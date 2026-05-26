/**
 * @file imageExporter.test.js
 * Unit tests for src/imageExporter.js
 */

import { describe, it, expect } from "vitest";
import { exportImage, MIN_EDGE } from "../src/imageExporter.js";
import { MAX_FILE_SIZE } from "../src/validator.js";

/** @param {number} width @param {number} height */
function makeRgba(width, height, r = 128, g = 64, b = 32, a = 255) {
  const buf = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    buf[i * 4]     = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

/** High-entropy RGBA for JPEG size / optimizer tests. */
function makeNoiseRgba(width, height) {
  const buf = new Uint8Array(width * height * 4);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = ((i * 37 + i * i * 7 + 17) ^ (i >> 3)) & 0xff;
  }
  return buf;
}

describe("exportImage - JPEG magic bytes (FF D8 FF)", () => {
  it("produces valid JPEG SOI marker at bytes 0-2", async () => {
    const rgba = makeRgba(200, 200);
    const { buffer } = await exportImage({ data: rgba, width: 200, height: 200, format: "jpeg" });
    const bytes = new Uint8Array(buffer);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    expect(bytes[2]).toBe(0xff);
  });

  it("returns mimeType image/jpeg and format jpeg", async () => {
    const rgba = makeRgba(100, 100);
    const result = await exportImage({ data: rgba, width: 100, height: 100, format: "jpeg" });
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.format).toBe("jpeg");
  });
});

describe("exportImage - PNG signature (89 50 4E 47)", () => {
  it("produces valid PNG signature at bytes 0-3", async () => {
    const rgba = makeRgba(200, 200);
    const { buffer } = await exportImage({ data: rgba, width: 200, height: 200, format: "png" });
    const bytes = new Uint8Array(buffer);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
  });

  it("returns mimeType image/png and format png", async () => {
    const rgba = makeRgba(100, 100);
    const result = await exportImage({ data: rgba, width: 100, height: 100, format: "png" });
    expect(result.mimeType).toBe("image/png");
    expect(result.format).toBe("png");
  });

  it("does not include qualityUsed for PNG", async () => {
    const rgba = makeRgba(100, 100);
    const result = await exportImage({ data: rgba, width: 100, height: 100, format: "png" });
    expect(result.qualityUsed).toBeUndefined();
  });
});

describe("exportImage - default JPEG quality is 85", () => {
  it("qualityUsed is 85 when no quality arg is supplied", async () => {
    const rgba = makeRgba(100, 100);
    const result = await exportImage({ data: rgba, width: 100, height: 100, format: "jpeg" });
    expect(result.qualityUsed).toBe(85);
  });

  it("qualityUsed reflects an explicit quality param", async () => {
    const rgba = makeRgba(100, 100);
    const result = await exportImage({
      data: rgba, width: 100, height: 100, format: "jpeg", quality: 70,
    });
    expect(result.qualityUsed).toBe(70);
  });
});

describe("exportImage - US-04: exported file is under 10 MB", () => {
  it("1080x1080 JPEG (solid colour) is under MAX_FILE_SIZE at default quality", async () => {
    const rgba = makeRgba(1080, 1080);
    const result = await exportImage({ data: rgba, width: 1080, height: 1080, format: "jpeg" });
    expect(result.byteLength).toBeLessThan(MAX_FILE_SIZE);
  });

  it("1080x1080 PNG (solid colour) is under MAX_FILE_SIZE", async () => {
    const rgba = makeRgba(1080, 1080);
    const result = await exportImage({ data: rgba, width: 1080, height: 1080, format: "png" });
    expect(result.byteLength).toBeLessThan(MAX_FILE_SIZE);
  });

  it("1080x1080 JPEG (noise) is under MAX_FILE_SIZE", async () => {
    const rgba = makeNoiseRgba(1080, 1080);
    const result = await exportImage({ data: rgba, width: 1080, height: 1080, format: "jpeg" });
    expect(result.byteLength).toBeLessThan(MAX_FILE_SIZE);
  });

  it("byteLength in result matches actual buffer.byteLength", async () => {
    const rgba = makeRgba(300, 300);
    const result = await exportImage({ data: rgba, width: 300, height: 300, format: "jpeg" });
    expect(result.byteLength).toBe(result.buffer.byteLength);
  });

  it("JPEG output is smaller than the raw RGBA input for 1080x1080", async () => {
    const rgba = makeRgba(1080, 1080);
    const rawSize = rgba.byteLength;
    const result = await exportImage({ data: rgba, width: 1080, height: 1080, format: "jpeg" });
    expect(result.byteLength).toBeLessThan(rawSize);
  });
});

