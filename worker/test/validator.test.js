/**
 * @file validator.test.js
 * Unit tests for src/validator.js
 * Covers all cases from sprint doc section 8.5 plus dimension enforcement
 * for issue #48.
 */

import { describe, it, expect } from "vitest";
import {
  MAX_DIMENSION,
  MIN_DIMENSION,
  readImageDimensions,
  sanitizeFilename,
  validateUpload,
} from "../src/validator.js";

/**
 * Writes a 32-bit big-endian unsigned integer into a Uint8Array.
 *
 * @param {Uint8Array} view
 * @param {number} offset
 * @param {number} value
 */
function writeUint32BE(view, offset, value) {
  view[offset] = (value >>> 24) & 0xff;
  view[offset + 1] = (value >>> 16) & 0xff;
  view[offset + 2] = (value >>> 8) & 0xff;
  view[offset + 3] = value & 0xff;
}

/**
 * Writes a 16-bit big-endian unsigned integer into a Uint8Array.
 *
 * @param {Uint8Array} view
 * @param {number} offset
 * @param {number} value
 */
function writeUint16BE(view, offset, value) {
  view[offset] = (value >>> 8) & 0xff;
  view[offset + 1] = value & 0xff;
}

/**
 * Builds a JPEG-shaped ArrayBuffer with valid SOI + SOF0 markers so the
 * validator can read width/height from the header.
 *
 * @param {Object} [options]
 * @param {number} [options.size] - Total byte length
 * @param {number} [options.width] - Pixel width
 * @param {number} [options.height] - Pixel height
 * @returns {ArrayBuffer}
 */
function fakeJpeg({ size = 1024, width = 512, height = 512 } = {}) {
  const buf = new ArrayBuffer(Math.max(size, 32));
  const view = new Uint8Array(buf);
  // SOI marker.
  view[0] = 0xff;
  view[1] = 0xd8;
  // SOF0 marker with length, 8-bit precision, and dimensions.
  view[2] = 0xff;
  view[3] = 0xc0;
  writeUint16BE(view, 4, 17); // segment length
  view[6] = 0x08; // precision
  writeUint16BE(view, 7, height);
  writeUint16BE(view, 9, width);
  view[11] = 0x03; // components
  // EOI marker at the end of the segment so consumers don't keep scanning.
  view[12] = 0xff;
  view[13] = 0xd9;
  return buf;
}

/**
 * Builds a PNG-shaped ArrayBuffer with a valid IHDR chunk so the validator
 * can read width/height from the header.
 *
 * @param {Object} [options]
 * @param {number} [options.size] - Total byte length
 * @param {number} [options.width] - Pixel width
 * @param {number} [options.height] - Pixel height
 * @returns {ArrayBuffer}
 */
function fakePng({ size = 1024, width = 512, height = 512 } = {}) {
  const buf = new ArrayBuffer(Math.max(size, 24));
  const view = new Uint8Array(buf);
  view[0] = 0x89;
  view[1] = 0x50;
  view[2] = 0x4e;
  view[3] = 0x47;
  view[4] = 0x0d;
  view[5] = 0x0a;
  view[6] = 0x1a;
  view[7] = 0x0a;
  // IHDR chunk length (13).
  writeUint32BE(view, 8, 13);
  // IHDR type.
  view[12] = 0x49;
  view[13] = 0x48;
  view[14] = 0x44;
  view[15] = 0x52;
  writeUint32BE(view, 16, width);
  writeUint32BE(view, 20, height);
  return buf;
}

/**
 * Builds a WebP-shaped ArrayBuffer with a valid VP8 chunk so the validator
 * can read width/height from the header.
 *
 * @param {Object} [options]
 * @param {number} [options.size] - Total byte length
 * @param {number} [options.width] - Pixel width
 * @param {number} [options.height] - Pixel height
 * @returns {ArrayBuffer}
 */
