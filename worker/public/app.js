const STATES = {
  IDLE: "idle",
  LOADING_IMAGE: "loading-image",
  DETECTING: "detecting",
  FACES_FOUND: "faces-found",
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
const FACE_CROP_DEFAULT_TYPE = "image/jpeg";
const FACE_CROP_QUALITY = 0.92;

const DETECTION_FAILURE_MESSAGES = {
  DETECTOR_UNAVAILABLE: "Face detection could not load in this browser. Use manual fit to line up the face.",
  DETECTION_FAILED: "Face detection could not find a usable face. Use manual fit or try another photo.",
  DETECTION_TIMEOUT: "Face detection took too long. Use manual fit or try another photo.",
  NO_FACE_DETECTED: "No face detected. Use manual fit or try another photo.",
};

const DEFAULT_MEME_TEXT = "TAP TO EDIT TEXT";
const EDITOR_HISTORY_STORAGE_KEY = "meme-editor-history";
const DEFAULT_MEME_FONT_KEY = "arial";
const DEFAULT_MEME_FONT_SIZE_MODE = "default";
const DEFAULT_MEME_TEXT_COLOR = "black";
const DEFAULT_MEME_OUTLINE_ENABLED = false;
const DEFAULT_MEME_OUTLINE_COLOR = "#ffffff";

const MEME_FONT_OPTIONS = {
  arial: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  impact: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
  "arial-black": '"Arial Black", Gadget, sans-serif',
  "comic-sans": '"Comic Sans MS", "Comic Sans", cursive',
  "times-new-roman": '"Times New Roman", Times, serif',
  "trebuchet-ms": '"Trebuchet MS", Helvetica, sans-serif',
  georgia: "Georgia, serif",
  verdana: "Verdana, Geneva, sans-serif",
  tahoma: "Tahoma, Geneva, sans-serif",
  "courier-new": '"Courier New", Courier, monospace',
  "lucida-console": '"Lucida Console", Monaco, monospace',
  palatino: '"Palatino Linotype", Palatino, serif',
  "gill-sans": '"Gill Sans", "Gill Sans MT", Calibri, sans-serif',
  optima: "Optima, Segoe, sans-serif",
};

const MEME_TEXT_COLORS = {
  black: "#000000",
  white: "#ffffff",
  red: "#d62828",
  blue: "#2563eb",
  yellow: "#ffd60a",
};

const MEME_FONT_SIZE_SCALES = {
  default: 1,
  small: 0.6,
};

const dom = {
  uploadPage: document.querySelector(".upload-page"),
  titleScreen: document.getElementById("title-screen"),
  titleStartCta: document.getElementById("title-start-cta"),
  topbar: document.querySelector(".topbar"),
  backBtn: document.querySelector(".back-btn"),
  ctaRow: document.querySelector(".cta-row"),
  selectedTemplateLabel: document.getElementById("selected-template-label"),
  studioScreen: document.getElementById("studio-screen"),
  studioTemplateArt: document.getElementById("studio-template-art"),
  studioTemplateImage: document.getElementById("studio-template-image"),
  studioTemplateInitials: document.getElementById("studio-template-initials"),
  studioTemplateRegions: document.getElementById("studio-template-regions"),
  memeTextPreview: document.getElementById("meme-text-preview"),
  memeTextHint: document.getElementById("meme-text-hint"),
  addTextCta: document.getElementById("add-text-cta"),
  memeTextDragHandle: document.getElementById("meme-text-drag-handle"),
  memeTextDelete: document.getElementById("meme-text-delete"),
  memeTextRotateHandle: document.getElementById("meme-text-rotate-handle"),
  memeTextResizeHandle: document.getElementById("meme-text-resize-handle"),
  textToolbar: document.getElementById("text-toolbar"),
  textLocalControls: document.getElementById("text-local-controls"),
  textDuplicateCta: document.getElementById("text-duplicate-cta"),
  textLockCta: document.getElementById("text-lock-cta"),
  textSizeDecCta: document.getElementById("text-size-dec-cta"),
  textSizeIncCta: document.getElementById("text-size-inc-cta"),
  textStyleBoldCta: document.getElementById("text-style-bold-cta"),
  textStyleItalicCta: document.getElementById("text-style-italic-cta"),
  textStyleUnderlineCta: document.getElementById("text-style-underline-cta"),
  textMoreCta: document.getElementById("text-more-cta"),
  textCopyCta: document.getElementById("text-copy-cta"),
  textPasteCta: document.getElementById("text-paste-cta"),
  textLinkCta: document.getElementById("text-link-cta"),
  textMoreMenu: document.getElementById("text-more-menu"),
  memeFontSelect: document.getElementById("meme-font-select"),
  memeFontSizeInput: document.getElementById("meme-font-size-input"),
  memeTextColorInput: document.getElementById("meme-text-color-input"),
  memeOutlineColorInput: document.getElementById("meme-outline-color-input"),
  outlineColorGroup: document.querySelector(".toolbar-color-group--outline"),
  memeOutlineRemoveCta: document.getElementById("meme-outline-remove-cta"),
  undoCta: document.getElementById("undo-cta"),
  redoCta: document.getElementById("redo-cta"),
  resetCta: document.getElementById("reset-cta"),
  resetConfirmation: document.getElementById("reset-confirmation"),
  resetConfirmationBackdrop: document.getElementById("reset-confirmation-backdrop"),
  resetCancelCta: document.getElementById("reset-cancel-cta"),
  resetConfirmCta: document.getElementById("reset-confirm-cta"),
  backConfirmation: document.getElementById("back-confirmation"),
  backConfirmationBackdrop: document.getElementById("back-confirmation-backdrop"),
  backCancelCta: document.getElementById("back-cancel-cta"),
  backConfirmCta: document.getElementById("back-confirm-cta"),
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
  continueBtn: document.getElementById("continue-btn"),
  manualOverlay: document.getElementById("manual-overlay"),
  manualCircle: document.getElementById("manual-circle"),
  manualControls: document.getElementById("manual-controls"),
  manualZoom: document.getElementById("manual-zoom"),
  manualRotation: document.getElementById("manual-rotation"),
  faceSwapLoader: document.getElementById("face-swap-loader"),
  faceSwapLoaderDelay: document.getElementById("face-swap-loader-delay"),
  faceSwapLoaderCancel: document.getElementById("face-swap-loader-cancel"),
};

const state = {
  status: STATES.IDLE,
  faces: [],
  selectedFaceId: null,
  selectedFaceIds: [],
  error: null,
  imageBitmap: null,
  previewUrl: "",
  file: null,
  sequence: 0,
  detectorAvailable: true,
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
  textDragPointerId: null,
  textResizePointerId: null,
  textPointerStartX: 0,
  textPointerStartY: 0,
  textStartX: 50,
  textStartY: 80,
  textStartWidth: 48,
  textDidDrag: false,
  cameraStream: null,
  cameraFacingMode: "user",
  cameraReviewFile: null,
  cameraReviewUrl: "",
  templateCatalog: [],
  selectedTemplateId: null,
  activeTemplateTab: "trending",
  templateSearchQuery: "",
  uploadModalOpen: false,
  view: "home",
  isEditingMemeText: false,
  isSubmittingFaceSwap: false,
  showSlowFaceSwapMessage: false,
  faceSwapAbortController: null,
  faceSwapSlowTimer: null,
  showResetConfirmation: false,
  showBackConfirmation: false,
  isTextSelected: false,
  isTextLocked: false,
  showTextMore: false,
  clipboardText: "",
  textLink: "",
  editor: {
    templateImage: "",
    generatedImage: "",
    overlayText: DEFAULT_MEME_TEXT,
    overlayFontKey: DEFAULT_MEME_FONT_KEY,
    overlaySizeMode: DEFAULT_MEME_FONT_SIZE_MODE,
    overlayFontPx: 22,
    overlayTextColor: DEFAULT_MEME_TEXT_COLOR,
    overlayOutlineEnabled: DEFAULT_MEME_OUTLINE_ENABLED,
    overlayOutlineColor: DEFAULT_MEME_OUTLINE_COLOR,
    overlayBold: false,
    overlayItalic: false,
    overlayUnderline: false,
    overlayAutoScale: 1,
    overlayX: 50,
    overlayY: 80,
    overlayWidthPct: 48,
    overlayRotation: 0,
    overlayVisible: false,
    frozenTextItems: [],
    historyStack: [],
    futureStack: [],
    initialSnapshot: null,
  },
};

const RECENTS_STORAGE_KEY = "meme-template-recents";

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
  state.imageBitmap = null;
  state.previewUrl = "";
  state.file = null;
  state.sequence += 1;
  state.detectorAvailable = true;
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
  state.isEditingMemeText = false;
  state.isSubmittingFaceSwap = false;
  state.showSlowFaceSwapMessage = false;
  state.faceSwapAbortController = null;
  if (state.faceSwapSlowTimer) clearTimeout(state.faceSwapSlowTimer);
  state.faceSwapSlowTimer = null;
  state.showResetConfirmation = false;
  initializeEditorState();
  clearEditorHistoryPersistence();
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
  state.faces = [];
  state.selectedFaceId = null;
  state.selectedFaceIds = [];
  state.imageBitmap = null;
  state.detectorAvailable = true;
  state.usedDetectedFace = false;
  state.manualMode = false;
  state.manualScale = 1;
  state.manualRotation = 0;
  state.manualOffsetX = 0;
  state.manualOffsetY = 0;
  state.dragPointerId = null;
  state.showResetConfirmation = false;
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

function getFaceCropBounds(detectedFace, natural) {
  const box = detectedFace?.boxNatural || detectedFace;
  const naturalWidth = Math.max(1, Math.floor(Number(natural?.width) || 0));
  const naturalHeight = Math.max(1, Math.floor(Number(natural?.height) || 0));
  const rawX = Number(box?.x);
  const rawY = Number(box?.y);
  const rawWidth = Number(box?.width);
  const rawHeight = Number(box?.height);

  if (
    !Number.isFinite(rawX)
    || !Number.isFinite(rawY)
    || !Number.isFinite(rawWidth)
    || !Number.isFinite(rawHeight)
    || rawWidth <= 0
    || rawHeight <= 0
  ) {
    const error = new Error("Selected face is missing a valid crop box.");
    error.code = "INVALID_FACE_CROP";
    throw error;
  }

  const left = clamp(Math.floor(rawX), 0, naturalWidth);
  const top = clamp(Math.floor(rawY), 0, naturalHeight);
  const right = clamp(Math.ceil(rawX + rawWidth), left, naturalWidth);
  const bottom = clamp(Math.ceil(rawY + rawHeight), top, naturalHeight);
  const width = right - left;
  const height = bottom - top;

  if (width <= 0 || height <= 0) {
    const error = new Error("Selected face crop is outside the image bounds.");
    error.code = "INVALID_FACE_CROP";
    throw error;
  }

  return { x: left, y: top, width, height };
}

function getFaceCropMimeType(file) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file?.type)
    ? file.type
    : FACE_CROP_DEFAULT_TYPE;
}

