const STATES = {
  IDLE: "idle",
  LOADING_IMAGE: "loading-image",
  DETECTING: "detecting",
  FACES_FOUND: "faces-found",
  NO_FACE: "no-face",
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

const dom = {
  uploadPage: document.querySelector(".upload-page"),
  backBtn: document.querySelector(".back-btn"),
  ctaRow: document.querySelector(".cta-row"),
  selectedTemplateLabel: document.getElementById("selected-template-label"),
  studioScreen: document.getElementById("studio-screen"),
  studioTemplateArt: document.getElementById("studio-template-art"),
  studioTemplateInitials: document.getElementById("studio-template-initials"),
  studioTemplateRegions: document.getElementById("studio-template-regions"),
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
  errorState: document.getElementById("error-state"),
  errorMessage: document.getElementById("error-message"),
  templateScreen: document.getElementById("template-screen"),
  templateSearch: document.getElementById("template-search"),
  templateTabs: document.getElementById("template-tabs"),
  templateGrid: document.getElementById("template-grid"),
  templateEmpty: document.getElementById("template-empty"),
  timingMetric: document.getElementById("timing-metric"),
  continueBtn: document.getElementById("continue-btn"),
  manualOverlay: document.getElementById("manual-overlay"),
  manualCircle: document.getElementById("manual-circle"),
  manualControls: document.getElementById("manual-controls"),
  manualZoom: document.getElementById("manual-zoom"),
  manualRotation: document.getElementById("manual-rotation"),
};

const state = {
  status: STATES.IDLE,
  faces: [],
  selectedFaceId: null,
  error: null,
  timingMs: null,
  imageBitmap: null,
  previewUrl: "",
  file: null,
  sequence: 0,
  detectorAvailable: true,
  detectedFaceCount: 0,
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
  cameraStream: null,
  cameraFacingMode: "user",
  cameraReviewFile: null,
  cameraReviewUrl: "",
  templateCatalog: [],
  selectedTemplateId: null,
  activeTemplateTab: "trending",
  templateSearchQuery: "",
  uploadModalOpen: false,
  view: "templates",
};

const RECENTS_STORAGE_KEY = "meme-template-recents";

function createFaceDetectionAdapter() {
  let detector = null;
  let available = true;

  return {
    async init() {
      if (detector) return;
      if (typeof window.FaceDetector !== "function") {
        available = false;
        return;
      }

      detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 8 });
      available = true;
    },

    async detect(imageBitmap) {
      if (!detector) return [];
      const rawFaces = await detector.detect(imageBitmap);
      return rawFaces.map((face, index) => ({
        id: `face-${index}`,
        score: Number(face?.confidence ?? 1),
        boxNatural: {
          x: face.boundingBox.x,
          y: face.boundingBox.y,
          width: face.boundingBox.width,
          height: face.boundingBox.height,
        },
      }));
    },

    isAvailable() {
      return available;
    },
  };
}

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
  state.error = null;
  state.timingMs = null;
  state.imageBitmap = null;
  state.previewUrl = "";
  state.file = null;
  state.sequence += 1;
  state.detectorAvailable = true;
  state.detectedFaceCount = 0;
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

