/**
 * Supabase Edge Function: memebro-image
 *
 * Deno port of worker/src/openai/image.js
 * Same contract:
 * - 503 { error: "no_api_key" } when OPENAI_API_KEY is missing
 * - 401 { error: "unauthorized" } when X-MemeBro-Token is missing/invalid
 * - 413 { error: "reference_too_large" } for oversized refs
 * - 400 { error: "blocked", ... } for moderation rejects
 * - 200 { b64, model, quality, size, mode } on success
 */

const EDIT_SUBJECT_HINT = "The attached photo is the subject of the scene below.";
const EDIT_BYO_HINT =
  "The first attached photo is the subject; the second is the scene/composition reference.";

const ALLOWED_QUALITIES = ["low", "high"];
const ALLOWED_SIZES = ["1024x1024", "1024x1536", "1536x1024"];
const ALLOWED_MODES = ["generate", "restyle", "cast"];

const MAX_REF_BYTES = 4 * 1024 * 1024;

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

function base64ToBytes(b64: string): Uint8Array {
  const clean = String(b64).replace(/^data:[^,]+,/, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function fileNameFor(mime: string): string {
  if (mime === "image/jpeg") return "reference.jpg";
  if (mime === "image/webp") return "reference.webp";
  return "reference.png";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGenerationsEndpoint(
  apiKey: string,
  model: string,
  prompt: string,
  quality: string,
  size: string
): Promise<Response> {
  return fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size,
      quality,
    }),
  });
}

async function callEditsEndpoint(
  apiKey: string,
  model: string,
  prompt: string,
  quality: string,
  size: string,
  body: Record<string, unknown>
): Promise<Response> {
  const refB64 = String(body?.referenceB64 ?? "");
  const mime = String(body?.referenceMime ?? "image/png").split(";")[0].trim();
  const bytes = base64ToBytes(refB64);
  const blob = new Blob([bytes], { type: mime });

  const hasTemplateRef = Boolean(body?.templateRefB64);

  const hint = hasTemplateRef ? EDIT_BYO_HINT : EDIT_SUBJECT_HINT;
  const finalPrompt = `${hint} ${prompt}`;

  const fd = new FormData();
  fd.append("model", model);
  fd.append("prompt", finalPrompt);
  fd.append("n", "1");
  fd.append("size", size);
  fd.append("quality", quality);

  const imageField = hasTemplateRef ? "image[]" : "image";
  fd.append(imageField, blob, fileNameFor(mime));

  if (hasTemplateRef) {
    const tplMime = String(body?.templateRefMime ?? "image/png")
      .split(";")[0]
      .trim();
    const tplBytes = base64ToBytes(String(body?.templateRefB64 ?? ""));
    const tplBlob = new Blob([tplBytes], { type: tplMime });
    fd.append(
      imageField,
      tplBlob,
      fileNameFor(tplMime).replace("reference", "template")
    );
  }

  return fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
    body: fd,
  });
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

  const prompt = String(body?.prompt ?? "").trim().slice(0, 800);
  if (!prompt) return jsonError(400, "empty_prompt");

  const quality = ALLOWED_QUALITIES.includes(body?.quality as string)
    ? (body.quality as string)
    : "low";

  const size = ALLOWED_SIZES.includes(body?.size as string)
    ? (body.size as string)
    : "1024x1024";

  const model = Deno.env.get("OPENAI_IMAGE_MODEL") || "gpt-image-1";

  const hasRef = Boolean(body?.referenceB64);
  const mode = ALLOWED_MODES.includes(body?.mode as string)
    ? (body.mode as string)
    : hasRef
      ? "cast"
      : "generate";

  if (body?.referenceB64 && String(body.referenceB64).length > MAX_REF_BYTES) {
    return jsonError(413, "reference_too_large");
  }

  if (body?.templateRefB64 && String(body.templateRefB64).length > MAX_REF_BYTES) {
    return jsonError(413, "reference_too_large");
  }

  const callOpenAI = () =>
    hasRef
      ? callEditsEndpoint(apiKey, model, prompt, quality, size, body)
      : callGenerationsEndpoint(apiKey, model, prompt, quality, size);

  let oa = await callOpenAI();
  if (!oa.ok && oa.status >= 500 && oa.status < 600) {
    await sleep(700);
    oa = await callOpenAI();
  }

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

    let passthrough: number;
    if (oa.status === 503) {
      passthrough = 502;
    } else if (oa.status >= 500 && oa.status < 600) {
      passthrough = oa.status;
    } else {
      passthrough = 502;
    }

    return jsonError(
      passthrough,
      "openai_error",
      (upstream.message ?? text).slice(0, 800)
    );
  }

  const data = await oa.json().catch(() => null);
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) return jsonError(502, "no_image_returned");

  return new Response(JSON.stringify({ b64, model, quality, size, mode }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...corsHeaders,
    },
  });
});
