// ─────────────────────────────────────────────
// app.js — entry point
// Imports all modules and wires everything up.
// ─────────────────────────────────────────────

import { dom }                      from "./lib/dom.js";
import { loadTemplates, requestFaceSwap } from "./lib/api.js";
import {
  clearCameraStream, clearCameraReview, clearFaceFitState,
  decodeImage, applyManualTransform,
  enterManualMode, startManualFitFromSelection,
  startCameraCapture, snapCameraPhoto, useReviewedPhoto,
  flipCamera, goBackToUploadChoices,
  startManualDrag, moveManualDrag, configureUpload,
} from "./lib/upload.js";
import adapter from "./lib/faceDetect.js";

import {
  STATES, ALLOWED_TYPES, DETECTION_FAILURE_MESSAGES,
  DEFAULT_MEME_FONT_KEY, DEFAULT_MEME_TEXT_COLOR,
  FACE_BOX_TAP_TARGET,
} from "./lib/constants.js";
import { state } from "./lib/state.js";

import * as Editor      from "./lib/editor.js";
import * as TextOverlay from "./lib/textOverlay.js";
import { recentMemeStorage } from "./js/recents.js";
import { saveCurrentMeme } from "./js/save.js";
import * as Templates   from "./lib/templates.js";
import * as Faces       from "./lib/faces.js";
import * as FaceSwap    from "./lib/faceSwap.js";
import * as Render      from "./lib/render.js";
import * as AiPrompting from "./lib/ai-prompting.js";
import * as ProjectActions from "./lib/projectActions.js";
import { registerEvents } from "./lib/events.js";

// ── Shared utilities ──────────────────────────

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

function normalizeBox(boxNatural, natural, rendered) {
  return {
    x:      boxNatural.x      * (rendered.width  / natural.width),
    y:      boxNatural.y      * (rendered.height / natural.height),
    width:  boxNatural.width  * (rendered.width  / natural.width),
    height: boxNatural.height * (rendered.height / natural.height),
  };
}

function getRenderedSize() {
  const rect = dom.previewImage.getBoundingClientRect();
  return { width: rect.width || 320, height: rect.height || 320 };
}

// ── Status / error helpers ────────────────────

function setStatus(next) { state.status = next; render(); }

function setError(code, message) { state.error = { code, message }; setStatus(STATES.ERROR); }

function setDetectionRecoveryError(code) {
  state.error = {
    code,
    message: DETECTION_FAILURE_MESSAGES[code] || DETECTION_FAILURE_MESSAGES.DETECTION_FAILED,
  };
}

function renderTemplates() {
  return Templates.renderTemplates({ dom, clamp, openStudioForTemplate, openStudioForRecentMeme });
}
// ── Template wrappers ─────────────────────────

const getSelectedTemplate     = ()              => Templates.getSelectedTemplate();
const getTemplateFaceCapacity = ()              => Templates.getTemplateFaceCapacity();
const getTemplateMainImage    = (t)             => Templates.getTemplateMainImage(t);
const extractGeneratedImageUrl = (p)            => Templates.extractGeneratedImageUrl(p);
const recordTemplateUsage     = (id)            => Templates.recordTemplateUsage(id);
const renderStudioTemplate    = (t)             => Templates.renderStudioTemplate(t, { dom, state });
const renderTemplates         = ()              => Templates.renderTemplates({ dom, clamp, openStudioForTemplate });

async function showTemplateSelection() {
  return Templates.showTemplateSelection({ loadTemplates, dom, render, renderTemplates });
}

function openStudioForTemplate(templateId) {
  return Templates.openStudioForTemplate(templateId, {
    recordTemplateUsage,
    initializeEditorState,
    restoreEditorSession,
    persistEditorHistory: Editor.persistEditorHistory,
    render,
    STATES,
  });
}

