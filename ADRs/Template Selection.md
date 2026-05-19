# Template Selection Task ADR
Primary Task: Build a scrollable grid of 20+ meme templates. Users browse, search by name/tags, and tap to select. Recent and trending tabs show favorite or popular templates. All templates have face region metadata.

Preface: To portion out the process, I will go through and prompt to build off of each sub-issue, building off the previous generation.

## Creating the Structure file - Sub Issue #1 & #2
### __Task__: 
- create Schema (persistent) 
- At least 20 templates 
- Tests: None (data task) 
- Acceptance: JSON file valid, face regions documented for each
### __Propmt__: 
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
### __Reasoning__/Concerns: 
I combined sub-issue 1 with parts of sub-issue 2 because I felt that a lot of what was part of 2 was structural in nature, those parts being the scrollable feature and mobile/desktop portability. I also included the data, since the first templates would serve as a basis for what to do in the future.
