import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src";

const gatewayEnv = {
  OPENAI_API_KEY: "sk-test123",
  FACE_SWAP_API_URL: "https://face.example/api/face-swap",
  IMAGE_GEN_API_URL: "https://image.example/api/image",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("OpenAI-backed routes", () => {
  it("returns 503 for /api/caption when OPENAI_API_KEY is missing", async () => {
    const request = new Request("http://example.com/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: "drake", slotCount: 2 }),
    });

    const response = await worker.fetch(request, {});
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "no_api_key" });
  });

  it("returns generated captions from /api/caption", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  captions: [
                    ["top line", "bottom line"],
                    ["top 2", "bottom 2"],
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", mockFetch);

    const request = new Request("http://example.com/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: "drake",
        slotCount: 2,
        subject: "monday",
        vibe: "deadpan",
        tags: ["classic"],
      }),
    });

    const response = await worker.fetch(request, gatewayEnv);

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.captions[0]).toEqual(["top line", "bottom line"]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.any(Object)
    );
  });

  it("maps moderation rejects on /api/caption to blocked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "moderation_blocked",
              message: "Rejected by policy",
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        )
      )
    );

    const request = new Request("http://example.com/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: "drake", slotCount: 2 }),
    });

    const response = await worker.fetch(request, gatewayEnv);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("blocked");
    expect(body.message).toContain("Rejected by policy");
  });

  it("returns 503 for /api/image when OPENAI_API_KEY is missing", async () => {
    const request = new Request("http://example.com/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "a cat in space" }),
    });

    const response = await worker.fetch(request, {});
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "no_api_key" });
  });

  it("returns generated image payload from /api/image", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: "AAAA" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", mockFetch);

    const request = new Request("http://example.com/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "a cat in space" }),
    });

    const response = await worker.fetch(request, gatewayEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      b64: "AAAA",
      model: "gpt-image-2",
      quality: "low",
      size: "1024x1024",
      mode: "generate",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/images/generations",
      expect.any(Object)
    );
  });

  it("maps moderation rejects on /api/image to blocked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "moderation_blocked",
              message: "Image denied",
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        )
      )
    );

    const request = new Request("http://example.com/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "violent meme" }),
    });

    const response = await worker.fetch(request, gatewayEnv);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("blocked");
    expect(body.message).toContain("Image denied");
  });

  it("uses local /api/image fallback for /api/process extra_roast when no upstream URL is configured", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ b64_json: "BBBB" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", mockFetch);

    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "extra_roast", prompt: "make it absurd" }),
    });

    const response = await worker.fetch(request, { OPENAI_API_KEY: "sk-test123" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ b64: "BBBB", mode: "generate" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/images/generations",
      expect.any(Object)
    );
  });
});
