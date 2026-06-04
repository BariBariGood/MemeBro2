/**
 * Supabase Edge Function: memebro-caption
 *
 * Deno port of worker/src/openai/caption.js
 * Same contract:
 * - 503 { error: "no_api_key" } when OPENAI_API_KEY is missing
 * - 401 { error: "unauthorized" } when X-MemeBro-Token is missing/invalid
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-memebro-token, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

function jsonError(status: number, code: string, detail?: string): Response {
  return jsonResponse({ error: code, detail }, status);
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseUpstreamError(text: string): { message?: string; code?: string } {
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

function safeParseCaptions(raw: string, slotCount: number): string[][] | null {
  try {
    const obj = JSON.parse(raw);
    if (!Array.isArray(obj?.captions)) return null;

    const out: string[][] = [];
    for (const set of obj.captions) {
      if (!Array.isArray(set)) continue;
      const cleaned = set
        .map((s: unknown) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .slice(0, slotCount);
      if (cleaned.length > 0) out.push(cleaned);
    }

    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError(405, "method_not_allowed");
  }

  const appToken = Deno.env.get("MEMEBRO_APP_TOKEN");
  const providedToken = req.headers.get("X-MemeBro-Token");
  if (appToken && providedToken !== appToken) {
    return jsonError(401, "unauthorized");
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "no_api_key" }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
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
    `Subject of the meme: "${subject}".`,
    `Overall vibe: "${vibe}".`,
    "Return 3 caption sets that fit the template structure.",
  ].join(" ");

  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

  const oa = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
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
      return jsonResponse(
        {
          error: "blocked",
          category: "upstream",
          message: upstream.message ?? "OpenAI rejected this request.",
        },
        400
      );
    }

    return jsonError(502, "openai_error", (upstream.message ?? text).slice(0, 500));
  }

  const data = await oa.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content ?? "";
  const parsed = safeParseCaptions(content, slotCount);

  if (!parsed) {
    return jsonError(502, "unparseable_response", content.slice(0, 500));
  }

  return new Response(JSON.stringify({ captions: parsed }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...corsHeaders,
    },
  });
});
