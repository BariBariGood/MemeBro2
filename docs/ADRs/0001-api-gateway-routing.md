## Cloudflare Workers API Gateway Routing and Upload Validation

### Context

The Cloudflare Worker already contained partial library-level support for environment validation, request timeouts, 429 retry handling, and upload validation. However, several critical gaps remained:

**Issue #38 – Request Routing + API Key Safety**

* The Worker still exposed a Hello World route instead of a production gateway endpoint.
* `callAPI()` accepted arbitrary URLs, allowing callers to determine upstream destinations.
* Environment validation was not enforced before outbound requests.
* API keys and secret values could potentially be exposed through logs or error messages.
* Routing behavior was not centralized or easily testable.

The existing `callAPI(url, options, env)` interface created unnecessary risk because clients could influence outbound routing. The gateway should own all upstream routing decisions and expose only approved feature modes.

**Issue #39 – Payload Size Validation**

* Upload validation existed only at the library level.
* The Worker route did not enforce the 10 MB upload limit.
* Oversized uploads were not translated into HTTP 413 responses.
* Requests could potentially be forwarded to external services before size validation occurred.

The gateway needed to enforce upload limits at the Worker boundary and return structured errors before forwarding requests.

### Decision

#### Request Routing and API Key Safety

Implemented a mode-based routing system in `worker/src/callManager.js`.

Supported routes:

* `face_swap` → `env.FACE_SWAP_API_URL`
* `extra_roast` → `env.EXTRA_ROAST_API_URL`
* Fallback for `extra_roast` → `env.IMAGE_GEN_API_URL`

Changed the API interface from:

```js
callAPI(url, options, env)
```

to:

```js
callAPI(mode, options, env)
```

The gateway now:

* Resolves upstream URLs internally through `routeRequest(mode, env)`.
* Rejects unsupported modes with a structured `INVALID_MODE` error.
* Validates required environment variables before any outbound fetch.
* Attaches API credentials server-side.
* Redacts secret values and API keys from error messages.
* Avoids logging request bodies, headers, or query-string-bearing URLs.
* Preserves existing timeout and rate-limit retry behavior.

#### Payload Size Validation

Exported and reused the shared `MAX_FILE_SIZE` constant from `worker/src/validator.js`.

Replaced the Hello World Worker with a gateway endpoint at:

```text
/api/process
```

For image uploads, the Worker now:

* Checks `Content-Length` when available.
* Reads request bodies using the shared 10 MB limit.
* Validates uploads using `validateUpload()`.
* Rejects oversized uploads with HTTP 413 and a structured error response.
* Forwards only validated uploads through the gateway.

For JSON requests, the Worker now:

* Applies the same 10 MB request limit.
* Extracts the processing mode from:

  * JSON payload
  * Query string
  * `X-MemeBro-Mode` header
* Routes requests through the same gateway path and validation logic.

### Consequence

The Worker now functions as a centralized API gateway rather than a simple proxy or placeholder endpoint.

Benefits include:

* Clients can only invoke approved processing modes.
* Upstream URLs are no longer client-controlled.
* API keys remain server-side and are protected from logs and error messages.
* Environment configuration issues are detected before outbound requests occur.
* Routing behavior is centralized and testable.
* Oversized uploads are rejected before external API calls are made.
* Both image and JSON requests share consistent validation and routing behavior.
* Structured error responses improve client-side handling and observability.

Verification was completed through the Vitest suite:

* 3 test files passed
* 39 tests passed

Additional tests verify:

* Mode-to-endpoint routing behavior
* Invalid mode rejection
* Environment validation before fetch execution
* Secret redaction
* HTTP 413 responses for oversized uploads
* Acceptance of valid uploads below the size limit

A compatibility-date warning remains in the test harness because the installed Workers runtime supports `2026-03-10` while the project configuration specifies `2026-05-19`. This does not impact test success.

### Trade-Offs/Risks

#### Routing and Gateway Design

**Advantages**

* Stronger security through server-controlled routing.
* Easier testing and maintenance.
* Reduced risk of URL manipulation and endpoint exposure.
* Consistent environment validation.

**Risks / Limitations**

* New processing modes require explicit route-table updates.
* Mode-based routing introduces a maintenance step when onboarding new providers.
* Current outbound authentication assumes a shared `OPENAI_API_KEY`.

**Future Considerations**

* Add provider-specific credentials such as `FACE_SWAP_API_KEY` when required.
* Preserve existing validation and redaction patterns for new secrets.

#### Upload Validation

**Advantages**

* Prevents forwarding oversized payloads to external services.
* Reduces bandwidth and upstream processing costs.
* Consistent enforcement regardless of whether `Content-Length` is supplied.

**Risks / Limitations**

* The Worker currently supports raw image uploads and JSON requests only.
* Multipart form uploads are not yet supported.
* Large requests are still read up to the configured limit before validation can complete when `Content-Length` is absent.

**Future Considerations**

* Implement multipart parsing if frontend requirements evolve.
* Standardize upload contracts across all clients before introducing additional upload formats.
