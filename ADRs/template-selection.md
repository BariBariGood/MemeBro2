# Template Selection Task ADR
Primary Task: Build a scrollable grid of 20+ meme templates. Users browse, search by name/tags, and tap to select. Recent and trending tabs show favorite or popular templates. All templates have face region metadata.

Preface: To portion out the process, I will go through and prompt to build off of each sub-issue, building off the previous generation.

## Creating the Structure file - Sub Issue #1 & #2
### __Task__: 
- create Schema (persistent) 
- At least 20 templates 
- Tests: None (data task) 
- Acceptance: JSON file valid, face regions documented for each

### __Propmt 1__: 
Build a file templates.json data structure schema that can hold over 20 meme templates based on popular memes from the internet displayed in a scrollable grid. 
The grid should allow for users to view from both desktops and mobile devices. 
                    
Data for each meme template:
- The memes should have their own tags based on the meme. 
- An id
- A main image to be displayed later
- A smaller thumbnail image that is displayed in the current screen
- Memes should also each have a face region documented, with coordinates relative to the image pixels
- The name of the meme should be displayed.
- Popularity of use

There should be no UI implementation yet, just placeholders and a structure.

### __Reasoning/Concerns__: 
I combined sub-issue 1 with parts of sub-issue 2 because I felt that a lot of what was part of 2 was structural in nature, those parts being the scrollable feature and mobile/desktop portability. I also included the data, since the first templates would serve as a basis for what to do in the future.

### __AI Summary__
Built templates.json as a placeholder-only schema and dataset for a future scrollable meme grid.
It includes responsive grid metadata for mobile/tablet/desktop, plus 25 meme templates with:
 - id
 - name
 - popularityScore
 - meme-specific tags
 - images.main and images.thumbnail
 - image width/height
 - faceRegions with pixel-relative coordinates
I also validated the JSON and fixed the template count so the declared total matches the actual array length. No UI was added.

## Creating the UI - Sub Issue #2
### __Task__: 
 - Scrollable, lazy-load images
 - Show template name + thumbnail
 - Tap to select → immediately go to editor
 - Mobile and desktop friendly
 - Tests: Custom (grid renders, lazy-loading works)
 - Acceptance: Grid loads <1.5 seconds, images lazy-load

### __Propmt 2__: 
Adjust the grid structure so that the grid has the following properties: 
 - Each image should have the name of the meme template underneath each image and should not take more than 1.5 seconds to load.
 - The displayed images should work in the lazy-load style, showcasing a compressed version of the meme before actually displaying them.
 - Clicking on the meme should send the user to the editor page (the implementation of the editor page is beyond this current task), meaning clicking on a meme switches the page to an edit layout, where the full resolution of the image is displayed.
 - 
### __Reasoning/Concerns__: 
I initially had the search bar implementation in this prompt, but I opted to exclude it and save it for the next prompt so that the generation can focus on one aspect at a time. This can prevent causing more bugs, hence why I decided in the beginning to have several prompts instead of one incredibly long prompt, supporting what we found in the second tech warm up.

### __AI Summary__
Updated templates.json so the grid schema now describes the behavior you want without adding UI code.
The structure now includes:
grid.itemCard to indicate the full card is clickable and the meme name appears under the image
grid.imageLoading for lazy progressive loading, using a compressed images.preview first, then swapping in the real thumbnail, with a maxInitialLoadMs target of 1500
grid.interaction plus per-template editorTarget.route so clicking a meme can navigate to /editor/:templateId
Per-template display.caption and images.preview placeholders so each item carries the metadata needed by the future grid/editor flow
I also validated the JSON and confirmed all 25 templates now include preview, caption, and editor route data.

## Tests for the UI - Sub-Issue #2
### __Task__: 
Create tests for the UI

### __Prompt 3__:
Create a tests.js file that tests the functionality of the grid UI using jest. 

Tests: 
- The grid renders properly in desktop through simulating the resolution
- The grid renders properly in mobile through simulating the resolution
- Time to render takes less than 1.5 seconds (in each format)
- Correct images are loaded (preview images are loaded, not full resolution images)
- Make sure that the correct name is loaded underneath the images
- Ensure that none of the meme properties are empty

Only create and modify the tests.js file.

### __Resoining/Concerns__:
After pushing the previous propmt, I wanted to make sure that there was a file that tests the functionality of the UI, as mentioned in the sub-issue. 

