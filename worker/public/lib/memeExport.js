/**
 * Canvas export + download / Web Share for the studio meme.
 */

import { DEFAULT_MEME_TEXT } from "./constants.js";
import { getMemeFontFamily, getMemeTextColor } from "./textOverlay.js";

function resolveColor(color) {
  if (typeof color === "string" && color.startsWith("#")) return color;
  return getMemeTextColor(color);
}

export function buildMemeFilename(extension = "png") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `memebro-${stamp}.${extension}`;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load meme image for export."));
    img.src = src;
  });
}

function wrapTextLines(ctx, text, maxWidth) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let line = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const next = `${line} ${words[i]}`;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
    } else {
      lines.push(line);
      line = words[i];
    }
  }
  lines.push(line);
  return lines;
}

function drawTextLayer(ctx, layer, width, height, fontScale = 1) {
  const text = String(layer.text || "").trim();
  if (!text) return;

  // On screen the meme renders inside a scaled-down art box. `fontScale`
  // maps the displayed font size up to the natural image resolution so the
  // export matches what the user sees. `autoScale` reflects the live-overlay
  // auto-fit applied by fitMemeTextToCanvas (frozen items use 1).
  const displayFontPx = Math.max(8, (Number(layer.fontPx) || 22) * (Number(layer.autoScale) || 1));
  const fontPx = displayFontPx * fontScale;
  const fontFamily = getMemeFontFamily(layer.fontKey);
  const color = resolveColor(layer.color);
  const outlineColor = layer.outlineColor || "#ffffff";
  const boxW = (Math.min(90, Math.max(18, Number(layer.widthPct) || 48)) / 100) * width;
  const x = (Math.min(95, Math.max(5, Number(layer.x) || 50)) / 100) * width;
  const y = (Math.min(95, Math.max(5, Number(layer.y) || 80)) / 100) * height;
  const rotation = Number(layer.rotation) || 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);

  const weight = layer.bold ? "700" : "400";
  const style = layer.italic ? "italic" : "normal";
  ctx.font = `${style} ${weight} ${fontPx}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = wrapTextLines(ctx, text, boxW);
  const lineHeight = fontPx * 1.15;
  const blockHeight = lines.length * lineHeight;
  let offsetY = -blockHeight / 2 + lineHeight / 2;

  for (const line of lines) {
    if (layer.outline) {
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = Math.max(2, fontPx * 0.12);
      ctx.lineJoin = "round";
      ctx.strokeText(line, 0, offsetY);
    }
    ctx.fillStyle = color;
    ctx.fillText(line, 0, offsetY);
    if (layer.underline) {
      const metrics = ctx.measureText(line);
      const underlineY = offsetY + fontPx * 0.35;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, fontPx * 0.06);
      ctx.beginPath();
      ctx.moveTo(-metrics.width / 2, underlineY);
      ctx.lineTo(metrics.width / 2, underlineY);
      ctx.stroke();
    }
    offsetY += lineHeight;
  }

  ctx.restore();
}

function collectTextLayers(editor) {
  const layers = (editor.frozenTextItems || []).map((item) => ({
    text: item.text,
    x: item.x,
    y: item.y,
    widthPct: item.widthPct,
    rotation: item.rotation,
    fontKey: item.fontKey,
    fontPx: item.fontPx,
    autoScale: 1,
    color: item.color,
    bold: item.bold,
    italic: item.italic,
    underline: item.underline,
    outline: item.outline,
    outlineColor: item.outlineColor,
  }));

  const overlayText = String(editor.overlayText || "").trim();
  const isPlaceholder = overlayText.toUpperCase() === DEFAULT_MEME_TEXT;
  if (editor.overlayVisible && overlayText && !isPlaceholder) {
    layers.push({
      text: overlayText,
      x: editor.overlayX,
      y: editor.overlayY,
      widthPct: editor.overlayWidthPct,
      rotation: editor.overlayRotation,
      fontKey: editor.overlayFontKey,
      fontPx: editor.overlayFontPx,
      autoScale: Number(editor.overlayAutoScale) || 1,
      color: editor.overlayTextColor,
      bold: editor.overlayBold,
      italic: editor.overlayItalic,
      underline: editor.overlayUnderline,
      outline: editor.overlayOutlineEnabled,
      outlineColor: editor.overlayOutlineColor,
    });
  }

  return layers;
}

/**
 * @param {{ dom: object, state: object }} ctx
 * @returns {Promise<Blob>}
 */
export async function exportStudioMemeBlob({ dom, state }) {
  const imgEl = dom.studioTemplateImage;
  if (!imgEl?.src || !imgEl.complete || !imgEl.naturalWidth) {
    throw new Error("Meme image is not ready yet. Wait for the template to load.");
  }

  const width = imgEl.naturalWidth;
  const height = imgEl.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas export is not supported in this browser.");

  const base = await loadImageElement(imgEl.currentSrc || imgEl.src);
  ctx.drawImage(base, 0, 0, width, height);

  // Ratio between the natural image and the on-screen rendered image so text
  // drawn here matches the preview size. object-fit: contain in an
  // aspect-matched box means clientWidth tracks the rendered image width.
  const displayWidth = imgEl.clientWidth || imgEl.getBoundingClientRect().width || width;
  const fontScale = displayWidth ? width / displayWidth : 1;

  for (const layer of collectTextLayers(state.editor)) {
    drawTextLayer(ctx, layer, width, height, fontScale);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode meme PNG."))),
      "image/png",
    );
  });
}

function downloadMemeBlob(blob, filename = buildMemeFilename("png")) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * @returns {Promise<"shared" | "downloaded">}
 */
export async function shareOrDownloadMeme(blob, filename = buildMemeFilename("png")) {
  const file = new File([blob], filename, { type: blob.type || "image/png" });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (error) {
      // User dismissed the share sheet — surface that to the caller.
      if (error?.name === "AbortError") throw error;
      // Any other share failure falls back to a direct download.
    }
  }

  downloadMemeBlob(blob, filename);
  return "downloaded";
}
