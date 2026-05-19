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

## Local development

```bash
npm run dev
```

Then open or request `http://localhost:8787/` (default Wrangler port). You should see the Hello World response.


## Environment variables and API keys

- **Non-secret config** can go under `vars` in `wrangler.jsonc` (see commented example in that file).
- **Secrets (API keys)** must not be committed. For local dev, copy `.dev.vars.example` to `.dev.vars` and set values there. Wrangler loads `.dev.vars` automatically when you run `wrangler dev`.
- For deployed environments, use `wrangler secret put <VARIABLE_NAME>` and read from `env` in the Worker.

## Tests

```bash
npm test
```

## Deploy

```bash
npm run deploy
```

Requires a Cloudflare account and Wrangler login (`npx wrangler login`).
