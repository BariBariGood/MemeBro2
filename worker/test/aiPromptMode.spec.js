/**
 * @file aiPromptMode.spec.js
 * Backend tests for Issue B task B.9 — ai_prompt mode coverage:
 *   - happy path
 *   - empty prompt
 *   - oversized prompt
 *   - queue saturated
 *   - buildAiPrompt unit test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above all imports by Vitest, so index.js will receive the
// mocked enqueueRequest when it first imports requestQueue.  Default behaviour
// delegates to the real implementation so every test except the QUEUE_FULL one
// works without any extra setup.
vi.mock("../src/requestQueue.js", async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    enqueueRequest: vi.fn().mockImplementation((task, state) =>
      mod.enqueueRequest(task, state)
    ),
  };
});

import worker from "../src";
import { ErrorCodes } from "../src/errors.js";
import { enqueueRequest, resetQueue } from "../src/requestQueue.js";
import {
  AI_PROMPT_PREFIX,
  MAX_AI_PROMPT_LENGTH,
  buildAiPrompt,
} from "../src/openai/aiPromptMode.js";

const testEnv = {
  OPENAI_API_KEY: "sk-test123",
};

beforeEach(() => {
  // clearAllMocks resets call history but keeps the default mockImplementation
  // so the passthrough to the real enqueueRequest stays intact between tests.
  vi.clearAllMocks();
  resetQueue();
});

// ---------------------------------------------------------------------------
// Unit tests for the aiPromptMode helpers (B.8)
// ---------------------------------------------------------------------------

describe("buildAiPrompt", () => {
  it("prepends AI_PROMPT_PREFIX to the user text", () => {
    const result = buildAiPrompt("a cat judging me");
    expect(result).toBe(`${AI_PROMPT_PREFIX}a cat judging me`);
  });

  it("AI_PROMPT_PREFIX contains required guardrail phrases", () => {
    expect(AI_PROMPT_PREFIX).toMatch(/single meme image/i);
    expect(AI_PROMPT_PREFIX).toMatch(/legib/i);
    expect(AI_PROMPT_PREFIX).toMatch(/PG-13/i);
    expect(AI_PROMPT_PREFIX).toMatch(/public figures/i);
  });
});

// ---------------------------------------------------------------------------
// Integration tests via worker.fetch (B.7 + B.9)
// ---------------------------------------------------------------------------

describe("ai_prompt mode — /api/process gateway", () => {
  it("happy path: forwards to OpenAI images/generations with prefixed prompt and returns b64 payload", async () => {
    const capturedBody = { value: null };
    const mockFetch = vi.fn(async (_url, options) => {
      capturedBody.value = JSON.parse(options.body);
      return new Response(
        JSON.stringify({ data: [{ b64_json: "CCCC" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", mockFetch);

    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "ai_prompt",
        prompt: "distracted boyfriend meme about pizza",
      }),
    });

    const response = await worker.fetch(request, testEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ b64: "CCCC", mode: "generate" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/images/generations",
      expect.any(Object)
    );
    // B.8: confirm the safety prefix reaches OpenAI
    expect(capturedBody.value.prompt).toContain(AI_PROMPT_PREFIX);
    expect(capturedBody.value.prompt).toContain(
      "distracted boyfriend meme about pizza"
    );
  });

  it("returns 400 empty_prompt when prompt is missing", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ai_prompt", prompt: "" }),
    });

    const response = await worker.fetch(request, testEnv);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      code: ErrorCodes.EMPTY_PROMPT,
      message: "Prompt is required.",
      retryable: false,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 empty_prompt when prompt is whitespace only", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ai_prompt", prompt: "   " }),
    });

    const response = await worker.fetch(request, testEnv);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      code: ErrorCodes.EMPTY_PROMPT,
      message: "Prompt is required.",
      retryable: false,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 prompt_too_long when prompt exceeds MAX_AI_PROMPT_LENGTH", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const longPrompt = "x".repeat(MAX_AI_PROMPT_LENGTH + 1);
    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ai_prompt", prompt: longPrompt }),
    });

    const response = await worker.fetch(request, testEnv);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe(ErrorCodes.PROMPT_TOO_LONG);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("accepts a prompt that is exactly MAX_AI_PROMPT_LENGTH characters", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ b64_json: "DDDD" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", mockFetch);

    const boundaryPrompt = "y".repeat(MAX_AI_PROMPT_LENGTH);
    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ai_prompt", prompt: boundaryPrompt }),
    });

    const response = await worker.fetch(request, testEnv);

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("includes a helpful detail message on prompt_too_long", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const longPrompt = "x".repeat(MAX_AI_PROMPT_LENGTH + 1);
    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ai_prompt", prompt: longPrompt }),
    });

    const response = await worker.fetch(request, testEnv);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe(ErrorCodes.PROMPT_TOO_LONG);
    expect(body.message).toBe(
      `Prompt must be ${MAX_AI_PROMPT_LENGTH} characters or fewer`
    );
    expect(body.retryable).toBe(false);
  });

  it("accepts a whitespace-padded prompt that trims to within the limit", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ b64_json: "HHHH" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", mockFetch);

    // Raw length exceeds the cap, but trims down to exactly the limit.
    const padded = `   ${"y".repeat(MAX_AI_PROMPT_LENGTH)}   `;
    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ai_prompt", prompt: padded }),
    });

    const response = await worker.fetch(request, testEnv);

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("returns 503 no_api_key when OPENAI_API_KEY is missing", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "ai_prompt",
        prompt: "a frog on a skateboard",
      }),
    });

    // env without OPENAI_API_KEY
    const response = await worker.fetch(request, {});
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      code: ErrorCodes.NO_API_KEY,
      message: "OpenAI API key is not configured.",
      retryable: false,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("normalizes OpenAI moderation rejects to the gateway error contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "moderation_blocked",
              message: "Image denied by policy",
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        )
      )
    );

    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "ai_prompt",
        prompt: "a meme that should get blocked",
      }),
    });

    const response = await worker.fetch(request, testEnv);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      code: ErrorCodes.UPSTREAM_BLOCKED,
      message: "Image denied by policy",
      retryable: false,
    });
  });

  it("normalizes OpenAI failures to the gateway error contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "OpenAI unavailable" } }),
          { status: 503, headers: { "content-type": "application/json" } }
        )
      )
    );

    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "ai_prompt",
        prompt: "a meme during an outage",
      }),
    });

    const response = await worker.fetch(request, testEnv);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      code: ErrorCodes.OPENAI_ERROR,
      message: "OpenAI unavailable",
      retryable: true,
    });
  });

  it("ignores a reference image and stays text-to-image (images/generations)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ b64_json: "FFFF" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", mockFetch);

    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "ai_prompt",
        prompt: "a cat as a wizard",
        referenceB64: "ABCD",
      }),
    });

    const response = await worker.fetch(request, testEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ b64: "FFFF", mode: "generate" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/images/generations",
      expect.any(Object)
    );
  });

  it("does not 413 on an oversized reference image in ai_prompt mode (ref ignored)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ b64_json: "GGGG" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", mockFetch);

    const hugeRef = "a".repeat(5 * 1024 * 1024); // > MAX_REF_BYTES (4 MB)
    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "ai_prompt",
        prompt: "a dog coding at 3am",
        referenceB64: hugeRef,
      }),
    });

    const response = await worker.fetch(request, testEnv);

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/images/generations",
      expect.any(Object)
    );
  });

  it("returns 503 QUEUE_FULL when the request queue is saturated", async () => {
    // Swap the default passthrough for a single rejection so this one
    // ai_prompt request hits the QUEUE_FULL error path in handleGatewayRequest.
    enqueueRequest.mockRejectedValueOnce(
      Object.assign(
        new Error("Server is busy; please retry shortly (queue saturated)"),
        { code: "QUEUE_FULL", retryable: true }
      )
    );

    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "ai_prompt",
        prompt: "this is fine dog but during finals",
      }),
    });

    const response = await worker.fetch(request, testEnv);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      code: "QUEUE_FULL",
      retryable: true,
    });
    expect(body.message).toMatch(/busy|queue/i);
  });

  it("rejects with 429 RATE_LIMITED when the ai_prompt rate limiter is exceeded", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const limitEnv = {
      ...testEnv,
      AI_PROMPT_RATE_LIMITER: {
        limit: vi.fn().mockResolvedValue({ success: false }),
      },
    };

    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.7",
      },
      body: JSON.stringify({ mode: "ai_prompt", prompt: "spam me" }),
    });

    const response = await worker.fetch(request, limitEnv);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toMatchObject({
      code: ErrorCodes.RATE_LIMITED,
      retryable: true,
    });
    // Throttled before any paid OpenAI call happens.
    expect(mockFetch).not.toHaveBeenCalled();
    expect(limitEnv.AI_PROMPT_RATE_LIMITER.limit).toHaveBeenCalledWith({
      key: "203.0.113.7",
    });
  });

  it("proceeds to OpenAI when the ai_prompt rate limiter allows the request", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ b64_json: "IIII" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", mockFetch);

    const limitEnv = {
      ...testEnv,
      AI_PROMPT_RATE_LIMITER: {
        limit: vi.fn().mockResolvedValue({ success: true }),
      },
    };

    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ai_prompt", prompt: "a polite request" }),
    });

    const response = await worker.fetch(request, limitEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ b64: "IIII", mode: "generate" });
    expect(limitEnv.AI_PROMPT_RATE_LIMITER.limit).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("does NOT apply prompt_too_long to extra_roast mode (backward compat)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ b64_json: "EEEE" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", mockFetch);

    // extra_roast silently truncates; must not get prompt_too_long
    const longPrompt = "z".repeat(MAX_AI_PROMPT_LENGTH + 1);
    const request = new Request("http://example.com/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "extra_roast", prompt: longPrompt }),
    });

    const response = await worker.fetch(request, { OPENAI_API_KEY: "sk-test123" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.b64).toBe("EEEE");
  });
});