function getFaceCropFilename(file, cropType) {
  const extensionByType = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensionByType[cropType] || "jpg";
  const sourceName = typeof file?.name === "string" ? file.name : "upload";
  const baseName = sourceName
    .replace(/\.[^/.\\]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "upload";

  return `${baseName}-face-crop.${extension}`;
}

async function canvasToBlob(canvas, type, quality) {
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });

  if (!blob) {
    const error = new Error("Could not export the selected face crop.");
    error.code = "FACE_CROP_EXPORT_FAILED";
    throw error;
  }

  return blob;
}

async function extractFaceCrop(fullImageBlob, detectedFace, options = {}) {
  if (!fullImageBlob && !options.decodedImage) {
    const error = new Error("A source image is required before cropping a face.");
    error.code = "MISSING_SOURCE_IMAGE";
    throw error;
  }

  const decodedImage = options.decodedImage || await decodeImage(fullImageBlob);
  const source = decodedImage.source || decodedImage;
  const natural = {
    width: decodedImage.width || source.naturalWidth || source.width,
    height: decodedImage.height || source.naturalHeight || source.height,
  };
  const crop = getFaceCropBounds(detectedFace, natural);
  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const error = new Error("Canvas is unavailable for face crop extraction.");
    error.code = "FACE_CROP_UNAVAILABLE";
    throw error;
  }

  ctx.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );

  const type = options.type || getFaceCropMimeType(fullImageBlob);
  const blob = await canvasToBlob(canvas, type, options.quality ?? FACE_CROP_QUALITY);

  return {
    blob,
    bounds: crop,
    width: crop.width,
    height: crop.height,
    type: blob.type || type,
  };
}