function fakeWebp({ size = 1024, width = 512, height = 512 } = {}) {
  const buf = new ArrayBuffer(Math.max(size, 32));
  const view = new Uint8Array(buf);
  view[0] = 0x52; // R
  view[1] = 0x49; // I
  view[2] = 0x46; // F
  view[3] = 0x46; // F
  view[8] = 0x57; // W
  view[9] = 0x45; // E
  view[10] = 0x42; // B
  view[11] = 0x50; // P
  // VP8  chunk tag.
  view[12] = 0x56; // V
  view[13] = 0x50; // P
  view[14] = 0x38; // 8
  view[15] = 0x20; // space
  // VP8 frame signature 0x9d 0x01 0x2a precedes the width/height fields.
  view[23] = 0x9d;
  view[24] = 0x01;
  view[25] = 0x2a;
  const w = width & 0x3fff;
  const h = height & 0x3fff;
  view[26] = w & 0xff;
  view[27] = (w >> 8) & 0xff;
  view[28] = h & 0xff;
  view[29] = (h >> 8) & 0xff;
  return buf;
}

/**
 * Builds a corrupt ArrayBuffer (no valid magic bytes).
 *
 * @returns {ArrayBuffer}
 */
function corruptBuffer() {
  const buf = new ArrayBuffer(100);
  const view = new Uint8Array(buf);
  view[0] = 0x00;
  view[1] = 0x00;
  view[2] = 0x00;
  return buf;
}

