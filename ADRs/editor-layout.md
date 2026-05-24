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

### __AI Summary__

## Add text edit settings
### __Task__
__PR Review: Sanjana__
3. Some additional features I think would be nice to have which most basic editors have: customizable font size(just a few size options), text color(5-8 main colors max, not everything please), some common famous font sizes(4-5) and maybe outline option since meme text usually wants a white outline on black etc

__PR Review: Andrew__
Nice-to-haves for a future pass

Font size options (a few presets, not a slider)
Text color (5–8 common colors max)
Font options (4–5 recognizable meme fonts)
Text outline toggle (white outline on black is standard meme style)

### __Prompt__
Using the current `app.js` file, add settings underneath the buttons that adjusts the inline text.

__Font__
- Have an drop down menu for fonts
  - The drop down menu should have 5 of the most recognizable meme fonts
- Have a menu (NOT SLIDER) for font sizes
  - Available font sizesfor selecting should be "Default" (the current size) and "Small" (60% of the current size)
- When text does not fit in the screen size, shrink the text size automatically so that all text is visible within the canvas boundaries.
  - Shrink should not be drastic
  - Shrink should allow for all text to be visible
  - Shrink size should have real time feedback and visible to the reader

__Text__
- Have a toggle that enables a white meme outline on the text
  - When it is on, there is a white meme outline
  - When it is off, there is no white meme outline
- Have a dropdown for text colors (NOT OUTLINE COLOR)
  - Colors include: Black, White, Red, Blue, Yellow
  - Default color will be black

### __Reasoning/Concerns__
The gliding was an unintentional feature that was added in previous prompting. Because it was unintentional, it had to be removed. I did like the color changing when hovered over, so that should be kept.

### __AI Summary__
Added the new text settings under the studio action buttons and wired them into the existing editor flow. The meme text now supports font selection, a Default/Small size menu, text color selection, and a white-outline toggle, all backed by editor snapshot state so undo/reset/session restore keep behaving consistently in app.js (line 40), index.html (line 77), and styles.css (line 139).
I also changed the inline edit experience so the preview stays visible while typing, and added an automatic fit pass that gently shrinks the preview text when it would spill outside the meme canvas. That fit logic runs on text changes, setting changes, and window resize for live feedback.
Verified with npx vitest --config vitest.ui.config.js test/app.inline-edit-loader.test.js from worker, and the updated UI spec passes. There was already an unrelated modified file in the repo: ADRs/editor-layout.md.

## Replace template with the original memes
### __Task__
Replace the placeholders with the original memes

### __Prompt__
Replace the placeholders with the original memes
- Find an API with the exisiting memes that match the names currently used and create two folders with the memes in `worker/public/assets/`
  - First folder is `preview-images`, which holds the compressed images for the lazy-load style
  - Second folder is the `meme-templates`, which contains the original full meme.
- Download the images from the API and make compressed versions (stored in `preview-images`)
- Store the regular images in `meme-templates`
- Replace the placeholder images created in `templates.json` with images from the folders
  - Update templates.json so each template contains:
    - a preview image path from `preview-images/`
    - a full template image path from `meme-templates/`
  - In place of the preview image placeholders, use the images from `preview-images` that match the name
  - When displaying the images in the editor page, use the images from `meme-templates`

### __Reasoning/Concerns__
Right now it is hard to figure out if face swap works. We need to make sure that the memes and their face recognition are in the correct place. After running the prompt, I noticed that the images are not properly cropped. and as a result the face detection is off. Additionally, the preview images are not properly loaded.

### __AI Summary__
Replaced the placeholder meme assets with local copies of the real templates and updated the catalog to point at them.
templates.json now uses compressed previews from worker/public/assets/preview-images and full-resolution templates from worker/public/assets/meme-templates. I also added worker/scripts/import-meme-assets.ps1, which pulls matches from Imgflip’s get_memes API, downloads the originals, generates preview JPEGs, and rewrites worker/public/templates.json (line 127).
A few names needed explicit mapping during import, like Awkward Look Monkey Puppet -> Monkey Puppet and Megamind No Bitches -> Megamind no bitches, but all 25 templates were matched and every referenced asset exists locally.
Verified with:
npx vitest --config vitest.ui.config.js test/app.inline-edit-loader.test.js
There’s still one unrelated pre-existing modified file in the repo: ADRs/editor-layout.md.

## Fix Issue with image loading
### __Task__
Fix the preview image loading
Fix the cropping in the editor

### __Prompt__
Fix issues with preview image loading and meme cropping in the editor.

__Preview Image Loading__
Fix the preview image behavior in the meme gallery/grid.
- Ensure preview images load correctly from: `worker/public/assets/preview-images/`
- Use the previewImage field from templates.json.
- Preserve lazy-loading behavior.
- Prevent layout shifting while images load.
- Ensure images render with the correct aspect ratio.
- Prevent broken image placeholders or flashing during load.
- Add fallback handling for missing preview images if needed. 

__Meme Editor Cropping__
Fix the meme template rendering/cropping behavior in the editor.
- Use the full-resolution image from: `worker/public/assets/meme-templates/`
- Ensure the meme template is fully visible inside the editor canvas/container.
- Prevent unintended cropping or clipping of the meme image.
- Preserve the original image aspect ratio.
- Scale the image responsively to fit within the editor viewport.
- Ensure text positioning still aligns correctly after scaling changes.
- Avoid stretching or distortion.
- Make sure that the face location data matches properly with the image.

### __Reasoning/Concerns__


### __AI Summary__

## Improve Undo Button
### __Task__
__PR Review: Sanjana__


__PR Review: Andrew__


### __Prompt__
Using the current `app.js` file, add settings to the 

### __Reasoning/Concerns__


### __AI Summary__

