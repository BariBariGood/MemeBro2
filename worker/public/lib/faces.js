// ─────────────────────────────────────────────
// Face detection, crop extraction, and selection.
// ─────────────────────────────────────────────

import {
    ALLOWED_TYPES,
    DETECTION_TIMEOUT_MS,
    FACE_CROP_DEFAULT_TYPE,
    FACE_CROP_QUALITY,
    STATES,
    } from "./constants.js";
import { state } from "./state.js";

// ── Utilities ────────────────────────────────

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

// ── Face crop ────────────────────────────────

export function getFaceCropBounds(detectedFace, natural, { clamp }) {
    const box         = detectedFace?.boxNatural || detectedFace;
    const naturalWidth  = Math.max(1, Math.floor(Number(natural?.width)  || 0));
    const naturalHeight = Math.max(1, Math.floor(Number(natural?.height) || 0));
    const rawX = Number(box?.x);
    const rawY = Number(box?.y);
    const rawWidth  = Number(box?.width);
    const rawHeight = Number(box?.height);

    if (
        !Number.isFinite(rawX) || !Number.isFinite(rawY)
        || !Number.isFinite(rawWidth) || !Number.isFinite(rawHeight)
        || rawWidth <= 0 || rawHeight <= 0
    ) {
        const error = new Error("Selected face is missing a valid crop box.");
        error.code = "INVALID_FACE_CROP";
        throw error;
    }

    const left   = clamp(Math.floor(rawX), 0, naturalWidth);
    const top    = clamp(Math.floor(rawY), 0, naturalHeight);
    const right  = clamp(Math.ceil(rawX + rawWidth),  left, naturalWidth);
    const bottom = clamp(Math.ceil(rawY + rawHeight), top,  naturalHeight);
    const width  = right - left;
    const height = bottom - top;

    if (width <= 0 || height <= 0) {
        const error = new Error("Selected face crop is outside the image bounds.");
        error.code = "INVALID_FACE_CROP";
        throw error;
    }

    return { x: left, y: top, width, height };
}

export function getFaceCropMimeType(file) {
    return ["image/jpeg", "image/png", "image/webp"].includes(file?.type)
        ? file.type
        : FACE_CROP_DEFAULT_TYPE;
}

async function canvasToBlob(canvas, type, quality) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob) {
        const error = new Error("Could not export the selected face crop.");
        error.code = "FACE_CROP_EXPORT_FAILED";
        throw error;
    }
    return blob;
}

export async function extractFaceCrop(fullImageBlob, detectedFace, options = {}, { decodeImage, clamp }) {
    if (!fullImageBlob && !options.decodedImage) {
        const error = new Error("A source image is required before cropping a face.");
        error.code = "MISSING_SOURCE_IMAGE";
        throw error;
    }

    const decodedImage = options.decodedImage || await decodeImage(fullImageBlob);
    const source = decodedImage.source || decodedImage;
    const natural = {
        width:  decodedImage.width  || source.naturalWidth  || source.width,
        height: decodedImage.height || source.naturalHeight || source.height,
    };
    const crop   = getFaceCropBounds(detectedFace, natural, { clamp });
    const canvas = document.createElement("canvas");
    canvas.width  = crop.width;
    canvas.height = crop.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        const error = new Error("Canvas is unavailable for face crop extraction.");
        error.code = "FACE_CROP_UNAVAILABLE";
        throw error;
    }

    ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);

    const type = options.type || getFaceCropMimeType(fullImageBlob);
    const blob = await canvasToBlob(canvas, type, options.quality ?? FACE_CROP_QUALITY);

    return { blob, bounds: crop, width: crop.width, height: crop.height, type: blob.type || type };
}

// ── Face selection ───────────────────────────

export function setSelectedFaceIds(faceIds) {
    const knownFaceIds = new Set(state.faces.map((face) => face.id));
    state.selectedFaceIds = faceIds.filter((faceId, index) => (
        faceId && knownFaceIds.has(faceId) && faceIds.indexOf(faceId) === index
    ));
    state.selectedFaceId = state.selectedFaceIds[0] || null;
}

export function selectSingleFace(faceId) {
    setSelectedFaceIds(faceId ? [faceId] : []);
}

export function getSelectedFaces() {
    return state.selectedFaceIds
        .map((faceId) => state.faces.find((face) => face.id === faceId))
        .filter(Boolean);
}

export function getSelectableFaceLimit({ getTemplateFaceCapacity }) {
    return Math.max(1, Math.min(getTemplateFaceCapacity(), state.faces.length || 1));
}

export function toggleDetectedFaceSelection(faceId, { getTemplateFaceCapacity, getSelectableFaceLimit }) {
    const faceCapacity = getTemplateFaceCapacity();

    if (faceCapacity <= 1) {
        selectSingleFace(faceId);
        return;
    }

    if (state.selectedFaceIds.includes(faceId)) {
        setSelectedFaceIds(state.selectedFaceIds.filter((id) => id !== faceId));
        return;
    }

    const nextFaceIds = [...state.selectedFaceIds, faceId];
    if (nextFaceIds.length > getSelectableFaceLimit()) nextFaceIds.shift();
    setSelectedFaceIds(nextFaceIds);
}

// ── Detection ────────────────────────────────

export async function detectFacesForBitmap(imageBitmap, faceLimit, { adapter }) {
    await adapter.init();
    state.detectorAvailable = adapter.isAvailable();
    if (!state.detectorAvailable) return [];
    return withTimeout(adapter.detect(imageBitmap, { faceLimit }), DETECTION_TIMEOUT_MS);
}

export async function detectFaces(file, deps) {
    const {
        adapter, decodeImage, clamp, normalizeBox,
        clearFaceFitState, enterManualMode,
        setStatus, setError, setDetectionRecoveryError,
        getRenderedSize, getTemplateFaceCapacity,
        selectSingleFace: selectSingle,
    } = deps;

    state.sequence += 1;
    const mySequence = state.sequence;
    state.file             = file;
    state.view             = "fit";
    state.uploadModalOpen  = false;
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
        const faceLimit = getTemplateFaceCapacity();
        const faces = await detectFacesForBitmap(imageBitmap, faceLimit, { adapter });
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
        setDetectionRecoveryError(state.detectorAvailable ? "NO_FACE_DETECTED" : "DETECTOR_UNAVAILABLE");
        enterManualMode();
        setStatus(STATES.READY);
        return;
        }

        state.faces = normalizedFaces;
        state.error = null;

        if (normalizedFaces.length === 1) {
        state.manualMode = false;
        selectSingle(normalizedFaces[0].id);
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