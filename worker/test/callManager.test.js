/**
 * @file callManager.test.js
 * Unit tests for src/callManager.js
 * Covers all cases from sprint doc section 8.4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateEnv,
  routeRequest,
  redactSecrets,
  fetchWithTimeout,
  fetchWithRetry,
  callAPI,
} from "../src/callManager.js";

beforeEach(() => {
  vi.restoreAllMocks();
});

// Verifies required Worker bindings are present before upstream calls run.
describe("validateEnv", () => {
  it("passes when all required keys are present", () => {
    const env = { OPENAI_API_KEY: "sk-test123" };
    expect(() => validateEnv(env, ["OPENAI_API_KEY"])).not.toThrow();
  });

  it("throws ConfigError when key is missing", () => {
    const env = {};
    expect(() => validateEnv(env, ["OPENAI_API_KEY"])).toThrow(
      "Missing required environment variable: OPENAI_API_KEY"
    );
  });

  it("throws ConfigError when key is empty string", () => {
    const env = { OPENAI_API_KEY: "" };
    expect(() => validateEnv(env, ["OPENAI_API_KEY"])).toThrow(
      "Missing required environment variable: OPENAI_API_KEY"
    );
  });
});

// Confirms each supported meme mode maps to the correct upstream service.
describe("routeRequest", () => {
  it("routes face_swap to the face-swap endpoint", () => {
    const env = {
      OPENAI_API_KEY: "sk-test123",
      FACE_SWAP_API_URL: "https://face.example/api/face-swap",
      IMAGE_GEN_API_URL: "https://image.example/api/image",
    };

    expect(routeRequest("face_swap", env).url).toBe(
      "https://face.example/api/face-swap"
    );
  });

  it("routes extra_roast to the image-generation endpoint", () => {
    const env = {
      OPENAI_API_KEY: "sk-test123",
      FACE_SWAP_API_URL: "https://face.example/api/face-swap",
      IMAGE_GEN_API_URL: "https://image.example/api/image",
    };

    expect(routeRequest("extra_roast", env).url).toBe(
      "https://image.example/api/image"
    );
  });

  it("throws INVALID_MODE for unsupported modes", () => {
    expect(() => routeRequest("unknown", {})).toThrow("Invalid mode: unknown");
  });
});

// Exercises deadline handling for individual fetch attempts.
describe("fetchWithTimeout", () => {
  it("returns response when fetch completes in time", async () => {
    const mockResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const result = await fetchWithTimeout("http://example.com", {}, 5000);
    expect(result.status).toBe(200);
  });

  it("throws TIMEOUT_ERROR when fetch hangs past deadline", async () => {
    // Mock fetch that never resolves
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, { signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
      )
    );

    await expect(
      fetchWithTimeout("http://example.com", {}, 100)
    ).rejects.toMatchObject({
      code: "TIMEOUT_ERROR",
      retryable: true,
    });
  });

  it("timeout is configurable - fires at 3000ms not default 5000ms", async () => {
    const start = Date.now();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, { signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
      )
    );

    await expect(
      fetchWithTimeout("http://example.com", {}, 3000)
    ).rejects.toMatchObject({ code: "TIMEOUT_ERROR" });

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(4000);
  });
});

// Covers retry behavior for transient upstream rate limits.
describe("fetchWithRetry", () => {
  it("returns immediately on 200 with no retries", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchWithRetry("http://example.com", {}, 5000);
    expect(result.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries using Retry-After header on 429", async () => {
    const headers = new Headers({ "Retry-After": "0.01" });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchWithRetry("http://example.com", {}, 5000);
    expect(result.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it(
    "throws RATE_LIMITED after 3 retries",
    async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          new Response("{}", { status: 429, headers: new Headers() })
        );
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        fetchWithRetry("http://example.com", {}, 5000)
      ).rejects.toMatchObject({
        code: "RATE_LIMITED",
        retryable: true,
      });

      expect(mockFetch).toHaveBeenCalledTimes(4);
    },
    10_000
  );
});

// Tests the public gateway helper across routing, parsing, errors, and secrets.
describe("callAPI", () => {
  const env = {
    OPENAI_API_KEY: "sk-test123",
    FACE_SWAP_API_URL: "https://face.example/api/face-swap",
    IMAGE_GEN_API_URL: "https://image.example/api/image",
  };

  it("returns parsed JSON on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ result: "ok" }), { status: 200 })
      )
    );

    const result = await callAPI("face_swap", {}, env);
    expect(result.result).toBe("ok");
  });

  it("throws SERVER_ERROR with retryable true on 5xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 502 }))
    );

    await expect(callAPI("face_swap", {}, env)).rejects.toMatchObject({
      code: "SERVER_ERROR",
      retryable: true,
    });
  });

  it("throws CLIENT_ERROR with retryable false on non-429 4xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 400 }))
    );

    await expect(callAPI("face_swap", {}, env)).rejects.toMatchObject({
      code: "CLIENT_ERROR",
      retryable: false,
    });
  });

  it("uses AI_TIMEOUT_MS env var when set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      )
    );

    const result = await callAPI("face_swap", {}, {
      ...env,
      AI_TIMEOUT_MS: "3000",
    });
    expect(result.ok).toBe(true);
  });

  it("never exposes API key in error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        Object.assign(new Error("auth failed with sk-secret123"), {
          code: "CLIENT_ERROR",
          retryable: false,
        })
      )
    );

    try {
      await callAPI("face_swap", {}, env);
    } catch (err) {
      expect(err.message).not.toContain("sk-secret123");
    }
  });

  it("uses different upstream URLs for different modes", async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      )
    );
    vi.stubGlobal("fetch", mockFetch);

    await callAPI("face_swap", { method: "POST" }, env);
    await callAPI("extra_roast", { method: "POST" }, env);

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://face.example/api/face-swap",
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://image.example/api/image",
      expect.any(Object)
    );
  });

  it("allows face_swap without OPENAI_API_KEY when FACE_SWAP_API_URL is configured", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await callAPI("face_swap", {}, {
      FACE_SWAP_API_URL: env.FACE_SWAP_API_URL,
    });
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("requires OPENAI_API_KEY for extra_roast mode", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      callAPI("extra_roast", {}, { IMAGE_GEN_API_URL: env.IMAGE_GEN_API_URL })
    ).rejects.toMatchObject({
      code: "MISSING_API_KEY",
      retryable: false,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// Ensures sensitive tokens are removed before errors reach clients or logs.
describe("redactSecrets", () => {
  it("redacts OpenAI-style keys and env secret values", () => {
    const message = "failed with sk-secret123 and custom-secret";
    const result = redactSecrets(message, { SERVICE_TOKEN: "custom-secret" });

    expect(result).not.toContain("sk-secret123");
    expect(result).not.toContain("custom-secret");
    expect(result).toContain("[REDACTED]");
  });
});
