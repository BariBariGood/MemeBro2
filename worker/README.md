# MemeBro Cloudflare Worker

Gateway Worker scaffold (Wrangler + Vitest).

## Prerequisites

- Node.js (LTS recommended)
- npm

## Install

```bash
cd worker
npm install
```

`npm install` also prepares the browser MediaPipe files under `public/.generated/mediapipe/`.
That generated folder is ignored by git, so run `npm run build:assets` if you ever need to recreate it manually.

## Local development

```bash
npm run dev
```

Then open `http://localhost:8787/` (default Wrangler port). The upload app should load from `public/index.html`.

`npm run dev` runs `npm run build:assets` first so a clean checkout has the MediaPipe JS, WASM, and face model files before the browser imports `public/app.js`.


## Environment variables and API keys

- **Non-secret config** can go under `vars` in `wrangler.jsonc` (see commented example in that file).
- **Secrets (API keys)** must not be committed. For local dev, copy `.dev.vars.example` to `.dev.vars` and set values there. Wrangler loads `.dev.vars` automatically when you run `wrangler dev`.
- For deployed environments, use `wrangler secret put <VARIABLE_NAME>` and read from `env` in the Worker.
- The final Add Face submit calls `/api/process`, so local submit testing needs `OPENAI_API_KEY`, `FACE_SWAP_API_URL`, and any related upstream config in `.dev.vars`.
- The Worker now also exposes built-in OpenAI routes:
  - `POST /api/caption` (chat-completions caption generation)
  - `POST /api/image` (gpt-image-1 generation/edits)
- Optional model vars:
  - `OPENAI_MODEL` (default `gpt-4o-mini`)
  - `OPENAI_IMAGE_MODEL` (default `gpt-image-1`)
- If `IMAGE_GEN_API_URL` / `EXTRA_ROAST_API_URL` is not set, `/api/process` with `mode=extra_roast` automatically falls back to the built-in `/api/image` logic.

## Tests

```bash
npm test
```

## Deploy

```bash
npm run deploy
```

Requires a Cloudflare account and Wrangler login (`npx wrangler login`).
