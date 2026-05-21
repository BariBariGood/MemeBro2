import {
  FaceDetector as MediaPipeFaceDetector,
  FilesetResolver,
} from "./.generated/mediapipe/vision_bundle.mjs";

const STATES = {
  IDLE: "idle",
  LOADING_IMAGE: "loading-image",
  DETECTING: "detecting",
  FACES_FOUND: "faces-found",
  NO_FACE: "no-face",
  ERROR: "error",
  READY: "ready",
};

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const DETECTION_TIMEOUT_MS = 5000;
const FACE_BOX_TAP_TARGET = 48;
const DETECTION_TILE_OVERLAP = 0.18;
const DETECTION_TILE_MAX_EDGE = 900;
const DETECTION_TILE_MAX_PASSES = 12;
const DETECTION_DUPLICATE_OVERLAP = 0.45;
const MEDIAPIPE_WASM_PATH = "/.generated/mediapipe/wasm";
const MEDIAPIPE_FACE_MODEL_PATH = "/.generated/mediapipe/models/blaze_face_short_range.tflite";

const DETECTION_FAILURE_MESSAGES = {
  DETECTOR_UNAVAILABLE: "Face detection could not load in this browser. Use manual fit to line up the face.",
  DETECTION_FAILED: "Face detection could not find a usable face. Use manual fit or try another photo.",
  DETECTION_TIMEOUT: "Face detection took too long. Use manual fit or try another photo.",
  NO_FACE_DETECTED: "No face detected. Use manual fit or try another photo.",
};

const dom = {
  uploadPage: document.querySelector(".upload-page"),
  backBtn: document.querySelector(".back-btn"),
  ctaRow: document.querySelector(".cta-row"),
  selectedTemplateLabel: document.getElementById("selected-template-label"),
  studioScreen: document.getElementById("studio-screen"),
  studioTemplateArt: document.getElementById("studio-template-art"),
  studioTemplateInitials: document.getElementById("studio-template-initials"),
  studioTemplateRegions: document.getElementById("studio-template-regions"),
  openUploadModalCta: document.getElementById("open-upload-modal-cta"),
  uploadModal: document.getElementById("upload-modal"),
  uploadModalBackdrop: document.getElementById("upload-modal-backdrop"),
  uploadModalClose: document.getElementById("upload-modal-close"),
  cameraCta: document.getElementById("camera-cta"),
  cameraSnapCta: document.getElementById("camera-snap-cta"),
  cameraCloseCta: document.getElementById("camera-close-cta"),
  cameraFlipCta: document.getElementById("camera-flip-cta"),
  cameraCancelCta: document.getElementById("camera-cancel-cta"),
  libraryCta: document.getElementById("library-cta"),
  cameraInput: document.getElementById("camera-input"),
  libraryInput: document.getElementById("library-input"),
  cameraShell: document.getElementById("camera-shell"),
  cameraVideo: document.getElementById("camera-video"),
  reviewShell: document.getElementById("review-shell"),
  reviewImage: document.getElementById("review-image"),
  reviewCloseCta: document.getElementById("review-close-cta"),
  retakeCta: document.getElementById("retake-cta"),
  usePhotoCta: document.getElementById("use-photo-cta"),
  progressWrap: document.getElementById("progress-wrap"),
  progressBar: document.getElementById("progress-bar"),
  progressLabel: document.getElementById("progress-label"),
  overlayShell: document.getElementById("overlay-shell"),
  previewImage: document.getElementById("preview-image"),
  overlayLayer: document.getElementById("overlay-layer"),
  statusText: document.getElementById("status-text"),
  manualFitCta: document.getElementById("manual-fit-cta"),
  errorState: document.getElementById("error-state"),
  errorMessage: document.getElementById("error-message"),
  templateScreen: document.getElementById("template-screen"),
  templateSearch: document.getElementById("template-search"),
  templateTabs: document.getElementById("template-tabs"),
  templateGrid: document.getElementById("template-grid"),
  templateEmpty: document.getElementById("template-empty"),
  timingMetric: document.getElementById("timing-metric"),
  continueBtn: document.getElementById("continue-btn"),
  manualOverlay: document.getElementById("manual-overlay"),
  manualCircle: document.getElementById("manual-circle"),
  manualControls: document.getElementById("manual-controls"),
  manualZoom: document.getElementById("manual-zoom"),
  manualRotation: document.getElementById("manual-rotation"),
};

const state = {
  status: STATES.IDLE,
  faces: [],
  selectedFaceId: null,
  selectedFaceIds: [],
  error: null,
  timingMs: null,
  imageBitmap: null,
  previewUrl: "",
  file: null,
  sequence: 0,
  detectorAvailable: true,
  detectedFaceCount: 0,
  usedDetectedFace: false,
  manualMode: false,
  manualScale: 1,
  manualRotation: 0,
  manualOffsetX: 0,
  manualOffsetY: 0,
  dragPointerId: null,
  dragStartX: 0,
  dragStartY: 0,
  dragOriginOffsetX: 0,
  dragOriginOffsetY: 0,
  cameraStream: null,
  cameraFacingMode: "user",
  cameraReviewFile: null,
  cameraReviewUrl: "",
  templateCatalog: [],
  selectedTemplateId: null,
  activeTemplateTab: "trending",
  templateSearchQuery: "",
  uploadModalOpen: false,
  view: "templates",
};

const RECENTS_STORAGE_KEY = "meme-template-recents";

