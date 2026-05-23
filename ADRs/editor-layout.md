# Editor Layout Task ADR
Primary Task: Build a scrollable grid of 20+ meme templates. Users browse, search by name/tags, and tap to select. Recent and trending tabs show favorite or popular templates. All templates have face region metadata.

Preface: To portion out the process, I will go through and prompt to build off of each sub-issue, building off the previous generation.

## Creating the Editor Layout - Sub Issue #1
### __Task__: 
- Image canvas center (60% of screen height)
- Text editing controls below canvas
- Generate, Undo, Reset, Download buttons
- One-thumb reachable on mobile
- Tests: Custom (layout responsive, buttons positioned)
- Acceptance: All controls reachable comfortably for the user

### __Propmt 1__: 
Using the existing `styles.css` file, create the layout for the editing page.

__Canvas__
- The center of the canvas should start in the middle of the screen
- The size of the canvas should be at max 60% of the screen.
- Ensure that the canvas scales properly with desktop and mobile devices.
- No horizontal scroll
  
__Text Editing__
- The main controls of the editor should be underneath the canvas
- There should be generate, undo, reset, and download buttons
- On mobile screens, the buttons should be reachable using only one thumb
- Scrolling should not be excessive and should be easy for the user
- The buttons should scale properly to fit desktop and mobile devices
- Buttons should not overlap each other or the canvas

Do not edit other files.

### __Reasoning/Concerns__: 
My primary concerns is with how specific some of our terms are. Since we do not have anything specifically mentioned, I tried to specify with behavior. I thought that by separating the task into two parts, it would be easier for the AI to not mix up specifications. 

### __AI Summary__
Updated styles.css to make the editing layout responsive without touching any other files.
The main changes are:
- Prevented horizontal scroll at the page level.
- Constrained the editor canvas to about 60vw on larger screens, while letting it expand safely on mobile.
- Centered the editing surface more intentionally and kept the control area aligned underneath it.
- Improved mobile reachability by making the lower editor actions sticky near the bottom and increasing tap target sizes.
- Made the studio action area flexible so multiple buttons can sit underneath the canvas without overlapping as the screen narrows.
One important note: the current markup does not actually contain generate, undo, reset, and download buttons, so I only changed the layout CSS to support that control pattern cleanly when those controls are present. I didn’t run a browser preview here, so visual verification is still worth doing once the page is loaded locally.

## Implement Result Display After Face-Swap - Sub Issue #4
### __Task__: 
- Show composited image (from backend)
- Text overlay editable
- Undo/Reset available
Tests: Custom (image displays, buttons work)
Acceptance: Image renders within 1 second of API response
Dependencies: F-1, F-2, B-1, B-3, BF-1

1. User is on the editor canvas screen.
2. They trigger face-swap generation.
3. The editor shows a loading/skeleton state.
4. When the backend responds, the canvas swaps from the placeholder/template preview to the composited face-swapped image.
5. The text overlay remains editable on top of that result.
6. Undo/Reset work on the same canvas state.

The result display is the post-generation state of the editor
### __Propmt 2__: 
Using the existing `app.js`, extend the editor canvas flow to support post-face-swap rendering, inline text editing, undo, and reset functionality.

__Display generated image__
- After the face swap api returns a face-swapped image, replace the current template preview image in the canvas with the returned composited image URL.
- Keep the existing canvas structure and overlays intact.

__Inline text editing__
- Continue using existing inline text editing logic in app.js.
- Ensure text overlays remain editable after the swapped image is rendered.
- Edited text should immediately update the displayed overlay state.

__Undo System__
- Store every user action (face swap result + text edits) as a full state snapshot.
- Persist undo history in localStorage.
- Undo restores the previous state snapshot.
- Undo actions themselves must NOT be recorded in history.
  
__Reset behavior__
- Reset restores the original meme template (before face swap and edits).
- Show a confirmation message before resetting:
- Message: "Warning: Reset cannot be undone"
- Buttons: “Cancel” and “Reset”
- Only perform reset after confirmation.
- Cancel closes the message without changes.
- Clear undo history
- Reset actions must NOT be stored in undo history.

__State handling__
- Maintain a single source of truth state object in app.js for:
  - template image
  - generated image
  - overlay text
  - history stack
- Sync UI updates directly from state changes.

No modals should be used

### __Reasoning/Concerns__: 
My primary concern for this task was the functionality of the undo and reset button. The issue did not clearly state what to do so I came up with a skeleton prompt on how it should be done:
```
Using the existing `app.js` file, display the resulting image after the face swap.

__Show Image__
- After the face swap, switch out the template preview in the canvas with the generated image

__Edit Text__
- Using the inline text editing functionality in `app.js`, allow the text of the displayed image to be changed from what it was originally

__Change State__
- When the undo button is pressed, revert the last change made
  - Actions should be stored in localStorage (includes the face swap, or text edits)
  - The action of undoing and resetting should not be stored
- When the reset button is pressed, remove the face swap and text changes and revert to the meme template
  - Display a warning that asks the user if they are sure they want to reset, informing them that the action cannot be undone
  - The warning display should have buttons to cancel or reset
  - Only reset once the user clicks reset do you perform the function of reseting the image
  - If the cancel button is pressed, do not reset. Hide the warning prompt.
```
Considering that this prompt looked sparse, I asked for the prompt to be revised, and after reviewing and editing the prompt I received, I had the prompt that was used. This prompt seemed fairly large, so I have a slight worry that there are too many things being asked in this prompt and the AI might get confused.

### __AI Summary__
Implemented the editor flow in `app.js`, with supporting UI in `index.html` and `styles.css`.
The canvas now uses a single state.editor source of truth for templateImage, generatedImage, overlayText, and historyStack. After /api/process returns, the studio canvas swaps to the returned composited image URL while keeping the existing text and face-region overlays intact. Inline text editing still uses the existing editor flow, but now updates state.editor.overlayText directly and records each edit as a full snapshot.
I also added non-modal Undo and Reset controls in the studio area. Undo restores the previous persisted snapshot without recording the undo itself. Reset now shows an inline confirmation message, not a modal, with the exact warning text and Cancel / Reset actions. Confirming reset restores the original template image and default text, and clears persisted undo history.
I updated `app.inline-edit-loader.test.js` to cover the generated-image render path plus undo/reset behavior. I wasn’t able to actually run the tests here because the workspace doesn’t have installed vitest dependencies and network access is blocked, so npx vitest could not fetch them.

## Remove the gliding from hovering over the textbox while maintaining the highlight
### __Task__
When the user hovers over the inline text editor, remove the feature that slides the textbox
Keep the darkening when it is hovered over

### __Prompt__

### __Reasoning/Concerns__
The gliding was an unintentional feature that was added in previous prompting. Because it was unintentional, it had to be removed. I did like the color changing when hovered over, so that should be kept.