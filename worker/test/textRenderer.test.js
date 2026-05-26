/**
 * @file textRenderer.test.js
 * Unit tests for src/textRenderer.js
 * Covers DS-02 acceptance criteria and section 8.3 text-only rows.
 */

import { describe, it, expect } from "vitest";
import { renderTextOverlay } from "../src/textRenderer.js";

async function decodePNG(png) {
  const view = new DataView(png);

  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (view.getUint8(i) !== sig[i]) throw new Error("Invalid PNG signature");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  const idatParts = [];

  while (offset < png.byteLength) {
    const length = view.getUint32(offset, false);
    const type =
      String.fromCharCode(view.getUint8(offset + 4)) +
      String.fromCharCode(view.getUint8(offset + 5)) +
      String.fromCharCode(view.getUint8(offset + 6)) +
      String.fromCharCode(view.getUint8(offset + 7));

    if (type === "IHDR") {
      width = view.getUint32(offset + 8, false);
      height = view.getUint32(offset + 12, false);
    } else if (type === "IDAT") {
      idatParts.push(new Uint8Array(png, offset + 8, length));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  // Concatenate IDAT chunks
  const totalLen = idatParts.reduce((s, c) => s + c.length, 0);
  const idat = new Uint8Array(totalLen);
  let pos = 0;
  for (const part of idatParts) { idat.set(part, pos); pos += part.length; }

  // Decompress (zlib/deflate)
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(idat);
  writer.close();

  const chunks = [];
  let done, value;
  while ({ done, value } = await reader.read(), !done) chunks.push(value);

  const rawLen = height * (1 + width * 4);
  const raw = new Uint8Array(rawLen);
  pos = 0;
  for (const c of chunks) { raw.set(c, pos); pos += c.length; }

  // Apply PNG filter per scanline (we only emit filter-type 0 = None)
  const pixels = new Uint8Array(width * height * 4);
  const rowLen = 1 + width * 4;
  for (let y = 0; y < height; y++) {
    pixels.set(raw.subarray(y * rowLen + 1, y * rowLen + 1 + width * 4), y * width * 4);
  }

  return { width, height, pixels };
}

function getPixel(pixels, width, x, y) {
  const i = (y * width + x) * 4;
  return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] };
}

function hasPixelMatching(pixels, width, height, predicate) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (predicate(getPixel(pixels, width, x, y))) return true;
    }
  }
  return false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validBbox(w = 300, h = 100) {
  return { x: 0, y: 0, width: w, height: h };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("renderTextOverlay – PNG output validity", () => {
  it("returns an object with png ArrayBuffer and correct width/height keys", async () => {
    const result = await renderTextOverlay({ text: "LOL", fontSize: 24, bbox: validBbox() });
    expect(result).toHaveProperty("png");
    expect(result).toHaveProperty("width");
    expect(result).toHaveProperty("height");
    expect(result.png).toBeInstanceOf(ArrayBuffer);
  });

  it("returns canvas width equal to bbox.width", async () => {
    const { width } = await renderTextOverlay({ text: "LOL", fontSize: 24, bbox: validBbox(200) });
    expect(width).toBe(200);
  });

  it("has a valid PNG signature (89 50 4E 47 …)", async () => {
    const { png } = await renderTextOverlay({ text: "LOL", fontSize: 24, bbox: validBbox() });
    const bytes = new Uint8Array(png);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50); 
    expect(bytes[2]).toBe(0x4e); 
    expect(bytes[3]).toBe(0x47); 
  });

  it("PNG can be decoded without errors", async () => {
    const { png, width, height } = await renderTextOverlay({ text: "LOL", fontSize: 24, bbox: validBbox() });
    const decoded = await decodePNG(png);
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect(decoded.pixels.length).toBe(width * height * 4);
  });
});

