// ─────────────────────────────────────────────
// Main render function, overlay renderer,
// and AI prompt history renderer.
// ─────────────────────────────────────────────

import { STATES } from "./constants.js";

const ACUTE_LOAD_ERROR_MESSAGES = {
    FEATURE_DISABLED: "AI generation is temporarily unavailable. You can retry in a few minutes.",
    QUEUE_FULL: "MemeBro is under heavy load. Retry shortly.",
    RATE_LIMITED: "The AI service is rate-limiting requests. Retry in a moment.",
};

const RETRYABLE_LOAD_ERROR_CODES = new Set(Object.keys(ACUTE_LOAD_ERROR_MESSAGES));

// ── AI Prompt history ─────────────────────────

export function renderAiPromptHistory({ dom, state }) {
    if (!dom.aiPromptHistory) return;
    const messages = state.aiPromptHistory.length
        ? state.aiPromptHistory
        : [{ role: "system", text: "Tell me what to change — caption, mood, style, or face-swap direction." }];
    dom.aiPromptHistory.innerHTML = "";
    messages.forEach((message) => {
        const node = document.createElement("article");
        node.className = `ai-prompt-message ai-prompt-message--${message.role}`;
        node.textContent = message.text;
        dom.aiPromptHistory.appendChild(node);
    });
    dom.aiPromptHistory.scrollTop = dom.aiPromptHistory.scrollHeight;
}

// ── Face overlay ──────────────────────────────

