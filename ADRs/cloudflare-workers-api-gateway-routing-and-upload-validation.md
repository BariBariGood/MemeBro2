# Cloudflare Workers API Gateway Routing and Upload Validation ADR

Primary Task: Build the backend gateway that routes API requests to external services, enforces timeouts, handles retries on rate limits, validates payloads, and never leaks secrets. This ADR summarizes how we completed the remaining work for issue #38, "Request routing + API key safety", and issue #39, "Payload size validation".

Preface: The Worker already had partial library-level support for environment validation, timeouts, 429 retry handling, and upload validation. The main gap was that the Worker still exposed a Hello World route, `callAPI()` accepted raw URLs instead of feature modes, env validation was not wired into outbound calls, and payload-size validation did not produce an HTTP 413 response.

## Request Routing and API Key Safety - Issue #38

### __Task__:
- Route by mode:
  - `face_swap` -> face-swap API
  - `extra_roast` -> image-generation API
- Prevent external URLs from being supplied directly by clients.
- Validate required env vars before outbound calls.
- Never expose API keys in logs or errors.
- Tests: Mock fetch and assert different modes hit different endpoints.
- Acceptance: Different modes hit different endpoints, invalid modes are rejected.

### __Prompt__:
Implement the remaining Cloudflare Worker gateway work for request routing and API key safety. Add a route function that maps supported modes to env-configured upstream URLs. Change `callAPI()` so callers pass a mode instead of a raw URL. Validate required env variables before outbound fetches, reject invalid modes with `INVALID_MODE`, and make sure API keys are not leaked through logs or errors.

### __Reasoning/Concerns__:
The original `callAPI(url, ...)` shape was risky because it allowed a caller to decide the upstream URL. For a backend gateway, the Worker should own external routing so the frontend can only request a supported mode. This avoids accidental URL exposure, keeps routing policy centralized, and makes mode-to-endpoint behavior easy to test.

API key safety needed two layers:
- Do not log request headers, bodies, or raw URLs with query strings.
- Redact OpenAI-style keys and configured secret values from error messages before errors leave the gateway.

The implementation validates env vars inside `callAPI()` immediately after resolving the route and before any outbound fetch. This keeps the existing `validateEnv()` behavior but actually wires it into the gateway path.

### __Decision__:
Use a mode-based route table in `worker/src/callManager.js`.

Supported routing:
- `face_swap` uses `env.FACE_SWAP_API_URL`.
- `extra_roast` uses `env.EXTRA_ROAST_API_URL` when present, otherwise falls back to `env.IMAGE_GEN_API_URL`.

`callAPI()` now accepts:

```js
callAPI(mode, options, env)
```

instead of:

```js
callAPI(url, options, env)
```

The Worker adds the gateway-managed API key to outbound requests server-side and validates required env vars before fetching.

### __AI Summary__:
Implemented `routeRequest(mode, env)` and updated `callAPI()` to route internally by mode. Invalid modes now throw a structured `INVALID_MODE` error before any fetch occurs. `callAPI()` validates `OPENAI_API_KEY` and the selected upstream URL env var before outbound calls, attaches the gateway auth header, preserves timeout and retry behavior, and redacts secrets from thrown errors.

Also added `redactSecrets()` and changed fetch timing logs to log only origin/path, not query strings. This reduces the chance of leaking key-bearing URLs in Worker logs.

Added tests for:
- `face_swap` routes to `FACE_SWAP_API_URL`
- `extra_roast` routes to `IMAGE_GEN_API_URL`
- different modes hit different mocked fetch URLs
- invalid modes are rejected
- env validation happens before fetch
- secret strings are redacted from errors

## Payload Size Validation - Issue #39

### __Task__:
- Reject image upload requests over 10 MB.
- Return HTTP 413 with a structured error body.
- Ensure 9 MB uploads are accepted at validation level.
- Wire `validateUpload()` into the Worker route.
- Tests: 10 MB+ rejected, 9 MB accepted.

### __Prompt__:
Wire upload validation into the Cloudflare Worker route. The Worker should inspect `Content-Length` when available, read the body with the same 10 MB limit used by `validateUpload()`, call `validateUpload()` for image uploads, and return HTTP 413 with `PAYLOAD_TOO_LARGE` when the payload is too large.