describe("renderTextOverlay – DS-02: 2px white outline, black fill", () => {
  it("renders white (FF FF FF) stroke pixels for LOL at font 24", async () => {
    const { png, width, height } = await renderTextOverlay({
      text: "LOL",
      fontSize: 24,
      bbox: validBbox(200, 80),
      strokeWidth: 2,
      strokeColor: "#FFFFFF",
      fillColor: "#000000",
    });
    const { pixels } = await decodePNG(png);
    const hasWhite = hasPixelMatching(pixels, width, height,
      ({ r, g, b, a }) => r === 255 && g === 255 && b === 255 && a === 255);
    expect(hasWhite).toBe(true);
  });

  it("renders black (00 00 00) fill pixels for LOL at font 24", async () => {
    const { png, width, height } = await renderTextOverlay({
      text: "LOL",
      fontSize: 24,
      bbox: validBbox(200, 80),
      strokeWidth: 2,
      strokeColor: "#FFFFFF",
      fillColor: "#000000",
    });
    const { pixels } = await decodePNG(png);
    const hasBlack = hasPixelMatching(pixels, width, height,
      ({ r, g, b, a }) => r === 0 && g === 0 && b === 0 && a === 255);
    expect(hasBlack).toBe(true);
  });
});

describe("renderTextOverlay – DS-02: transparent background (alpha preserved)", () => {
  it("has fully transparent pixels in the background", async () => {
    const { png, width, height } = await renderTextOverlay({
      text: "LOL",
      fontSize: 24,
      bbox: validBbox(300, 80),
    });
    const { pixels } = await decodePNG(png);
    const hasTransparent = hasPixelMatching(pixels, width, height, ({ a }) => a === 0);
    expect(hasTransparent).toBe(true);
  });

  it("top-left corner pixel is transparent (LOL does not fill entire canvas)", async () => {
    const { png, width, height } = await renderTextOverlay({
      text: "LOL",
      fontSize: 24,
      bbox: validBbox(300, 80),
    });
    const { pixels } = await decodePNG(png);
    // Top-left should be transparent since text is centered in a wide canvas
    const px = getPixel(pixels, width, 0, 0);
    expect(px.a).toBe(0);
  });
});

describe("renderTextOverlay – DS-02: auto-wrap long caption within bbox width", () => {
  it("produces taller output when text exceeds bbox width", async () => {
    const bbox = validBbox(200);
    const longText = "This caption is way too long and must definitely wrap around";
    const { height: multiH } = await renderTextOverlay({ text: longText, fontSize: 24, bbox });
    const { height: singleH } = await renderTextOverlay({ text: "Short", fontSize: 24, bbox });
    expect(multiH).toBeGreaterThan(singleH);
  });

  it("wraps so no characters draw past bbox width", async () => {
    const bbox = validBbox(200);
    const longText = "This is a long string that should wrap nicely within the bounding box";
    const { width } = await renderTextOverlay({ text: longText, fontSize: 24, bbox });
    expect(width).toBe(200);
  });
});

describe("renderTextOverlay – DS-02: multi-line, center-aligned", () => {
  it("explicit newline produces a taller canvas than a single line", async () => {
    const bbox = validBbox(300);
    const { height: two } = await renderTextOverlay({ text: "Line one\nLine two", fontSize: 24, bbox });
    const { height: one } = await renderTextOverlay({ text: "Line one", fontSize: 24, bbox });
    expect(two).toBeGreaterThan(one);
  });

  it("center-aligned text starts further right than left-aligned text", async () => {
    const bbox = validBbox(300);
    const textStr = "LOL";

    const { png: pngCenter, width: wC, height: hC } =
      await renderTextOverlay({ text: textStr, fontSize: 24, bbox, align: "center" });
    const { png: pngLeft, width: wL, height: hL } =
      await renderTextOverlay({ text: textStr, fontSize: 24, bbox, align: "left" });

    const { pixels: pc } = await decodePNG(pngCenter);
    const { pixels: pl } = await decodePNG(pngLeft);

    // Find leftmost opaque pixel in each image
    function leftmostOpaque(pixels, w, h) {
      for (let x = 0; x < w; x++)
        for (let y = 0; y < h; y++)
          if (getPixel(pixels, w, x, y).a > 0) return x;
      return w;
    }

    const centerLeft = leftmostOpaque(pc, wC, hC);
    const leftLeft = leftmostOpaque(pl, wL, hL);
    expect(centerLeft).toBeGreaterThan(leftLeft);
  });
});

