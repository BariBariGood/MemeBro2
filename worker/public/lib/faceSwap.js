/**
 * @module faceSwap
 * Face swap submission and loading state.
 * Orchestrates the face-swap API call, manages the abort controller
 * for cancellation, and toggles the slow-request UX message.
 */

import { state } from "./state.js";

/**
 * Converts a data-URL to a blob URL for reliable browser rendering.
 * Large base64 data URLs (>1 MB) can cause rendering corruption in some
 * browsers; blob URLs delegate storage to the browser's blob subsystem
 * and avoid the overhead of keeping a multi-megabyte string in the DOM.
 * Non-data-URL inputs are returned as-is.
 */
async function toBlobUrl(url) {
    if (!url || !url.startsWith("data:")) return url;
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        return URL.createObjectURL(blob);
    } catch (err) {
        console.error("[faceSwap] toBlobUrl conversion failed, using data URL:", err);
        return url;
    }
}

export function startFaceSwapLoadingState({ render }) {
    state.isSubmittingFaceSwap   = true;
    state.showSlowFaceSwapMessage = false;
    if (state.faceSwapSlowTimer) clearTimeout(state.faceSwapSlowTimer);
    state.faceSwapSlowTimer = setTimeout(() => {
        state.showSlowFaceSwapMessage = true;
        render();
    }, 5000);
    render();
}

export function stopFaceSwapLoadingState({ render }) {
    state.isSubmittingFaceSwap    = false;
    state.showSlowFaceSwapMessage = false;
    state.faceSwapAbortController = null;
    if (state.faceSwapSlowTimer) clearTimeout(state.faceSwapSlowTimer);
    state.faceSwapSlowTimer = null;
    render();
}

export async function submitSelectedFace({
    state: _state,
    getSelectedFaces,
    getSelectedTemplate,
    getFaceCropMimeType,
    extractFaceCrop,
    extractGeneratedImageUrl,
    requestFaceSwap,
    recordEditorSnapshot,
    startFaceSwapLoading,
    stopFaceSwapLoading,
    render,
    STATES,
    }) {
    if (_state.status !== STATES.READY) return;
    const selectedFaces  = getSelectedFaces();
    const selectedFace   = selectedFaces[0];
    if (!selectedFace) return;

    _state.faceSwapAbortController = new AbortController();
    startFaceSwapLoading();
    let payload;

    try {
        const cropType = getFaceCropMimeType(_state.file);
        const faceCrop = await extractFaceCrop(_state.file, selectedFace, {
        decodedImage: _state.imageBitmap,
        type: cropType,
        });

        payload = await requestFaceSwap({
        file:       _state.file,
        faceCrop,
        templateId: _state.selectedTemplateId,
        selectedFaces,
        memeText:   _state.editor.overlayText || "",
        textStyle: {
            fontKey:        _state.editor.overlayFontKey,
            fontPx:         _state.editor.overlayFontPx,
            textColor:      _state.editor.overlayTextColor,
            outlineEnabled: _state.editor.overlayOutlineEnabled,
            outlineColor:   _state.editor.overlayOutlineColor,
        },
        signal: _state.faceSwapAbortController.signal,
        });
    } finally {
        stopFaceSwapLoading();
    }

    const generatedImage = extractGeneratedImageUrl(payload);
    if (!generatedImage) {
        const error = new Error("Face swap completed, but no composited image URL was returned.");
        error.code = "MISSING_GENERATED_IMAGE";
        throw error;
    }

    const finalUrl = await toBlobUrl(generatedImage);
    _state.editor.generatedImage = finalUrl;
    _state.showResetConfirmation  = false;

    if (_state.previewUrl) {
        URL.revokeObjectURL(_state.previewUrl);
        _state.previewUrl = "";
    }
    _state.view   = "studio";
    _state.status = STATES.IDLE;

    recordEditorSnapshot();
    render();
    return payload;
}