function getRenderedSize() {
  const rect = dom.previewImage.getBoundingClientRect();
  return { width: rect.width || 320, height: rect.height || 320 };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function decodeImage(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    try {
      const url = URL.createObjectURL(file);
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
      URL.revokeObjectURL(url);
      return await createImageBitmap(image);
    } catch {
      const err = new Error("Image cannot be decoded.");
      err.code = "CORRUPT_IMAGE";
      throw err;
    }
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
  state.selectedFaceId = "face-manual-0";
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

async function detectFacesForBitmap(imageBitmap) {
  await adapter.init();
  state.detectorAvailable = adapter.isAvailable();

  if (!state.detectorAvailable) return [];
  return withTimeout(adapter.detect(imageBitmap), DETECTION_TIMEOUT_MS);
}

async function openManualEditor(file) {
  state.sequence += 1;
  const mySequence = state.sequence;
  state.file = file;
  state.error = null;
  state.timingMs = null;
  state.detectedFaceCount = 0;
  state.usedDetectedFace = false;
  state.view = "fit";
  state.uploadModalOpen = false;

  if (!ALLOWED_TYPES.has(file.type) && !file.type.startsWith("image/")) {
    setError("UNSUPPORTED_FORMAT", "Unsupported format. Please use a standard image format.");
    return;
  }

  const start = performance.now();
  setStatus(STATES.LOADING_IMAGE);

  try {
    state.imageBitmap = await decodeImage(file);
    if (mySequence !== state.sequence) return;
  } catch (error) {
    if (mySequence !== state.sequence) return;
    setError(error.code || "CORRUPT_IMAGE", "Could not read this image. Please choose another photo.");
    return;
  }

  setStatus(STATES.DETECTING);

  let faces = [];
  try {
    faces = await detectFacesForBitmap(state.imageBitmap);
  } catch {
    faces = [];
  }

  if (mySequence !== state.sequence) return;
  state.timingMs = performance.now() - start;
  state.detectedFaceCount = faces.length;
  state.usedDetectedFace = faces.length > 0;
  state.faces = faces;
  state.selectedFaceId = faces[0]?.id || null;

  enterManualMode(faces[0] || null);
  setStatus(STATES.READY);
}

async function detectFaces(file) {
  state.sequence += 1;
  const mySequence = state.sequence;
  state.file = file;
  state.error = null;

  if (!ALLOWED_TYPES.has(file.type) && !file.type.startsWith("image/")) {
    setError("UNSUPPORTED_FORMAT", "Unsupported format. Please use a standard image format.");
    return;
  }

  const start = performance.now();
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

  await adapter.init();

  try {
    let faces = [];
    state.detectorAvailable = adapter.isAvailable();

    if (state.detectorAvailable) {
      faces = await withTimeout(adapter.detect(imageBitmap), DETECTION_TIMEOUT_MS);
    } else {
      enterManualMode();
      setStatus(STATES.READY);
      return;
    }

    const timingMs = performance.now() - start;
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

    state.timingMs = timingMs;

    if (normalizedFaces.length === 0) {
      enterManualMode();
      setStatus(STATES.READY);
      return;
    }

    state.faces = normalizedFaces;

    if (normalizedFaces.length === 1) {
      state.manualMode = false;
      state.selectedFaceId = normalizedFaces[0].id;
      setStatus(STATES.READY);
      return;
    }

    state.selectedFaceId = null;
    state.manualMode = false;
    setStatus(STATES.FACES_FOUND);
  } catch (error) {
    if (mySequence !== state.sequence) return;
    state.timingMs = performance.now() - start;
    enterManualMode();
    setStatus(STATES.READY);
  }
}

function renderOverlay() {
  dom.overlayLayer.innerHTML = "";
  dom.overlayLayer.style.pointerEvents = state.manualMode ? "none" : "";

  if (state.manualMode) return;

  state.faces.forEach((face) => {
    if (!face.boxRendered) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = `face-box ${state.selectedFaceId === face.id ? "selected" : ""}`;
    button.style.left = `${face.boxRendered.x}px`;
    button.style.top = `${face.boxRendered.y}px`;
    button.style.width = `${face.boxRendered.width}px`;
    button.style.height = `${face.boxRendered.height}px`;
    button.disabled = state.status !== STATES.FACES_FOUND;
    button.setAttribute("aria-label", `Select ${face.id}`);

    button.addEventListener("click", () => {
      if (state.status !== STATES.FACES_FOUND) return;
      state.selectedFaceId = face.id;
      state.status = STATES.READY;
      render();
    });

    dom.overlayLayer.appendChild(button);
  });
}

async function loadTemplateCatalog() {
  if (state.templateCatalog.length) return;

  try {
    const response = await fetch("/MemeBro Template Selection/templates.json");
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
    const card = document.createElement("button");
    card.type = "button";
    card.className = "template-card";
    card.dataset.templateId = template.id;
    card.style.setProperty("--template-hue", String((index * 37) % 360));

    const art = document.createElement("span");
    art.className = "template-art";

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
      marker.style.left = `${(region.x / template.images.width) * 100}%`;
      marker.style.top = `${(region.y / template.images.height) * 100}%`;
      marker.style.width = `${Math.max(12, (region.width / template.images.width) * 100)}%`;
      marker.style.height = `${Math.max(12, (region.height / template.images.height) * 100)}%`;
      regions.appendChild(marker);
    });

    const name = document.createElement("span");
    name.className = "template-name";
    name.textContent = template.name;

    art.append(initials, regions);
    card.append(art, name);

    card.addEventListener("click", () => {
      state.selectedTemplateId = template.id;
      recordTemplateUsage(template.id);
      state.status = STATES.IDLE;
      state.view = "studio";
      state.uploadModalOpen = false;
      render();
    });

    if (state.selectedTemplateId === template.id) {
      card.classList.add("selected");
    }

    dom.templateGrid.appendChild(card);
  });
}