### __AI Summary__
Created tests.js with Jest + jsdom tests that cover desktop/mobile grid rendering, per-format render time under 1500ms, preview-vs-full image loading, caption/name placement under each image, and a recursive non-empty-property check across the meme dataset.
I wasn’t able to execute the suite here because jest is not installed or not on the PATH in this workspace. One important note: the final “none of the meme properties are empty” test is strict and will flag empty arrays like faceRegions: [] if those are meant to be invalid.

## Implementation of Search - Sub Issue #3
### __Task__: 
 - Search bar at top of grid
 - Filter by name/tags in real-time
 - Returns results <500ms
 - Tests: Custom (search filters correctly)
### __Propmt 4__: 
Using the existing templates.json meme data structure, implement search functionality for the meme grid.
- At the very top of the grid should be a search bar 
- Users can input a meme name to look it up or search via their tags
- Results are displayed by filtering out any memes that do not meet the search criteria in real time by hiding those memes
- Results show up in less than 500ms

Maintain the current grid structure, focusing only on the search filter. Do not redesign it.

### __Reasoning/Concerns__: 
We want a way for users to look up a meme template if they know exactly what they want. Rather than reloading results that were only loaded on the page start up, it would be more intuitive to filter out the templates that do not have an exact match, reducing the loading time. After running the prompt, the tests.js file was also modified. It is nice that tests were automatically added, but also concerning since the focus shifted away from JUST writing code.

### __AI Summary__
Implemented the search filter in the existing grid flow without redesigning it. The search bar now sits at the top of the grid, matches against both meme name and tags, and hides non-matching cards in real time. I also added search metadata to templates.json so the behavior stays part of the current data structure.
The main logic lives in tests.js: it renders a type="search" input above the existing grid, filters cards on each input event, and tracks filter timing against the 500ms target. I added coverage for name search, tag search, clear/reset behavior, top-of-grid placement, and the response-time requirement.
I verified that tests.js parses cleanly with node --check and that the updated schema exposes grid.search.maxFilterResponseMs = 500. I did not run a full Jest test suite here because no project test runner/package setup was present in this workspace.

## Implementation of Tabs - Sub Issue #4
### __Task__: 
 - Recent: show last 3 templates user selected (local cache)
 - Trending: hardcoded list for MVP
 - Tests: Custom (tabs switch)
 - Acceptance: Tabs work, recent persists across sessions
### __Propmt 5__: 
Using the existing templates.json meme data structure, implement tabs into the interface: 
 - Have 2 tabs: "Recents" and "Trending" 
 - In the "Recents" tab, show the 3 most recently used meme templates
 - When a user clicks on a meme, store the time stamp of when a meme template was used in localStorage to be accessed again for the "Recents" tab
 - If the user has never entered the site before, display an empty history (no memes)
 - Based on the popularity variable of each meme, order the memes in descending order of popularity with the most highly rated memes are at the top 
 - Be able to switch between the tabs 
 - The trending tab should be consistent across different sessions

Maintain the current grid structure, focusing only on the tabs feature. Do not redesign it. 

In tests.js, create tests that look for the following:
 - Ensure that you are able to switch between tabs.
 - Recents persist across sessions.
 - Trending Tab is consistent across sessions.
 - Memes in trending tab are ordered in descending order of their popularity.

### __Reasoning/Concerns__: 
We want to make the process of looking for memes even easier for users. By implementing tabs, we allow the user to find processes easier if they do not remember what to search for. Rather than the AI taking initiative in writing tests, I wanted to specify what I wanted tested. 

### __AI Summary__
Implemented the tab feature in tests.js and extended templates.json with tab metadata. The grid structure stays the same, but it now supports Recents and Trending, with Trending as the default tab.
Trending is rendered by sorting all memes by popularityScore descending, so it stays consistent across sessions. Recents is backed by localStorage using click timestamps, shows only the 3 most recently used meme templates, and correctly starts empty for a first-time visitor. Clicking a meme now records its usage timestamp without changing the layout structure.
I also added the tests you requested:
 - tab switching
 - recents persistence across sessions
 - trending consistency across sessions
 - descending popularity order in trending
I verified the updated file parses cleanly with node --check tests.js. I didn’t run a full Jest suite here because there isn’t an installed project test runner/config visible in this workspace.
