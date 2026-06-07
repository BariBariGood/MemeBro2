## Template Editing Back-Navigation Confirmation

### Context

Users can spend a significant amount of time customizing meme templates within the editor. Editing actions include:

* Modifying text content
* Repositioning text
* Adjusting font size
* Changing text styles
* Updating colors
* Configuring outlines and other formatting

Prior to this change, tapping the editor's back button immediately navigated away from the studio, causing all in-progress changes to be lost.

This behavior created several problems:

* Accidental taps could discard meaningful work.
* Users received no warning before losing edits.
* Navigation behavior was inconsistent with user expectations for editing workflows.
* Recovering lost edits required restarting the editing process from the beginning.

The editor already maintained snapshot state through `state.editor.initialSnapshot`, making it possible to detect whether meaningful changes had occurred since entering the editor.

### Decision

Implemented a confirmation workflow when navigating away from the studio/editor screen.

When the user taps the back button:

1. Determine whether unsaved edits exist.
2. If no edits exist, navigate normally.
3. If unsaved edits exist, display a confirmation dialog warning that progress will be lost.
4. If the user cancels, remain in the editor with all current state preserved.
5. If the user confirms, perform a complete editor reset and return to template selection.

#### Unsaved Edit Detection

Unsaved edits are determined by comparing the current editor snapshot against:

```javascript
state.editor.initialSnapshot
```

using the existing snapshot equality logic.

This approach avoids maintaining separate dirty flags and ensures the confirmation logic remains aligned with the editor's actual state.

#### Confirmed Back Behavior

When the user confirms navigation:

* Reinitialize editor state via:

```javascript
initializeEditorState()
```

* Clear persisted editor history via:

```javascript
clearEditorHistoryPersistence()
```

* Clear the selected template:

```javascript
state.selectedTemplateId = null
```

* Return to the template selection view:

```javascript
state.view = "templates"
```

* Re-render the application UI.

#### UI Implementation

Added a dedicated confirmation modal:

```html
#back-confirmation
```

The modal reuses the existing reset-confirmation styling to maintain visual consistency across destructive actions.

New state and helper functions include:

* `state.showBackConfirmation`
* `hasUnsavedStudioEdits()`
* `confirmBackAndResetStudio()`

Navigation logic in `goBackToUploadChoices()` was updated to route editor exits through the confirmation workflow when required.

### Consequence

The editor now protects users from accidentally losing work while maintaining a predictable navigation experience.

Benefits include:

* Prevention of accidental data loss.
* Clear communication before destructive actions.
* Consistent reset behavior across editor workflows.
* Improved confidence when editing templates.
* Reuse of existing editor snapshot infrastructure.
* Minimal changes to the underlying editor architecture.

The resulting behavior aligns with common expectations for content-editing applications where unsaved work may be discarded.

### Trade-Offs/Risks

#### Advantages

* Significantly reduces accidental loss of user work.
* Makes editor navigation behavior explicit and predictable.
* Leverages existing snapshot comparison logic rather than introducing a separate tracking mechanism.
* Keeps reset and back-navigation semantics aligned.

#### Risks

* Adds an additional interaction step when leaving the editor with unsaved changes.
* Accuracy depends on the correctness of snapshot equality comparisons.
* Future editor features must continue to be represented in snapshot state to ensure unsaved-edit detection remains reliable.

#### Maintenance Considerations

* Any new editable properties must be included in snapshot generation and comparison logic.
* Changes to editor persistence mechanisms should continue to clear state during confirmed back-navigation.
* Confirmation messaging should remain consistent with other destructive actions throughout the application.

### Files

Modified files:

* `worker/public/index.html`
* `worker/public/app.js`