async function openStudioForRecentMeme(recentMemeId) {
  const recent = await recentMemeStorage.get(recentMemeId);
  const snapshot = recent?.snapshot;
  const editorSnapshot = snapshot?.editorSnapshot;

  if (!snapshot || !editorSnapshot) return null;

  const restoredEditorSnapshot = {
    ...editorSnapshot,
    generatedImage: editorSnapshot.generatedImage || snapshot.currentImage || "",
  };

  state.selectedTemplateId = restoredEditorSnapshot.selectedTemplateId || state.selectedTemplateId;
  state.status = STATES.IDLE;
  state.view = "studio";
  state.uploadModalOpen = false;
  state.isEditingMemeText = false;
  state.isTextSelected = false;
  state.isTextLocked = false;
  state.showTextMore = false;
  state.showResetConfirmation = false;
  state.showBackConfirmation = false;
  state.isAiPromptPanelOpen = false;
  state.editor.historyStack = Array.isArray(snapshot.editHistory?.historyStack)
    ? snapshot.editHistory.historyStack
    : [];
  state.editor.futureStack = Array.isArray(snapshot.editHistory?.futureStack)
    ? snapshot.editHistory.futureStack
    : [];
  state.editor.initialSnapshot = state.editor.historyStack[0] || restoredEditorSnapshot;
  Editor.applyEditorSnapshot(restoredEditorSnapshot, { getTemplateMainImage });
  Editor.persistEditorHistory();
  render();
  return recent;
}

const getMemeFontFamily = (fontKey = DEFAULT_MEME_FONT_KEY) =>
  TextOverlay.getMemeFontFamily(fontKey);

const applyMemeOutline = (preview) =>
  TextOverlay.applyMemeOutline(preview);

const positionTextHandles = () =>
  TextOverlay.positionTextHandles({ dom, clamp });

const createOrSelectTextAtPointer = (event) =>
  TextOverlay.createOrSelectTextAtPointer(event, {
    dom,
    clamp,
    recordEditorSnapshot,
    beginInlineTextEdit,
  });
// ── Editor wrappers ───────────────────────────

const initializeEditorState  = ()  => Editor.initializeEditorState({ getTemplateMainImage, getSelectedTemplate });
const recordEditorSnapshot   = ()  => Editor.recordEditorSnapshot({ getTemplateMainImage, getSelectedTemplate });
const restoreEditorSession   = ()  => Editor.restoreEditorSession({ getTemplateMainImage });
const hasUnsavedStudioEdits  = ()  => Editor.hasUnsavedStudioEdits();
const undoEditorSnapshot     = ()  => Editor.undoEditorSnapshot({ getTemplateMainImage, render });
const redoEditorSnapshot     = ()  => Editor.redoEditorSnapshot({ getTemplateMainImage, render });
const resetEditorToTemplate  = ()  => Editor.resetEditorToTemplate({ getTemplateMainImage, getSelectedTemplate, render });
const confirmBackAndResetStudio = () => Editor.confirmBackAndResetStudio({ getTemplateMainImage, getSelectedTemplate, render, renderTemplates });

// ── Text overlay wrappers ─────────────────────

const getMemeTextColor        = (k) => TextOverlay.getMemeTextColor(k);
const getEditableTextValue    = (n) => TextOverlay.getEditableTextValue(n);
const syncOutlineSwatchState  = ()  => TextOverlay.syncOutlineSwatchState({ dom });
const syncMemeTextAppearance  = ()  => TextOverlay.syncMemeTextAppearance({ dom, clamp });
const fitMemeTextToCanvas     = ()  => TextOverlay.fitMemeTextToCanvas({ dom });
const renderFrozenTextItems   = ()  => TextOverlay.renderFrozenTextItems({ dom, clamp });
const freezeCurrentTextItem   = ()  => TextOverlay.freezeCurrentTextItem();
const selectFrozenTextItem    = (i) => TextOverlay.selectFrozenTextItem(i, { recordEditorSnapshot, render });
const deleteMemeText          = ()  => TextOverlay.deleteMemeText({ recordEditorSnapshot, render });
const finishInlineTextEdit    = ()  => TextOverlay.finishInlineTextEdit({ dom, recordEditorSnapshot, render });
const rotateTextOneStep       = (e) => TextOverlay.rotateTextOneStep(e, { recordEditorSnapshot, render });
const startTextDrag           = (e) => TextOverlay.startTextDrag(e, { dom });
const moveTextDrag            = (e) => TextOverlay.moveTextDrag(e, { dom, clamp, render });
const endTextDrag             = (e) => TextOverlay.endTextDrag(e, { recordEditorSnapshot });
const startTextResize         = (e) => TextOverlay.startTextResize(e);
const moveTextResize          = (e) => TextOverlay.moveTextResize(e, { dom, clamp, render });
const endTextResize           = (e) => TextOverlay.endTextResize(e, { recordEditorSnapshot });
const selectTextObject        = (e) => TextOverlay.selectTextObject(e, { render });
const updateEditorTextSetting = (k, v) => TextOverlay.updateEditorTextSetting(k, v, { recordEditorSnapshot, render });

