import { dom } from "./lib/dom.js";
import { loadTemplates, requestFaceSwap } from "./lib/api.js";
import {
  clearCameraStream,
  clearCameraReview,
  clearFaceFitState,
  decodeImage,
  getManualCircleBox,
  buildManualFaceBoxNatural,
  updateManualFaceSelection,
  applyManualTransform,
  alignManualViewToFace,
  enterManualMode,
  startManualFitFromSelection,
  startCameraCapture,
  snapCameraPhoto,
  useReviewedPhoto,
  flipCamera,
  goBackToUploadChoices,
  startManualDrag,
  moveManualDrag,
  configureUpload,
} from "./lib/upload.js";
import adapter from "./lib/faceDetect.js";

import {
  STATES,
  ALLOWED_TYPES,
  DETECTION_FAILURE_MESSAGES,
  DEFAULT_MEME_TEXT,
  DEFAULT_MEME_FONT_KEY,
  DEFAULT_MEME_FONT_SIZE_MODE,
  DEFAULT_MEME_TEXT_COLOR,
  DEFAULT_MEME_OUTLINE_ENABLED,
  DEFAULT_MEME_OUTLINE_COLOR,
  ROTATE_STEP,
  FACE_BOX_TAP_TARGET,
  FACE_CROP_DEFAULT_TYPE,
  FACE_CROP_QUALITY,
} from "./lib/constants.js";
import { state } from "./lib/state.js";

import * as Editor from "./lib/editor.js";
import * as TextOverlay from "./lib/textOverlay.js";
import * as Templates from "./lib/templates.js";
import * as Faces from "./lib/faces.js";

