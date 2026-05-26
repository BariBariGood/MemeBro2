import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src";
import { resetHealthCache } from "../src/healthCheck.js";
import { resetQueue } from "../src/requestQueue.js";

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

beforeEach(() => {
  vi.restoreAllMocks();
  resetHealthCache();
  resetQueue();
});

describe("MemeBro API gateway", () => {
  it("returns gateway metadata at the root route", async () => {
    const request = new Request("http://example.com");
    const ctx = createExecutionContext();

    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

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

    const response = await worker.fetch(request, testEnv, createExecutionContext());
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

    const response = await worker.fetch(request, testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: "ok" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://face.example/api/face-swap",
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

    const response = await worker.fetch(request, testEnv, createExecutionContext());

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

    const response = await worker.fetch(request, testEnv, createExecutionContext());
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

    const response = await worker.fetch(request, testEnv, createExecutionContext());
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
    const response = await worker.fetch(request, testEnv, createExecutionContext());
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
    const response = await worker.fetch(request, testEnv, createExecutionContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.services.face_swap.healthy).toBe(true);
  });

  it("rejects non-GET requests with 405", async () => {
    const request = new Request("http://example.com/api/health", {
      method: "POST",
    });
    const response = await worker.fetch(request, testEnv, createExecutionContext());

    expect(response.status).toBe(405);
  });
});