function beginInlineTextEdit(event) {
  return TextOverlay.beginInlineTextEdit(event, { dom, render });
}

function createOrSelectTextAtPointer(event) {
  return TextOverlay.createOrSelectTextAtPointer(event, { dom, clamp, recordEditorSnapshot, beginInlineTextEdit });
}

// ── Face wrappers ─────────────────────────────

const getFaceCropBounds       = (f, n) => Faces.getFaceCropBounds(f, n, { clamp });
const getFaceCropMimeType     = (f)    => Faces.getFaceCropMimeType(f);
const extractFaceCrop         = (b, f, o) => Faces.extractFaceCrop(b, f, o, { decodeImage, clamp });
const setSelectedFaceIds      = (ids) => Faces.setSelectedFaceIds(ids);
const selectSingleFace        = (id)  => Faces.selectSingleFace(id);
const getSelectedFaces        = ()    => Faces.getSelectedFaces();
const getSelectableFaceLimit  = ()    => Faces.getSelectableFaceLimit({ getTemplateFaceCapacity });

function toggleDetectedFaceSelection(faceId) {
  return Faces.toggleDetectedFaceSelection(faceId, { getTemplateFaceCapacity, getSelectableFaceLimit });
}

async function detectFaces(file) {
  return Faces.detectFaces(file, {
    adapter, decodeImage, clamp, normalizeBox,
    clearFaceFitState, enterManualMode,
    setStatus, setError, setDetectionRecoveryError,
    getRenderedSize, getTemplateFaceCapacity,
    selectSingleFace,
  });
}

// ── Face swap wrappers ────────────────────────

const startFaceSwapLoadingState = () => FaceSwap.startFaceSwapLoadingState({ render });
const stopFaceSwapLoadingState  = () => FaceSwap.stopFaceSwapLoadingState({ render });

/**
 * Saves the currently edited meme through the save module.
 *
 * @returns {Promise<{metadata: object, snapshot: object}>} Saved recent meme records.
 */
