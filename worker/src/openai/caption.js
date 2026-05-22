/**
 * Cloudflare Worker handler: POST /api/caption
 *
 * Mirrors the previous MemeBro caption endpoint contract:
 * - 503 { error: "no_api_key" } when OPENAI_API_KEY is missing
 * - 400 { error: "blocked", ... } for moderation rejects
 * - 200 { captions: string[][] } on success
 */

const SYSTEM_PROMPT = [
  "You are MemeBro, a meme-caption engine.",
  "Output is consumed by a meme renderer, so follow the rules exactly:",
  "- Each caption set MUST have EXACTLY the requested number of slots, in order.",
  "- Each line is short and high-impact (<= 6 words ideal, <= 10 max).",
  "- Tone: dry, observational, internet-literate. PG-13. No slurs, no punching down.",
  "- Match the requested vibe; do not default to \"bro\" humor unless asked.",
  '- Return STRICT JSON: {"captions": [["line1","line2"], ["line1","line2"]]}',
  "- Exactly 3 sets. No commentary, no markdown, no trailing text.",
].join(" ");

export async function handleCaptionRequest(request, env) {
  if (request.method !== "POST") {
    return jsonError(405, "method_not_allowed");
  }

  if (!env?.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "no_api_key" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json");
  }

  const slotCount = clampInt(body?.slotCount ?? 2, 1, 6);
  const subject = String(body?.subject ?? "").slice(0, 80) || "the project";
  const vibe = String(body?.vibe ?? "").slice(0, 80) || "deadpan";
  const templateId = String(body?.templateId ?? "").slice(0, 40);
  const tags = (Array.isArray(body?.tags) ? body.tags : []).slice(0, 8).join(", ");

  const userPrompt = [
    `Template: ${templateId} (vibe tags: ${tags || "n/a"}).`,
    `Slot count per set: ${slotCount}.`,
    `Subject of the meme: \"${subject}\".`,
    `Overall vibe: \"${vibe}\".`,
    "Return 3 caption sets that fit the template structure.",
  ].join(" ");

  const model = env.OPENAI_MODEL || "gpt-4o-mini";

  const oa = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.95,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!oa.ok) {
    const text = await oa.text().catch(() => "");
    const upstream = parseUpstreamError(text);

    if (
      oa.status >= 400 &&
      oa.status < 500 &&
      (upstream.code === "moderation_blocked" ||
        upstream.code === "safety_violation" ||
        /safety system|content policy|moderation/i.test(upstream.message ?? ""))
    ) {
      return new Response(
        JSON.stringify({
          error: "blocked",
          category: "upstream",
          message: upstream.message ?? "OpenAI rejected this request.",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    return jsonError(502, "openai_error", (upstream.message ?? text).slice(0, 500));
  }

  const data = await oa
    .json()
    .catch(() => null);

  const content = data?.choices?.[0]?.message?.content ?? "";
  const parsed = safeParseCaptions(content, slotCount);

  if (!parsed) {
    return jsonError(502, "unparseable_response", content.slice(0, 500));
  }

  return new Response(JSON.stringify({ captions: parsed }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function clampInt(v, min, max) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function jsonError(status, code, detail) {
  return new Response(JSON.stringify({ error: code, detail }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseUpstreamError(text) {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && parsed.error) {
      return {
        message: parsed.error.message,
        code: parsed.error.code,
      };
    }
  } catch {
    // not JSON
  }
  return { message: text };
}

function safeParseCaptions(raw, slotCount) {
  try {
    const obj = JSON.parse(raw);
    if (!Array.isArray(obj?.captions)) return null;

    const out = [];
    for (const set of obj.captions) {
      if (!Array.isArray(set)) continue;
      const cleaned = set
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .slice(0, slotCount);
      if (cleaned.length > 0) out.push(cleaned);
    }

    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}