function createFaceDetectionAdapter() {
  let detector = null;
  let vision = null;
  let available = true;
  let initPromise = null;

  return {
    async init() {
      if (detector) return true;
      if (initPromise) return initPromise;

      initPromise = (async () => {
        try {
          vision = vision || await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
          detector = await MediaPipeFaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MEDIAPIPE_FACE_MODEL_PATH,
              delegate: "CPU",
            },
            runningMode: "IMAGE",
            minDetectionConfidence: 0.35,
            minSuppressionThreshold: 0.3,
          });
          available = true;
          return true;
        } catch (error) {
          console.warn("Face detection failed to initialize.", error);
          detector = null;
          available = false;
          return false;
        } finally {
          initPromise = null;
        }
      })();

      return initPromise;
    },

    async detect(decodedImage, options = {}) {
      if (!detector) return [];

      const targetFaceCount = Math.max(1, Number(options.faceLimit) || 1);
      let faces = detectFacesInRegion(detector, decodedImage.source, {
        x: 0,
        y: 0,
        width: decodedImage.width,
        height: decodedImage.height,
      });
      faces = mergeDetectedFaces(faces, decodedImage);

      if (targetFaceCount <= 1 || faces.length >= targetFaceCount) {
        return assignFaceIds(faces);
      }

      const tilePlan = buildDetectionTiles(decodedImage, targetFaceCount);

      for (let index = 0; index < tilePlan.length; index += 1) {
        const tileCanvas = createDetectionTileCanvas(decodedImage.source, tilePlan[index]);
        const tileFaces = detectFacesInRegion(detector, tileCanvas, tilePlan[index]);
        faces = mergeDetectedFaces([...faces, ...tileFaces], decodedImage);

        if (faces.length >= targetFaceCount) break;
      }

      return assignFaceIds(faces);
    },

    isAvailable() {
      return available;
    },
  };
}

function detectFacesInRegion(detector, source, region) {
  const result = detector.detect(source);
  const detections = Array.isArray(result?.detections) ? result.detections : [];
  const sourceWidth = source.naturalWidth || source.width || region.width;
  const sourceHeight = source.naturalHeight || source.height || region.height;
  const scaleX = region.width / sourceWidth;
  const scaleY = region.height / sourceHeight;

  return detections
    .filter((face) => face.boundingBox)
    .map((face) => {
      const box = face.boundingBox;
      const x = region.x + box.originX * scaleX;
      const y = region.y + box.originY * scaleY;
      const width = box.width * scaleX;
      const height = box.height * scaleY;

      return {
        score: Number(face.categories?.[0]?.score ?? 1),
        boxNatural: {
          x,
          y,
          width,
          height,
        },
      };
    });
}

function buildDetectionTiles(decodedImage, targetFaceCount) {
  const tiles = [];
  const seen = new Set();
  const gridPlans = targetFaceCount >= 3
    ? [[2, 1], [1, 2], [2, 2], [3, 2]]
    : [[2, 1], [1, 2], [2, 2]];

  gridPlans.forEach(([columns, rows]) => {
    const tileWidth = decodedImage.width / (columns - (columns - 1) * DETECTION_TILE_OVERLAP);
    const tileHeight = decodedImage.height / (rows - (rows - 1) * DETECTION_TILE_OVERLAP);
    const stepX = columns === 1 ? 0 : (decodedImage.width - tileWidth) / (columns - 1);
    const stepY = rows === 1 ? 0 : (decodedImage.height - tileHeight) / (rows - 1);

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = Math.round(column * stepX);
        const y = Math.round(row * stepY);
        const width = Math.round(Math.min(tileWidth, decodedImage.width - x));
        const height = Math.round(Math.min(tileHeight, decodedImage.height - y));
        const key = `${x}:${y}:${width}:${height}`;

        if (seen.has(key)) continue;
        seen.add(key);
        tiles.push({ x, y, width, height });
      }
    }
  });

  return tiles.slice(0, DETECTION_TILE_MAX_PASSES);
}

function createDetectionTileCanvas(source, tile) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, DETECTION_TILE_MAX_EDGE / Math.max(tile.width, tile.height));
  canvas.width = Math.max(1, Math.round(tile.width * scale));
  canvas.height = Math.max(1, Math.round(tile.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    source,
    tile.x,
    tile.y,
    tile.width,
    tile.height,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas;
}

function mergeDetectedFaces(faces, decodedImage) {
  const candidates = faces
    .map((face) => {
      const box = face.boxNatural;
      const x = clamp(box.x, 0, decodedImage.width);
      const y = clamp(box.y, 0, decodedImage.height);
      const right = clamp(box.x + box.width, x, decodedImage.width);
      const bottom = clamp(box.y + box.height, y, decodedImage.height);

      return {
        ...face,
        boxNatural: {
          x,
          y,
          width: right - x,
          height: bottom - y,
        },
      };
    })
    .filter((face) => face.boxNatural.width >= 8 && face.boxNatural.height >= 8)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return getFaceArea(right) - getFaceArea(left);
    });

  const merged = [];

  candidates.forEach((candidate) => {
    const duplicateIndex = merged.findIndex((face) => areDuplicateFaces(face, candidate));

    if (duplicateIndex === -1) {
      merged.push(candidate);
      return;
    }

    const existing = merged[duplicateIndex];
    if (
      candidate.score > existing.score ||
      (candidate.score >= existing.score - 0.08 && getFaceArea(candidate) > getFaceArea(existing) * 1.35)
    ) {
      merged[duplicateIndex] = candidate;
    }
  });

  return merged.sort((left, right) => (
    left.boxNatural.y - right.boxNatural.y || left.boxNatural.x - right.boxNatural.x
  ));
}

function assignFaceIds(faces) {
  return faces.map((face, index) => ({
    ...face,
    id: `face-${index}`,
  }));
}

function getFaceArea(face) {
  return face.boxNatural.width * face.boxNatural.height;
}

