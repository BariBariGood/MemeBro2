/**
 * @file validator.test.js
 * Unit tests for src/validator.js
 * Covers all cases from sprint doc section 8.5
 */

import { describe, it, expect } from "vitest";
import { validateUpload, sanitizeFilename } from "../src/validator.js";


/**
 * Builds a minimal valid JPEG ArrayBuffer using JPEG magic bytes.
 * @param {number} size - Total byte length of the fake file
 * @returns {ArrayBuffer}
 */
function fakeJpeg(size = 1024) {
  const buf = new ArrayBuffer(size);
  const view = new Uint8Array(buf);
  view[0] = 0xff; view[1] = 0xd8; view[2] = 0xff; // JPEG magic bytes
  return buf;
}

/**
 * Builds a minimal valid PNG ArrayBuffer using PNG magic bytes.
 * @param {number} size - Total byte length
 * @returns {ArrayBuffer}
 */
function fakePng(size = 1024) {
  const buf = new ArrayBuffer(size);
  const view = new Uint8Array(buf);
  view[0] = 0x89; view[1] = 0x50; view[2] = 0x4e; view[3] = 0x47; // PNG magic
  return buf;
}

/**
 * Builds a minimal valid WebP ArrayBuffer using RIFF/WEBP magic bytes.
 * @param {number} size - Total byte length
 * @returns {ArrayBuffer}
 */
function fakeWebp(size = 1024) {
  const buf = new ArrayBuffer(size);
  const view = new Uint8Array(buf);
  view[0] = 0x52; view[1] = 0x49; view[2] = 0x46; view[3] = 0x46; 
  view[8] = 0x57; view[9] = 0x45; view[10] = 0x42; view[11] = 0x50; 
  return buf;
}

/**
 * Builds a corrupt ArrayBuffer (no valid magic bytes).
 * @returns {ArrayBuffer}
 */
function corruptBuffer() {
  const buf = new ArrayBuffer(100);
  const view = new Uint8Array(buf);
  view[0] = 0x00; view[1] = 0x00; view[2] = 0x00;
  return buf;
}

describe("validateUpload — accepted formats", () => {
  it("accepts a valid JPEG", () => {
    const result = validateUpload({
      buffer: fakeJpeg(2 * 1024 * 1024),
      mimeType: "image/jpeg",
      filename: "photo.jpg",
      size: 2 * 1024 * 1024,
    });
    expect(result.valid).toBe(true);
    expect(result.format).toBe("jpeg");
  });

  it("accepts a valid PNG", () => {
    const result = validateUpload({
      buffer: fakePng(1.5 * 1024 * 1024),
      mimeType: "image/png",
      filename: "photo.png",
      size: 1.5 * 1024 * 1024,
    });
    expect(result.valid).toBe(true);
    expect(result.format).toBe("png");
  });

  it("accepts a valid WebP", () => {
    const result = validateUpload({
      buffer: fakeWebp(500 * 1024),
      mimeType: "image/webp",
      filename: "photo.webp",
      size: 500 * 1024,
    });
    expect(result.valid).toBe(true);
    expect(result.format).toBe("webp");
  });
});

describe("validateUpload — size checks", () => {
  it("rejects a file over 10 MB", () => {
    expect(() =>
      validateUpload({
        buffer: fakeJpeg(12 * 1024 * 1024),
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

describe("validateUpload — MIME type checks", () => {
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

  it("detects MIME spoofing — PDF disguised as JPEG", () => {
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

describe("validateUpload — corrupt / unreadable files", () => {
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