describe("exportImage - size optimizer reduces output to fit maxBytes", () => {
  it("reduces JPEG quality when initial encode exceeds maxBytes", async () => {
    const rgba = makeNoiseRgba(400, 400);
    const baseline = await exportImage({
      data: rgba, width: 400, height: 400, format: "jpeg", quality: 85,
    });
    expect(baseline.byteLength).toBeGreaterThan(5000);

    const maxBytes = baseline.byteLength - 1;
    const result = await exportImage({
      data: rgba, width: 400, height: 400, format: "jpeg", maxBytes,
    });
    expect(result.byteLength).toBeLessThanOrEqual(maxBytes);
    expect(result.qualityUsed).toBeLessThan(85);
  });

  it("multi-step reduction keeps result under maxBytes", async () => {
    const rgba = makeNoiseRgba(400, 400);
    const baseline = await exportImage({
      data: rgba, width: 400, height: 400, format: "jpeg",
    });
    expect(baseline.byteLength).toBeGreaterThan(5000);

    const maxBytes = Math.floor(baseline.byteLength * 0.7);
    const result = await exportImage({
      data: rgba, width: 400, height: 400, format: "jpeg", maxBytes,
    });
    expect(result.byteLength).toBeLessThanOrEqual(maxBytes);
  });
});

describe("exportImage - PNG ArrayBuffer input", () => {
  it("accepts a PNG ArrayBuffer and exports as JPEG (magic bytes FF D8 FF)", async () => {
    const rgba = makeRgba(100, 100);
    const pngResult = await exportImage({
      data: rgba, width: 100, height: 100, format: "png",
    });
    const jpegResult = await exportImage({
      data: pngResult.buffer, width: 100, height: 100, format: "jpeg",
    });
    const bytes = new Uint8Array(jpegResult.buffer);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    expect(bytes[2]).toBe(0xff);
    expect(jpegResult.mimeType).toBe("image/jpeg");
  });

  it("PNG roundtrip preserves image dimensions", async () => {
    const rgba = makeRgba(150, 120);
    const pngResult = await exportImage({
      data: rgba, width: 150, height: 120, format: "png",
    });
    const jpegResult = await exportImage({
      data: pngResult.buffer, width: 150, height: 120, format: "jpeg",
    });
    expect(jpegResult.width).toBe(150);
    expect(jpegResult.height).toBe(120);
  });
});

describe("exportImage - MIN_EDGE is 800 px (scenario 7.6)", () => {
  it("MIN_EDGE export constant is 800", () => {
    expect(MIN_EDGE).toBe(800);
  });

  it("normal 1080x1080 export keeps full dimensions (no downscale needed)", async () => {
    const rgba = makeRgba(1080, 1080);
    const result = await exportImage({ data: rgba, width: 1080, height: 1080, format: "jpeg" });
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);
  });
});

describe("exportImage - EXPORT_TOO_LARGE error", () => {
  it("throws when maxBytes is impossibly small", async () => {
    const rgba = makeRgba(500, 500);
    await expect(
      exportImage({ data: rgba, width: 500, height: 500, format: "jpeg", maxBytes: 100 }),
    ).rejects.toThrow();
  });

  it("thrown error has code EXPORT_TOO_LARGE", async () => {
    const rgba = makeRgba(500, 500);
    let caught = null;
    try {
      await exportImage({ data: rgba, width: 500, height: 500, format: "jpeg", maxBytes: 100 });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(caught.code).toBe("EXPORT_TOO_LARGE");
  });

  it("throws CLIENT_ERROR for unsupported format", async () => {
    const rgba = makeRgba(100, 100);
    let caught = null;
    try {
      await exportImage({ data: rgba, width: 100, height: 100, format: "webp" });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(caught.message).toContain("Unsupported export format: webp");
    expect(caught.code).toBe("CLIENT_ERROR");
  });
});

describe("exportImage - return shape", () => {
  it("result has all required fields", async () => {
    const rgba = makeRgba(100, 100);
    const result = await exportImage({ data: rgba, width: 100, height: 100, format: "jpeg" });
    expect(result).toHaveProperty("buffer");
    expect(result).toHaveProperty("format");
    expect(result).toHaveProperty("mimeType");
    expect(result).toHaveProperty("byteLength");
    expect(result).toHaveProperty("width");
    expect(result).toHaveProperty("height");
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
  });

  it("width and height in result match input when no downscaling occurred", async () => {
    const rgba = makeRgba(200, 150);
    const result = await exportImage({ data: rgba, width: 200, height: 150, format: "jpeg" });
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
  });

  it("accepts ArrayBuffer raw RGBA input (non-PNG)", async () => {
    const rgba = makeRgba(100, 100);
    const result = await exportImage({
      data: rgba.buffer, width: 100, height: 100, format: "jpeg",
    });
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.byteLength).toBeGreaterThan(0);
  });
});
