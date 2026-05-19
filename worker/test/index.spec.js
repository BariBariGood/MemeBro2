import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src";

const testEnv = {
  OPENAI_API_KEY: "sk-test123",
  FACE_SWAP_API_URL: "https://face.example/api/face-swap",
  IMAGE_GEN_API_URL: "https://image.example/api/image",
};

/**
 * Builds a minimal valid JPEG ArrayBuffer using JPEG magic bytes.
 *
 * @param {number} size - Total byte length of the fake file
 * @returns {ArrayBuffer}
 */
function fakeJpeg(size = 1024) {
  const buf = new ArrayBuffer(size);
  const view = new Uint8Array(buf);
  view[0] = 0xff;
  view[1] = 0xd8;
  view[2] = 0xff;
  return buf;
}

beforeEach(() => {
  vi.restoreAllMocks();
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
});