function renderStudioTemplate(template) {
  if (!template) return;

  dom.studioTemplateArt.style.setProperty(
    "--template-hue",
    String(Math.abs(template.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 360)
  );
  dom.studioTemplateInitials.textContent = template.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  dom.studioTemplateRegions.innerHTML = "";

  (template.faceRegions || []).slice(0, 4).forEach((region) => {
    const marker = document.createElement("span");
    marker.className = "studio-template-region";
    marker.style.left = `${(region.x / template.images.width) * 100}%`;
    marker.style.top = `${(region.y / template.images.height) * 100}%`;
    marker.style.width = `${Math.max(10, (region.width / template.images.width) * 100)}%`;
    marker.style.height = `${Math.max(10, (region.height / template.images.height) * 100)}%`;
    dom.studioTemplateRegions.appendChild(marker);
  });
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
  const editingPhoto = Boolean(state.previewUrl) && [STATES.FACES_FOUND, STATES.READY, STATES.NO_FACE].includes(state.status);
  const showingTemplates = state.view === "templates";
  const showingStudio = state.view === "studio";
  const choosingUpload = false;
  const selectedTemplate = state.templateCatalog.find((template) => template.id === state.selectedTemplateId);
  dom.uploadPage.classList.toggle("camera-mode", cameraActive || reviewingCameraPhoto);
  dom.uploadPage.classList.toggle("choice-mode", choosingUpload);
  dom.cameraShell.classList.toggle("hidden", !cameraActive);
  dom.reviewShell.classList.toggle("hidden", !reviewingCameraPhoto);
  dom.templateScreen.classList.toggle("hidden", !showingTemplates);
  dom.studioScreen.classList.toggle("hidden", !showingStudio);
  dom.uploadModal.classList.toggle("hidden", !state.uploadModalOpen);
  dom.overlayShell.classList.toggle("hidden", !editingPhoto || showingTemplates || showingStudio);
  dom.cameraCancelCta.classList.toggle("hidden", !cameraActive);
  dom.ctaRow.classList.toggle("hidden", !state.uploadModalOpen || cameraActive || reviewingCameraPhoto || editingPhoto);
  dom.cameraCta.classList.toggle("hidden", cameraActive || reviewingCameraPhoto || editingPhoto);
  dom.libraryCta.classList.toggle("hidden", cameraActive || reviewingCameraPhoto || editingPhoto);
  dom.overlayShell.classList.toggle("manual-active", state.manualMode);
  dom.overlayShell.classList.toggle("dragging", state.dragPointerId !== null);
  dom.selectedTemplateLabel.textContent = selectedTemplate ? `Template: ${selectedTemplate.name}` : "";
  if (showingStudio && selectedTemplate) renderStudioTemplate(selectedTemplate);

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

  dom.errorState.classList.toggle("hidden", ![STATES.ERROR, STATES.NO_FACE].includes(state.status));
  dom.errorMessage.textContent = state.error?.message || "";

  if (state.previewUrl) {
    dom.previewImage.src = state.previewUrl;
  }

  if (state.status === STATES.FACES_FOUND) {
    dom.statusText.textContent = "Multiple faces found. Tap one face to continue.";
  } else if (state.status === STATES.READY) {
    if (state.manualMode && state.usedDetectedFace) {
      dom.statusText.textContent = "Face detected. Drag to fine tune the fit inside the oval.";
    } else if (state.manualMode) {
      dom.statusText.textContent = "Drag the photo until the face sits inside the oval.";
    } else {
      dom.statusText.textContent = "Face selected and ready.";
    }
  } else if (state.status === STATES.NO_FACE) {
    dom.statusText.textContent = "No face detected.";
  } else {
    dom.statusText.textContent = "";
  }

  dom.continueBtn.disabled = state.status !== STATES.READY;
  dom.continueBtn.classList.toggle("hidden", !editingPhoto || showingTemplates);
  dom.manualOverlay.classList.toggle("hidden", !state.manualMode);
  dom.manualControls.classList.toggle("hidden", !state.manualMode);

  if (typeof state.timingMs === "number") {
    dom.timingMetric.classList.remove("hidden");
  } else {
    dom.timingMetric.classList.add("hidden");
    dom.timingMetric.textContent = "";
  }

  applyManualTransform();
  renderOverlay();
}

async function submitSelectedFace() {
  if (state.status !== STATES.READY) return;
  const selectedFace = state.faces.find((face) => face.id === state.selectedFaceId);
  if (!selectedFace) return;
  const selectedTemplate = state.templateCatalog.find((template) => template.id === state.selectedTemplateId);

  await fetch("/api/process", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MemeBro-Mode": "face_swap",
      "X-MemeBro-Selected-Face": JSON.stringify(selectedFace),
      "X-MemeBro-Template": state.selectedTemplateId || "",
    },
    body: JSON.stringify({
      mode: "face_swap",
      selectedFace,
      selectedTemplateId: state.selectedTemplateId,
      selectedTemplate,
    }),
  });
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
  await openManualEditor(file);
}

async function flipCamera() {
  state.cameraFacingMode = state.cameraFacingMode === "user" ? "environment" : "user";
  await startCameraCapture();
}

function goBackToUploadChoices() {
  if (state.view === "templates") {
    return;
  }

  if (state.uploadModalOpen) {
    state.uploadModalOpen = false;
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
    state.error = null;
    state.timingMs = null;
    state.imageBitmap = null;
    state.previewUrl = "";
    state.file = null;
    state.sequence += 1;
    state.detectorAvailable = true;
    state.detectedFaceCount = 0;
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

dom.cameraInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = URL.createObjectURL(file);
  render();
  await openManualEditor(file);
});

dom.libraryInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = URL.createObjectURL(file);
  render();
  await openManualEditor(file);
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
  } catch {
    setError("UPLOAD_FAILED", "Upload failed.");
  }
});

async function init() {
  await showTemplateSelection();
}

init();