function areDuplicateFaces(left, right) {
  const overlap = getFaceOverlap(left.boxNatural, right.boxNatural);
  const leftCenter = getBoxCenter(left.boxNatural);
  const rightCenter = getBoxCenter(right.boxNatural);
  const centerDistance = Math.hypot(leftCenter.x - rightCenter.x, leftCenter.y - rightCenter.y);
  const smallerFaceEdge = Math.min(
    left.boxNatural.width,
    left.boxNatural.height,
    right.boxNatural.width,
    right.boxNatural.height
  );

  return overlap >= DETECTION_DUPLICATE_OVERLAP || (overlap >= 0.18 && centerDistance <= smallerFaceEdge * 0.45);
}

function getFaceOverlap(left, right) {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.width, right.x + right.width);
  const y2 = Math.min(left.y + left.height, right.y + right.height);
  const width = Math.max(0, x2 - x1);
  const height = Math.max(0, y2 - y1);
  const intersection = width * height;
  const smallerArea = Math.min(left.width * left.height, right.width * right.height);

  return smallerArea ? intersection / smallerArea : 0;
}

function getBoxCenter(box) {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

const adapter = createFaceDetectionAdapter();

function setStatus(next) {
  state.status = next;
  render();
}

function clearCameraStream() {
  if (!state.cameraStream) return;
  state.cameraStream.getTracks().forEach((track) => track.stop());
  state.cameraStream = null;
  dom.cameraVideo.srcObject = null;
}

function clearCameraReview() {
  if (state.cameraReviewUrl) URL.revokeObjectURL(state.cameraReviewUrl);
  state.cameraReviewFile = null;
  state.cameraReviewUrl = "";
  dom.reviewImage.removeAttribute("src");
}

function resetState() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  clearCameraStream();
  clearCameraReview();

  state.status = STATES.IDLE;
  state.faces = [];
  state.selectedFaceId = null;
  state.selectedFaceIds = [];
  state.error = null;
  state.timingMs = null;
  state.imageBitmap = null;
  state.previewUrl = "";
  state.file = null;
  state.sequence += 1;
  state.detectorAvailable = true;
  state.detectedFaceCount = 0;
  state.usedDetectedFace = false;
  state.manualMode = false;
  state.manualScale = 1;
  state.manualRotation = 0;
  state.manualOffsetX = 0;
  state.manualOffsetY = 0;
  state.dragPointerId = null;
  state.cameraFacingMode = "user";
  state.selectedTemplateId = null;
  state.activeTemplateTab = "trending";
  state.templateSearchQuery = "";
  state.uploadModalOpen = false;
  state.view = "templates";
  dom.cameraInput.value = "";
  dom.libraryInput.value = "";
  dom.templateSearch.value = "";
  dom.manualZoom.value = "1";
  dom.manualRotation.value = "0";
  dom.previewImage.style.transform = "";
  render();
}

function setError(code, message) {
  state.error = { code, message };
  setStatus(STATES.ERROR);
}

function setDetectionRecoveryError(code) {
  state.error = {
    code,
    message: DETECTION_FAILURE_MESSAGES[code] || DETECTION_FAILURE_MESSAGES.DETECTION_FAILED,
  };
}

function clearFaceFitState() {
  state.error = null;
  state.timingMs = null;
  state.faces = [];
  state.selectedFaceId = null;
  state.selectedFaceIds = [];
  state.imageBitmap = null;
  state.detectorAvailable = true;
  state.detectedFaceCount = 0;
  state.usedDetectedFace = false;
  state.manualMode = false;
  state.manualScale = 1;
  state.manualRotation = 0;
  state.manualOffsetX = 0;
  state.manualOffsetY = 0;
  state.dragPointerId = null;
  dom.manualZoom.value = "1";
  dom.manualRotation.value = "0";
  dom.previewImage.style.transform = "";
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error("Face detection timed out.");
        err.code = "DETECTION_TIMEOUT";
        reject(err);
      }, ms);
    }),
  ]);
}

function normalizeBox(boxNatural, natural, rendered) {
  return {
    x: boxNatural.x * (rendered.width / natural.width),
    y: boxNatural.y * (rendered.height / natural.height),
    width: boxNatural.width * (rendered.width / natural.width),
    height: boxNatural.height * (rendered.height / natural.height),
  };
}

function getRenderedSize() {
  const rect = dom.previewImage.getBoundingClientRect();
  return { width: rect.width || 320, height: rect.height || 320 };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getSelectedTemplate() {
  return state.templateCatalog.find((template) => template.id === state.selectedTemplateId);
}

function getTemplateFaceCapacity() {
  const selectedTemplate = getSelectedTemplate();
  return Math.max(1, selectedTemplate?.faceRegions?.length || 1);
}

function getSelectableFaceLimit() {
  return Math.max(1, Math.min(getTemplateFaceCapacity(), state.faces.length || 1));
}

function setSelectedFaceIds(faceIds) {
  const knownFaceIds = new Set(state.faces.map((face) => face.id));
  state.selectedFaceIds = faceIds.filter((faceId, index) => (
    faceId && knownFaceIds.has(faceId) && faceIds.indexOf(faceId) === index
  ));
  state.selectedFaceId = state.selectedFaceIds[0] || null;
}

function selectSingleFace(faceId) {
  setSelectedFaceIds(faceId ? [faceId] : []);
}

function getSelectedFaces() {
  return state.selectedFaceIds
    .map((faceId) => state.faces.find((face) => face.id === faceId))
    .filter(Boolean);
}

function toggleDetectedFaceSelection(faceId) {
  const faceCapacity = getTemplateFaceCapacity();

  if (faceCapacity <= 1) {
    selectSingleFace(faceId);
    return;
  }

  if (state.selectedFaceIds.includes(faceId)) {
    setSelectedFaceIds(state.selectedFaceIds.filter((selectedFaceId) => selectedFaceId !== faceId));
    return;
  }

  const nextFaceIds = [...state.selectedFaceIds, faceId];
  const selectableLimit = getSelectableFaceLimit();

  if (nextFaceIds.length > selectableLimit) {
    nextFaceIds.shift();
  }

  setSelectedFaceIds(nextFaceIds);
}

async function decodeImage(file) {
  const url = state.previewUrl || URL.createObjectURL(file);
  const shouldRevokeUrl = !state.previewUrl;

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.decoding = "async";
      img.src = url;
    });
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;

    if (!width || !height) {
      throw new Error("Decoded image has no dimensions.");
    }

    return { source: image, width, height };
  } catch {
    const err = new Error("Image cannot be decoded.");
    err.code = "CORRUPT_IMAGE";
    throw err;
  } finally {
    if (shouldRevokeUrl) URL.revokeObjectURL(url);
  }
}