function getRenderedSize() {
  const rect = dom.previewImage.getBoundingClientRect();
  return { width: rect.width || 320, height: rect.height || 320 };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cloneSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

function getTemplatePreviewImage(template = getSelectedTemplate()) {
  return template?.previewImage
    || template?.images?.preview
    || template?.images?.thumbnail
    || template?.images?.main
    || "/assets/memes/placeholder-preview.svg";
}

function getTemplateMainImage(template = getSelectedTemplate()) {
  return template?.templateImage
    || template?.images?.main
    || getTemplatePreviewImage(template)
    || "/assets/memes/placeholder.svg";
}

function getTemplateImageDimensions(template = getSelectedTemplate()) {
  return {
    width: Math.max(1, Number(template?.images?.width) || 1),
    height: Math.max(1, Number(template?.images?.height) || 1),
  };
}

function getTemplateImageSources(primarySource, fallbacks = []) {
  return [primarySource, ...fallbacks]
    .filter(Boolean)
    .filter((source, index, list) => list.indexOf(source) === index);
}

function updateImageWithFallback(image, sources) {
  if (!image) return;
  const serializedSources = JSON.stringify(sources);
  const nextSource = sources[0] || "";

  if (
    image.dataset.fallbackSources === serializedSources
    && image.dataset.fallbackIndex === "0"
    && image.getAttribute("src") === nextSource
  ) {
    return;
  }

  image.dataset.fallbackSources = serializedSources;
  image.dataset.fallbackIndex = "0";
  image.src = nextSource;
}

function getStudioTemplateBox(template = getSelectedTemplate()) {
  const { width, height } = getTemplateImageDimensions(template);
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 900;
  const maxWidth = Math.max(220, Math.min(
    viewportWidth <= 520 ? viewportWidth - 24 : viewportWidth - 32,
    viewportWidth * 0.6,
    560
  ));
  const maxHeight = Math.max(220, Math.min(viewportHeight * 0.72, 760));
  const scale = Math.min(maxWidth / width, maxHeight / height);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function createEditorSnapshot(overrides = {}) {
  return {
    selectedTemplateId: overrides.selectedTemplateId ?? state.selectedTemplateId ?? null,
    templateImage: overrides.templateImage ?? state.editor.templateImage,
    generatedImage: overrides.generatedImage ?? state.editor.generatedImage,
    overlayText: overrides.overlayText ?? state.editor.overlayText,
    overlayFontKey: overrides.overlayFontKey ?? state.editor.overlayFontKey,
    overlaySizeMode: overrides.overlaySizeMode ?? state.editor.overlaySizeMode,
    overlayFontPx: overrides.overlayFontPx ?? state.editor.overlayFontPx,
    overlayTextColor: overrides.overlayTextColor ?? state.editor.overlayTextColor,
    overlayOutlineEnabled: overrides.overlayOutlineEnabled ?? state.editor.overlayOutlineEnabled,
    overlayOutlineColor: overrides.overlayOutlineColor ?? state.editor.overlayOutlineColor,
    overlayBold: overrides.overlayBold ?? state.editor.overlayBold,
    overlayItalic: overrides.overlayItalic ?? state.editor.overlayItalic,
    overlayUnderline: overrides.overlayUnderline ?? state.editor.overlayUnderline,
    overlayX: overrides.overlayX ?? state.editor.overlayX,
    overlayY: overrides.overlayY ?? state.editor.overlayY,
    overlayWidthPct: overrides.overlayWidthPct ?? state.editor.overlayWidthPct,
    overlayRotation: overrides.overlayRotation ?? state.editor.overlayRotation,
    overlayVisible: overrides.overlayVisible ?? state.editor.overlayVisible,
    frozenTextItems: overrides.frozenTextItems ?? state.editor.frozenTextItems,
  };
}

function applyEditorSnapshot(snapshot) {
  if (!snapshot) return;
  state.editor.templateImage = snapshot.templateImage || getTemplateMainImage();
  state.editor.generatedImage = snapshot.generatedImage || "";
  state.editor.overlayText = snapshot.overlayText ?? DEFAULT_MEME_TEXT;
  state.editor.overlayFontKey = snapshot.overlayFontKey || DEFAULT_MEME_FONT_KEY;
  state.editor.overlaySizeMode = snapshot.overlaySizeMode || DEFAULT_MEME_FONT_SIZE_MODE;
  state.editor.overlayFontPx = Number.isFinite(snapshot.overlayFontPx) ? snapshot.overlayFontPx : 22;
  state.editor.overlayTextColor = snapshot.overlayTextColor || DEFAULT_MEME_TEXT_COLOR;
  state.editor.overlayOutlineEnabled = snapshot.overlayOutlineEnabled ?? DEFAULT_MEME_OUTLINE_ENABLED;
  state.editor.overlayOutlineColor = snapshot.overlayOutlineColor || DEFAULT_MEME_OUTLINE_COLOR;
  state.editor.overlayBold = snapshot.overlayBold ?? false;
  state.editor.overlayItalic = snapshot.overlayItalic ?? false;
  state.editor.overlayUnderline = snapshot.overlayUnderline ?? false;
  state.editor.overlayX = Number.isFinite(snapshot.overlayX) ? snapshot.overlayX : 50;
  state.editor.overlayY = Number.isFinite(snapshot.overlayY) ? snapshot.overlayY : 80;
  state.editor.overlayWidthPct = Number.isFinite(snapshot.overlayWidthPct) ? snapshot.overlayWidthPct : 48;
  state.editor.overlayRotation = Number.isFinite(snapshot.overlayRotation) ? snapshot.overlayRotation : 0;
  state.editor.overlayVisible = snapshot.overlayVisible ?? false;
  state.editor.frozenTextItems = Array.isArray(snapshot.frozenTextItems) ? snapshot.frozenTextItems : [];
  state.editor.overlayAutoScale = 1;
}

function editorSnapshotsEqual(left, right) {
  return Boolean(left && right)
    && left.selectedTemplateId === right.selectedTemplateId
    && left.templateImage === right.templateImage
    && left.generatedImage === right.generatedImage
    && left.overlayText === right.overlayText
    && left.overlayFontKey === right.overlayFontKey
    && left.overlaySizeMode === right.overlaySizeMode
    && left.overlayFontPx === right.overlayFontPx
    && left.overlayTextColor === right.overlayTextColor
    && left.overlayOutlineEnabled === right.overlayOutlineEnabled
    && left.overlayOutlineColor === right.overlayOutlineColor
    && left.overlayBold === right.overlayBold
    && left.overlayItalic === right.overlayItalic
    && left.overlayUnderline === right.overlayUnderline
    && left.overlayX === right.overlayX
    && left.overlayY === right.overlayY
    && left.overlayWidthPct === right.overlayWidthPct
    && left.overlayRotation === right.overlayRotation
    && left.overlayVisible === right.overlayVisible
    && JSON.stringify(left.frozenTextItems || []) === JSON.stringify(right.frozenTextItems || []);
}

function persistEditorHistory() {
  try {
    localStorage.setItem(EDITOR_HISTORY_STORAGE_KEY, JSON.stringify({
      selectedTemplateId: state.selectedTemplateId,
      initialSnapshot: state.editor.initialSnapshot,
      historyStack: state.editor.historyStack,
      futureStack: state.editor.futureStack,
      currentSnapshot: createEditorSnapshot(),
    }));
  } catch {
    // Ignore storage errors to preserve core editing behavior.
  }
}

function clearEditorHistoryPersistence() {
  try {
    localStorage.removeItem(EDITOR_HISTORY_STORAGE_KEY);
  } catch {
    // Ignore storage errors to preserve core editing behavior.
  }
}

function initializeEditorState(template = getSelectedTemplate()) {
  state.editor.initialSnapshot = createEditorSnapshot({
    selectedTemplateId: state.selectedTemplateId,
    templateImage: getTemplateMainImage(template),
    generatedImage: "",
    overlayText: DEFAULT_MEME_TEXT,
    overlayFontKey: DEFAULT_MEME_FONT_KEY,
    overlaySizeMode: DEFAULT_MEME_FONT_SIZE_MODE,
    overlayFontPx: 22,
    overlayTextColor: DEFAULT_MEME_TEXT_COLOR,
    overlayOutlineEnabled: DEFAULT_MEME_OUTLINE_ENABLED,
    overlayOutlineColor: DEFAULT_MEME_OUTLINE_COLOR,
    overlayBold: false,
    overlayItalic: false,
    overlayUnderline: false,
    overlayX: 50,
    overlayY: 80,
    overlayWidthPct: 48,
    overlayRotation: 0,
    overlayVisible: false,
    frozenTextItems: [],
  });
  state.editor.historyStack = [];
  state.editor.futureStack = [];
  state.showResetConfirmation = false;
  state.isTextSelected = false;
  state.isTextLocked = false;
  state.showTextMore = false;
  applyEditorSnapshot(state.editor.initialSnapshot);
}

function ensureHistorySeed() {
  if (!state.editor.initialSnapshot) {
    initializeEditorState();
  }

  if (state.editor.historyStack.length === 0) {
    state.editor.historyStack = [cloneSnapshot(state.editor.initialSnapshot)];
  }
}

function recordEditorSnapshot(snapshot = createEditorSnapshot()) {
  ensureHistorySeed();
  const nextSnapshot = cloneSnapshot(snapshot);
  const lastSnapshot = state.editor.historyStack[state.editor.historyStack.length - 1];

  if (editorSnapshotsEqual(lastSnapshot, nextSnapshot)) return;

  state.editor.historyStack.push(nextSnapshot);
  state.editor.futureStack = [];
  persistEditorHistory();
}

function restoreEditorSession() {
  try {
    const raw = localStorage.getItem(EDITOR_HISTORY_STORAGE_KEY);
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    if (parsed?.selectedTemplateId !== state.selectedTemplateId) return false;

    state.editor.initialSnapshot = parsed.initialSnapshot || null;
    state.editor.historyStack = Array.isArray(parsed.historyStack)
      ? parsed.historyStack.filter(Boolean)
      : [];
    state.editor.futureStack = Array.isArray(parsed.futureStack)
      ? parsed.futureStack.filter(Boolean)
      : [];

    const snapshot = parsed.currentSnapshot
      || state.editor.historyStack[state.editor.historyStack.length - 1]
      || state.editor.initialSnapshot;

    if (!snapshot) return false;

    applyEditorSnapshot(snapshot);
    return true;
  } catch {
    return false;
  }
}

function openStudioForTemplate(templateId) {
  state.selectedTemplateId = templateId;
  recordTemplateUsage(templateId);
  state.status = STATES.IDLE;
  state.view = "studio";
  state.uploadModalOpen = false;
  state.isEditingMemeText = false;
  state.showResetConfirmation = false;
  state.showBackConfirmation = false;

  initializeEditorState();
  if (!restoreEditorSession()) {
    persistEditorHistory();
  }

  render();
}

function undoEditorSnapshot() {
  if (state.editor.historyStack.length <= 1) return;
  const current = state.editor.historyStack.pop();
  if (current) state.editor.futureStack.push(current);
  applyEditorSnapshot(state.editor.historyStack[state.editor.historyStack.length - 1]);
  state.showResetConfirmation = false;
  state.isEditingMemeText = false;
  persistEditorHistory();
  render();
}

function redoEditorSnapshot() {
  if (state.editor.futureStack.length === 0) return;
  const next = state.editor.futureStack.pop();
  if (!next) return;
  state.editor.historyStack.push(cloneSnapshot(next));
  applyEditorSnapshot(next);
  state.showResetConfirmation = false;
  state.isEditingMemeText = false;
  persistEditorHistory();
  render();
}

function resetEditorToTemplate() {
  initializeEditorState();
  state.isEditingMemeText = false;
  state.showBackConfirmation = false;
  clearEditorHistoryPersistence();
  render();
}

function hasUnsavedStudioEdits() {
  if (state.view !== "studio" || !state.selectedTemplateId) return false;
  if (!state.editor.initialSnapshot) return false;
  const current = createEditorSnapshot();
  return !editorSnapshotsEqual(current, state.editor.initialSnapshot);
}

function confirmBackAndResetStudio() {
  initializeEditorState();
  clearEditorHistoryPersistence();
  state.showBackConfirmation = false;
  state.showResetConfirmation = false;
  state.selectedTemplateId = null;
  state.view = "templates";
  render();
  renderTemplates();
}

function getMemeFontFamily(fontKey = DEFAULT_MEME_FONT_KEY) {
  return MEME_FONT_OPTIONS[fontKey] || MEME_FONT_OPTIONS[DEFAULT_MEME_FONT_KEY];
}

function getMemeTextColor(colorKey = DEFAULT_MEME_TEXT_COLOR) {
  if (typeof colorKey === "string" && colorKey.startsWith("#")) return colorKey;
  return MEME_TEXT_COLORS[colorKey] || MEME_TEXT_COLORS[DEFAULT_MEME_TEXT_COLOR];
}

function getMemeBaseScale(sizeMode = DEFAULT_MEME_FONT_SIZE_MODE) {
  return MEME_FONT_SIZE_SCALES[sizeMode] || MEME_FONT_SIZE_SCALES[DEFAULT_MEME_FONT_SIZE_MODE];
}

function syncMemeTextAppearance() {
  const preview = dom.memeTextPreview;
  if (!preview) return 1;
  const textColor = getMemeTextColor(state.editor.overlayTextColor);

  preview.style.left = `${clamp(state.editor.overlayX, 5, 95)}%`;
  preview.style.top = `${clamp(state.editor.overlayY, 5, 95)}%`;
  preview.style.width = `${clamp(state.editor.overlayWidthPct, 18, 90)}%`;
  preview.style.setProperty("--meme-text-rotate", `${state.editor.overlayRotation}deg`);
  preview.style.transform = `translate(-50%, -50%) rotate(${state.editor.overlayRotation}deg)`;
  preview.style.fontFamily = getMemeFontFamily(state.editor.overlayFontKey);
  preview.style.fontWeight = state.editor.overlayBold ? "700" : "400";
  preview.style.fontStyle = state.editor.overlayItalic ? "italic" : "normal";
  preview.style.textDecoration = state.editor.overlayUnderline ? "underline" : "none";
  preview.style.color = textColor;
  preview.style.caretColor = textColor;

  const scale = fitMemeTextToCanvas();
  applyMemeOutline(preview);
  positionTextHandles();
  return scale;
}

function applyMemeOutline(preview) {
  if (!state.editor.overlayOutlineEnabled) {
    preview.style.textShadow = "none";
    return;
  }
  const color = state.editor.overlayOutlineColor || "#ffffff";
  const renderedPx = parseFloat(preview.style.fontSize) || Number(state.editor.overlayFontPx || 22);
  const t = Math.max(1, Math.round(renderedPx / 12));
  const offsets = [
    [-t, -t], [t, -t], [-t, t], [t, t],
    [0, -t], [0, t], [-t, 0], [t, 0],
  ];
  preview.style.textShadow = offsets.map(([x, y]) => `${x}px ${y}px 0 ${color}`).join(", ");
}

function syncOutlineSwatchState() {
  const group = dom.outlineColorGroup;
  const removeBtn = dom.memeOutlineRemoveCta;
  const enabled = !!state.editor.overlayOutlineEnabled;
  if (group) group.classList.toggle("is-off", !enabled);
  if (removeBtn) removeBtn.classList.toggle("hidden", !enabled);
}

function fitMemeTextToCanvas() {
  const preview = dom.memeTextPreview;
  const art = dom.studioTemplateArt;
  if (!preview || !art) return 1;

  const artRect = art.getBoundingClientRect();
  if (!artRect.width || !artRect.height) {
    state.editor.overlayAutoScale = 1;
    preview.dataset.fitScale = "1.00";
    preview.style.fontSize = "";
    return 1;
  }

  const baseScale = 1;
  const basePx = Number(state.editor.overlayFontPx || 22);
  let fitScale = 1;
  const minScale = 0.42;

  while (fitScale >= minScale) {
    preview.style.fontSize = `${Math.max(8, basePx * fitScale)}px`;
    const previewRect = preview.getBoundingClientRect();
    const withinHorizontalBounds = previewRect.left >= artRect.left + 12 && previewRect.right <= artRect.right - 12;
    const withinVerticalBounds = previewRect.top >= artRect.top + 12 && previewRect.bottom <= artRect.bottom - 12;

    if (withinHorizontalBounds && withinVerticalBounds) {
      break;
    }

    fitScale = Number((fitScale - 0.04).toFixed(2));
  }

  const clampedScale = Math.max(fitScale, minScale);
  preview.style.fontSize = `${Math.max(8, basePx * clampedScale)}px`;
  preview.dataset.fitScale = clampedScale.toFixed(2);
  state.editor.overlayAutoScale = clampedScale;
  return clampedScale;
}

function positionTextHandles() {
  if (!dom.memeTextDelete || !dom.memeTextRotateHandle) return;
  const artRect = dom.studioTemplateArt?.getBoundingClientRect();
  const textRect = dom.memeTextPreview?.getBoundingClientRect();
  if (!artRect?.width || !textRect?.width) return;

  const left = textRect.left - artRect.left;
  const top = textRect.top - artRect.top;
  const width = textRect.width;
  const height = textRect.height;

  dom.memeTextDelete.style.left = `${left + width - 16}px`;
  dom.memeTextDelete.style.top = `${top - 16}px`;
  dom.memeTextDragHandle.style.left = `${left - 16}px`;
  dom.memeTextDragHandle.style.top = `${top - 16}px`;
  dom.memeTextRotateHandle.style.left = `${left - 16}px`;
  dom.memeTextRotateHandle.style.top = `${top + height - 16}px`;
  dom.memeTextResizeHandle.style.left = `${left + width - 16}px`;
  dom.memeTextResizeHandle.style.top = `${top + height - 16}px`;
  if (dom.textLocalControls) {
    dom.textLocalControls.style.left = `${left + width / 2}px`;
    dom.textLocalControls.style.top = `${Math.max(12, top - 52)}px`;
    dom.textLocalControls.style.transform = "translateX(-50%)";
  }
  if (dom.textMoreMenu) {
    dom.textMoreMenu.style.left = `${left + width / 2}px`;
    dom.textMoreMenu.style.top = `${Math.max(12, top - 8)}px`;
    dom.textMoreMenu.style.transform = "translate(-50%, -100%)";
  }
}

function freezeCurrentTextItem() {
  if (!state.editor.overlayVisible) return;
  const text = (state.editor.overlayText || "").trim();
  if (!text) return;
  state.editor.frozenTextItems.push({
    text,
    fontKey: state.editor.overlayFontKey,
    fontPx: state.editor.overlayFontPx,
    color: state.editor.overlayTextColor,
    outline: state.editor.overlayOutlineEnabled,
    outlineColor: state.editor.overlayOutlineColor,
    bold: state.editor.overlayBold,
    italic: state.editor.overlayItalic,
    underline: state.editor.overlayUnderline,
    x: state.editor.overlayX,
    y: state.editor.overlayY,
    widthPct: state.editor.overlayWidthPct,
    rotation: state.editor.overlayRotation,
    locked: state.isTextLocked,
  });
}

function renderFrozenTextItems() {
  if (!dom.studioTemplateArt) return;
  dom.studioTemplateArt.querySelectorAll(".frozen-text-item").forEach((node) => node.remove());
  state.editor.frozenTextItems.forEach((item, index) => {
    const node = document.createElement("div");
    node.className = "frozen-text-item";
    node.dataset.textIndex = String(index);
    node.textContent = item.text;
    node.style.left = `${item.x}%`;
    node.style.top = `${item.y}%`;
    node.style.width = `${clamp(Number(item.widthPct) || 48, 18, 90)}%`;
    node.style.transform = `translate(-50%, -50%) rotate(${item.rotation || 0}deg)`;
    node.style.fontFamily = getMemeFontFamily(item.fontKey);
    node.style.fontSize = `${Math.max(8, Number(item.fontPx) || 22)}px`;
    node.style.color = item.color?.startsWith?.("#") ? item.color : getMemeTextColor(item.color);
    node.style.fontWeight = item.bold ? "700" : "400";
    node.style.fontStyle = item.italic ? "italic" : "normal";
    node.style.textDecoration = item.underline ? "underline" : "none";
    node.style.textShadow = item.outline
      ? `-2px -2px 0 ${item.outlineColor || DEFAULT_MEME_OUTLINE_COLOR}, 2px -2px 0 ${item.outlineColor || DEFAULT_MEME_OUTLINE_COLOR}, -2px 2px 0 ${item.outlineColor || DEFAULT_MEME_OUTLINE_COLOR}, 2px 2px 0 ${item.outlineColor || DEFAULT_MEME_OUTLINE_COLOR}`
      : "none";
    node.style.cursor = "text";
    dom.studioTemplateArt.appendChild(node);
  });
}

function selectFrozenTextItem(index) {
  const item = state.editor.frozenTextItems[index];
  if (!item) return;
  // Preserve the currently active textbox before switching selection.
  freezeCurrentTextItem();
  state.editor.frozenTextItems.splice(index, 1);
  state.editor.overlayText = item.text;
  state.editor.overlayFontKey = item.fontKey;
  state.editor.overlayFontPx = Number(item.fontPx) || 22;
  state.editor.overlayTextColor = item.color;
  state.editor.overlayOutlineEnabled = item.outline ?? false;
  state.editor.overlayOutlineColor = item.outlineColor || DEFAULT_MEME_OUTLINE_COLOR;
  state.editor.overlayBold = item.bold ?? false;
  state.editor.overlayItalic = item.italic ?? false;
  state.editor.overlayUnderline = item.underline ?? false;
  state.editor.overlayX = item.x;
  state.editor.overlayY = item.y;
  state.editor.overlayWidthPct = Number(item.widthPct) || 48;
  state.editor.overlayRotation = item.rotation || 0;
  state.editor.overlayVisible = true;
  state.isTextLocked = Boolean(item.locked);
  state.isTextSelected = true;
  state.isEditingMemeText = false;
  state.showTextMore = false;
  recordEditorSnapshot();
  render();
}

function createOrSelectTextAtPointer(event) {
  const artRect = dom.studioTemplateArt.getBoundingClientRect();
  const xPercent = clamp(((event.clientX - artRect.left) / artRect.width) * 100, 5, 95);
  const yPercent = clamp(((event.clientY - artRect.top) / artRect.height) * 100, 5, 95);
  if (state.editor.overlayVisible) freezeCurrentTextItem();
  // Create a fresh text object at the tapped location
  state.editor.overlayText = DEFAULT_MEME_TEXT;
  state.editor.overlayFontKey = DEFAULT_MEME_FONT_KEY;
  state.editor.overlaySizeMode = DEFAULT_MEME_FONT_SIZE_MODE;
  state.editor.overlayFontPx = 22;
  state.editor.overlayTextColor = DEFAULT_MEME_TEXT_COLOR;
  state.editor.overlayOutlineEnabled = DEFAULT_MEME_OUTLINE_ENABLED;
  state.editor.overlayOutlineColor = DEFAULT_MEME_OUTLINE_COLOR;
  state.editor.overlayBold = false;
  state.editor.overlayItalic = false;
  state.editor.overlayUnderline = false;
  state.editor.overlayRotation = 0;
  state.isTextLocked = false;
  state.editor.overlayX = xPercent;
  state.editor.overlayY = yPercent;
  state.isEditingMemeText = true;
  state.editor.overlayVisible = true;
  state.isTextSelected = true;
  state.showTextMore = false;
  // Ensure new textboxes never inherit prior DOM text content.
  dom.memeTextPreview.textContent = DEFAULT_MEME_TEXT;
  recordEditorSnapshot();
  render();
  if (state.isEditingMemeText) dom.memeTextPreview.focus();
}

function updateEditorTextSetting(key, value) {
  state.editor[key] = value;
  state.showResetConfirmation = false;
  recordEditorSnapshot();
  render();
}

function extractGeneratedImageUrl(payload) {
  return payload?.generatedImageUrl
    || payload?.imageUrl
    || payload?.compositedImageUrl
    || payload?.compositedImage
    || payload?.outputUrl
    || payload?.url
    || (payload?.b64 ? `data:${payload.mimeType || "image/png"};base64,${payload.b64}` : "")
    || "";
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

async function detectFaces(file) {
  state.sequence += 1;
  const mySequence = state.sequence;
  state.file = file;
  state.view = "fit";
  state.uploadModalOpen = false;
  state.isEditingMemeText = false;
  clearFaceFitState();

  if (!ALLOWED_TYPES.has(file.type) && !file.type.startsWith("image/")) {
    setError("UNSUPPORTED_FORMAT", "Unsupported format. Please use a standard image format.");
    return;
  }

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
    const { width, height } = getTemplateImageDimensions(template);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "template-card";
    card.dataset.templateId = template.id;
    card.style.setProperty("--template-hue", String((index * 37) % 360));

    const art = document.createElement("span");
    art.className = "template-art";
    art.style.aspectRatio = `${width} / ${height}`;
    const previewImage = document.createElement("img");
    previewImage.className = "template-art-image";
    previewImage.alt = template.name;
    previewImage.loading = "lazy";
    previewImage.decoding = "async";
    previewImage.width = width;
    previewImage.height = height;
    previewImage.addEventListener("load", () => {
      art.classList.add("image-ready");
      previewImage.classList.add("is-loaded");
    });
    previewImage.addEventListener("error", () => {
      const sources = JSON.parse(previewImage.dataset.fallbackSources || "[]");
      const nextIndex = Number(previewImage.dataset.fallbackIndex || "0") + 1;

      if (nextIndex < sources.length) {
        previewImage.dataset.fallbackIndex = String(nextIndex);
        previewImage.src = sources[nextIndex];
        return;
      }

      art.classList.add("image-error");
    });
    updateImageWithFallback(previewImage, getTemplateImageSources(
      getTemplatePreviewImage(template),
      [template.images?.thumbnail, getTemplateMainImage(template), "/assets/memes/placeholder-preview.svg"]
    ));

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
      marker.style.left = `${(region.x / width) * 100}%`;
      marker.style.top = `${(region.y / height) * 100}%`;
      marker.style.width = `${Math.max(12, (region.width / width) * 100)}%`;
      marker.style.height = `${Math.max(12, (region.height / height) * 100)}%`;
      regions.appendChild(marker);
    });

    const name = document.createElement("span");
    name.className = "template-name";
    name.textContent = template.name;

    art.append(previewImage, initials, regions);
    card.append(art, name);

    card.addEventListener("click", () => {
      openStudioForTemplate(template.id);
    });

    if (state.selectedTemplateId === template.id) {
      card.classList.add("selected");
    }

    dom.templateGrid.appendChild(card);
  });
}

