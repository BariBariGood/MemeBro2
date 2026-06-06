/**
 * @module faceSwap
 * Face swap submission and loading state.
 * Orchestrates the face-swap API call, manages the abort controller
 * for cancellation, and toggles the slow-request UX message.
 */

import { state } from "./state.js";
import { compressForUpload } from "./compressImage.js";

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

        // Compress the face crop before uploading (resize to max 1024px,
        // re-encode JPEG q0.85, strip metadata). Show "Optimizing..." if
        // compression takes longer than 500ms.
        let optimizingTimer = null;
        optimizingTimer = setTimeout(() => {
            state.isOptimizingImage = true;
            render();
        }, 500);

        const compressedBlob = await compressForUpload(faceCrop.blob);
        clearTimeout(optimizingTimer);
        state.isOptimizingImage = false;

        const compressedFaceCrop = {
            ...faceCrop,
            blob: compressedBlob,
            type: compressedBlob.type || "image/jpeg",
        };

        payload = await requestFaceSwap({
        file:       _state.file,
        faceCrop:   compressedFaceCrop,
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
        state.isOptimizingImage = false;
        stopFaceSwapLoading();
    }

    const generatedImage = extractGeneratedImageUrl(payload);
    if (!generatedImage) {
        const error = new Error("Face swap completed, but no composited image URL was returned.");
        error.code = "MISSING_GENERATED_IMAGE";
        throw error;
    }

    _state.editor.generatedImage = generatedImage;
    _state.showResetConfirmation  = false;
    recordEditorSnapshot();
    render();
    return payload;
}