function getManualCircleBox() {
  const shellRect = dom.overlayShell.getBoundingClientRect();
  const circleRect = dom.manualCircle.getBoundingClientRect();
  return {
    x: circleRect.left - shellRect.left,
    y: circleRect.top - shellRect.top,
    width: circleRect.width,
    height: circleRect.height,
  };
}

function buildManualFaceBoxNatural() {
  if (!state.imageBitmap) return null;
  const nw = state.imageBitmap.width;
  const nh = state.imageBitmap.height;
  const rendered = getRenderedSize();
  const base = Math.max(rendered.width / nw, rendered.height / nh);
  const finalScale = base * state.manualScale;
  const displayedW = nw * finalScale;
  const displayedH = nh * finalScale;
  const imageLeft = (rendered.width - displayedW) / 2 + state.manualOffsetX;
  const imageTop = (rendered.height - displayedH) / 2 + state.manualOffsetY;
  const circle = getManualCircleBox();
  return {
    x: clamp((circle.x - imageLeft) / finalScale, 0, nw),
    y: clamp((circle.y - imageTop) / finalScale, 0, nh),
    width: clamp(circle.width / finalScale, 10, nw),
    height: clamp(circle.height / finalScale, 10, nh),
  };
}

function updateManualFaceSelection() {
  if (!state.manualMode || !state.imageBitmap) return;
  const boxNatural = buildManualFaceBoxNatural();
  if (!boxNatural) return;
  const rendered = getRenderedSize();
  state.faces = [{
    id: "face-manual-0",
    score: 1,
    boxNatural,
    transform: {
      scale: state.manualScale,
      rotation: state.manualRotation,
      offsetX: state.manualOffsetX,
      offsetY: state.manualOffsetY,
    },
    boxRendered: normalizeBox(
      boxNatural,
      { width: state.imageBitmap.width, height: state.imageBitmap.height },
      rendered
    ),
  }];
  selectSingleFace("face-manual-0");
}

function applyManualTransform() {
  if (!state.manualMode) {
    dom.previewImage.style.transform = "";
    return;
  }
  dom.previewImage.style.transform = `translate(${state.manualOffsetX}px, ${state.manualOffsetY}px) rotate(${state.manualRotation}deg) scale(${state.manualScale})`;
  updateManualFaceSelection();
}

function alignManualViewToFace(face) {
  if (!face?.boxNatural || !state.imageBitmap) return;

  const rendered = getRenderedSize();
  const circle = getManualCircleBox();
  const natural = {
    width: state.imageBitmap.width,
    height: state.imageBitmap.height,
  };
  const base = Math.max(rendered.width / natural.width, rendered.height / natural.height);
  const targetScale = Math.min(
    circle.width / (face.boxNatural.width * 1.18),
    circle.height / (face.boxNatural.height * 1.18)
  );
  const manualScale = clamp(targetScale / base, 0.5, 2.2);
  const finalScale = base * manualScale;
  const displayedW = natural.width * finalScale;
  const displayedH = natural.height * finalScale;
  const baseLeft = (rendered.width - displayedW) / 2;
  const baseTop = (rendered.height - displayedH) / 2;
  const faceCenterX = face.boxNatural.x + face.boxNatural.width / 2;
  const faceCenterY = face.boxNatural.y + face.boxNatural.height / 2;
  const circleCenterX = circle.x + circle.width / 2;
  const circleCenterY = circle.y + circle.height / 2;

  state.manualScale = manualScale;
  state.manualRotation = 0;
  state.manualOffsetX = circleCenterX - faceCenterX * finalScale - baseLeft;
  state.manualOffsetY = circleCenterY - faceCenterY * finalScale - baseTop;
  dom.manualZoom.value = String(manualScale);
  dom.manualRotation.value = "0";
}

function enterManualMode(faceToAlign = null) {
  state.manualMode = true;
  state.manualScale = 1;
  state.manualRotation = 0;
  state.manualOffsetX = 0;
  state.manualOffsetY = 0;
  dom.manualZoom.value = "1";
  dom.manualRotation.value = "0";
  requestAnimationFrame(() => {
    alignManualViewToFace(faceToAlign);
    applyManualTransform();
    renderOverlay();
  });
}

function startManualFitFromSelection() {
  const faceToAlign = getSelectedFaces()[0] || state.faces[0] || null;
  state.usedDetectedFace = Boolean(faceToAlign);
  enterManualMode(faceToAlign);
  setStatus(STATES.READY);
}

async function detectFacesForBitmap(imageBitmap, faceLimit = 1) {
  await adapter.init();
  state.detectorAvailable = adapter.isAvailable();

  if (!state.detectorAvailable) return [];
  return withTimeout(adapter.detect(imageBitmap, { faceLimit }), DETECTION_TIMEOUT_MS);
}

