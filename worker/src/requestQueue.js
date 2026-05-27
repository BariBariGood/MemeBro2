/**
 * @module requestQueue
 * FIFO request queue with backpressure for the MemeBro API gateway (issue #34).
 *
 * Strategy:
 * - Track recent request arrivals in a sliding 1-second window.
 * - When the arrival rate exceeds `RATE_LIMIT_PER_SECOND`, additional
 *   requests enter a FIFO queue instead of being rejected outright.
 * - Queued tasks are processed in insertion order, capped at the same rate so
 *   downstream services are not stampeded.
 * - If the queue grows past `MAX_QUEUE_SIZE`, the gateway returns QUEUE_FULL
 *   (HTTP 503) so callers receive backpressure instead of unbounded latency.
 *
 * The queue is intentionally in-memory: the Cloudflare Workers runtime gives
 * each isolate its own module-level state, which is the same lifetime we
 * want for short-lived burst smoothing. This is not a durable queue and is
 * not meant to survive isolate eviction.
 */

import { ErrorCodes } from "./errors.js";

/** Maximum sustained inbound rate before queuing kicks in. */
const RATE_LIMIT_PER_SECOND = 10;

/** Maximum number of queued requests before we shed load. */
const MAX_QUEUE_SIZE = 50;

/** Sliding window size in milliseconds for arrival-rate tracking. */
const RATE_WINDOW_MS = 1000;

/**
 * Builds a fresh queue state object. Exported so tests can use independent
 * queues without sharing module-level state.
 *
 * @param {Object} [options]
 * @param {number} [options.rateLimit] - Requests per second before queueing
 * @param {number} [options.maxQueueSize] - Maximum queued requests
 * @param {number} [options.windowMs] - Sliding window size
 * @returns {{ arrivals: number[], queue: Array<{ task: Function, resolve: Function, reject: Function }>, processing: boolean, config: { rateLimit: number, maxQueueSize: number, windowMs: number } }}
 */
export function createQueueState(options = {}) {
  return {
    arrivals: [],
    queue: [],
    processing: false,
    config: {
      rateLimit: Number.isFinite(options.rateLimit)
        ? options.rateLimit
        : RATE_LIMIT_PER_SECOND,
      maxQueueSize: Number.isFinite(options.maxQueueSize)
        ? options.maxQueueSize
        : MAX_QUEUE_SIZE,
      windowMs: Number.isFinite(options.windowMs)
        ? options.windowMs
        : RATE_WINDOW_MS,
    },
  };
}

/** Shared default state used by `enqueueRequest`. */
const defaultState = createQueueState();

/**
 * Drops timestamps that have fallen outside the sliding window so the next
 * arrival-count check reflects only the most recent activity.
 *
 * @param {ReturnType<createQueueState>} state
 * @param {number} now
 */
function trimArrivals(state, now) {
  const cutoff = now - state.config.windowMs;
  while (state.arrivals.length && state.arrivals[0] < cutoff) {
    state.arrivals.shift();
  }
}

/**
 * Returns the number of arrivals recorded within the sliding window.
 *
 * @param {ReturnType<createQueueState>} state
 * @returns {number}
 */
export function currentRate(state = defaultState) {
  trimArrivals(state, Date.now());
  return state.arrivals.length;
}

/**
 * Returns the current queue depth.
 *
 * @param {ReturnType<createQueueState>} state
 * @returns {number}
 */
export function queueDepth(state = defaultState) {
  return state.queue.length;
}

/**
 * Clears all queued work and arrival history. Test-only helper.
 *
 * @param {ReturnType<createQueueState>} state
 */
export function resetQueue(state = defaultState) {
  state.arrivals.length = 0;
  state.queue.length = 0;
  state.processing = false;
}

/**
 * Constructs a QUEUE_FULL error so callers can map it to HTTP 503.
 *
 * @returns {Error}
 */
function queueFullError() {
  const err = new Error(
    "Server is busy; please retry shortly (queue saturated)"
  );
  err.code = ErrorCodes.QUEUE_FULL;
  err.retryable = true;
  return err;
}

/**
 * Returns the soonest wall-clock time (ms since epoch) at which another
 * request may run without exceeding the configured rate limit. When the
 * limit has not been reached yet, returns 0 so the task can run immediately.
 *
 * @param {ReturnType<createQueueState>} state
 * @param {number} now
 * @returns {number}
 */
function nextAvailableAt(state, now) {
  trimArrivals(state, now);
  if (state.arrivals.length < state.config.rateLimit) return 0;
  const oldest = state.arrivals[0];
  return oldest + state.config.windowMs;
}

/**
 * Drains the queue in FIFO order, pacing the work so the configured rate
 * limit is not exceeded. Recursive scheduling via setTimeout keeps the call
 * stack shallow regardless of queue depth.
 *
 * @param {ReturnType<createQueueState>} state
 */
function drainQueue(state) {
  if (state.processing) return;
  if (state.queue.length === 0) return;

  state.processing = true;

  const runNext = () => {
    if (state.queue.length === 0) {
      state.processing = false;
      return;
    }

    const now = Date.now();
    const earliest = nextAvailableAt(state, now);
    const wait = Math.max(0, earliest - now);

    if (wait > 0) {
      setTimeout(runNext, wait);
      return;
    }

    const entry = state.queue.shift();
    state.arrivals.push(Date.now());

    Promise.resolve()
      .then(() => entry.task())
      .then(
        (value) => {
          entry.resolve(value);
          runNext();
        },
        (err) => {
          entry.reject(err);
          runNext();
        }
      );
  };

  runNext();
}

/**
 * Runs `task` either immediately (when below the rate limit) or after the
 * queue catches up. Resolves with the task result or rejects with a
 * QUEUE_FULL error when the queue is saturated.
 *
 * @template T
 * @param {() => Promise<T>|T} task - Work to run, ideally a single outbound
 *   API call. The task is not invoked until the queue is ready to run it.
 * @param {ReturnType<createQueueState>} [state] - Queue state; defaults to
 *   the module-level singleton.
 * @returns {Promise<T>}
 */
export function enqueueRequest(task, state = defaultState) {
  const now = Date.now();
  trimArrivals(state, now);

  if (
    state.arrivals.length < state.config.rateLimit &&
    state.queue.length === 0
  ) {
    state.arrivals.push(now);
    return Promise.resolve().then(() => task());
  }

  if (state.queue.length >= state.config.maxQueueSize) {
    return Promise.reject(queueFullError());
  }

  return new Promise((resolve, reject) => {
    state.queue.push({ task, resolve, reject });
    drainQueue(state);
  });
}

export const __QUEUE_DEFAULTS = {
  RATE_LIMIT_PER_SECOND,
  MAX_QUEUE_SIZE,
  RATE_WINDOW_MS,
};
