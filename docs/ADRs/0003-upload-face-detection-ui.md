## Upload & Face Detection UI

### Context

The application required a mobile-first image upload workflow that allows users to capture or select photos, detect faces before editing, and continue even when automatic face detection fails.

Key requirements included:

* Mobile-first upload experience optimized for camera usage.
* Camera capture and photo library selection support.
* Client-side face detection with no additional unapproved dependencies.
* Visual face selection overlay for detected faces.
* Manual face alignment when detection fails.
* Support for multiple detected faces and multi-face meme templates.
* Graceful handling of unsupported formats, corrupt files, detector failures, and timeouts.
* Compatibility with desktop and mobile browsers.

The implementation was divided into multiple sub-issues to isolate functionality and reduce the risk of introducing bugs across the upload, detection, and overlay workflows.

Several constraints influenced the design:

* No new frontend dependencies could be introduced without approval.
* The upload experience needed to remain usable on browsers without face detection support.
* Detection failures could not create dead-end user flows.
* The existing backend contract needed to remain compatible.

### Decision

#### Mobile-First Upload Flow

Implemented a dedicated upload experience using camera and library entry points.

Features include:

* Primary "Take Photo" action using `getUserMedia`.
* Fallback camera capture using:

```html
<input type="file" capture="user">
```

when camera APIs are unavailable.

* Secondary library upload option.
* Camera shell with:

  * Live preview
  * Capture button
  * Camera flip control
  * Close control
* Review shell with:

  * Captured image preview
  * Retake option
  * Use Photo confirmation
* Progress indicator during image loading and face detection.
* Format validation for:

  * JPEG
  * PNG
  * WebP
  * HEIC
  * HEIF

#### Face Detection Architecture

Implemented face detection through an adapter layer to isolate detection logic from UI and state management.

The adapter exposes:

```javascript
init()
detect(imageBitmap)
isAvailable()
```

Detection execution includes:

* One-time detector initialization.
* Bounding box normalization into:

  * Natural image coordinates (`boxNatural`)
  * Rendered image coordinates (`boxRendered`)
* Detection timing collection.
* Sequence guards to prevent stale asynchronous results.

Detection operations are wrapped in a 5-second timeout.

If detection fails because of:

* Timeout
* Detector unavailability
* Runtime errors
* No detected faces

the workflow automatically falls back to manual fit mode rather than displaying a blocking error.

The implementation initially targeted the browser FaceDetector API but later adopted a locally hosted MediaPipe-based detector while preserving the adapter contract.

#### Face Selection Overlay

Implemented a rendered overlay layer above the image preview.

Behavior:

* Single detected face:

  * Automatically selected.
  * User enters ready state immediately.

* Multiple detected faces:

  * Bounding boxes rendered as selectable buttons.
  * User chooses which face to use.

* Multi-face templates:

  * Multiple face selections supported.
  * Face selections can be added, removed, or changed.
  * Selection count is constrained by template face-region capacity.

Overlay positioning uses normalized rendered coordinates and is recalculated during rendering to prevent stale overlays after layout changes.

#### Manual Fit Mode

Implemented a complete manual fallback workflow.

Features include:

* Dashed oval alignment guide.
* Drag-to-position image controls.
* Zoom slider.
* Rotation slider.
* Transform-based image manipulation.
* Synthetic face bounding box generation from oval placement.

Manual fit is available:

* When detection fails.
* When no face is found.
* When detectors are unavailable.
* After successful detection for user refinement.

When detection succeeds, manual mode can be initialized using the detected face position through `alignManualViewToFace()`.

#### Error Handling

Implemented recoverable error states for:

* Unsupported image formats.
* Corrupt image files.
* Detector unavailable.
* Detection timeout.
* Detection failure.
* No face detected.

Errors are displayed inline and always preserve a path forward through manual fit mode.

### Consequence

The application now provides a complete upload and face-selection workflow that functions across supported browsers and devices.

Benefits include:

* Mobile-first camera experience.
* No dependency on backend face detection.
* Face selection before editing begins.
* Automatic face selection for simple cases.
* Multi-face support for complex templates.
* Consistent fallback behavior across browsers.
* Reduced risk of stale detection results through sequence guards.
* Ability to swap detection engines without modifying overlay or state logic.
* Continued usability even when detection fails.

Testing verified:

* Single-face detection.
* Multi-face detection.
* Manual mode fallback.
* Timeout handling.
* Unsupported format handling.
* Corrupt image handling.
* Detection recovery paths.
* Multi-face selection behavior.

JavaScript validation passed and backend test suites remained fully functional throughout implementation.

### Trade-Offs/Risks

#### Face Detection Strategy

**Advantages**

* Detection implementation is isolated behind an adapter.
* Future detector replacements require minimal code changes.
* Client-side execution avoids backend processing costs.
* No upload required before user review and selection.

**Risks**

* Browser support varies across detection implementations.
* Detection accuracy depends on image quality and lighting.
* Large images may introduce temporary UI jank on lower-end devices.

#### Manual Fit Mode

**Advantages**

* Eliminates dead-end failure cases.
* Works on every browser.
* Provides user control when detection is inaccurate.

**Risks**

* Users must understand the oval alignment workflow.
* Additional interaction steps compared to successful automatic detection.
* No guided tutorial currently exists.

#### Multi-Face Support

**Advantages**

* Supports meme templates with multiple face regions.
* Preserves backward compatibility with single-face workflows.
* Allows users to modify selections after initial detection.

**Risks**

* Additional detection passes increase processing time for multi-face templates.
* Tile-based detection introduces added implementation complexity.
* Face merging logic may require future tuning for edge cases.

#### Testing Infrastructure

**Advantages**

* Functional behavior validated through manual and automated testing.
* Core backend tests remained stable throughout implementation.

**Risks**

* Existing browser-based UI tests conflict with the Cloudflare Workers Vitest environment.
* Separate browser-focused test infrastructure may be required to achieve full automated coverage.
* Some UI verification currently relies on manual testing rather than CI execution.

#### Future Considerations

* Move detection into a Web Worker to reduce main-thread blocking.
* Improve onboarding for manual fit mode.
* Add dedicated browser-based test infrastructure.
* Evaluate whether server-side analytics or telemetry should be collected for detection success rates.
* Reassess detector implementation if browser support requirements change.
