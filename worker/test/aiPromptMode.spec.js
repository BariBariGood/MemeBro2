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
    expect(body.error).toBe("empty_prompt");
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
    expect(body.error).toBe("empty_prompt");
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
    expect(body.error).toBe("prompt_too_long");
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
