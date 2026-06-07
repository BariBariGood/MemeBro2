## Recents Tab Persistence
### Context

Users need a way to return to recently edited memes after saving, exporting, or reloading the app. The existing template Recents behavior is not enough because it only tracks recently used templates, not full meme edit state.

The saved meme state needs to include the current image, edit history, text content, text transformations, save/export time, editor mode, and a small preview image. The preview grid should load quickly and use compact thumbnails, while full editor restoration should use the complete stored snapshot.

### Decision

Add a recent meme storage flow backed by IndexedDB and localStorage.

Recent meme snapshots are saved through `worker/public/js/save.js` and `worker/public/js/recents.js`. The Save button on the editor layout creates a snapshot of the current editor state and stores:

- Current image
- Edit history and redo history
- Text content
- Text transformation
- Time of save/export
- Editor mode: `face_swap`, `ai_prompt`, or `text`
- 256px WEBP thumbnail

Full snapshots and thumbnails are stored in IndexedDB. Lightweight metadata is stored in localStorage under `recent-memes`, sorted newest first.

The store is capped at 20 memes. When saving item 21, the oldest meme is removed from localStorage metadata and IndexedDB before the new meme is saved.

The Recents tab renders saved meme cards using the stored 256px WEBP thumbnails. Cards are ordered newest first in the same left-to-right, top-to-bottom grid flow as Trending. If no recent memes exist, the tab shows:

```text
No Recent Memes Yet.

Create your first meme from the Trending Tab
```

The empty state includes a CTA that switches back to the Trending tab.

Clicking a recent meme loads metadata from localStorage and the full snapshot from IndexedDB, then restores the editor to the saved state, including image, text, transformations, and edit history.

### Consequence

Saved memes persist across reloads and can be restored from the Recents tab. The Recents tab now represents recently saved meme edits rather than recently used templates.

The preview grid can render quickly because it reads lightweight metadata and thumbnail records instead of loading full snapshots for every card. Full snapshot retrieval only happens when a user opens a recent meme.

Tests for grid behavior were refactored to exercise the real app rendering paths instead of duplicate local test implementations. Save behavior is covered at both the module level and the button integration level.

### Trade-Offs/Risks

IndexedDB and localStorage can fail because of browser storage limits, private browsing modes, or user storage cleanup. Save behavior should not block normal editing if persistence fails.

Object URLs used for thumbnail previews must be revoked to avoid leaking memory during repeated Recents tab renders.

The 20-item cap limits storage growth but means older saved memes are automatically removed. Users do not currently receive a warning before the oldest saved meme is evicted.

Because Recents now means saved meme edits, any previous expectation that the tab lists recently used templates is superseded by this decision.