async function openManualEditor(file) {
  state.sequence += 1;
  const mySequence = state.sequence;
  state.file = file;
  state.error = null;
  state.timingMs = null;
  state.detectedFaceCount = 0;
  state.usedDetectedFace = false;
  state.view = "fit";
  state.uploadModalOpen = false;

  if (!ALLOWED_TYPES.has(file.type) && !file.type.startsWith("image/")) {
    setError("UNSUPPORTED_FORMAT", "Unsupported format. Please use a standard image format.");
    return;
  }

  const start = performance.now();
  setStatus(STATES.LOADING_IMAGE);

  try {
    state.imageBitmap = await decodeImage(file);
    if (mySequence !== state.sequence) return;
  } catch (error) {
    if (mySequence !== state.sequence) return;
    setError(error.code || "CORRUPT_IMAGE", "Could not read this image. Please choose another photo.");
    return;
  }

  setStatus(STATES.DETECTING);

  let faces = [];
  try {
    faces = await detectFacesForBitmap(state.imageBitmap, getTemplateFaceCapacity());
  } catch {
    faces = [];
  }

  if (mySequence !== state.sequence) return;
  state.timingMs = performance.now() - start;
  state.detectedFaceCount = faces.length;
  state.usedDetectedFace = faces.length > 0;
  state.faces = faces;
  selectSingleFace(faces[0]?.id || null);

  enterManualMode(faces[0] || null);
  setStatus(STATES.READY);
}

async function detectFaces(file) {
  state.sequence += 1;
  const mySequence = state.sequence;
  state.file = file;
  state.view = "fit";
  state.uploadModalOpen = false;
  clearFaceFitState();

  if (!ALLOWED_TYPES.has(file.type) && !file.type.startsWith("image/")) {
    setError("UNSUPPORTED_FORMAT", "Unsupported format. Please use a standard image format.");
    return;
  }

  const start = performance.now();
  setStatus(STATES.LOADING_IMAGE);

  let imageBitmap;
  try {
    imageBitmap = await decodeImage(file);
    if (mySequence !== state.sequence) return;
  } catch (error) {
    if (mySequence !== state.sequence) return;
    setError(error.code || "CORRUPT_IMAGE", "Could not read this image. Please choose another photo.");
    return;
  }

  state.imageBitmap = imageBitmap;
  setStatus(STATES.DETECTING);

  try {
    const faces = await detectFacesForBitmap(imageBitmap, getTemplateFaceCapacity());

    const timingMs = performance.now() - start;
    if (mySequence !== state.sequence) return;

    const rendered = getRenderedSize();
    const normalizedFaces = faces.map((face) => ({
      ...face,
      boxRendered: normalizeBox(
        face.boxNatural,
        { width: imageBitmap.width, height: imageBitmap.height },
        rendered
      ),
    }));

    state.timingMs = timingMs;
    state.detectedFaceCount = normalizedFaces.length;
    state.usedDetectedFace = normalizedFaces.length > 0;

    if (normalizedFaces.length === 0) {
      setDetectionRecoveryError(
        state.detectorAvailable ? "NO_FACE_DETECTED" : "DETECTOR_UNAVAILABLE"
      );
      enterManualMode();
      setStatus(STATES.READY);
      return;
    }

    state.faces = normalizedFaces;
    state.error = null;

    if (normalizedFaces.length === 1) {
      state.manualMode = false;
      selectSingleFace(normalizedFaces[0].id);
      setStatus(STATES.READY);
      return;
    }

    setSelectedFaceIds([]);
    state.manualMode = false;
    setStatus(STATES.FACES_FOUND);
  } catch (error) {
    if (mySequence !== state.sequence) return;
    state.timingMs = performance.now() - start;
    state.detectedFaceCount = 0;
    state.usedDetectedFace = false;
    setDetectionRecoveryError(error.code || "DETECTION_FAILED");
    enterManualMode();
    setStatus(STATES.READY);
  }
}

function renderOverlay() {
  dom.overlayLayer.innerHTML = "";
  dom.overlayLayer.style.pointerEvents = state.manualMode ? "none" : "";

  if (state.manualMode) return;

  const rendered = getRenderedSize();

  state.faces.forEach((face, index) => {
    const boxRendered = face.boxNatural && state.imageBitmap
      ? normalizeBox(
        face.boxNatural,
        { width: state.imageBitmap.width, height: state.imageBitmap.height },
        rendered
      )
      : face.boxRendered;

    if (!boxRendered) return;

    const hitWidth = Math.max(boxRendered.width, FACE_BOX_TAP_TARGET);
    const hitHeight = Math.max(boxRendered.height, FACE_BOX_TAP_TARGET);
    const hitLeft = clamp(
      boxRendered.x - (hitWidth - boxRendered.width) / 2,
      0,
      Math.max(0, rendered.width - hitWidth)
    );
    const hitTop = clamp(
      boxRendered.y - (hitHeight - boxRendered.height) / 2,
      0,
      Math.max(0, rendered.height - hitHeight)
    );

    const isSelected = state.selectedFaceIds.includes(face.id);
    const canSelectDetectedFaces = [STATES.FACES_FOUND, STATES.READY].includes(state.status);

    const button = document.createElement("button");
    button.type = "button";
    button.className = `face-box ${isSelected ? "selected" : ""}`;
    button.style.left = `${hitLeft}px`;
    button.style.top = `${hitTop}px`;
    button.style.width = `${hitWidth}px`;
    button.style.height = `${hitHeight}px`;
    button.style.setProperty("--face-ring-left", `${boxRendered.x - hitLeft}px`);
    button.style.setProperty("--face-ring-top", `${boxRendered.y - hitTop}px`);
    button.style.setProperty("--face-ring-width", `${boxRendered.width}px`);
    button.style.setProperty("--face-ring-height", `${boxRendered.height}px`);
    button.disabled = !canSelectDetectedFaces;
    button.setAttribute("aria-pressed", String(isSelected));
    button.setAttribute("aria-label", `Select face ${index + 1} of ${state.faces.length}`);

    const ring = document.createElement("span");
    ring.className = "face-box-ring";
    button.appendChild(ring);

    button.addEventListener("click", () => {
      if (![STATES.FACES_FOUND, STATES.READY].includes(state.status)) return;
      toggleDetectedFaceSelection(face.id);
      state.status = state.selectedFaceIds.length ? STATES.READY : STATES.FACES_FOUND;
      render();
    });

    dom.overlayLayer.appendChild(button);
  });
}

