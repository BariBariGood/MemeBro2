/**
 * @file fallback.test.js
 * Unit tests for src/fallback.js (issue #33).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertFeatureEnabled,
  getFeatureAvailability,
} from "../src/fallback.js";
import { resetHealthCache } from "../src/healthCheck.js";

const env = {
  FACE_SWAP_API_URL: "https://face.example/api/face-swap",
};

beforeEach(() => {
  vi.restoreAllMocks();
  resetHealthCache();
});

describe("assertFeatureEnabled", () => {
  it("allows the request when the upstream is healthy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 200 }))
    );

    await expect(assertFeatureEnabled("face_swap", env)).resolves.toBeUndefined();
  });

  it("throws FEATURE_DISABLED when the upstream is unhealthy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500 }))
    );

    let thrown;
    try {
      await assertFeatureEnabled("face_swap", env);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.code).toBe("FEATURE_DISABLED");
    expect(thrown.feature).toBe("face_swap");
    expect(thrown.message).toMatch(/temporarily unavailable/i);
  });

  it("is a no-op for modes without a health-checked upstream", async () => {
    await expect(assertFeatureEnabled("extra_roast", env)).resolves.toBeUndefined();
    await expect(assertFeatureEnabled(undefined, env)).resolves.toBeUndefined();
  });

  it("treats missing upstream URL as disabled", async () => {
    let thrown;
    try {
      await assertFeatureEnabled("face_swap", {});
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe("FEATURE_DISABLED");
  });
});

describe("getFeatureAvailability", () => {
  it("returns a snapshot for every health-checked feature", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 200 }))
    );

    const snapshot = await getFeatureAvailability(env);
    expect(snapshot.face_swap.healthy).toBe(true);
  });
});