describe("validateUpload - accepted formats", () => {
  it("accepts a valid JPEG", () => {
    const result = validateUpload({
      buffer: fakeJpeg({ size: 2 * 1024 * 1024 }),
      mimeType: "image/jpeg",
      filename: "photo.jpg",
      size: 2 * 1024 * 1024,
    });
    expect(result.valid).toBe(true);
    expect(result.format).toBe("jpeg");
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it("accepts a valid PNG", () => {
    const result = validateUpload({
      buffer: fakePng({ size: 1.5 * 1024 * 1024 }),
      mimeType: "image/png",
      filename: "photo.png",
      size: 1.5 * 1024 * 1024,
    });
    expect(result.valid).toBe(true);
    expect(result.format).toBe("png");
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it("accepts a valid WebP", () => {
    const result = validateUpload({
      buffer: fakeWebp({ size: 500 * 1024 }),
      mimeType: "image/webp",
      filename: "photo.webp",
      size: 500 * 1024,
    });
    expect(result.valid).toBe(true);
    expect(result.format).toBe("webp");
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });
});

describe("validateUpload - size checks", () => {
  it("accepts a valid JPEG just under 9 MB", () => {
    const size = 9 * 1024 * 1024 - 1;
    const result = validateUpload({
      buffer: fakeJpeg({ size }),
      mimeType: "image/jpeg",
      filename: "large-ok.jpg",
      size,
    });

    expect(result.valid).toBe(true);
    expect(result.format).toBe("jpeg");
  });

  it("rejects a file one byte over 10 MB", () => {
    const size = 10 * 1024 * 1024 + 1;

    expect(() =>
      validateUpload({
        buffer: fakeJpeg({ size }),
        mimeType: "image/jpeg",
        filename: "too-big.jpg",
        size,
      })
    ).toThrow("File exceeds 10 MB upload limit");
  });

  it("rejects a file over 10 MB", () => {
    expect(() =>
      validateUpload({
        buffer: fakeJpeg({ size: 12 * 1024 * 1024 }),
        mimeType: "image/jpeg",
        filename: "big.jpg",
        size: 12 * 1024 * 1024,
      })
    ).toThrow("File exceeds 10 MB upload limit");
  });

  it("rejects a zero-byte file", () => {
    expect(() =>
      validateUpload({
        buffer: new ArrayBuffer(0),
        mimeType: "image/png",
        filename: "empty.png",
        size: 0,
      })
    ).toThrow("Empty file — no image data to process");
  });
});

describe("validateUpload - MIME type checks", () => {
  it("rejects an unsupported MIME type (BMP)", () => {
    expect(() =>
      validateUpload({
        buffer: fakeJpeg(),
        mimeType: "image/bmp",
        filename: "photo.bmp",
        size: 1024,
      })
    ).toThrow("Unsupported format — accepted types: JPEG, PNG, WebP");
  });

  it("rejects SVG for security reasons", () => {
    expect(() =>
      validateUpload({
        buffer: new ArrayBuffer(100),
        mimeType: "image/svg+xml",
        filename: "attack.svg",
        size: 100,
      })
    ).toThrow("SVG uploads are not supported for security reasons");
  });

  it("detects MIME spoofing - PDF disguised as JPEG", () => {
    // PDF magic bytes: %PDF
    const buf = new ArrayBuffer(100);
    const view = new Uint8Array(buf);
    view[0] = 0x25; view[1] = 0x50; view[2] = 0x44; view[3] = 0x46;
    expect(() =>
      validateUpload({
        buffer: buf,
        mimeType: "image/jpeg",
        filename: "notajpeg.jpg",
        size: 100,
      })
    ).toThrow("File content does not match declared type");
  });
});

describe("validateUpload - corrupt / unreadable files", () => {
  it("rejects a corrupt image (invalid magic bytes)", () => {
    expect(() =>
      validateUpload({
        buffer: corruptBuffer(),
        mimeType: "image/jpeg",
        filename: "corrupt.jpg",
        size: 100,
      })
    ).toThrow("Unable to decode image — file may be corrupt");
  });
});

describe("validateUpload - dimension enforcement (issue #48)", () => {
  it("rejects a JPEG smaller than the minimum dimension", () => {
    expect(() =>
      validateUpload({
        buffer: fakeJpeg({ size: 4096, width: 50, height: 200 }),
        mimeType: "image/jpeg",
        filename: "tiny.jpg",
        size: 4096,
      })
    ).toThrow(`Image is too small — minimum ${MIN_DIMENSION}px on each side`);
  });

  it("rejects a PNG larger than the maximum dimension", () => {
    expect(() =>
      validateUpload({
        buffer: fakePng({ size: 4096, width: 5000, height: 1000 }),
        mimeType: "image/png",
        filename: "huge.png",
        size: 4096,
      })
    ).toThrow(`Image is too large — maximum ${MAX_DIMENSION}px on each side`);
  });

  it("rejects a WebP with an out-of-range width", () => {
    expect(() =>
      validateUpload({
        buffer: fakeWebp({ size: 4096, width: 99, height: 500 }),
        mimeType: "image/webp",
        filename: "narrow.webp",
        size: 4096,
      })
    ).toThrow(`Image is too small — minimum ${MIN_DIMENSION}px on each side`);
  });

  it("accepts a JPEG at the upper boundary", () => {
    const result = validateUpload({
      buffer: fakeJpeg({ size: 8192, width: MAX_DIMENSION, height: MIN_DIMENSION }),
      mimeType: "image/jpeg",
      filename: "edge.jpg",
      size: 8192,
    });
    expect(result.width).toBe(MAX_DIMENSION);
    expect(result.height).toBe(MIN_DIMENSION);
  });

  it("flags JPEGs missing a SOF marker with INVALID_DIMENSIONS", () => {
    // Plain JPEG SOI without any frame marker so the parser cannot find
    // dimensions and must fail closed.
    const buf = new ArrayBuffer(64);
    const view = new Uint8Array(buf);
    view[0] = 0xff;
    view[1] = 0xd8;
    view[2] = 0xff;
    view[3] = 0xd9;

    let thrown;
    try {
      validateUpload({
        buffer: buf,
        mimeType: "image/jpeg",
        filename: "no-dims.jpg",
        size: 64,
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.code).toBe("INVALID_DIMENSIONS");
  });
});

describe("readImageDimensions", () => {
  it("decodes a PNG IHDR chunk", () => {
    const bytes = new Uint8Array(fakePng({ width: 640, height: 480 }));
    expect(readImageDimensions(bytes, "image/png")).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("decodes a JPEG SOF0 segment", () => {
    const bytes = new Uint8Array(fakeJpeg({ width: 800, height: 600 }));
    expect(readImageDimensions(bytes, "image/jpeg")).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("decodes a WebP VP8 frame", () => {
    const bytes = new Uint8Array(fakeWebp({ width: 320, height: 240 }));
    expect(readImageDimensions(bytes, "image/webp")).toEqual({
      width: 320,
      height: 240,
    });
  });

  it("returns null for unknown formats", () => {
    expect(readImageDimensions(new Uint8Array(8), "image/heic")).toBeNull();
  });
});

describe("sanitizeFilename", () => {
  it("strips path traversal characters", () => {
    const result = sanitizeFilename("../../etc/passwd.jpg");
    expect(result).not.toContain("..");
    expect(result).not.toContain("/");
  });

  it("returns safe filename for a normal name", () => {
    expect(sanitizeFilename("myphoto.jpg")).toBe("myphoto.jpg");
  });

  it("handles empty filename gracefully", () => {
    expect(sanitizeFilename("")).toBe("upload");
  });
});
