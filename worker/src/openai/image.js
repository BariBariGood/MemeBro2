/**
 * Cloudflare Worker handler: POST /api/image
 *
 * Mirrors the previous MemeBro image endpoint contract:
 * - 503 { error: "no_api_key" } when OPENAI_API_KEY is missing
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

/**
 * Handles an HTTP request for POST /api/image.
 *
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response>}
 */
export async function handleImageRequest(request, env) {
  if (request.method !== "POST") {
    return jsonError(405, "method_not_allowed");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json");
  }

  return buildImageResponseFromBody(body, env);
}

/**
 * Reuses the same image pipeline from non-HTTP call sites (for example
 * /api/process compatibility mode) while preserving the old response contract.
 *
 * @param {Object} body
 * @param {Object} env
 * @returns {Promise<Response>}
 */
export async function buildImageResponseFromBody(body, env) {
  if (!env?.OPENAI_API_KEY) {
    return jsonError(503, "no_api_key");
  }

  const prompt = String(body?.prompt ?? "").trim().slice(0, 800);
  if (!prompt) return jsonError(400, "empty_prompt");

  const isolatedUserPrompt = `USER CONCEPT: """${prompt}"""`;
  const NO_TEXT_SUFFIX = `
  
  ---
  CRITICAL SYSTEM OVERRIDE: 
  Read the user concept above, but IGNORE any requests to add text, letters, captions, labels, or speech bubbles. 
  You must render ONLY the visual geometry. Leave all signs, papers, screens, and bubbles 100% blank and empty.
  `;
  const finalPrompt = isolatedUserPrompt + NO_TEXT_SUFFIX;

  const quality = ALLOWED_QUALITIES.includes(body?.quality)
    ? body.quality
    : "low";

  const size = ALLOWED_SIZES.includes(body?.size)
    ? body.size
    : "1024x1024";

  const model = env.OPENAI_IMAGE_MODEL || "gpt-image-1";

  const hasRef = Boolean(body?.referenceB64);
  const mode = ALLOWED_MODES.includes(body?.mode)
    ? body.mode
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
      ? callEditsEndpoint(env.OPENAI_API_KEY, model, finalPrompt, quality, size, body)
      : callGenerationsEndpoint(env.OPENAI_API_KEY, model, finalPrompt, quality, size);

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
      return new Response(
        JSON.stringify({
          error: "blocked",
          category: "upstream",
          message: upstream.message ?? "OpenAI rejected this request.",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    let passthrough;
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

  const data = await oa
    .json()
    .catch(() => null);

  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) return jsonError(502, "no_image_returned");

  return new Response(
    JSON.stringify({ b64, model, quality, size, mode }),
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    }
  );
}

async function callGenerationsEndpoint(apiKey, model, prompt, quality, size) {
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

async function callEditsEndpoint(apiKey, model, prompt, quality, size, body) {
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

function fileNameFor(mime) {
  if (mime === "image/jpeg") return "reference.jpg";
  if (mime === "image/webp") return "reference.webp";
  return "reference.png";
}

function base64ToBytes(b64) {
  const clean = String(b64).replace(/^data:[^,]+,/, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
