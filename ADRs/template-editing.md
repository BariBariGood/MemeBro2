# Template Editing

## Status
Accepted

## Context
Users can spend significant time editing template text (content, position, size, style, color, outline), and accidentally tapping the top back button can discard that work.

Without a confirmation step, this creates high-friction data loss and a confusing UX.

## Decision
When the user taps the top back button while on the studio/editor screen:

1. Detect whether there are unsaved template edits.
2. If there are unsaved edits, show a confirmation dialog warning that progress will be lost.
3. If user confirms, perform a complete editor reset and navigate back to template selection.
4. If user cancels, keep the user in the editor with current state intact.

### Unsaved Edit Rule
Unsaved edits are detected by comparing the current editor snapshot to `state.editor.initialSnapshot` using existing snapshot equality logic.

### Confirmed Back Behavior (Complete Reset)
On confirm:
- Reinitialize editor state via `initializeEditorState()`.
- Clear persisted editor history via `clearEditorHistoryPersistence()`.
- Clear selected template and return to template list (`state.selectedTemplateId = null`, `state.view = "templates"`).
- Re-render template list and UI.

## Implementation Notes
- Added back confirmation modal in `worker/public/index.html` (`#back-confirmation`).
- Reused modal styling from reset confirmation for visual consistency.
- Added app state flag `state.showBackConfirmation`.
- Added helpers in `worker/public/app.js`:
  - `hasUnsavedStudioEdits()`
  - `confirmBackAndResetStudio()`
- Updated `goBackToUploadChoices()` to gate studio back-navigation through this confirmation flow.

## Consequences
### Positive
- Prevents accidental loss of meaningful editor work.
- Makes navigation behavior predictable and explicit.
- Keeps reset semantics consistent (confirmed back means full reset).

### Tradeoffs
- Adds one extra click when leaving with edits.
- Requires careful maintenance of snapshot equality to keep detection accurate.

## Files
- `worker/public/index.html`
- `worker/public/app.js`