async function saveCurrentEditorMeme() {
  return saveCurrentMeme({
    state,
    dom,
    createEditorSnapshot: Editor.createEditorSnapshot,
  });
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
async function submitSelectedFace() {
  return FaceSwap.submitSelectedFace({
    state, getSelectedFaces, getSelectedTemplate,
    getFaceCropMimeType, extractFaceCrop, extractGeneratedImageUrl,
    requestFaceSwap, recordEditorSnapshot,
    startFaceSwapLoading: startFaceSwapLoadingState,
    stopFaceSwapLoading:  stopFaceSwapLoadingState,
    render, STATES,
  });
}

// ── Render ────────────────────────────────────

function renderOverlay() {
  return Render.renderOverlay({
    dom, state, normalizeBox, clamp,
    FACE_BOX_TAP_TARGET, toggleDetectedFaceSelection,
    getRenderedSize, render,
  });
}

function renderAiPromptHistory() {
  return AiPrompting.renderAiPromptHistory({ dom, state });
}

function renderAiPromptLoadMode() {
  return AiPrompting.renderAiPromptLoadMode({ dom, state });
}



dom.cameraCta.addEventListener("click", () => {
  startCameraCapture();
});
dom.titleStartCta?.addEventListener("click", async () => {
  await showTemplateSelection();
});
dom.saveCta?.addEventListener("click", async () => {
  if (state.view !== "studio") return;
  dom.saveCta.disabled = true;
  try {
    await saveCurrentEditorMeme();
  } catch {
    // Keep save non-blocking for the editor if browser storage fails.
  } finally {
    dom.saveCta.disabled = false;
  }
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
  state.isAiPromptPanelOpen = false;
  render();
});
dom.aiPromptCta?.addEventListener("click", () => {
  // AI prompt panel is temporarily disabled.
  state.isAiPromptPanelOpen = false;
  render();
});
dom.aiPromptCloseCta?.addEventListener("click", () => {
  state.isAiPromptPanelOpen = false;
  render();
});
dom.aiPromptForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = dom.aiPromptInput?.value.trim();
  if (!prompt) return;
  state.aiPromptHistory.push({ role: "user", text: prompt });
  state.aiPromptHistory.push({ role: "assistant", text: "Got it — AI variant generation will use this prompt once connected." });
  dom.aiPromptInput.value = "";
  renderAiPromptHistory();
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
  Templates.syncTemplateTabs({ dom });
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
  const duplicateOffset = clamp(Math.max(10, duplicateSource.widthPct * 0.22), 10, 18);
  const duplicateX = duplicateSource.x + duplicateOffset > 95
    ? duplicateSource.x - duplicateOffset
    : duplicateSource.x + duplicateOffset;
  const duplicateY = duplicateSource.y + duplicateOffset > 95
    ? duplicateSource.y - duplicateOffset
    : duplicateSource.y + duplicateOffset;
  state.editor.overlayText = duplicateSource.text;
  state.editor.overlayFontKey = duplicateSource.fontKey;
  state.editor.overlayFontPx = duplicateSource.fontPx;
  state.editor.overlayTextColor = duplicateSource.color;
  state.editor.overlayOutlineEnabled = duplicateSource.outline;
  state.editor.overlayOutlineColor = duplicateSource.outlineColor;
  state.editor.overlayBold = duplicateSource.bold;
  state.editor.overlayItalic = duplicateSource.italic;
  state.editor.overlayUnderline = duplicateSource.underline;
  state.editor.overlayX = clamp(duplicateX, 5, 95);
  state.editor.overlayY = clamp(duplicateY, 5, 95);
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
function render() {
  const result = Render.render({
    dom, state,
    getSelectedTemplate, getSelectedFaces, getSelectableFaceLimit,
    renderStudioTemplate, renderFrozenTextItems,
    syncMemeTextAppearance, syncOutlineSwatchState,
    applyManualTransform: () => applyManualTransform(),
    renderOverlay, renderAiPromptHistory, renderAiPromptLoadMode,
    getMemeTextColor,
  });
  projectActions?.scheduleAutoSave();
  return result;
}

const projectActions = ProjectActions.configureProjectActions({
  dom, state, render,
  getTemplateMainImage,
  recordEditorSnapshot,
});

// ── Events ────────────────────────────────────

registerEvents({
  dom, state, STATES, clamp,
  // Camera / upload
  startCameraCapture, snapCameraPhoto, flipCamera,
  clearCameraStream, clearCameraReview,
  useReviewedPhoto, goBackToUploadChoices,
  startManualFitFromSelection, startManualDrag, moveManualDrag,
  configureUpload, detectFaces,
  applyManualTransform: () => applyManualTransform(),
  // Template
  showTemplateSelection, renderTemplates, openStudioForTemplate,
  // Text overlay
  createOrSelectTextAtPointer, selectTextObject, beginInlineTextEdit,
  finishInlineTextEdit, deleteMemeText, freezeCurrentTextItem,
  selectFrozenTextItem, updateEditorTextSetting,
  startTextDrag, moveTextDrag, endTextDrag,
  startTextResize, moveTextResize, endTextResize,
  rotateTextOneStep, syncMemeTextAppearance, syncOutlineSwatchState,
  getEditableTextValue,
  // Editor
  undoEditorSnapshot, redoEditorSnapshot, resetEditorToTemplate,
  confirmBackAndResetStudio, recordEditorSnapshot,
  // Face swap
  submitSelectedFace, startFaceSwapLoadingState, stopFaceSwapLoadingState,
  // Render
  render, renderOverlay,
  // Misc
  getSelectedFaces, selectSingleFace, getRenderedSize,
  hasUnsavedStudioEdits, normalizeBox, setStatus, setError,
});

// ── Test hooks (keep for test suite) ─────────

export const __testHooks = {
  dom,
  state,
  render,
  renderTemplates,
  setStatus,
  selectSingleFace,
  submitSelectedFace,
  saveCurrentEditorMeme,
  openStudioForRecentMeme,
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
  projectActions,
};

// ── Init ──────────────────────────────────────

async function init() {
  await Templates.loadTemplateCatalog({ loadTemplates });
  projectActions.restoreAutoSave();
  render();
}
init();