async function loadTemplateCatalog() {
  if (state.templateCatalog.length) return;

  try {
    const response = await fetch("/templates.json");
    const catalog = await response.json();
    state.templateCatalog = Array.isArray(catalog.templates) ? catalog.templates : [];
  } catch {
    state.templateCatalog = [];
  }
}

function getRecentTemplateIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENTS_STORAGE_KEY) || "{}");
    return Object.entries(parsed)
      .sort((left, right) => right[1] - left[1])
      .map(([templateId]) => templateId);
  } catch {
    return [];
  }
}

function recordTemplateUsage(templateId) {
  let usageMap = {};
  try {
    usageMap = JSON.parse(localStorage.getItem(RECENTS_STORAGE_KEY) || "{}") || {};
  } catch {
    usageMap = {};
  }

  usageMap[templateId] = Date.now();
  localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(usageMap));
}

function getVisibleTemplates() {
  const query = state.templateSearchQuery.trim().toLowerCase();
  const sorted = [...state.templateCatalog].sort((left, right) => right.popularityScore - left.popularityScore);
  const tabTemplates = state.activeTemplateTab === "recents"
    ? getRecentTemplateIds()
      .map((templateId) => state.templateCatalog.find((template) => template.id === templateId))
      .filter(Boolean)
    : sorted;

  if (!query) return tabTemplates;

  return tabTemplates.filter((template) => {
    const fields = [template.name, ...(template.tags || [])];
    return fields.some((field) => field.toLowerCase().includes(query));
  });
}

function renderTemplates() {
  const templates = getVisibleTemplates();
  dom.templateGrid.innerHTML = "";
  dom.templateEmpty.classList.toggle("hidden", templates.length > 0);

  templates.forEach((template, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "template-card";
    card.dataset.templateId = template.id;
    card.style.setProperty("--template-hue", String((index * 37) % 360));

    const art = document.createElement("span");
    art.className = "template-art";

    const initials = document.createElement("span");
    initials.className = "template-initials";
    initials.textContent = template.name
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("");

    const regions = document.createElement("span");
    regions.className = "template-regions";
    (template.faceRegions || []).slice(0, 4).forEach((region) => {
      const marker = document.createElement("span");
      marker.className = "template-region";
      marker.style.left = `${(region.x / template.images.width) * 100}%`;
      marker.style.top = `${(region.y / template.images.height) * 100}%`;
      marker.style.width = `${Math.max(12, (region.width / template.images.width) * 100)}%`;
      marker.style.height = `${Math.max(12, (region.height / template.images.height) * 100)}%`;
      regions.appendChild(marker);
    });

    const name = document.createElement("span");
    name.className = "template-name";
    name.textContent = template.name;

    art.append(initials, regions);
    card.append(art, name);

    card.addEventListener("click", () => {
      state.selectedTemplateId = template.id;
      recordTemplateUsage(template.id);
      state.status = STATES.IDLE;
      state.view = "studio";
      state.uploadModalOpen = false;
      render();
    });

    if (state.selectedTemplateId === template.id) {
      card.classList.add("selected");
    }

    dom.templateGrid.appendChild(card);
  });
}

