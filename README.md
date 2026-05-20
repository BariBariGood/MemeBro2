# cse110 project topic: memebro

## Project Links

- Upload flow app (standards-based frontend): `web/index.html`
- End-user documentation website: `docs/index.html`
- Cloudflare Worker API gateway: `worker/`
- Unified local run via Wrangler: from `worker/`, run `npm run dev` and open `/` (app), `/docs/` (docs), and `/api/process` (API)

## Architecture Decisions (MADR)

- `ADRs/0003-client-side-face-detection-strategy.md`
- `ADRs/0004-frontend-implementation-constraints.md`
- Existing backend ADRs remain in `ADRs/`

## Deployment Constraints

Frontend assets are static and can be hosted on Cloudflare Pages or GitHub Pages. Backend API runs on Cloudflare Workers.