### __Reasoning/Concerns__:
The validator already had a 10 MB `MAX_FILE_SIZE` constant and threw `PAYLOAD_TOO_LARGE`, but that behavior was only library-level. It did not protect the actual Worker request path. The gateway needed to reject oversized uploads before forwarding anything to external services.

The Worker now checks size in two places:
- `Content-Length` is checked first when present, so clearly oversized requests can be rejected before reading the full body.
- The actual `ArrayBuffer.byteLength` is checked after reading, so requests without `Content-Length` are still enforced.

This keeps the Worker behavior aligned with the validator while still allowing the validator to perform MIME, magic-byte, and filename checks.

### __Decision__:
Export `MAX_FILE_SIZE` from `worker/src/validator.js` and reuse it in `worker/src/index.js`. The Worker route `/api/process` handles raw image uploads and JSON gateway requests.

For image uploads, the Worker:
- reads the request body with the 10 MB limit,
- calls `validateUpload()`,
- forwards only valid images through `callAPI(mode, options, env)`,
- returns HTTP 413 for `PAYLOAD_TOO_LARGE`.

For JSON requests, the Worker:
- reads the body with the same 10 MB limit,
- extracts `mode` from the JSON payload, query string, or `X-MemeBro-Mode` header,
- routes through the same `callAPI()` gateway path.

### __AI Summary__:
Replaced the Hello World Worker with a real API gateway route at `/api/process`. The route accepts POST requests, supports image and JSON request bodies, extracts the feature mode, enforces the shared 10 MB upload limit, validates image uploads, and returns structured JSON errors.

Oversized image uploads now return:

```json
{
  "code": "PAYLOAD_TOO_LARGE",
  "message": "Maximum upload size is 10 MB",
  "retryable": false
}
```

with HTTP status `413`.

Added tests for:
- Worker returns HTTP 413 for 10 MB + 1 byte image upload
- 9 MB image upload is accepted and forwarded
- validator accepts a file just under 9 MB
- validator rejects 10 MB + 1 byte

## Environment Variables

The local env example was updated to document:

- `FACE_SWAP_API_URL`
- `IMAGE_GEN_API_URL`
- optional `EXTRA_ROAST_API_URL`
- `OPENAI_API_KEY`

`wrangler.jsonc` now includes commented examples for non-secret upstream URL vars. Real API keys should stay in `.dev.vars` for local development or be configured with `wrangler secret put` for deployed environments.

## Files Changed

- `worker/src/callManager.js`: added mode routing, env validation before fetch, gateway auth header injection, secret redaction, safer URL logging, and mode-based `callAPI()`.
- `worker/src/index.js`: replaced Hello World with `/api/process`, JSON/image request parsing, payload-size enforcement, upload validation, and structured error responses.
- `worker/src/validator.js`: exported `MAX_FILE_SIZE` so the Worker route uses the same 10 MB limit as the validator.
- `worker/test/callManager.test.js`: added routing, invalid mode, env validation, and redaction tests.
- `worker/test/index.spec.js`: replaced Hello World tests with Worker gateway and HTTP 413 tests.
- `worker/test/validator.test.js`: added explicit 9 MB accepted and 10 MB + 1 byte rejected tests.
- `worker/.dev.vars.example`: documented required local env vars.
- `worker/wrangler.jsonc`: added commented non-secret upstream URL examples.

## Verification

Ran the Worker test suite with Vitest:

```bash
npm test
```

Result:
- 3 test files passed
- 39 tests passed

One test-harness warning remains: the installed Cloudflare Workers runtime supports compatibility date `2026-03-10`, so tests fall back from the configured `2026-05-19` compatibility date. This did not fail the suite.

## Consequences and Follow-Ups

The frontend now has one gateway surface, `/api/process`, instead of calling external APIs directly. This keeps API keys server-side and makes routing testable.

The current upload handler supports raw image uploads and JSON payloads. Multipart form parsing is not implemented yet. If the frontend sends multipart uploads later, the Worker should add a multipart parser or standardize the upload contract before integration.

The gateway currently attaches `OPENAI_API_KEY` as the default `Authorization` bearer token for outbound calls. If the face-swap provider requires a different credential, add a mode-specific secret mapping such as `FACE_SWAP_API_KEY` while preserving the same env validation and redaction pattern.