export function renderOverlay({
    dom, state,
    normalizeBox, clamp,
    FACE_BOX_TAP_TARGET,
    toggleDetectedFaceSelection,
    getRenderedSize,
    render,
    }) {
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

        const hitWidth  = Math.max(boxRendered.width,  FACE_BOX_TAP_TARGET);
        const hitHeight = Math.max(boxRendered.height, FACE_BOX_TAP_TARGET);
        const hitLeft   = clamp(boxRendered.x - (hitWidth  - boxRendered.width)  / 2, 0, Math.max(0, rendered.width  - hitWidth));
        const hitTop    = clamp(boxRendered.y - (hitHeight - boxRendered.height) / 2, 0, Math.max(0, rendered.height - hitHeight));

        const isSelected            = state.selectedFaceIds.includes(face.id);
        const canSelectDetectedFaces = [STATES.FACES_FOUND, STATES.READY].includes(state.status);

        const button = document.createElement("button");
        button.type      = "button";
        button.className = `face-box ${isSelected ? "selected" : ""}`;
        button.style.left   = `${hitLeft}px`;
        button.style.top    = `${hitTop}px`;
        button.style.width  = `${hitWidth}px`;
        button.style.height = `${hitHeight}px`;
        button.style.setProperty("--face-ring-left",   `${boxRendered.x - hitLeft}px`);
        button.style.setProperty("--face-ring-top",    `${boxRendered.y - hitTop}px`);
        button.style.setProperty("--face-ring-width",  `${boxRendered.width}px`);
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

// ── Main render ───────────────────────────────

export function render(ctx) {
    const {
        dom, state,
        getSelectedTemplate, getSelectedFaces, getSelectableFaceLimit,
        renderStudioTemplate, renderFrozenTextItems, syncMemeTextAppearance,
        applyManualTransform, renderOverlay: _renderOverlay, renderAiPromptHistory: _renderAiPromptHistory,
        syncOutlineSwatchState, getMemeTextColor,
    } = ctx;

    const cameraActive          = Boolean(state.cameraStream);
    const reviewingCameraPhoto  = Boolean(state.cameraReviewUrl);
    const editingPhoto          = Boolean(state.previewUrl) && [STATES.FACES_FOUND, STATES.READY].includes(state.status);
    const showingHome           = state.view === "home";
    const showingTemplates      = state.view === "templates";
    const showingStudio         = state.view === "studio";
    const aiPromptPanelOpen     = state.aiPrompt?.panelState === "open" || state.isAiPromptPanelOpen;
    const aiPromptBusy          = state.aiPrompt?.requestState === "submitting";
    const aiPromptErrorCode     = state.aiPrompt?.error?.code || "";
    const aiPromptHasLoadState  = aiPromptBusy || Boolean(aiPromptErrorCode);
    const selectedTemplate      = getSelectedTemplate();
    const selectedFaceCount     = getSelectedFaces().length;
    const selectableFaceLimit   = getSelectableFaceLimit();

    // ── Page-level classes ──
    dom.uploadPage.classList.toggle("home-mode",   showingHome);
    dom.uploadPage.classList.toggle("camera-mode", cameraActive || reviewingCameraPhoto);

    // ── Show/hide sections ──
    dom.titleScreen?.classList.toggle("hidden", !showingHome);
    dom.topbar?.classList.toggle("hidden", showingHome);
    dom.backBtn?.classList.toggle("hidden", showingHome);
    dom.saveCta?.classList.toggle("hidden", !showingStudio);
    dom.cameraShell.classList.toggle("hidden", !cameraActive);
    dom.reviewShell.classList.toggle("hidden", !reviewingCameraPhoto);
    dom.templateScreen.classList.toggle("hidden", !showingTemplates);
    dom.studioScreen.classList.toggle("hidden", !showingStudio);
    dom.uploadModal.classList.toggle("hidden", !state.uploadModalOpen);
    dom.aiPromptPanel?.classList.toggle("hidden", !showingStudio || !aiPromptPanelOpen);
    dom.vibePanel?.classList.toggle("hidden", showingStudio && aiPromptPanelOpen);
    dom.vibeContainer?.classList.toggle("hidden", showingStudio && aiPromptPanelOpen);
    dom.resetConfirmation.classList.toggle("hidden", !showingStudio || !state.showResetConfirmation);
    dom.backConfirmation.classList.toggle("hidden",  !showingStudio || !state.showBackConfirmation);
    dom.overlayShell.classList.toggle("hidden", !editingPhoto || showingTemplates || showingStudio);

    // ── Upload / camera CTAs ──
    dom.cameraCancelCta.classList.toggle("hidden", !cameraActive);
    dom.ctaRow.classList.toggle("hidden", !state.uploadModalOpen || cameraActive || reviewingCameraPhoto || editingPhoto);
    dom.cameraCta.classList.toggle("hidden", cameraActive || reviewingCameraPhoto || editingPhoto);
    dom.libraryCta.classList.toggle("hidden", cameraActive || reviewingCameraPhoto || editingPhoto);
    dom.manualFitCta.classList.toggle("hidden",
        !editingPhoto || showingTemplates || showingStudio || state.manualMode || !state.imageBitmap
    );

    // ── Overlay shell state ──
    dom.overlayShell.classList.toggle("manual-active", state.manualMode);
    dom.overlayShell.classList.toggle("dragging", state.dragPointerId !== null);

    // ── Studio ──
    dom.selectedTemplateLabel.textContent = selectedTemplate ? `Template: ${selectedTemplate.name}` : "";
    if (showingStudio && selectedTemplate) renderStudioTemplate(selectedTemplate);

    // ── Meme text ──
    if (!state.isEditingMemeText) dom.memeTextPreview.textContent = state.editor.overlayText;
    dom.studioTemplateArt.classList.toggle("editing-text",  state.isEditingMemeText);
    dom.studioTemplateArt.classList.toggle("text-selected", state.isTextSelected);
    dom.memeTextPreview.setAttribute("contenteditable", state.isEditingMemeText ? "true" : "false");
    dom.memeTextPreview.classList.toggle("hidden", !state.editor.overlayVisible);
    dom.memeTextHint?.classList.toggle("hidden",
        showingStudio && (state.editor.overlayVisible || state.editor.frozenTextItems.length > 0)
    );

    // ── Text controls enabled state ──
    const noTextSelection  = !showingStudio || !state.editor.overlayVisible || !state.isTextSelected;
    const transformDisabled = noTextSelection || state.isTextLocked;
    dom.memeTextDelete.disabled     = noTextSelection;
    dom.memeTextRotateHandle.disabled = transformDisabled;
    dom.memeTextResizeHandles?.forEach((handle) => {
        handle.classList.toggle("hidden", transformDisabled);
        handle.disabled = transformDisabled;
    });

    dom.textToolbar.classList.toggle("hidden", !showingStudio);
    dom.textLocalControls.classList.toggle("hidden",
        !showingStudio || !state.editor.overlayVisible || !state.isTextSelected
    );

    const showTextPopups = showingStudio && state.editor.overlayVisible && state.isTextSelected;
    dom.textMoreMenu.classList.toggle("hidden", !showTextPopups || !state.showTextMore);

    // ── Border toggle ──
    if (dom.textBorderToggleCta) {
        const outlineOn = !!state.editor.overlayOutlineEnabled;
        dom.textBorderToggleCta.textContent = `border: ${outlineOn ? "on" : "off"}`;
        dom.textBorderToggleCta.classList.toggle("active", outlineOn);
        dom.textBorderToggleCta.disabled = noTextSelection;
        dom.textBorderToggleCta.setAttribute("aria-pressed", String(outlineOn));
    }

    // ── Toolbar values ──
    dom.textLockCta.textContent      = state.isTextLocked ? "🔒" : "🔓";
    dom.memeFontSelect.value         = state.editor.overlayFontKey;
    dom.memeFontSizeInput.value      = String(Math.round(state.editor.overlayFontPx || 22));
    dom.memeTextColorInput.value     = getMemeTextColor(state.editor.overlayTextColor);
    dom.memeOutlineColorInput.value  = state.editor.overlayOutlineColor || "#ffffff";
    syncOutlineSwatchState();
    dom.textStyleBoldCta.classList.toggle("active",      state.editor.overlayBold);
    dom.textStyleItalicCta.classList.toggle("active",    state.editor.overlayItalic);
    dom.textStyleUnderlineCta.classList.toggle("active", state.editor.overlayUnderline);

    // ── Face swap loader ──
    dom.faceSwapLoader.classList.toggle("hidden",      !state.isSubmittingFaceSwap);
    dom.faceSwapLoaderDelay.classList.toggle("hidden", !state.showSlowFaceSwapMessage);

    // ── AI prompt load mode ──
    dom.aiPromptLoadMode?.classList.toggle("hidden", !aiPromptHasLoadState);
    dom.aiPromptRetryCta?.classList.toggle("hidden", aiPromptBusy || !aiPromptErrorCode);
    if (dom.aiPromptLoadMessage) {
        dom.aiPromptLoadMessage.textContent = aiPromptBusy
        ? "Generating your meme variant…"
        : state.aiPrompt?.error?.message || ACUTE_LOAD_ERROR_MESSAGES[aiPromptErrorCode] || "Something went sideways. Retry when you are ready.";
    }

    // ── History buttons ──
    dom.undoCta.disabled  = state.editor.historyStack.length <= 1;
    dom.redoCta.disabled  = state.editor.futureStack.length === 0;
    dom.resetCta.disabled = !selectedTemplate;

    // ── Progress ──
    dom.progressWrap.classList.toggle("hidden",
        !(state.status === STATES.LOADING_IMAGE || state.status === STATES.DETECTING)
    );
    if (state.status === STATES.LOADING_IMAGE) { dom.progressBar.value = 40;  dom.progressLabel.textContent = "Loading image..."; }
    if (state.status === STATES.DETECTING)     { dom.progressBar.value = 80;  dom.progressLabel.textContent = "Detecting faces..."; }

    // ── Error ──
    const errorCode = state.error?.code || "";
    const errorMessage = ACUTE_LOAD_ERROR_MESSAGES[errorCode] || state.error?.message || "";
    dom.errorState.classList.toggle("hidden", !state.error && state.status !== STATES.ERROR);
    dom.errorMessage.textContent = errorMessage;
    dom.errorRetryCta?.classList.toggle("hidden", !RETRYABLE_LOAD_ERROR_CODES.has(errorCode));

    // ── Preview image ──
    if (state.previewUrl) dom.previewImage.src = state.previewUrl;

    // ── Status text ──
    if (state.status === STATES.FACES_FOUND) {
        dom.statusText.textContent = selectableFaceLimit > 1
        ? `${state.faces.length} faces found. Select up to ${selectableFaceLimit} faces for this template.`
        : `${state.faces.length} faces found. Tap or click one face to continue.`;
    } else if (state.status === STATES.READY) {
        if      (state.manualMode && state.error?.code === "NO_FACE_DETECTED")    dom.statusText.textContent = "No face detected. Use the oval to choose the face manually.";
        else if (state.manualMode && state.error?.code === "DETECTOR_UNAVAILABLE") dom.statusText.textContent = "Face detection could not load. Use the oval to choose the face manually.";
        else if (state.manualMode && state.error)                                  dom.statusText.textContent = "Face detection had trouble. Use the oval to choose the face manually.";
        else if (state.manualMode && state.usedDetectedFace)                       dom.statusText.textContent = "Face detected. Drag to fine tune the fit inside the oval.";
        else if (state.manualMode)                                                 dom.statusText.textContent = "Drag the photo until the face sits inside the oval.";
        else if (selectableFaceLimit > 1 && selectedFaceCount === 0)               dom.statusText.textContent = "Select a face to continue.";
        else if (selectableFaceLimit > 1 && selectedFaceCount > 1)                 dom.statusText.textContent = `${selectedFaceCount} faces selected and ready.`;
        else if (selectableFaceLimit > 1)                                          dom.statusText.textContent = `${selectedFaceCount || 1} face selected. Select another face or continue.`;
        else                                                                       dom.statusText.textContent = "Face selected and ready.";
    } else {
        dom.statusText.textContent = "";
    }

    // ── Continue / manual controls ──
    dom.continueBtn.disabled = state.status !== STATES.READY || (!state.manualMode && selectedFaceCount === 0);
    dom.continueBtn.classList.toggle("hidden", !editingPhoto || showingTemplates);
    dom.manualOverlay.classList.toggle("hidden",  !state.manualMode);
    dom.manualControls.classList.toggle("hidden", !state.manualMode);

    // ── Sub-renders ──
    applyManualTransform();
    _renderOverlay();
    renderFrozenTextItems();
    syncMemeTextAppearance();
    _renderAiPromptHistory();
}
