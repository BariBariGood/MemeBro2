/**
 * Generate meme captions using AI via Cloudflare Worker
 * @param {object} options
 * @param {string} options.subject - What the meme is about
 * @param {string} [options.vibe] - Tone/style (e.g. "tired", "sarcastic")
 * @param {number} [options.slotCount] - Number of text slots per caption set
 * @param {string} [options.templateId] - Template identifier
 * @param {string[]} [options.tags] - Vibe tags
 * @returns {Promise<{captions: string[][]}>}
 */
export async function generateCaptions({ subject, vibe, slotCount, templateId, tags }) {
  const response = await fetch("/api/caption", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject, vibe, slotCount, templateId, tags }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || `Caption generation failed (${response.status})`);
  }

  return response.json();
}

/**
 * Generate an AI image via Cloudflare Worker
 * @param {object} options
 * @param {string} options.prompt - Image generation prompt
 * @param {string} [options.quality] - "low" or "high"
 * @param {string} [options.size] - "1024x1024", "1024x1536", or "1536x1024"
 * @param {string} [options.referenceB64] - Base64 reference image for edits
 * @param {string} [options.referenceMime] - MIME type of reference
 * @returns {Promise<{b64: string, model: string, quality: string, size: string, mode: string}>}
 */
export async function generateImage({ prompt, quality, size, referenceB64, referenceMime }) {
  const response = await fetch("/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, quality, size, referenceB64, referenceMime }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || `Image generation failed (${response.status})`);
  }

  return response.json();
}

/**
 * @typedef {object} FaceCrop
 * @property {Blob} blob
 * @property {{ x: number, y: number, width: number, height: number }} bounds
 * @property {string} type
 */

/**
 * @typedef {object} FaceSwapRequest
 * @property {File|Blob} file
 * @property {FaceCrop} faceCrop
 * @property {string} templateId
 * @property {Array<object>} selectedFaces
 * @property {string} [memeText]
 * @property {object} [textStyle]
 * @property {AbortSignal} [signal]
 */

function getFaceCropExtension(cropType) {
  if (cropType === "image/png") return "png";
  if (cropType === "image/webp") return "webp";
  return "jpg";
}

function getFaceCropFilename(file, cropType) {
  const extension = getFaceCropExtension(cropType);
  const sourceName = typeof file?.name === "string" ? file.name : "upload";
  const baseName = sourceName
    .replace(/\.[^/.\\]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "upload";

  return `${baseName}-face-crop.${extension}`;
}

async function readJsonBody(response) {
  return response.json().catch(() => ({}));
}

async function createResponseError(response) {
  const body = await readJsonBody(response);
  const code = body?.code || "UPLOAD_FAILED";
  const message = [body?.code, body?.message].filter(Boolean).join(": ")
    || `Upload failed with HTTP ${response.status}.`;
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function loadTemplates() {
  const response = await fetch("/templates.json");
  return readJsonBody(response);
}

/**
 * @param {FaceSwapRequest} request
 * @returns {Promise<object>}
 */
export async function requestFaceSwap({
  file,
  faceCrop,
  templateId,
  selectedFaces,
  memeText = "",
  textStyle = {},
  signal,
}) {
  const selectedFace = selectedFaces[0];
  const response = await fetch("/api/process", {
    method: "POST",
    headers: {
      "Content-Type": faceCrop.type,
      "X-MemeBro-Mode": "face_swap",
      "X-MemeBro-Filename": getFaceCropFilename(file, faceCrop.type),
      "X-MemeBro-Selected-Face": JSON.stringify(selectedFace),
      "X-MemeBro-Selected-Faces": JSON.stringify(selectedFaces),
      "X-MemeBro-Face-Crop": JSON.stringify(faceCrop.bounds),
      "X-MemeBro-Template": templateId || "",
      "X-MemeBro-Meme-Text": memeText,
      "X-MemeBro-Text-Style": JSON.stringify(textStyle),
    },
    body: faceCrop.blob,
    signal,
  });

  if (!response.ok) {
    throw await createResponseError(response);
  }

  return readJsonBody(response);
}