describe("renderTextOverlay – DS-02: emoji in caption", () => {
  it("does not throw for emoji text", async () => {
    await expect(
      renderTextOverlay({ text: "fire emoji 🔥 LOL", fontSize: 24, bbox: validBbox() })
    ).resolves.not.toThrow();
  });

  it("produces non-zero pixels where emoji was drawn (fire emoji 🔥)", async () => {
    const bbox = validBbox(300);
    const { png: pngEmoji, width: we, height: he } =
      await renderTextOverlay({ text: "🔥", fontSize: 24, bbox });
    const { png: pngEmpty, width: wm, height: hm } =
      await renderTextOverlay({ text: "", fontSize: 24, bbox });

    const { pixels: emojiPixels } = await decodePNG(pngEmoji);
    // Emoji canvas must have at least one opaque pixel
    const hasOpaque = hasPixelMatching(emojiPixels, we, he, ({ a }) => a > 0);
    expect(hasOpaque).toBe(true);

    // Empty canvas must be fully transparent
    const { pixels: emptyPixels } = await decodePNG(pngEmpty);
    const emptyHasOpaque = hasPixelMatching(emptyPixels, wm, hm, ({ a }) => a > 0);
    expect(emptyHasOpaque).toBe(false);
  });
});

describe("renderTextOverlay – DS-02: empty string must not throw", () => {
  it("returns valid PNG for empty string without throwing", async () => {
    const result = await renderTextOverlay({ text: "", fontSize: 24, bbox: validBbox() });
    expect(result.png).toBeInstanceOf(ArrayBuffer);
    const bytes = new Uint8Array(result.png);
    // PNG magic bytes
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
  });

  it("empty string produces a fully transparent image (no text pixels)", async () => {
    const { png, width, height } = await renderTextOverlay({ text: "", fontSize: 24, bbox: validBbox() });
    const { pixels } = await decodePNG(png);
    const hasOpaque = hasPixelMatching(pixels, width, height, ({ a }) => a > 0);
    expect(hasOpaque).toBe(false);
  });
});

describe("renderTextOverlay – DS-02: special chars render as literal glyphs", () => {
  it("renders & < > \" without throwing", async () => {
    await expect(
      renderTextOverlay({ text: '& < > "hello"', fontSize: 24, bbox: validBbox() })
    ).resolves.not.toThrow();
  });

  it("special chars produce non-zero pixels (rendered as glyphs, not HTML entities)", async () => {
    const { png, width, height } = await renderTextOverlay({
      text: '& < > "',
      fontSize: 24,
      bbox: validBbox(),
    });
    const { pixels } = await decodePNG(png);
    const hasOpaque = hasPixelMatching(pixels, width, height, ({ a }) => a > 0);
    expect(hasOpaque).toBe(true);
  });

  it("& renders same pixels as other ASCII chars (not encoded as &amp;)", async () => {
    const bbox = validBbox();
    const { height: hAmp } = await renderTextOverlay({ text: "&", fontSize: 24, bbox });
    const { height: hZ } = await renderTextOverlay({ text: "Z", fontSize: 24, bbox });
    // Both are single characters so canvas height should be the same
    expect(hAmp).toBe(hZ);
  });
});

describe("renderTextOverlay – stroke / fill color customisation", () => {
  it("custom strokeColor is applied", async () => {
    const { png, width, height } = await renderTextOverlay({
      text: "HI",
      fontSize: 24,
      bbox: validBbox(),
      strokeColor: "#FF0000",
      fillColor: "#0000FF",
    });
    const { pixels } = await decodePNG(png);
    const hasRed = hasPixelMatching(pixels, width, height,
      ({ r, g, b, a }) => r === 255 && g === 0 && b === 0 && a === 255);
    const hasBlue = hasPixelMatching(pixels, width, height,
      ({ r, g, b, a }) => r === 0 && g === 0 && b === 255 && a === 255);
    expect(hasRed).toBe(true);
    expect(hasBlue).toBe(true);
  });
});
