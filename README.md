# cse110 project topic: memebro

## Project Links
- youtube video:https://youtu.be/yxKbU6RzruE
- Upload flow app: `worker/public/index.html`
- Cloudflare Worker API gateway: `worker/src/index.js`
- Unified local run via Wrangler: from `worker/`, run `npm install`, then `npm run dev`, and open `http://localhost:8787/`

## Architecture Decisions (MADR)

- `ADRs/0003-client-side-face-detection-strategy.md`
- `ADRs/0004-frontend-implementation-constraints.md`
- Existing backend ADRs remain in `ADRs/`

## Deployment Constraints

Frontend assets are served by the Cloudflare Worker static asset binding. Backend API runs on Cloudflare Workers.
