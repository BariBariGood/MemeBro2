/**
 * @file healthCheck.test.js
 * Unit tests for src/healthCheck.js (issue #32).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getServiceHealth,
  isServiceHealthy,
  resetHealthCache,
} from "../src/healthCheck.js";

const env = {
  FACE_SWAP_API_URL: "https://face.example/api/face-swap",
};

beforeEach(() => {
  vi.restoreAllMocks();
  resetHealthCache();
});

describe("getServiceHealth", () => {
  it("returns healthy:true when the upstream responds 2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    );

    const result = await getServiceHealth("face_swap", env);
    expect(result.healthy).toBe(true);
    expect(result.statusCode).toBe(204);
    expect(result.cached).toBe(false);
  });

  it("returns healthy:false on 5xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 }))
    );

    const result = await getServiceHealth("face_swap", env);
    expect(result.healthy).toBe(false);
    expect(result.statusCode).toBe(503);
  });

  it("returns healthy:false on network errors and never throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );

    const result = await getServiceHealth("face_swap", env);
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/ECONNREFUSED/);
  });

  it("caches results for the configured TTL", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const first = await getServiceHealth("face_swap", env);
    const second = await getServiceHealth("face_swap", env);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("force option bypasses the cache", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    await getServiceHealth("face_swap", env);
    await getServiceHealth("face_swap", env, { force: true });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("re-probes after the TTL expires", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    await getServiceHealth("face_swap", env, { ttlMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await getServiceHealth("face_swap", env, { ttlMs: 1 });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns unhealthy when the upstream URL is not configured", async () => {
    const result = await getServiceHealth("face_swap", {});
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/not configured/i);
  });

  it("isServiceHealthy returns boolean shorthand", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 200 }))
    );

    await expect(isServiceHealthy("face_swap", env)).resolves.toBe(true);
  });

  it("falls back to GET when HEAD is rejected", async () => {
    const mockFetch = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error("HEAD not allowed")))
      .mockImplementationOnce(() =>
        Promise.resolve(new Response("", { status: 200 }))
      );
    vi.stubGlobal("fetch", mockFetch);

    const result = await getServiceHealth("face_swap", env);

    expect(result.healthy).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][1].method).toBe("HEAD");
    expect(mockFetch.mock.calls[1][1].method).toBe("GET");
  });

  it("treats probe timeouts as unhealthy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, init) =>
        new Promise((_, reject) => {
          init.signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
      )
    );

    const result = await getServiceHealth("face_swap", env, { timeoutMs: 10 });
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/timed out/i);
  });

  it("deduplicates concurrent probes for the same service", async () => {
    let resolveFn;
    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = () => resolve(new Response("", { status: 200 }));
        })
    );
    vi.stubGlobal("fetch", mockFetch);

    const [a, b] = await Promise.all([
      Promise.resolve().then(() => getServiceHealth("face_swap", env)),
      Promise.resolve().then(() => getServiceHealth("face_swap", env)),
      Promise.resolve().then(() => {
        resolveFn?.();
      }),
    ]);

    expect(a.healthy).toBe(true);
    expect(b.healthy).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
