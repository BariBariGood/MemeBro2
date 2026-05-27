/**
 * @file requestQueue.test.js
 * Unit tests for src/requestQueue.js (issue #34).
 */

import { describe, expect, it } from "vitest";
import {
  createQueueState,
  currentRate,
  enqueueRequest,
  queueDepth,
} from "../src/requestQueue.js";

/**
 * Wait for a given number of milliseconds.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("enqueueRequest", () => {
  it("runs tasks immediately while under the rate limit", async () => {
    const state = createQueueState({ rateLimit: 10, windowMs: 1000 });
    const results = [];

    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        enqueueRequest(async () => {
          results.push(i);
          return i;
        }, state)
      )
    );

    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(queueDepth(state)).toBe(0);
  });

  it("queues requests once the rate exceeds the configured limit", async () => {
    const state = createQueueState({
      rateLimit: 3,
      windowMs: 100,
      maxQueueSize: 50,
    });

    const promises = Array.from({ length: 6 }, (_, i) =>
      enqueueRequest(async () => i, state)
    );

    // Give the synchronous portion a tick to schedule the queued work.
    await Promise.resolve();
    expect(queueDepth(state)).toBeGreaterThan(0);

    const settled = await Promise.all(promises);
    expect(settled).toEqual([0, 1, 2, 3, 4, 5]);
    expect(queueDepth(state)).toBe(0);
  });

  it("processes queued tasks in FIFO order", async () => {
    const state = createQueueState({
      rateLimit: 2,
      windowMs: 60,
      maxQueueSize: 50,
    });

    const order = [];
    const tasks = [];
    for (let i = 0; i < 8; i += 1) {
      tasks.push(
        enqueueRequest(async () => {
          order.push(i);
          return i;
        }, state)
      );
    }

    await Promise.all(tasks);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("applies backpressure with QUEUE_FULL when the queue is saturated", async () => {
    const state = createQueueState({
      rateLimit: 1,
      windowMs: 2_000,
      maxQueueSize: 2,
    });

    // First two arrivals fit (1 runs, the next 2 queue).
    const accepted = [
      enqueueRequest(async () => "run", state),
      enqueueRequest(async () => "q1", state),
      enqueueRequest(async () => "q2", state),
    ];

    let rejection;
    try {
      await enqueueRequest(async () => "overflow", state);
    } catch (err) {
      rejection = err;
    }

    expect(rejection).toBeDefined();
    expect(rejection.code).toBe("QUEUE_FULL");
    expect(rejection.retryable).toBe(true);

    // Allow the rest of the queue to drain before exiting the test.
    await Promise.allSettled(accepted);
  });

  it("paces queued work so the rate limit is not exceeded", async () => {
    const state = createQueueState({
      rateLimit: 3,
      windowMs: 100,
      maxQueueSize: 50,
    });

    const start = Date.now();
    await Promise.all(
      Array.from({ length: 6 }, () => enqueueRequest(async () => Date.now(), state))
    );
    const elapsed = Date.now() - start;

    // We pushed 6 tasks through a 3-per-100ms limit, so the second batch
    // should wait roughly one window before running.
    expect(elapsed).toBeGreaterThanOrEqual(80);
  });

  it("currentRate reflects only arrivals inside the sliding window", async () => {
    const state = createQueueState({
      rateLimit: 50,
      windowMs: 40,
      maxQueueSize: 50,
    });

    await Promise.all(
      Array.from({ length: 4 }, () => enqueueRequest(async () => "ok", state))
    );
    expect(currentRate(state)).toBe(4);

    await sleep(60);
    expect(currentRate(state)).toBe(0);
  });

  it("propagates task rejection back to the caller", async () => {
    const state = createQueueState();
    await expect(
      enqueueRequest(async () => {
        throw new Error("boom");
      }, state)
    ).rejects.toThrow("boom");
  });
});