function setStatus(next) {
  state.status = next;
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getRenderedSize() {
  const rect = dom.previewImage.getBoundingClientRect();
  return { width: rect.width || 320, height: rect.height || 320 };
}

function getFaceCropBounds(detectedFace, natural) {
  return Faces.getFaceCropBounds(detectedFace, natural, { clamp });
}

function getFaceCropMimeType(file) {
  return Faces.getFaceCropMimeType(file);
}

async function extractFaceCrop(fullImageBlob, detectedFace, options = {}) {
  return Faces.extractFaceCrop(fullImageBlob, detectedFace, options, { decodeImage, clamp });
}

function getTemplatePreviewImage(template) {
  return Templates.getTemplatePreviewImage(template);
}

function getTemplateMainImage(template) {
  return Templates.getTemplateMainImage(template);
}

function getTemplateImageDimensions(template) {
  return Templates.getTemplateImageDimensions(template);
}

function getTemplateImageSources(primarySource, fallbacks = []) {
  return Templates.getTemplateImageSources(primarySource, fallbacks);
}

function updateImageWithFallback(image, sources) {
  return Templates.updateImageWithFallback(image, sources);
}

function getStudioTemplateBox(template) {
  return Templates.getStudioTemplateBox(template);
}

function getSelectedTemplate() {
  return Templates.getSelectedTemplate();
}

function getTemplateFaceCapacity() {
  return Templates.getTemplateFaceCapacity();
}

function extractGeneratedImageUrl(payload) {
  return Templates.extractGeneratedImageUrl(payload);
}

function getRecentTemplateIds() {
  return Templates.getRecentTemplateIds();
}

function recordTemplateUsage(templateId) {
  return Templates.recordTemplateUsage(templateId);
}

function getVisibleTemplates() {
  return Templates.getVisibleTemplates();
}

async function loadTemplateCatalog() {
  return Templates.loadTemplateCatalog({ loadTemplates });
}

function renderTemplates() {
  return Templates.renderTemplates({ dom, clamp, openStudioForTemplate });
}

function renderStudioTemplate(template) {
  return Templates.renderStudioTemplate(template, { dom, state });
}

async function showTemplateSelection() {
  return Templates.showTemplateSelection({
    loadTemplates,
    dom,
    render,
    renderTemplates: () => Templates.renderTemplates({ dom, clamp, openStudioForTemplate }),
  });
}

function openStudioForTemplate(templateId) {
  const result = Templates.openStudioForTemplate(templateId, {
    recordTemplateUsage,
    initializeEditorState,
    restoreEditorSession,
    persistEditorHistory: Editor.persistEditorHistory,
    render,
    STATES,
  });

  if (state.view === "studio" && !state.editor.overlayVisible && !state.editor.frozenTextItems.length) {
    state.editor.overlayVisible = true;
    state.isTextSelected = false;
  }

  return result;
}

function getMemeFontFamily(fontKey = DEFAULT_MEME_FONT_KEY) {
  return TextOverlay.getMemeFontFamily(fontKey);
}

function getMemeTextColor(colorKey = DEFAULT_MEME_TEXT_COLOR) {
  return TextOverlay.getMemeTextColor(colorKey);
}

function getEditableTextValue(node) {
  return TextOverlay.getEditableTextValue(node);
}

function applyMemeOutline(preview) {
  return TextOverlay.applyMemeOutline(preview);
}

function syncOutlineSwatchState() {
  return TextOverlay.syncOutlineSwatchState({ dom });
}

function fitMemeTextToCanvas() {
  return TextOverlay.fitMemeTextToCanvas({ dom });
}

function positionTextHandles() {
  return TextOverlay.positionTextHandles({ dom, clamp });
}

function syncMemeTextAppearance() {
  return TextOverlay.syncMemeTextAppearance({ dom, clamp });
}

function freezeCurrentTextItem() {
  return TextOverlay.freezeCurrentTextItem();
}

function renderFrozenTextItems() {
  return TextOverlay.renderFrozenTextItems({ dom, clamp });
}

function selectFrozenTextItem(index) {
  return TextOverlay.selectFrozenTextItem(index, { recordEditorSnapshot, render });
}

function createOrSelectTextAtPointer(event) {
  return TextOverlay.createOrSelectTextAtPointer(event, {
    dom,
    clamp,
    recordEditorSnapshot,
    beginInlineTextEdit,
  });
}

function updateEditorTextSetting(key, value) {
  return TextOverlay.updateEditorTextSetting(key, value, { recordEditorSnapshot, render });
}

function beginInlineTextEdit(event) {
  return TextOverlay.beginInlineTextEdit(event, { dom, render });
}

function selectTextObject(event) {
  return TextOverlay.selectTextObject(event, { render });
}

function finishInlineTextEdit() {
  return TextOverlay.finishInlineTextEdit({ dom, recordEditorSnapshot, render });
}

function deleteMemeText() {
  return TextOverlay.deleteMemeText({ recordEditorSnapshot, render });
}

function startTextDrag(event) {
  return TextOverlay.startTextDrag(event, { dom });
}

function moveTextDrag(event) {
  return TextOverlay.moveTextDrag(event, { dom, clamp, render });
}

function endTextDrag(event) {
  return TextOverlay.endTextDrag(event, { recordEditorSnapshot });
}

function startTextResize(event) {
  return TextOverlay.startTextResize(event);
}

function moveTextResize(event) {
  return TextOverlay.moveTextResize(event, { dom, clamp, render });
}

function endTextResize(event) {
  return TextOverlay.endTextResize(event, { recordEditorSnapshot });
}

function rotateTextOneStep(event) {
  return TextOverlay.rotateTextOneStep(event, { recordEditorSnapshot, render });
}

function setSelectedFaceIds(faceIds) {
  return Faces.setSelectedFaceIds(faceIds);
}

function selectSingleFace(faceId) {
  return Faces.selectSingleFace(faceId);
}

function getSelectedFaces() {
  return Faces.getSelectedFaces();
}

function getSelectableFaceLimit() {
  return Faces.getSelectableFaceLimit({ getTemplateFaceCapacity });
}

function toggleDetectedFaceSelection(faceId) {
  return Faces.toggleDetectedFaceSelection(faceId, {
    getTemplateFaceCapacity,
    getSelectableFaceLimit,
  });
}

async function detectFacesForBitmap(imageBitmap, faceLimit = 1) {
  return Faces.detectFacesForBitmap(imageBitmap, faceLimit, { adapter });
}

async function detectFaces(file) {
  return Faces.detectFaces(file, {
    adapter,
    decodeImage,
    clamp,
    normalizeBox,
    clearFaceFitState,
    enterManualMode,
    setStatus,
    setError,
    setDetectionRecoveryError,
    getRenderedSize,
    getTemplateFaceCapacity,
    selectSingleFace,
  });
}

function initializeEditorState() {
  return Editor.initializeEditorState({ getTemplateMainImage, getSelectedTemplate });
}

function recordEditorSnapshot() {
  return Editor.recordEditorSnapshot({ getTemplateMainImage, getSelectedTemplate });
}

function restoreEditorSession() {
  return Editor.restoreEditorSession({ getTemplateMainImage });
}

function undoEditorSnapshot() {
  return Editor.undoEditorSnapshot({ getTemplateMainImage, render });
}

function redoEditorSnapshot() {
  return Editor.redoEditorSnapshot({ getTemplateMainImage, render });
}

function resetEditorToTemplate() {
  return Editor.resetEditorToTemplate({ getTemplateMainImage, getSelectedTemplate, render });
}

function hasUnsavedStudioEdits() {
  return Editor.hasUnsavedStudioEdits();
}

function confirmBackAndResetStudio() {
  return Editor.confirmBackAndResetStudio({
    getTemplateMainImage,
    getSelectedTemplate,
    render,
    renderTemplates,
  });
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
  const noTextSelection = !showingStudio || !state.editor.overlayVisible || !state.isTextSelected;
  const transformDisabled = noTextSelection || state.isTextLocked;
  dom.memeTextDelete.disabled = noTextSelection;
  dom.memeTextRotateHandle.disabled = transformDisabled;
  dom.memeTextResizeHandles?.forEach((handle) => {
    handle.classList.toggle("hidden", transformDisabled);
    handle.disabled = transformDisabled;
  });
  dom.textToolbar.classList.toggle("hidden", !showingStudio);
  dom.textLocalControls.classList.toggle("hidden", !showingStudio || !state.editor.overlayVisible || !state.isTextSelected);
  const showTextPopups = showingStudio && state.editor.overlayVisible && state.isTextSelected;
  dom.textMoreMenu.classList.toggle("hidden", !showTextPopups || !state.showTextMore);
  if (dom.textBorderToggleCta) {
    const outlineOn = !!state.editor.overlayOutlineEnabled;
    dom.textBorderToggleCta.textContent = `border: ${outlineOn ? "on" : "off"}`;
    dom.textBorderToggleCta.classList.toggle("active", outlineOn);
    dom.textBorderToggleCta.disabled = noTextSelection;
    dom.textBorderToggleCta.setAttribute("aria-pressed", String(outlineOn));
  }
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
  let payload;

  try {
    const cropType = getFaceCropMimeType(state.file);
    const faceCrop = await extractFaceCrop(state.file, selectedFace, {
      decodedImage: state.imageBitmap,
      type: cropType,
    });

    payload = await requestFaceSwap({
      file: state.file,
      faceCrop,
      templateId: state.selectedTemplateId,
      selectedFaces,
      memeText: state.editor.overlayText || "",
      textStyle: {
        fontKey: state.editor.overlayFontKey,
        fontPx: state.editor.overlayFontPx,
        textColor: state.editor.overlayTextColor,
        outlineEnabled: state.editor.overlayOutlineEnabled,
        outlineColor: state.editor.overlayOutlineColor,
      },
      signal: state.faceSwapAbortController.signal,
    });
  } finally {
    stopFaceSwapLoadingState();
  }

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



dom.cameraCta.addEventListener("click", () => {
  startCameraCapture();
});
dom.titleStartCta?.addEventListener("click", async () => {
  await showTemplateSelection();
});
dom.backBtn.addEventListener("click", goBackToUploadChoices);
configureUpload({
  dom,
  state,
  render,
  renderOverlay,
  getSelectedFaces,
  selectSingleFace,
  setStatus,
  detectFaces,
  getRenderedSize,
  hasUnsavedStudioEdits,
  renderTemplates,
  clamp,
  normalizeBox,
  STATES,
});
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
  startTextDrag(event);
});
dom.memeTextPreview.addEventListener("pointermove", moveTextDrag);
dom.memeTextPreview.addEventListener("pointerup", endTextDrag);
dom.memeTextPreview.addEventListener("pointercancel", endTextDrag);
dom.memeTextPreview.addEventListener("input", () => {
  state.editor.overlayText = getEditableTextValue(dom.memeTextPreview);
  state.editor.overlayVisible = true;
  state.showResetConfirmation = false;

  syncMemeTextAppearance();

  // DO NOT render() while actively editing
});
dom.memeTextPreview.addEventListener("blur", finishInlineTextEdit);
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
dom.textBorderToggleCta?.addEventListener("click", () => {
  updateEditorTextSetting("overlayOutlineEnabled", !state.editor.overlayOutlineEnabled);
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
dom.memeTextResizeHandles?.forEach((handle) => {
  handle.addEventListener("pointerdown", startTextResize);
  handle.addEventListener("pointermove", moveTextResize);
  handle.addEventListener("pointerup", endTextResize);
  handle.addEventListener("pointercancel", endTextResize);
});
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

document.addEventListener("keydown", (event) => {
  if (event.key !== "Backspace") return;
  if (!state.editor.overlayVisible || !state.isTextSelected || state.isEditingMemeText) return;
  const target = event.target;
  if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
  event.preventDefault();
  deleteMemeText();
});

document.addEventListener("pointerdown", (event) => {
  const clickedInsideEditor =
    event.target.closest(
      "#meme-text-preview, .frozen-text-item, .text-toolbar, .text-local-controls, .text-menu, .meme-text-resize-handle"
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