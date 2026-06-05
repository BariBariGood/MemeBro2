// Codes the gateway can return while upstream AI work is temporarily unavailable.
const ACUTE_LOAD_ERROR_MESSAGES = {
    FEATURE_DISABLED: "AI generation is temporarily unavailable. You can retry in a few minutes.",
    QUEUE_FULL: "MemeBro is under heavy load. Retry shortly.",
    RATE_LIMITED: "The AI service is rate-limiting requests. Retry in a moment.",
};

export const RETRYABLE_LOAD_ERROR_CODES = new Set(Object.keys(ACUTE_LOAD_ERROR_MESSAGES));

// Errors where the user should be offered a "Try another photo" recovery path.
export const NEW_PHOTO_ERROR_CODES = new Set([
    "CORRUPT_IMAGE",
    "UNSUPPORTED_FORMAT",
    "NO_FACE_DETECTED",
    "DETECTION_FAILED",
    "DETECTION_TIMEOUT",
    "DETECTOR_UNAVAILABLE",
]);

// Prefer product copy for known transient failures; fall back to the backend message otherwise.
export function getLoadErrorMessage(error) {
    const code = error?.code || "";
    return ACUTE_LOAD_ERROR_MESSAGES[code] || error?.message || "";
}
