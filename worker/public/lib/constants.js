export const STATES = {
    IDLE: "idle",
    LOADING_IMAGE: "loading-image",
    DETECTING: "detecting",
    FACES_FOUND: "faces-found",
    ERROR: "error",
    READY: "ready",
};

export const ALLOWED_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
]);

export const DETECTION_TIMEOUT_MS = 5000;
export const FACE_BOX_TAP_TARGET = 48;
export const DETECTION_TILE_OVERLAP = 0.18;
export const DETECTION_TILE_MAX_EDGE = 900;
export const DETECTION_TILE_MAX_PASSES = 12;
export const DETECTION_DUPLICATE_OVERLAP = 0.45;
export const MEDIAPIPE_WASM_PATH = "/.generated/mediapipe/wasm";
export const MEDIAPIPE_FACE_MODEL_PATH = "/.generated/mediapipe/models/blaze_face_short_range.tflite";

export const DETECTION_FAILURE_MESSAGES = {
    DETECTOR_UNAVAILABLE: "Face detection could not load in this browser. Use manual fit to line up the face.",
    DETECTION_FAILED: "Face detection could not find a usable face. Use manual fit or try another photo.",
    DETECTION_TIMEOUT: "Face detection took too long. Use manual fit or try another photo.",
    NO_FACE_DETECTED: "No face detected. Use manual fit or try another photo.",
};

export const DEFAULT_MEME_TEXT = "TAP TO EDIT TEXT";
export const EDITOR_HISTORY_STORAGE_KEY = "meme-editor-history";
export const PROJECT_AUTOSAVE_STORAGE_KEY = "memebro-project-autosave";
export const DEFAULT_MEME_FONT_KEY = "arial";
export const DEFAULT_MEME_FONT_SIZE_MODE = "default";
export const DEFAULT_MEME_TEXT_COLOR = "black";
export const DEFAULT_MEME_OUTLINE_ENABLED = false;
export const DEFAULT_MEME_OUTLINE_COLOR = "#ffffff";
export const RECENTS_STORAGE_KEY = "meme-template-recents";
export const ROTATE_STEP = 90;
export const FACE_CROP_DEFAULT_TYPE = "image/jpeg";
export const FACE_CROP_QUALITY = 0.92;

export const MEME_FONT_OPTIONS = {
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

export const MEME_TEXT_COLORS = {
    black: "#000000",
    white: "#ffffff",
    red: "#d62828",
    blue: "#2563eb",
    yellow: "#ffd60a",
};

export const MEME_FONT_SIZE_SCALES = {
    default: 1,
    small: 0.6,
};
