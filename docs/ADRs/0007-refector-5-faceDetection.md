## Debugging Image Validation Failure for Cropped Face Uploads

### Context

A backend test began failing after changes introduced in the upload validation work:

```bash
FAIL  test/index.spec.js > MemeBro API gateway > runs local face compositing when a cropped face upload includes crop metadata

AssertionError: expected 400 to be 200
```

The failing test expected a successful response (`200`) when submitting a cropped face image for local compositing, but the API returned a validation error (`400`).

The goal was to determine why the request was being rejected and identify the correct location to investigate without immediately modifying production code.

Investigation focused on:

* Upload validation behavior
* Image dimension requirements
* Local face compositing request flow
* Differences between the current branch and the main branch

### Decision

The failure was traced to image validation occurring before local face compositing logic executes.

Request flow:

1. The test creates an image:

```js
const cropPng = await fakePng(80, 80);
```

2. The image is submitted through the upload pipeline.

3. `prepareImageOutbound()` invokes:

```js
validateUpload(...)
```

4. Upload validation enforces:

```js
MIN_DIMENSION = 100
```

5. Images smaller than 100×100 pixels are rejected with:

```txt
INVALID_DIMENSIONS
```

6. The request returns HTTP 400.

Because validation fails first, execution is never reached even though crop metadata is present.

The branch introducing the failure implemented image dimension enforcement that did not previously exist on the main branch.

Main branch behavior:

```js
// TODO (issue #39):
// Parse image dimensions from buffer headers and enforce
// MIN_DIMENSION (100px) and MAX_DIMENSION (4096px)
```

Current branch behavior:

* Dimension validation is fully implemented.
* Images below 100×100 are rejected.
* Existing test data still uses an 80×80 crop image.

This created a mismatch between the test fixture and the new validation rules. We needed to fix the image dimensions that were being tested

### Consequence

The failure was determined to be caused by conflicting assumptions:

| Component                | Requirement           |
| ------------------------ | --------------------- |
| Upload validator         | Minimum 100×100 image |
| Cropped face upload test | Uses 80×80 image      |

As a result:

* Upload validation rejects the request.
* Local compositing logic never executes.
* Test receives HTTP 400 instead of HTTP 200.

The issue was not caused by:

* Face compositing code
* Crop metadata parsing
* Routing logic
* Local face-swap implementation

The issue was specifically caused by validation rules rejecting the uploaded image before those systems are reached.

### Trade-Offs/Risks

#### Update the Test Fixture

Increase the crop image dimensions to satisfy current validation rules:

```js
fakePng(128, 128)
```

**Advantages**

* Aligns tests with current production requirements.
* No validator changes required.
* Keeps minimum image-size guarantees intact.

**Risks**

* Small face crops that may be acceptable in practice are no longer represented by tests.

#### Resolution Applied

The issue was treated as a test-data mismatch rather than a face compositing defect.

The test fixtures were updated to use dimensions that satisfy the new upload validation requirements. The tests relied on the default image size unless image dimensions were explicitly being tested, and the updated fixtures use valid image dimensions consistent with the enforced minimum size rules.
