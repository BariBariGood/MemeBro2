import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src";
import { resetHealthCache } from "../src/healthCheck.js";
import { resetQueue } from "../src/requestQueue.js";
import { encodePNG } from "../src/pngUtil.js";

const testEnv = {
  OPENAI_API_KEY: "sk-test123",
  FACE_SWAP_API_URL: "https://face.example/api/face-swap",
  IMAGE_GEN_API_URL: "https://image.example/api/image",
};

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
 * Builds a JPEG-shaped ArrayBuffer with SOI + SOF0 markers so the validator
 * can read width/height from the header. Defaults to a 512x512 image that
 * passes the 100-4096 dimension window.
 *
 * @param {number} size - Total byte length of the fake file
 * @returns {ArrayBuffer}
 */
function fakeJpeg(size = 1024) {
  const buf = new ArrayBuffer(Math.max(size, 32));
  const view = new Uint8Array(buf);
  view[0] = 0xff;
  view[1] = 0xd8;
  view[2] = 0xff;
  view[3] = 0xc0;
  writeUint16BE(view, 4, 17);
  view[6] = 0x08;
  writeUint16BE(view, 7, 512);
  writeUint16BE(view, 9, 512);
  view[11] = 0x03;
  view[12] = 0xff;
  view[13] = 0xd9;
  return buf;
}

async function fakePng(width = 128, height = 128) {
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  return encodePNG(width, height, rgba);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetHealthCache();
  resetQueue();
});

describe("MemeBro API gateway", () => {
  it("returns gateway metadata at the root route", async () => {
    const request = new Request("http://example.com");

    const response = await worker.fetch(request, testEnv);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      name: "MemeBro API gateway",
      route: "/api/process",
    });
  });

  it("rejects image uploads over 10 MB with HTTP 413", async () => {
    const request = new Request(
      "http://example.com/api/process?mode=face_swap",
      {
        method: "POST",
        headers: {
          "Content-Type": "image/jpeg",
          "X-MemeBro-Filename": "too-big.jpg",
        },
        body: fakeJpeg(10 * 1024 * 1024 + 1),
      }
    );

    const response = await worker.fetch(request, testEnv);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body).toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      message: "Maximum upload size is 10 MB",
      retryable: false,
    });
  });

  it("accepts a 9 MB image upload and forwards it to the selected mode", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: "ok" }), { status: 200 })
    );
    vi.stubGlobal("fetch", mockFetch);

    const request = new Request(
      "http://example.com/api/process?mode=face_swap",
      {
        method: "POST",
        headers: {
          "Content-Type": "image/jpeg",
          "X-MemeBro-Filename": "large-ok.jpg",
        },
        body: fakeJpeg(9 * 1024 * 1024 - 1),
      }
    );

    const response = await worker.fetch(request, testEnv);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: "ok" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://face.example/api/face-swap",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("runs local face compositing when a cropped face upload includes crop metadata", async () => {
    const generatedPng = await fakePng();
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ b64_json: arrayBufferToBase64(generatedPng) }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", mockFetch);

    const cropPng = await fakePng();
    const templatePng = await fakePng(128, 128);
    const assets = {
      fetch: vi.fn(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/templates.json") {
          return new Response(
            JSON.stringify({
              templates: [
                {
                  id: "drake",
                  templateImage: "/assets/memes/drake.png",
                  faceRegions: [{ x: 10, y: 10, width: 40, height: 40 }],
                  images: { width: 128, height: 128 },
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.pathname === "/assets/memes/drake.png") {
          return new Response(templatePng, {
            status: 200,
            headers: { "content-type": "image/png" },
          });
        }
        return new Response("not found", { status: 404 });
      }),
    };

    const request = new Request("http://example.com/api/process?mode=face_swap", {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "X-MemeBro-Filename": "face.png",
        "X-MemeBro-Face-Crop": JSON.stringify({ x: 0, y: 0, width: 128, height: 128 }),
        "X-MemeBro-Template": "drake",
        "X-MemeBro-Meme-Text": "test meme",
      },
      body: cropPng,
    });

    const response = await worker.fetch(request, { ...testEnv, ASSETS: assets });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.generatedImageUrl).toMatch(/^data:image\/png;base64,/);
    expect(body.mode).toBe("face_swap");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/images/edits",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("routes JSON requests by mode without exposing upstream URLs to clients", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: "ok" }), { status: 200 })
    );
    vi.stubGlobal("fetch", mockFetch);

    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "extra_roast", prompt: "make it chaotic" }),
    });

    const response = await worker.fetch(request, testEnv);

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://image.example/api/image",
      expect.any(Object)
    );
  });

  it("rejects invalid modes before outbound fetch", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "unknown" }),
    });

    const response = await worker.fetch(request, testEnv);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_MODE");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("disables face_swap with FEATURE_DISABLED when upstream is unhealthy (issue #33)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("", { status: 502 })
    );
    vi.stubGlobal("fetch", mockFetch);

    const request = new Request(
      "http://example.com/api/process?mode=face_swap",
      {
        method: "POST",
        headers: {
          "Content-Type": "image/jpeg",
          "X-MemeBro-Filename": "face.jpg",
        },
        body: fakeJpeg(2 * 1024),
      }
    );

    const response = await worker.fetch(request, testEnv);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      code: "FEATURE_DISABLED",
      feature: "face_swap",
      retryable: true,
    });
    expect(body.message).toMatch(/temporarily unavailable/i);
  });
});

describe("/api/health", () => {
  it("reports degraded when face_swap upstream is unhealthy", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("", { status: 500 })
    );
    vi.stubGlobal("fetch", mockFetch);

    const request = new Request("http://example.com/api/health");
    const response = await worker.fetch(request, testEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.services.face_swap.healthy).toBe(false);
    expect(body.features.face_swap.healthy).toBe(false);
  });

  it("reports ok when the face_swap upstream responds 2xx", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("", { status: 200 })
    );
    vi.stubGlobal("fetch", mockFetch);

    const request = new Request("http://example.com/api/health");
    const response = await worker.fetch(request, testEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.services.face_swap.healthy).toBe(true);
  });

  it("rejects non-GET requests with 405", async () => {
    const request = new Request("http://example.com/api/health", {
      method: "POST",
    });
    const response = await worker.fetch(request, testEnv);

    expect(response.status).toBe(405);
  });
});
