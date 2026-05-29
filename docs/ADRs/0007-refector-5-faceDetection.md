## Debugging Image Size
### __Task__
The test for cropped images failed. Look for why and make the necessary changes

### __Prompt__
```bash
FAIL  test/index.spec.js > MemeBro API gateway > runs local face compositing when a cropped face upload includes crop metadata
AssertionError: expected 400 to be 200 // Object.is equality

- Expected
+ Received

- 200
+ 400

 ❯ test/index.spec.js:198:55
    199|   });
    200|
    201|   it("routes JSON requests by mode without exposing upstream URLs to clients", async () => {
       |                  ^
    202|     const mockFetch = vi.fn().mockResolvedValue(
    203|       new Response(JSON.stringify({ result: "ok" }), { status: 200 })
```

I am getting the above failed test. Do not rewrite any code, tell me why it is giving me the error and where I should fix it

### __Reasoning/Concerns__
I figured that because only one test is failing, it would be easier to debug on my own. However, to speed up the process, I asked the AI agent what exactly the error message said. It told me that the error was with the image size validation and that the tests were using dimensions that did not fit the requirements. As a result, it produced errors, causing the tests to fail, so I asked it to change the default image size in the tests, which they were changed to 128x128px and the tests relied on the default size unless the image size itself was being explicitly being tested.

### __AI Summary__
The 400 is coming from upload validation before local compositing runs.
In `worker/src/index.js` (line 174), prepareImageOutbound() calls validateUpload() for every image/* request. Your failing test sends an 80x80 PNG crop here: `worker/test/index.spec.js` (line 147).
But `worker/src/validator.js` (line 13) sets MIN_DIMENSION = 100, and `worker/src/validator.js` (line 395) rejects images smaller than 100px on either side with INVALID_DIMENSIONS, which maps to HTTP 400.
So the local face-swap path at `worker/src/index.js` (line 382) is never reached, even though the crop metadata is present.
Where to fix depends on the intended behavior:
If the test should follow current upload rules, fix the test: make cropPng and X-MemeBro-Face-Crop at least 100x100.
If cropped face uploads are supposed to allow smaller crops, fix the gateway/validator path: prepareImageOutbound() or validateUpload() needs a crop-aware validation path for requests with X-MemeBro-Face-Crop, since validateFaceCrop() already allows crops larger than 50px in worker/src/validator.js (line 276).
The error works on the main branch on not on on this branch because this branch changed the validation rules, and the new test is using an input that violates those new rules.
On main, worker/src/validator.js did not enforce image dimensions yet. The diff shows it had this TODO:
```js
// TODO (issue #39): Parse image dimensions from buffer headers and enforce
// MIN_DIMENSION (100px) and MAX_DIMENSION (4096px)
```
In your current branch, `Refactor5-Extract-faceDetectjs`, that TODO is implemented. validateUpload() now reads PNG/JPEG/WebP dimensions and rejects anything under 100x100.
At the same time, this branch added the failing test in `worker/test/index.spec.js` (line 137), and that test creates:
```js
const cropPng = await fakePng(80, 80);
```

So the branch introduced both:
A stricter global upload validator: minimum 100x100.
A local face-compositing test upload: 80x80.
Those conflict. The request gets rejected in prepareImageOutbound() before it ever reaches shouldUseLocalFaceSwap() / handleLocalFaceSwap().
So it works on main because main didn’t have the 100px dimension enforcement in validateUpload() yet, and likely also didn’t have this exact local compositing test. The fix should be wherever your intended rule lives: either make the test crop 100x100+, or make cropped face uploads use the face-crop rule instead of the general upload rule.

## Debugging the import moving from R-5.1
### __Task__
Identify what is causing the test to fail and resolve the issue that is causing it.

### __Prompt__
```bash
FAIL  test/frontendAssets.test.js > frontend runtime assets > MediaPipe files required by public/app.js are generated
AssertionError: expected undefined to be '.generated/mediapipe/vision_bundle.mjs' // Object.is equality

- Expected:
".generated/mediapipe/vision_bundle.mjs"

+ Received:
undefined

 ❯ test/frontendAssets.test.js:24:30
     22|     const importMatch = appSource.match(/from "\.\/([^"]*vision_bundle\.mjs)"/);
     23|
     24|     expect(importMatch?.[1]).toBe(".generated/mediapipe/vision_bundle.mjs");
       |                              ^
     25|
     26|     await expectPublicFile(".generated/mediapipe/vision_bundle.mjs", 100_000);
```

What is failing here exactly? Do not change any code

### __Reasoning/Concerns__
Similar to debugging with the other debugging entry, I consulted the agent to identify what the issue is and where. After recieving the response, I changed line 4 in `faceDetect.js` to reflect the new path from that file. Afterwards, I asked the agent to adjust the test to reflect the new path and ran the tests again, which resulted in all passing.

### __AI Summary__
The failure is this line in `frontendAssets.test.js` (line 22):
```js
const importMatch = appSource.match(/from "\.\/([^"]*vision_bundle\.mjs)"/);
```
That regex scans worker/public/app.js for an import that looks exactly like:
```js
import ... from "./.generated/mediapipe/vision_bundle.mjs"
```
But in the current app.js, there is no matching from "./...vision_bundle.mjs" import at all. So appSource.match(...) returns null, and then importMatch?.[1] becomes undefined.
That is why Vitest says:
txt```
Expected: ".generated/mediapipe/vision_bundle.mjs"
Received: undefined
```
Important nuance: the generated MediaPipe files do exist on disk, including:
```txt
worker/public/.generated/mediapipe/vision_bundle.mjs
```
So this specific assertion is not failing because the file is missing. It is failing because public/app.js does not contain the static import statement the test expects.