/**
 * @module faceSwap
 * Face swap submission and loading state.
 * Orchestrates the face-swap API call, manages the abort controller
 * for cancellation, and toggles the slow-request UX message.
 */

import { state } from "./state.js";

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

    const generatedImageDataUrl = extractGeneratedImageUrl(payload);
    if (!generatedImageDataUrl) {
        const error = new Error("Face swap completed, but no composited image URL was returned.");
        error.code = "MISSING_GENERATED_IMAGE";
        throw error;
    }

    // Large base64 data URLs (1–5 MB) can cause garbled rendering when set
    // directly as an <img> src.  Convert to a Blob URL for reliable display.
    let displayUrl = generatedImageDataUrl;
    if (generatedImageDataUrl.startsWith("data:")) {
        try {
            const blob = await fetch(generatedImageDataUrl).then((r) => r.blob());
            displayUrl = URL.createObjectURL(blob);
        } catch { /* keep the data URL as fallback */ }
    }

    // Pre-decode so the image is ready before we hand it to the renderer.
    try {
        const img = new Image();
        img.src = displayUrl;
        await img.decode();
    } catch { /* non-critical — the browser will decode on paint */ }

    _state.editor.generatedImage = displayUrl;
    _state.editor._generatedImageDataUrl = generatedImageDataUrl;
    _state.showResetConfirmation  = false;

    // Transition to the studio view so the composited meme is displayed
    // instead of staying stuck on the face-overlay screen.
    if (_state.previewUrl) URL.revokeObjectURL(_state.previewUrl);
    _state.previewUrl  = "";
    _state.status      = STATES.IDLE;
    _state.imageBitmap = null;
    _state.view        = "studio";

    recordEditorSnapshot();
    render();
    return payload;
}