function renderStudioTemplate(template) {
  if (!template) return;
  const { width, height } = getTemplateImageDimensions(template);
  const box = getStudioTemplateBox(template);
  const studioImageSources = getTemplateImageSources(
    state.editor.generatedImage || state.editor.templateImage || getTemplateMainImage(template),
    [getTemplateMainImage(template), getTemplatePreviewImage(template), "/assets/memes/placeholder.svg"]
  );
  const serializedStudioImageSources = JSON.stringify(studioImageSources);
  const shouldResetStudioImageState = dom.studioTemplateImage.dataset.fallbackSources !== serializedStudioImageSources;

  dom.studioTemplateArt.style.setProperty(
    "--template-hue",
    String(Math.abs(template.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 360)
  );
  dom.studioTemplateArt.style.width = `${box.width}px`;
  dom.studioTemplateArt.style.height = `${box.height}px`;
  dom.studioTemplateInitials.textContent = template.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  dom.studioTemplateRegions.innerHTML = "";
  if (shouldResetStudioImageState) {
    dom.studioTemplateArt.classList.remove("image-ready", "image-error");
    dom.studioTemplateImage.classList.remove("is-loaded");
  }
  dom.studioTemplateImage.alt = template.name;
  updateImageWithFallback(dom.studioTemplateImage, studioImageSources);

  (template.faceRegions || []).slice(0, 4).forEach((region) => {
    const marker = document.createElement("span");
    marker.className = "studio-template-region";
    marker.style.left = `${(region.x / width) * 100}%`;
    marker.style.top = `${(region.y / height) * 100}%`;
    marker.style.width = `${Math.max(10, (region.width / width) * 100)}%`;
    marker.style.height = `${Math.max(10, (region.height / height) * 100)}%`;
    dom.studioTemplateRegions.appendChild(marker);
  });
}

function beginInlineTextEdit(event) {
  event?.stopPropagation();
  if (state.textDidDrag) return;
  if (!state.editor.overlayVisible) return;

  state.isEditingMemeText = true;
  state.isTextSelected = true;
  const isPlaceholder = (state.editor.overlayText || "").trim().toUpperCase() === DEFAULT_MEME_TEXT;
  if (isPlaceholder) {
    state.editor.overlayText = "";
  }

  dom.memeTextPreview.contentEditable = "true";

  requestAnimationFrame(() => {
    dom.memeTextPreview.focus();

    if (isPlaceholder) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(dom.memeTextPreview);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });

  render();
}

function selectTextObject(event) {
  event?.stopPropagation();
  if (!state.editor.overlayVisible) return;
  if (state.textDidDrag) return;
  state.isTextSelected = true;
  state.showTextMore = false;
  render();
}

function finishInlineTextEdit() {
  state.isEditingMemeText = false;
  state.editor.overlayText = (dom.memeTextPreview.textContent || "").trim() || DEFAULT_MEME_TEXT;
  if (!state.isEditingMemeText) {
    dom.memeTextPreview.textContent = state.editor.overlayText;
  }
  recordEditorSnapshot();
  render();
}

function deleteMemeText() {
  state.editor.overlayVisible = false;
  state.isTextSelected = false;
  state.isEditingMemeText = false;
  state.showResetConfirmation = false;
  recordEditorSnapshot();
  render();
}

function getTextCenterInArt() {
  const artRect = dom.studioTemplateArt.getBoundingClientRect();
  return {
    x: (clamp(state.editor.overlayX, 5, 95) / 100) * artRect.width,
    y: (clamp(state.editor.overlayY, 5, 95) / 100) * artRect.height,
    artRect,
  };
}

function startTextDrag(event) {
  if (!state.editor.overlayVisible || state.isTextLocked) return;
  event.preventDefault();
  state.isTextSelected = true;
  state.textDidDrag = false;
  state.textDragPointerId = event.pointerId;
  state.textPointerStartX = event.clientX;
  state.textPointerStartY = event.clientY;
  state.textStartX = state.editor.overlayX;
  state.textStartY = state.editor.overlayY;
  dom.memeTextPreview.setPointerCapture(event.pointerId);
}

function startTextResize(event) {
  if (!state.editor.overlayVisible || state.isTextLocked) return;
  event.preventDefault();
  state.textResizePointerId = event.pointerId;
  state.textPointerStartX = event.clientX;
  state.textStartWidth = state.editor.overlayWidthPct;
  dom.memeTextResizeHandle.setPointerCapture(event.pointerId);
}

function moveTextResize(event) {
  if (state.textResizePointerId !== event.pointerId) return;
  event.preventDefault();
  const artRect = dom.studioTemplateArt.getBoundingClientRect();
  const dxPct = ((event.clientX - state.textPointerStartX) / artRect.width) * 100;
  state.editor.overlayWidthPct = clamp(state.textStartWidth + dxPct, 18, 90);
  render();
}

function endTextResize(event) {
  if (state.textResizePointerId !== event.pointerId) return;
  event.preventDefault();
  state.textResizePointerId = null;
  recordEditorSnapshot();
}

function moveTextDrag(event) {
  if (state.textDragPointerId !== event.pointerId) return;
  event.preventDefault();
  const { artRect } = getTextCenterInArt();
  const dxPercent = (event.clientX - state.textPointerStartX) / artRect.width * 100;
  const dyPercent = (event.clientY - state.textPointerStartY) / artRect.height * 100;
  state.editor.overlayX = clamp(state.textStartX + dxPercent, 5, 95);
  state.editor.overlayY = clamp(state.textStartY + dyPercent, 5, 95);
  if (Math.abs(dxPercent) > 0.1 || Math.abs(dyPercent) > 0.1) {
    state.textDidDrag = true;
  }
  render();
}

function endTextDrag(event) {
  if (state.textDragPointerId !== event.pointerId) return;
  event.preventDefault();
  state.textDragPointerId = null;
  if (state.textDidDrag) {
    recordEditorSnapshot();
    setTimeout(() => {
      state.textDidDrag = false;
    }, 0);
  }
}

// Rotation now works as a discrete 90-degree step: click the handle to advance.
const ROTATE_STEP = 90;

function rotateTextOneStep(event) {
  if (!state.editor.overlayVisible || state.isTextLocked) return;
  event?.preventDefault();
  event?.stopPropagation();
  const current = Number.isFinite(state.editor.overlayRotation) ? state.editor.overlayRotation : 0;
  const next = (((current + ROTATE_STEP) % 360) + 360) % 360;
  state.editor.overlayRotation = next === 360 ? 0 : next;
  recordEditorSnapshot();
  render();
}

function startFaceSwapLoadingState() {
  state.isSubmittingFaceSwap = true;
  state.showSlowFaceSwapMessage = false;
  if (state.faceSwapSlowTimer) clearTimeout(state.faceSwapSlowTimer);
  state.faceSwapSlowTimer = setTimeout(() => {
    state.showSlowFaceSwapMessage = true;
    render();
  }, 5000);
  render();
}

function stopFaceSwapLoadingState() {
  state.isSubmittingFaceSwap = false;
  state.showSlowFaceSwapMessage = false;
  state.faceSwapAbortController = null;
  if (state.faceSwapSlowTimer) clearTimeout(state.faceSwapSlowTimer);
  state.faceSwapSlowTimer = null;
  render();
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
  const editingPhoto = Boolean(state.previewUrl) && [STATES.FACES_FOUND, STATES.READY].includes(state.status);
  const showingHome = state.view === "home";
  const showingTemplates = state.view === "templates";
  const showingStudio = state.view === "studio";
  const selectedTemplate = getSelectedTemplate();
  const selectedFaceCount = getSelectedFaces().length;
  const selectableFaceLimit = getSelectableFaceLimit();
  dom.uploadPage.classList.toggle("home-mode", showingHome);
  dom.uploadPage.classList.toggle("camera-mode", cameraActive || reviewingCameraPhoto);
  dom.titleScreen?.classList.toggle("hidden", !showingHome);
  dom.topbar?.classList.toggle("hidden", showingHome);
  dom.backBtn?.classList.toggle("hidden", showingHome);
  dom.cameraShell.classList.toggle("hidden", !cameraActive);
  dom.reviewShell.classList.toggle("hidden", !reviewingCameraPhoto);
  dom.templateScreen.classList.toggle("hidden", !showingTemplates);
  dom.studioScreen.classList.toggle("hidden", !showingStudio);
  dom.uploadModal.classList.toggle("hidden", !state.uploadModalOpen);
  dom.resetConfirmation.classList.toggle("hidden", !showingStudio || !state.showResetConfirmation);
  dom.backConfirmation.classList.toggle("hidden", !showingStudio || !state.showBackConfirmation);
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
  if (!state.isEditingMemeText) dom.memeTextPreview.textContent = state.editor.overlayText;
  dom.studioTemplateArt.classList.toggle("editing-text", state.isEditingMemeText);
  dom.studioTemplateArt.classList.toggle("text-selected", state.isTextSelected);
  dom.memeTextPreview.setAttribute("contenteditable", state.isEditingMemeText ? "true" : "false");
  dom.memeTextPreview.classList.toggle("hidden", !state.editor.overlayVisible);
  dom.memeTextHint?.classList.toggle("hidden", showingStudio && (state.editor.overlayVisible || state.editor.frozenTextItems.length > 0));
  dom.memeTextDelete.classList.toggle("hidden", !showingStudio || !state.editor.overlayVisible || !state.isTextSelected);
  dom.memeTextDragHandle.classList.toggle("hidden", !showingStudio || !state.editor.overlayVisible || !state.isTextSelected);
  dom.memeTextRotateHandle.classList.toggle(
    "hidden",
    !showingStudio || !state.editor.overlayVisible || !state.isTextSelected
  );
  dom.memeTextResizeHandle.classList.toggle(
    "hidden",
    !showingStudio || !state.editor.overlayVisible || !state.isTextSelected
  );
  dom.textToolbar.classList.toggle("hidden", !showingStudio);
  dom.textLocalControls.classList.toggle("hidden", !showingStudio || !state.editor.overlayVisible || !state.isTextSelected);
  const showTextPopups = showingStudio && state.editor.overlayVisible && state.isTextSelected;
  dom.textMoreMenu.classList.toggle("hidden", !showTextPopups || !state.showTextMore);
  dom.textLockCta.textContent = state.isTextLocked ? "🔒" : "🔓";
  dom.memeFontSelect.value = state.editor.overlayFontKey;
  dom.memeFontSizeInput.value = String(Math.round(state.editor.overlayFontPx || 22));
  dom.memeTextColorInput.value = getMemeTextColor(state.editor.overlayTextColor);
  dom.memeOutlineColorInput.value = state.editor.overlayOutlineColor || "#ffffff";
  syncOutlineSwatchState();
  dom.textStyleBoldCta.classList.toggle("active", state.editor.overlayBold);
  dom.textStyleItalicCta.classList.toggle("active", state.editor.overlayItalic);
  dom.textStyleUnderlineCta.classList.toggle("active", state.editor.overlayUnderline);
  dom.faceSwapLoader.classList.toggle("hidden", !state.isSubmittingFaceSwap);
  dom.faceSwapLoaderDelay.classList.toggle("hidden", !state.showSlowFaceSwapMessage);
  dom.undoCta.disabled = state.editor.historyStack.length <= 1;
  dom.redoCta.disabled = state.editor.futureStack.length === 0;
  dom.resetCta.disabled = !selectedTemplate;

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
    !state.error && state.status !== STATES.ERROR
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
  } else {
    dom.statusText.textContent = "";
  }

  dom.continueBtn.disabled = state.status !== STATES.READY || (!state.manualMode && selectedFaceCount === 0);
  dom.continueBtn.classList.toggle("hidden", !editingPhoto || showingTemplates);
  dom.manualOverlay.classList.toggle("hidden", !state.manualMode);
  dom.manualControls.classList.toggle("hidden", !state.manualMode);

  applyManualTransform();
  renderOverlay();
  renderFrozenTextItems();
  syncMemeTextAppearance();
}