function renderStudioTemplate(template) {
  if (!template) return;

  dom.studioTemplateArt.style.setProperty(
    "--template-hue",
    String(Math.abs(template.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 360)
  );
  dom.studioTemplateInitials.textContent = template.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  dom.studioTemplateRegions.innerHTML = "";

  (template.faceRegions || []).slice(0, 4).forEach((region) => {
    const marker = document.createElement("span");
    marker.className = "studio-template-region";
    marker.style.left = `${(region.x / template.images.width) * 100}%`;
    marker.style.top = `${(region.y / template.images.height) * 100}%`;
    marker.style.width = `${Math.max(10, (region.width / template.images.width) * 100)}%`;
    marker.style.height = `${Math.max(10, (region.height / template.images.height) * 100)}%`;
    dom.studioTemplateRegions.appendChild(marker);
  });
}

async function showTemplateSelection() {
  await loadTemplateCatalog();
  state.view = "templates";
  state.activeTemplateTab = "trending";
  state.templateSearchQuery = "";
  dom.templateSearch.value = "";
  [...dom.templateTabs.querySelectorAll("[data-tab]")].forEach((button) => {
    const active = button.dataset.tab === state.activeTemplateTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  render();
  renderTemplates();
}

function render() {
  const cameraActive = Boolean(state.cameraStream);
  const reviewingCameraPhoto = Boolean(state.cameraReviewUrl);
  const editingPhoto = Boolean(state.previewUrl) && [STATES.FACES_FOUND, STATES.READY, STATES.NO_FACE].includes(state.status);
  const showingTemplates = state.view === "templates";
  const showingStudio = state.view === "studio";
  const choosingUpload = false;
  const selectedTemplate = getSelectedTemplate();
  const selectedFaceCount = getSelectedFaces().length;
  const selectableFaceLimit = getSelectableFaceLimit();
  dom.uploadPage.classList.toggle("camera-mode", cameraActive || reviewingCameraPhoto);
  dom.uploadPage.classList.toggle("choice-mode", choosingUpload);
  dom.cameraShell.classList.toggle("hidden", !cameraActive);
  dom.reviewShell.classList.toggle("hidden", !reviewingCameraPhoto);
  dom.templateScreen.classList.toggle("hidden", !showingTemplates);
  dom.studioScreen.classList.toggle("hidden", !showingStudio);
  dom.uploadModal.classList.toggle("hidden", !state.uploadModalOpen);
  dom.overlayShell.classList.toggle("hidden", !editingPhoto || showingTemplates || showingStudio);
  dom.cameraCancelCta.classList.toggle("hidden", !cameraActive);
  dom.ctaRow.classList.toggle("hidden", !state.uploadModalOpen || cameraActive || reviewingCameraPhoto || editingPhoto);
  dom.cameraCta.classList.toggle("hidden", cameraActive || reviewingCameraPhoto || editingPhoto);
  dom.libraryCta.classList.toggle("hidden", cameraActive || reviewingCameraPhoto || editingPhoto);
  dom.manualFitCta.classList.toggle(
    "hidden",
    !editingPhoto || showingTemplates || showingStudio || state.manualMode || !state.imageBitmap
  );
  dom.overlayShell.classList.toggle("manual-active", state.manualMode);
  dom.overlayShell.classList.toggle("dragging", state.dragPointerId !== null);
  dom.selectedTemplateLabel.textContent = selectedTemplate ? `Template: ${selectedTemplate.name}` : "";
  if (showingStudio && selectedTemplate) renderStudioTemplate(selectedTemplate);

  dom.progressWrap.classList.toggle(
    "hidden",
    !(state.status === STATES.LOADING_IMAGE || state.status === STATES.DETECTING)
  );

  if (state.status === STATES.LOADING_IMAGE) {
    dom.progressBar.value = 40;
    dom.progressLabel.textContent = "Loading image...";
  }

  if (state.status === STATES.DETECTING) {
    dom.progressBar.value = 80;
    dom.progressLabel.textContent = "Detecting faces...";
  }

  dom.errorState.classList.toggle(
    "hidden",
    !state.error && ![STATES.ERROR, STATES.NO_FACE].includes(state.status)
  );
  dom.errorMessage.textContent = state.error?.message || "";

  if (state.previewUrl) {
    dom.previewImage.src = state.previewUrl;
  }

  if (state.status === STATES.FACES_FOUND) {
    dom.statusText.textContent = selectableFaceLimit > 1
      ? `${state.faces.length} faces found. Select up to ${selectableFaceLimit} faces for this template.`
      : `${state.faces.length} faces found. Tap or click one face to continue.`;
  } else if (state.status === STATES.READY) {
    if (state.manualMode && state.error?.code === "NO_FACE_DETECTED") {
      dom.statusText.textContent = "No face detected. Use the oval to choose the face manually.";
    } else if (state.manualMode && state.error?.code === "DETECTOR_UNAVAILABLE") {
      dom.statusText.textContent = "Face detection could not load. Use the oval to choose the face manually.";
    } else if (state.manualMode && state.error) {
      dom.statusText.textContent = "Face detection had trouble. Use the oval to choose the face manually.";
    } else if (state.manualMode && state.usedDetectedFace) {
      dom.statusText.textContent = "Face detected. Drag to fine tune the fit inside the oval.";
    } else if (state.manualMode) {
      dom.statusText.textContent = "Drag the photo until the face sits inside the oval.";
    } else if (selectableFaceLimit > 1 && selectedFaceCount === 0) {
      dom.statusText.textContent = "Select a face to continue.";
    } else if (selectableFaceLimit > 1 && selectedFaceCount > 1) {
      dom.statusText.textContent = `${selectedFaceCount} faces selected and ready.`;
    } else if (selectableFaceLimit > 1) {
      dom.statusText.textContent = `${selectedFaceCount || 1} face selected. Select another face or continue.`;
    } else {
      dom.statusText.textContent = "Face selected and ready.";
    }
  } else if (state.status === STATES.NO_FACE) {
    dom.statusText.textContent = "No face detected.";
  } else {
    dom.statusText.textContent = "";
  }

  dom.continueBtn.disabled = state.status !== STATES.READY || (!state.manualMode && selectedFaceCount === 0);
  dom.continueBtn.classList.toggle("hidden", !editingPhoto || showingTemplates);
  dom.manualOverlay.classList.toggle("hidden", !state.manualMode);
  dom.manualControls.classList.toggle("hidden", !state.manualMode);

  if (typeof state.timingMs === "number") {
    dom.timingMetric.classList.remove("hidden");
  } else {
    dom.timingMetric.classList.add("hidden");
    dom.timingMetric.textContent = "";
  }

  applyManualTransform();
  renderOverlay();
}

async function submitSelectedFace() {
  if (state.status !== STATES.READY) return;
  const selectedFaces = getSelectedFaces();
  const selectedFace = selectedFaces[0];
  if (!selectedFace) return;
  const selectedTemplate = getSelectedTemplate();

  await fetch("/api/process", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MemeBro-Mode": "face_swap",
      "X-MemeBro-Selected-Face": JSON.stringify(selectedFace),
      "X-MemeBro-Selected-Faces": JSON.stringify(selectedFaces),
      "X-MemeBro-Template": state.selectedTemplateId || "",
    },
    body: JSON.stringify({
      mode: "face_swap",
      selectedFace,
      selectedFaces,
      selectedFaceIds: state.selectedFaceIds,
      selectedTemplateId: state.selectedTemplateId,
      selectedTemplate,
    }),
  });
}

async function startCameraCapture() {
  clearCameraStream();
  clearCameraReview();
  state.uploadModalOpen = false;
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      dom.cameraInput.click();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.cameraFacingMode },
      audio: false,
    });
    state.cameraStream = stream;
    dom.cameraVideo.srcObject = stream;
    render();
  } catch {
    dom.cameraInput.click();
  }
}

async function snapCameraPhoto() {
  if (!state.cameraStream) return;
  const video = dom.cameraVideo;
  if (!video.videoWidth || !video.videoHeight) return;

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) return;
  const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });

  clearCameraStream();
  clearCameraReview();
  state.cameraReviewFile = file;
  state.cameraReviewUrl = URL.createObjectURL(file);
  dom.reviewImage.src = state.cameraReviewUrl;
  render();
}

