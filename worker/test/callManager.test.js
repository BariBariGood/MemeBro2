/**
 * @file callManager.test.js
 * Unit tests for src/callManager.js
 * Covers all cases from sprint doc section 8.4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateEnv,
  fetchWithTimeout,
  fetchWithRetry,
  callAPI,
} from "../src/callManager.js";

beforeEach(() => {
  vi.restoreAllMocks();
});

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

  it("timeout is configurable — fires at 3000ms not default 5000ms", async () => {
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

describe("callAPI", () => {
  it("returns parsed JSON on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ result: "ok" }), { status: 200 })
      )
    );

    const result = await callAPI("http://example.com", {}, {});
    expect(result.result).toBe("ok");
  });

  it("throws SERVER_ERROR with retryable true on 5xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 502 }))
    );

    await expect(callAPI("http://example.com", {}, {})).rejects.toMatchObject({
      code: "SERVER_ERROR",
      retryable: true,
    });
  });

  it("throws CLIENT_ERROR with retryable false on non-429 4xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 400 }))
    );

    await expect(callAPI("http://example.com", {}, {})).rejects.toMatchObject({
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

    const env = { AI_TIMEOUT_MS: "3000" };
    const result = await callAPI("http://example.com", {}, env);
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
      await callAPI("http://example.com", {}, {});
    } catch (err) {
      expect(err.message).not.toContain("sk-secret123");
    }
  });
});