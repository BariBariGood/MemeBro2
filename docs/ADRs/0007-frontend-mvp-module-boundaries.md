# Frontend MVP Module Boundaries

## Status
Accepted

## Context
`worker/public/app.js` has grown into the main frontend orchestrator for upload, face detection, template selection, editor state, face swap submission, and result handling. It is currently large enough that parallel agent work can easily create overlapping edits and merge conflicts.

The immediate refactor goal is not to redesign the frontend. The goal is to move stable, already-existing code into small modules so upcoming feature work has clear places to land.

## Decision
Create an MVP module split under `worker/public/lib/` while keeping `worker/public/app.js` as the top-level orchestrator.

The first refactor pass will extract only stable code:

- `state.js` owns shared frontend state and storage keys.
- `constants.js` owns static configuration, detection tuning values, and meme text option maps.
- `dom.js` owns cached DOM references.
- `api.js` owns frontend network calls.
- `faceDetect.js` owns MediaPipe setup, detection, tiling, and face-merge logic.
- `upload.js` owns camera, library upload, manual-fit fallback, and image decoding.
- `utils.js` owns small shared pure helpers.

Editor/layer behavior is intentionally not extracted in this pass because the next editor feature will change that flow. Extracting it now would duplicate work and increase conflicts.

## Module Ownership

| Module | Current `app.js` ownership |
| --- | --- |
| `state.js` | `STATES`, default meme text/style values, `state`, `EDITOR_HISTORY_STORAGE_KEY`, `RECENTS_STORAGE_KEY` |
| `constants.js` | upload allowed types, detection constants, MediaPipe asset paths, detection failure messages, font/color/size maps |
| `dom.js` | the central `dom` object of `document.getElementById(...)` references |
| `api.js` | `fetch("/templates.json")`, `fetch("/api/process")`, and future `/api/caption` / template-suggestion calls |
| `faceDetect.js` | MediaPipe imports, `createFaceDetectionAdapter`, detection tile helpers, face merge/dedupe helpers, high-level `detectFaces` functions, and the adapter instance |
| `upload.js` | camera stream/review handling, file decode, manual-fit helpers, camera capture/use/flip flows, upload-choice navigation, and manual drag handlers |
| `utils.js` | `withTimeout`, `normalizeBox`, `clamp`, `cloneSnapshot`, and other small pure helpers that do not belong to a feature module |

## Current Line Range Map

These line ranges are based on `worker/public/app.js` at the time of this ADR. If line numbers drift, keep the ownership intent rather than the exact numbers.

```text
state.js       app.js:6-13, 39-45, 175-251, 253
constants.js   app.js:15-38, 47-77
dom.js         app.js:79-173
api.js         app.js:1671 (templates.json fetch), 2160 (/api/process fetch)
faceDetect.js  app.js:1-4, 255-503, 1521-1597
upload.js      app.js:510-524, 582-600, 1373-1520, 2237-2295, 2297, 2796-2816
utils.js       app.js:602-634, 753-759
```

## Import Rules

- `app.js` remains the only orchestration layer during this MVP refactor.
- Modules should avoid importing `app.js`.
- `api.js` must contain frontend `fetch(...)` calls; new feature code should not add direct `fetch(...)` calls back into `app.js`.
- `faceDetect.js` is the only module that should import MediaPipe generated assets.
- `upload.js` may depend on `faceDetect.js`, `state.js`, `dom.js`, `constants.js`, and `utils.js`.
- `state.js`, `constants.js`, and `utils.js` should stay low-level and avoid DOM access.

## Explicitly Out of Scope

Do not extract these in the MVP cleanup pass:

- `editor.js` for text overlay, undo/redo, drag/resize, and toolbar logic.
- `layers.js` for the future post-swap layer editor.
- `styles.css` splitting.
- Backend worker modules.
- Large behavior rewrites or new features.

These should be handled by later feature/refactor issues after the post-swap text-layer direction is implemented.

## Consequences

### Positive

- Parallel refactor tasks have clear file ownership.
- Future AI agents can work in smaller files with less context noise.
- New AI caption, prompt suggestion, share/export, and gallery features have obvious module homes.
- The refactor can be reviewed as mostly move-only behavior preservation.

### Tradeoffs

- `app.js` will still contain editor and orchestration logic after this pass.
- Imports will temporarily increase before the final editor refactor.
- Exact line numbers in this ADR may drift as other work lands, so reviewers must enforce ownership intent rather than line-number literalism.

## Verification

Every module extraction PR should preserve behavior and run:

```powershell
npm run test:worker -- --run
npm run test:ui -- --run
```

Manual smoke testing should cover template selection, upload from library, camera capture when available, face detection, manual fit fallback, face swap submission, and editor history persistence.
