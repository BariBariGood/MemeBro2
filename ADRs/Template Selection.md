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
### __Reasoning/Concerns__: 
I initially had the search bar implementation in this prompt, but I opted to exclude it and save it for the next prompt so that the generation can focus on one aspect at a time. This can prevent causing more bugs, hence why I decided in the beginning to have several prompts instead of one incredibly long prompt, supporting what we found in the second tech warm up.

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

## Implementation of Search - Sub Issue #3
### __Task__: 
 - Search bar at top of grid
Filter by name/tags in real-time
Returns results <500ms
Tests: Custom (search filters correctly)
### __Propmt 4__: 
Using the existing templates.json meme data structure, implement search functionality for the meme grid.
- At the very top of the grid should be a search bar 
- Users can input a meme name to look it up or search via their tags
- Results are displayed by filtering out any memes that do not meet the search criteria in real time by hiding those memes
- Results show up in less than 500ms

Maintain the current grid structure, focusing only on the search filter. Do not redesign it.

### __Reasoning/Concerns__: 
We want a way for users to look up a meme template if they know exactly what they want. Rather than reloading results that were only loaded on the page start up, it would be more intuitive to filter out the templates that do not have an exact match, reducing the loading time. After running the prompt, the tests.js file was also modified. It is nice that tests were automatically added, but also concerning since the focus shifted away from JUST writing code.

## Implementation of Tabs - Sub Issue #4
### __Task__: 
 - Search bar at top of grid
Filter by name/tags in real-time
Returns results <500ms
Tests: Custom (search filters correctly)
### __Propmt__: 
Using the existing templates.json meme data structure, implement search functionality for the meme grid.
- At the very top of the grid should be a search bar 
- Users can input a meme name to look it up or search via their tags
- Results are displayed by filtering out any memes that do not meet the search criteria in real time by hiding those memes
- Results show up in less than 500ms

Maintain the current grid structure, focusing only on the search filter. Do not redesign it.

### __Reasoning/Concerns__: 
We want a way for users to look up a meme template if they know exactly what they want. Rather than reloading results that were only loaded on the page start up, it would be more intuitive to filter out the templates that do not have an exact match, reducing the loading time. After running the prompt, the tests.js file was also modified. It is nice that tests were automatically added, but also concerning since the focus shifted away from JUST writing code.