async function submitSelectedFace() {
  if (state.status !== STATES.READY) return;
  const selectedFaces = getSelectedFaces();
  const selectedFace = selectedFaces[0];
  if (!selectedFace) return;
  const selectedTemplate = getSelectedTemplate();

  state.faceSwapAbortController = new AbortController();
  startFaceSwapLoadingState();
  let response;

  try {
    const cropType = getFaceCropMimeType(state.file);
    const faceCrop = await extractFaceCrop(state.file, selectedFace, {
      decodedImage: state.imageBitmap,
      type: cropType,
    });

    response = await fetch("/api/process", {
      method: "POST",
      headers: {
        "Content-Type": faceCrop.type,
        "X-MemeBro-Mode": "face_swap",
        "X-MemeBro-Filename": getFaceCropFilename(state.file, faceCrop.type),
        "X-MemeBro-Selected-Face": JSON.stringify(selectedFace),
        "X-MemeBro-Selected-Faces": JSON.stringify(selectedFaces),
        "X-MemeBro-Face-Crop": JSON.stringify(faceCrop.bounds),
        "X-MemeBro-Template": state.selectedTemplateId || "",
        "X-MemeBro-Meme-Text": state.editor.overlayText || "",
        "X-MemeBro-Text-Style": JSON.stringify({
          fontKey: state.editor.overlayFontKey,
          fontPx: state.editor.overlayFontPx,
          textColor: state.editor.overlayTextColor,
          outlineEnabled: state.editor.overlayOutlineEnabled,
          outlineColor: state.editor.overlayOutlineColor,
        }),
      },
      body: faceCrop.blob,
      signal: state.faceSwapAbortController.signal,
    });
  } finally {
    stopFaceSwapLoadingState();
  }

  if (response.ok) {
    const payload = await response.json().catch(() => ({}));
    const generatedImage = extractGeneratedImageUrl(payload);

    if (!generatedImage) {
      const error = new Error("Face swap completed, but no composited image URL was returned.");
      error.code = "MISSING_GENERATED_IMAGE";
      throw error;
    }

    state.editor.generatedImage = generatedImage;
    state.showResetConfirmation = false;
    recordEditorSnapshot();
    render();
    return payload;
  }

  let message = `Upload failed with HTTP ${response.status}.`;
  let code = "UPLOAD_FAILED";

  try {
    const body = await response.json();
    code = body?.code || code;
    message = [body?.code, body?.message].filter(Boolean).join(": ") || message;
  } catch {
    // Keep the HTTP status fallback when the gateway does not return JSON.
  }

  const error = new Error(message);
  error.code = code;
  throw error;
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
    state.view = "home";
    render();
    return;
  }

  if (state.uploadModalOpen) {
    state.uploadModalOpen = false;
    render();
    return;
  }

  if (state.showResetConfirmation) {
    state.showResetConfirmation = false;
    render();
    return;
  }

  if (state.showBackConfirmation) {
    state.showBackConfirmation = false;
    render();
    return;
  }

  if (state.view === "studio" && hasUnsavedStudioEdits()) {
    state.showBackConfirmation = true;
    state.showResetConfirmation = false;
    state.isEditingMemeText = false;
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
    state.imageBitmap = null;
    state.previewUrl = "";
    state.file = null;
    state.sequence += 1;
    state.detectorAvailable = true;
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
dom.titleStartCta?.addEventListener("click", async () => {
  await showTemplateSelection();
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
dom.addTextCta?.addEventListener("click", () => {
  const rect = dom.studioTemplateArt.getBoundingClientRect();
  createOrSelectTextAtPointer({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
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
dom.memeTextPreview.addEventListener("click", selectTextObject);
dom.memeTextPreview.addEventListener("dblclick", beginInlineTextEdit);
dom.studioTemplateArt.addEventListener("click", (event) => {
  if (event.target.closest(".text-toolbar, .text-local-controls, .text-menu")) return;
  if (event.target === dom.memeTextDelete || event.target === dom.memeTextRotateHandle) return;
  const frozenTextNode = event.target.closest(".frozen-text-item");
  if (frozenTextNode) {
    const index = Number(frozenTextNode.dataset.textIndex);
    if (Number.isFinite(index)) {
      selectFrozenTextItem(index);
      return;
    }
  }
  // Single-click on blank space should not create new text.
});

dom.studioTemplateArt.addEventListener("dblclick", (event) => {
  if (event.target.closest(".text-toolbar, .text-local-controls, .text-menu")) return;
  if (event.target === dom.memeTextDelete || event.target === dom.memeTextRotateHandle) return;
  if (event.target.closest(".frozen-text-item")) return;
  if (state.textDidDrag) return;
  if (event.target === dom.studioTemplateArt || event.target === dom.studioTemplateInitials || event.target === dom.studioTemplateRegions) {
    createOrSelectTextAtPointer(event);
  }
});

let lastBlankTapTime = 0;
dom.studioTemplateArt.addEventListener("pointerup", (event) => {
  if (event.pointerType !== "touch") return;
  if (event.target.closest(".text-toolbar, .text-local-controls, .text-menu, .frozen-text-item")) return;
  if (!(event.target === dom.studioTemplateArt || event.target === dom.studioTemplateInitials || event.target === dom.studioTemplateRegions)) return;
  const now = Date.now();
  if (now - lastBlankTapTime <= 360) {
    createOrSelectTextAtPointer(event);
    lastBlankTapTime = 0;
    return;
  }
  lastBlankTapTime = now;
});
dom.memeTextPreview.addEventListener("pointerdown", (event) => {
  if (state.isEditingMemeText) return;
  if (event.target === dom.memeTextDragHandle) return;
  startTextDrag(event);
});
dom.memeTextPreview.addEventListener("pointermove", moveTextDrag);
dom.memeTextPreview.addEventListener("pointerup", endTextDrag);
dom.memeTextPreview.addEventListener("pointercancel", endTextDrag);
dom.memeTextPreview.addEventListener("input", () => {
  state.editor.overlayText = dom.memeTextPreview.textContent || "";
  state.editor.overlayVisible = true;
  state.showResetConfirmation = false;

  syncMemeTextAppearance();

  // DO NOT render() while actively editing
});
dom.memeTextPreview.addEventListener("blur", finishInlineTextEdit);
dom.memeTextPreview.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    finishInlineTextEdit();
  }
});
dom.memeTextDelete.addEventListener("click", deleteMemeText);
dom.textDuplicateCta.addEventListener("click", () => {
  if (!state.editor.overlayVisible) return;
  const text = (state.editor.overlayText || "").trim();
  if (!text) return;

  const duplicateSource = {
    text,
    fontKey: state.editor.overlayFontKey,
    fontPx: state.editor.overlayFontPx,
    color: state.editor.overlayTextColor,
    outline: state.editor.overlayOutlineEnabled,
    outlineColor: state.editor.overlayOutlineColor,
    bold: state.editor.overlayBold,
    italic: state.editor.overlayItalic,
    underline: state.editor.overlayUnderline,
    x: state.editor.overlayX,
    y: state.editor.overlayY,
    widthPct: state.editor.overlayWidthPct,
    rotation: state.editor.overlayRotation,
    locked: state.isTextLocked,
  };

  // Persist original, then make duplicate a separate active textbox.
  freezeCurrentTextItem();
  const duplicateOffset = 3;
  state.editor.overlayText = duplicateSource.text;
  state.editor.overlayFontKey = duplicateSource.fontKey;
  state.editor.overlayFontPx = duplicateSource.fontPx;
  state.editor.overlayTextColor = duplicateSource.color;
  state.editor.overlayOutlineEnabled = duplicateSource.outline;
  state.editor.overlayOutlineColor = duplicateSource.outlineColor;
  state.editor.overlayBold = duplicateSource.bold;
  state.editor.overlayItalic = duplicateSource.italic;
  state.editor.overlayUnderline = duplicateSource.underline;
  state.editor.overlayX = clamp(duplicateSource.x + duplicateOffset, 5, 95);
  state.editor.overlayY = clamp(duplicateSource.y + duplicateOffset, 5, 95);
  state.editor.overlayWidthPct = duplicateSource.widthPct;
  state.editor.overlayRotation = duplicateSource.rotation;
  state.isTextLocked = duplicateSource.locked;
  state.editor.overlayVisible = true;
  state.isEditingMemeText = false;
  state.isTextSelected = true;
  state.showTextMore = false;
  recordEditorSnapshot();
  render();
});
dom.textLockCta.addEventListener("click", () => {
  state.isTextLocked = !state.isTextLocked;
  state.isEditingMemeText = false;
  render();
});
dom.textMoreCta.addEventListener("click", () => {
  state.showTextMore = !state.showTextMore;
  render();
});
dom.textSizeDecCta.addEventListener("click", () => {
  const next = clamp(Math.round((state.editor.overlayFontPx || 22) - 2), 8, 120);
  updateEditorTextSetting("overlayFontPx", next);
});
dom.textSizeIncCta.addEventListener("click", () => {
  const next = clamp(Math.round((state.editor.overlayFontPx || 22) + 2), 8, 120);
  updateEditorTextSetting("overlayFontPx", next);
});
dom.textStyleBoldCta.addEventListener("click", () => {
  updateEditorTextSetting("overlayBold", !state.editor.overlayBold);
});
dom.textStyleItalicCta.addEventListener("click", () => {
  updateEditorTextSetting("overlayItalic", !state.editor.overlayItalic);
});
dom.textStyleUnderlineCta.addEventListener("click", () => {
  updateEditorTextSetting("overlayUnderline", !state.editor.overlayUnderline);
});
dom.textCopyCta.addEventListener("click", async () => {
  state.clipboardText = state.editor.overlayText;
  try { await navigator.clipboard?.writeText(state.editor.overlayText); } catch {}
  state.showTextMore = false;
  render();
});
dom.textPasteCta.addEventListener("click", async () => {
  let text = state.clipboardText;
  try { text = (await navigator.clipboard?.readText()) || text; } catch {}
  if (!text) return;
  state.editor.overlayText = text;
  state.editor.overlayVisible = true;
  recordEditorSnapshot();
  state.showTextMore = false;
  render();
});
dom.textLinkCta.addEventListener("click", () => {
  const link = window.prompt("Add a link for this text", state.textLink || "https://");
  if (link !== null) state.textLink = link.trim();
  state.showTextMore = false;
  render();
});
dom.memeTextRotateHandle.addEventListener("click", rotateTextOneStep);
dom.memeTextDragHandle.addEventListener("pointerdown", startTextDrag);
dom.memeTextDragHandle.addEventListener("pointermove", moveTextDrag);
dom.memeTextDragHandle.addEventListener("pointerup", endTextDrag);
dom.memeTextDragHandle.addEventListener("pointercancel", endTextDrag);
dom.memeTextResizeHandle.addEventListener("pointerdown", startTextResize);
dom.memeTextResizeHandle.addEventListener("pointermove", moveTextResize);
dom.memeTextResizeHandle.addEventListener("pointerup", endTextResize);
dom.memeTextResizeHandle.addEventListener("pointercancel", endTextResize);
dom.memeFontSelect.addEventListener("change", () => {
  updateEditorTextSetting("overlayFontKey", dom.memeFontSelect.value);
});
dom.memeFontSizeInput.addEventListener("change", () => {
  const value = clamp(Number(dom.memeFontSizeInput.value) || 22, 8, 120);
  updateEditorTextSetting("overlayFontPx", value);
});
let textColorFocusStart = state.editor.overlayTextColor;
let outlineColorFocusStart = state.editor.overlayOutlineColor;
let textColorCommittedInFocus = false;
let outlineColorCommittedInFocus = false;

dom.memeTextColorInput.addEventListener("focus", () => {
  textColorFocusStart = state.editor.overlayTextColor;
  textColorCommittedInFocus = false;
});
dom.memeTextColorInput.addEventListener("input", () => {
  // Live preview only while dragging picker; don't push undo snapshots yet.
  state.editor.overlayTextColor = dom.memeTextColorInput.value;
  state.showResetConfirmation = false;
  syncMemeTextAppearance();
});
dom.memeTextColorInput.addEventListener("change", () => {
  textColorCommittedInFocus = true;
  updateEditorTextSetting("overlayTextColor", dom.memeTextColorInput.value);
});
dom.memeTextColorInput.addEventListener("blur", () => {
  if (textColorCommittedInFocus) return;
  if (state.editor.overlayTextColor !== textColorFocusStart) {
    updateEditorTextSetting("overlayTextColor", state.editor.overlayTextColor);
  }
});

dom.memeOutlineColorInput.addEventListener("focus", () => {
  outlineColorFocusStart = state.editor.overlayOutlineColor;
  outlineColorCommittedInFocus = false;
});
dom.memeOutlineColorInput.addEventListener("input", () => {
  // Live preview only while dragging picker; don't push undo snapshots yet.
  // Picking any color implies the user wants an outline, so auto-enable.
  state.editor.overlayOutlineEnabled = true;
  state.editor.overlayOutlineColor = dom.memeOutlineColorInput.value;
  state.showResetConfirmation = false;
  syncMemeTextAppearance();
  syncOutlineSwatchState();
});
dom.memeOutlineColorInput.addEventListener("change", () => {
  outlineColorCommittedInFocus = true;
  // Commit enabled=true alongside the color in a single undo snapshot.
  state.editor.overlayOutlineEnabled = true;
  updateEditorTextSetting("overlayOutlineColor", dom.memeOutlineColorInput.value);
});
dom.memeOutlineColorInput.addEventListener("blur", () => {
  if (outlineColorCommittedInFocus) return;
  if (state.editor.overlayOutlineColor !== outlineColorFocusStart) {
    state.editor.overlayOutlineEnabled = true;
    updateEditorTextSetting("overlayOutlineColor", state.editor.overlayOutlineColor);
  }
});
dom.memeOutlineRemoveCta?.addEventListener("click", () => {
  updateEditorTextSetting("overlayOutlineEnabled", false);
});
dom.undoCta.addEventListener("click", () => {
  undoEditorSnapshot();
});
dom.redoCta.addEventListener("click", () => {
  redoEditorSnapshot();
});
dom.resetCta.addEventListener("click", () => {
  state.showResetConfirmation = !state.showResetConfirmation;
  state.isEditingMemeText = false;
  render();
});
dom.resetConfirmationBackdrop?.addEventListener("click", () => {
  state.showResetConfirmation = false;
  render();
});
dom.resetCancelCta.addEventListener("click", () => {
  state.showResetConfirmation = false;
  render();
});
dom.resetConfirmCta.addEventListener("click", () => {
  resetEditorToTemplate();
});
dom.backConfirmationBackdrop?.addEventListener("click", () => {
  state.showBackConfirmation = false;
  render();
});
dom.backCancelCta?.addEventListener("click", () => {
  state.showBackConfirmation = false;
  render();
});
dom.backConfirmCta?.addEventListener("click", () => {
  confirmBackAndResetStudio();
});

document.addEventListener("pointerdown", (event) => {
  const clickedInsideEditor =
    event.target.closest(
      "#meme-text-preview, .frozen-text-item, .text-toolbar, .text-local-controls, .text-menu, #meme-text-delete, #meme-text-rotate-handle, #meme-text-drag-handle, #meme-text-resize-handle"
    );

  if (clickedInsideEditor) return;

  if (state.isEditingMemeText) {
    finishInlineTextEdit();
  }

  if (event.target.closest("#studio-template-art")) {
    state.isTextSelected = false;
    state.showTextMore = false;
    render();
    return;
  }

  if (state.isTextSelected || state.showTextMore) {
    state.isTextSelected = false;
    state.showTextMore = false;
    render();
  }
});
dom.faceSwapLoaderCancel.addEventListener("click", () => {
  if (state.faceSwapAbortController) state.faceSwapAbortController.abort();
  stopFaceSwapLoadingState();
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

dom.studioTemplateImage.addEventListener("load", () => {
  dom.studioTemplateArt.classList.add("image-ready");
  dom.studioTemplateArt.classList.remove("image-error");
  dom.studioTemplateImage.classList.add("is-loaded");
});

dom.studioTemplateImage.addEventListener("error", () => {
  const sources = JSON.parse(dom.studioTemplateImage.dataset.fallbackSources || "[]");
  const nextIndex = Number(dom.studioTemplateImage.dataset.fallbackIndex || "0") + 1;

  if (nextIndex < sources.length) {
    dom.studioTemplateImage.dataset.fallbackIndex = String(nextIndex);
    dom.studioTemplateImage.src = sources[nextIndex];
    return;
  }

  dom.studioTemplateArt.classList.add("image-error");
});

window.addEventListener("resize", () => {
  if (state.view === "studio") {
    const selectedTemplate = getSelectedTemplate();
    if (selectedTemplate) renderStudioTemplate(selectedTemplate);
    syncMemeTextAppearance();
  }
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
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }
    setError(error.code || "UPLOAD_FAILED", error.message || "Upload failed.");
  }
});

export const __testHooks = {
  dom,
  state,
  render,
  setStatus,
  selectSingleFace,
  submitSelectedFace,
  undoEditorSnapshot,
  redoEditorSnapshot,
  resetEditorToTemplate,
  beginInlineTextEdit,
  finishInlineTextEdit,
  startFaceSwapLoadingState,
  stopFaceSwapLoadingState,
  getFaceCropBounds,
  extractFaceCrop,
  syncMemeTextAppearance,
  fitMemeTextToCanvas,
  updateEditorTextSetting,
};

async function init() {
  render();
}

init();
