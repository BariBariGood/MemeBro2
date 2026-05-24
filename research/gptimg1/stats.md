<b> gptimg1 <b>
Run 1:
Latency: 23.94 s
Cost: ? (cannot find)
Face is incorportated well, background isn't 1 to 1 but pretty accurate. Original meme character's body is now deformed? AI assumed the body of the face. Character is facing correct direction.

Run 2:
Latency: 25.62 s
Cost: 0.1$
Very similar background as run 1 (same issues). Face is facing wrong way / towards screen and not the same as meme. 

Prompt: "Place the human face from the second image onto the main character in the first meme image. Preserve the exact meme text, background, and visual layout."

(test run with more specific prompt)
Run 3: 
Latency: 22.43 s
Cost: 0.09$
Focus was placed on keeping the meme character's body intact. The background of the generated image appears to be more similar to that of the original meme. The body of the character was deformed (potato?) but kept the hat (new). Cropped face placed onto the image has some characteristics of original image but differs.

Prompt: "Place the human face from the second image onto the main character in the first meme image. Preserve the exact meme text, background, and visual layout. Preserve the body of the second meme image as much as possible, but ensure the face is seamlessly integrated onto the main character in the first image. The final output should look natural and maintain the comedic essence of the original meme.",

Overall:
Latency: 24 s
Cost: 0.1$ per run
- Very promising results. Face is incorportated into the meme well (not just plastered ontop, AI made efforts to blend / correct the direction the char was looking). 
- Background differs slightly from the original meme with differences in artstyle + object placement, output however is still pretty similar.
- Tests were pretty similar across all 3 images with not too much deviation