async function useReviewedPhoto() {
  if (!state.cameraReviewFile) return;
  const file = state.cameraReviewFile;
  clearCameraStream();
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = URL.createObjectURL(file);
  clearCameraReview();
  render();
  await detectFaces(file);
}

async function flipCamera() {
  state.cameraFacingMode = state.cameraFacingMode === "user" ? "environment" : "user";
  await startCameraCapture();
}

function goBackToUploadChoices() {
  if (state.view === "templates") {
    return;
  }

  if (state.uploadModalOpen) {
    state.uploadModalOpen = false;
    render();
    return;
  }

  if (state.view === "studio" && state.status === STATES.IDLE && state.selectedTemplateId) {
    state.selectedTemplateId = null;
    state.view = "templates";
    render();
    renderTemplates();
    return;
  }

  if (state.cameraStream) {
    clearCameraStream();
    render();
    return;
  }

  if (state.cameraReviewUrl || state.previewUrl || state.status !== STATES.IDLE) {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    clearCameraStream();
    clearCameraReview();
    state.status = STATES.IDLE;
    state.faces = [];
    state.selectedFaceId = null;
    state.selectedFaceIds = [];
    state.error = null;
    state.timingMs = null;
    state.imageBitmap = null;
    state.previewUrl = "";
    state.file = null;
    state.sequence += 1;
    state.detectorAvailable = true;
    state.detectedFaceCount = 0;
    state.usedDetectedFace = false;
    state.manualMode = false;
    state.manualScale = 1;
    state.manualRotation = 0;
    state.manualOffsetX = 0;
    state.manualOffsetY = 0;
    state.dragPointerId = null;
    dom.cameraInput.value = "";
    dom.libraryInput.value = "";
    dom.manualZoom.value = "1";
    dom.manualRotation.value = "0";
    dom.previewImage.style.transform = "";
    state.view = "studio";
    render();
  }
}

dom.cameraCta.addEventListener("click", () => {
  startCameraCapture();
});
dom.backBtn.addEventListener("click", goBackToUploadChoices);
dom.cameraSnapCta.addEventListener("click", () => {
  snapCameraPhoto();
});
dom.cameraCloseCta.addEventListener("click", () => {
  clearCameraStream();
  render();
});
dom.cameraFlipCta.addEventListener("click", () => {
  flipCamera();
});
dom.cameraCancelCta.addEventListener("click", () => {
  clearCameraStream();
  render();
});
dom.reviewCloseCta.addEventListener("click", () => {
  clearCameraReview();
  render();
});
dom.retakeCta.addEventListener("click", () => {
  clearCameraReview();
  startCameraCapture();
});
dom.usePhotoCta.addEventListener("click", () => {
  useReviewedPhoto();
});
dom.openUploadModalCta.addEventListener("click", () => {
  state.uploadModalOpen = true;
  render();
});
dom.uploadModalBackdrop.addEventListener("click", () => {
  state.uploadModalOpen = false;
  render();
});
dom.uploadModalClose.addEventListener("click", () => {
  state.uploadModalOpen = false;
  render();
});
dom.manualFitCta.addEventListener("click", () => {
  startManualFitFromSelection();
});
dom.libraryCta.addEventListener("click", () => {
  state.uploadModalOpen = false;
  render();
  dom.libraryInput.click();
});
dom.templateSearch.addEventListener("input", (event) => {
  state.templateSearchQuery = event.target.value;
  renderTemplates();
});
dom.templateTabs.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-tab]");
  if (!tab) return;
  state.activeTemplateTab = tab.dataset.tab;
  [...dom.templateTabs.querySelectorAll("[data-tab]")].forEach((button) => {
    const active = button.dataset.tab === state.activeTemplateTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  renderTemplates();
});

dom.cameraInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = URL.createObjectURL(file);
  render();
  await detectFaces(file);
});

dom.libraryInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = URL.createObjectURL(file);
  render();
  await detectFaces(file);
});

dom.manualZoom.addEventListener("input", () => {
  state.manualScale = Number(dom.manualZoom.value || 1);
  applyManualTransform();
  renderOverlay();
});

dom.manualRotation.addEventListener("input", () => {
  state.manualRotation = Number(dom.manualRotation.value || 0);
  applyManualTransform();
  renderOverlay();
});

function startManualDrag(event) {
  if (!state.manualMode) return;
  event.preventDefault();
  state.dragPointerId = event.pointerId;
  state.dragStartX = event.clientX;
  state.dragStartY = event.clientY;
  state.dragOriginOffsetX = state.manualOffsetX;
  state.dragOriginOffsetY = state.manualOffsetY;
  dom.previewImage.classList.add("dragging");
  dom.overlayShell.setPointerCapture(event.pointerId);
}

function moveManualDrag(event) {
  if (!state.manualMode || state.dragPointerId !== event.pointerId) return;
  event.preventDefault();
  state.manualOffsetX = state.dragOriginOffsetX + (event.clientX - state.dragStartX);
  state.manualOffsetY = state.dragOriginOffsetY + (event.clientY - state.dragStartY);
  applyManualTransform();
  renderOverlay();
}

function endDrag(event) {
  if (state.dragPointerId !== event.pointerId) return;
  event.preventDefault();
  state.dragPointerId = null;
  dom.previewImage.classList.remove("dragging");
}

dom.overlayShell.addEventListener("pointerdown", startManualDrag);
dom.overlayShell.addEventListener("pointermove", moveManualDrag);
dom.overlayShell.addEventListener("pointerup", endDrag);
dom.overlayShell.addEventListener("pointercancel", endDrag);

dom.continueBtn.addEventListener("click", async () => {
  try {
    await submitSelectedFace();
  } catch {
    setError("UPLOAD_FAILED", "Upload failed.");
  }
});

async function init() {
  await showTemplateSelection();
}

init();
