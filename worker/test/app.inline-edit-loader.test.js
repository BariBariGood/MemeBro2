/**
 * @vitest-environment jsdom
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import catalog from "../public/templates.json";

vi.mock("../public/.generated/mediapipe/vision_bundle.mjs", () => ({
  FaceDetector: {
    createFromOptions: vi.fn(async () => ({
      detect: vi.fn(() => ({ detections: [] })),
    })),
  },
  FilesetResolver: {
    forVisionTasks: vi.fn(async () => ({})),
  },
}));

const testDir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(testDir, "../public/index.html");
const indexHtml = readFileSync(htmlPath, "utf8");

function mountAppHtml() {
  const mainMarkup = indexHtml.match(/<main[\s\S]*<\/main>/)?.[0] || "";
  document.body.innerHTML = mainMarkup;
}

async function loadApp() {
  return import("../public/app.js");
}

async function settleApp() {
  await Promise.resolve();
  await Promise.resolve();
}

function createMemoryStorage() {
  const values = new Map();

  return {
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key) => {
      const storageKey = String(key);
      return values.has(storageKey) ? values.get(storageKey) : null;
    }),
    removeItem: vi.fn((key) => values.delete(String(key))),
    setItem: vi.fn((key, value) => values.set(String(key), String(value))),
  };
}

function seedStudioEditorState(state, templateId = catalog.templates[0].id) {
  const template = catalog.templates.find((entry) => entry.id === templateId) || catalog.templates[0];

  state.templateCatalog = catalog.templates;
  state.view = "studio";
  state.selectedTemplateId = template.id;
  state.editor.templateImage = template.templateImage || template.images.main || template.images.preview || "/assets/memes/placeholder.svg";
  state.editor.generatedImage = "";
  state.editor.overlayText = "Tap to edit text";
  state.editor.overlayVisible = true;
  state.editor.overlayFontKey = "impact";
  state.editor.overlayFontPx = 22;
  state.editor.overlaySizeMode = "default";
  state.editor.overlayTextColor = "black";
  state.editor.overlayOutlineEnabled = true;
  state.editor.overlayAutoScale = 1;
  state.editor.initialSnapshot = {
    selectedTemplateId: template.id,
    templateImage: state.editor.templateImage,
    generatedImage: "",
    overlayText: "Tap to edit text",
    overlayVisible: true,
    overlayFontKey: "impact",
    overlayFontPx: 22,
    overlaySizeMode: "default",
    overlayTextColor: "black",
    overlayOutlineEnabled: true,
  };
  state.editor.historyStack = [];
}

function mockFaceCropCanvas(blobType = "image/jpeg") {
  let canvas;
  const drawImage = vi.fn();

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function getContext() {
    canvas = this;
    return { drawImage };
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function toBlob(callback, type) {
    callback(new Blob(["face-crop"], { type: type || blobType }));
  });

  return {
    drawImage,
    get canvas() {
      return canvas;
    },
  };
}

function seedSelectedFaceCrop(state, options = {}) {
  const source = options.source || { width: 120, height: 90 };
  const face = options.face || {
    id: "face-0",
    boxNatural: { x: 20, y: 15, width: 40, height: 30 },
  };
  const file = options.file || new File(["source-image"], "portrait.png", { type: "image/png" });

  state.file = file;
  state.imageBitmap = {
    source,
    width: source.width,
    height: source.height,
  };
  state.faces = [face];
  state.selectedFaceIds = [face.id];
  state.selectedFaceId = face.id;

  return { file, source, face };
}

describe("US-03 scenario 7.4: inline text editing + face-swap loader", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mountAppHtml();
    const localStorage = createMemoryStorage();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorage,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: localStorage,
    });
    vi.stubGlobal("requestAnimationFrame", (cb) => cb());
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url === "/templates.json") {
        return { json: async () => ({ templates: catalog.templates }) };
      }
      return { ok: true, json: async () => ({ generatedImageUrl: "/generated/default.png" }) };
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("custom: text is editable inline and preview updates live", async () => {
    const { __testHooks } = await loadApp();
    await settleApp();
    const { state, dom, render } = __testHooks;

    seedStudioEditorState(state);
    render();

    dom.memeTextPreview.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(state.isEditingMemeText).toBe(true);
    expect(dom.memeTextPreview.getAttribute("contenteditable")).toBe("true");

    dom.memeTextPreview.textContent = "new meme text";
    dom.memeTextPreview.dispatchEvent(new Event("input", { bubbles: true }));
    expect(dom.memeTextPreview.textContent).toBe("new meme text");

    dom.memeTextPreview.dispatchEvent(new Event("blur", { bubbles: true }));
    expect(state.isEditingMemeText).toBe(false);
    expect(dom.memeTextPreview.getAttribute("contenteditable")).toBe("false");
  });

  test("custom: text settings update preview styles and undo restores them", async () => {
    const { __testHooks } = await loadApp();
    await settleApp();
    const { state, dom, render, updateEditorTextSetting } = __testHooks;

    seedStudioEditorState(state);
    render();

    expect(dom.memeFontSelect.value).toBe("impact");
    expect(dom.memeFontSizeInput.value).toBe("22");
    expect(dom.memeTextColorInput.value).toBe("#000000");
    expect(dom.memeOutlineRemoveCta.classList.contains("hidden")).toBe(false);

    updateEditorTextSetting("overlayFontKey", "comic-sans");
    updateEditorTextSetting("overlayFontPx", 14);
    updateEditorTextSetting("overlayTextColor", "red");
    updateEditorTextSetting("overlayOutlineEnabled", false);

    expect(state.editor.overlayFontKey).toBe("comic-sans");
    expect(state.editor.overlayFontPx).toBe(14);
    expect(state.editor.overlayTextColor).toBe("red");
    expect(state.editor.overlayOutlineEnabled).toBe(false);
    expect(dom.memeTextPreview.style.fontFamily).toContain("Comic Sans MS");
    expect(dom.memeTextPreview.style.color).toBe("rgb(214, 40, 40)");
    expect(dom.memeTextPreview.style.textShadow).toBe("none");

    dom.undoCta.click();
    dom.undoCta.click();
    dom.undoCta.click();
    dom.undoCta.click();

    expect(state.editor.overlayFontKey).toBe("impact");
    expect(state.editor.overlayFontPx).toBe(22);
    expect(state.editor.overlayTextColor).toBe("black");
    expect(state.editor.overlayOutlineEnabled).toBe(true);
  });

  test("custom: gallery cards use previewImage sources and preserve image dimensions", async () => {
    const { __testHooks } = await loadApp();
    await settleApp();
    const { dom } = __testHooks;

    dom.titleStartCta.click();
    await settleApp();
    await settleApp();

    const firstCardImage = dom.templateGrid.querySelector(".template-art-image");
    const firstCardArt = dom.templateGrid.querySelector(".template-art");

    expect(firstCardImage).not.toBeNull();
    expect(firstCardImage.getAttribute("src")).toBe(catalog.templates[0].previewImage);
    expect(firstCardImage.loading).toBe("lazy");
    expect(firstCardArt.style.aspectRatio).toBe(`${catalog.templates[0].images.width} / ${catalog.templates[0].images.height}`);
  });

  test("custom: template face regions stay inside the actual meme image bounds", () => {
    for (const template of catalog.templates) {
      for (const region of template.faceRegions || []) {
        expect(region.x).toBeGreaterThanOrEqual(0);
        expect(region.y).toBeGreaterThanOrEqual(0);
        expect(region.width).toBeGreaterThan(0);
        expect(region.height).toBeGreaterThan(0);
        expect(region.x + region.width).toBeLessThanOrEqual(template.images.width);
        expect(region.y + region.height).toBeLessThanOrEqual(template.images.height);
      }
    }
  });

  test("custom: long text shrinks to stay inside the meme canvas", async () => {
    const { __testHooks } = await loadApp();
    await settleApp();
    const { state, dom, render, syncMemeTextAppearance } = __testHooks;

    seedStudioEditorState(state);
    state.editor.overlayText = "this is a much longer meme caption that should shrink to stay visible";

    dom.studioTemplateArt.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 320,
      bottom: 320,
      width: 320,
      height: 320,
    });

    dom.memeTextPreview.getBoundingClientRect = () => {
      const fontSize = dom.memeTextPreview.style.fontSize;
      const scale = Number(fontSize.match(/\*\s([0-9.]+)\)/)?.[1] || 1);
      const width = 360 * scale;
      const height = 150 * scale;
      return {
        left: (320 - width) / 2,
        right: (320 + width) / 2,
        top: 320 - 70 - height,
        bottom: 320 - 70,
        width,
        height,
      };
    };

    render();
    const scale = syncMemeTextAppearance();

    expect(scale).toBeLessThan(1);
    expect(Number(dom.memeTextPreview.dataset.fitScale)).toBeLessThan(1);
    expect(state.editor.overlayAutoScale).toBeLessThan(1);
  });

  test("custom: studio template uses full image source without cover-cropping", async () => {
    const { __testHooks } = await loadApp();
    await settleApp();
    const { state, dom, render } = __testHooks;

    seedStudioEditorState(state, "expanding-brain");
    render();

    const template = catalog.templates.find((entry) => entry.id === "expanding-brain");
    const { getStudioTemplateBox } = await import("../public/lib/templates.js");
    const expectedBox = getStudioTemplateBox(template);

    expect(dom.studioTemplateImage.getAttribute("src")).toBe(template.templateImage);
    expect(dom.studioTemplateArt.style.width).toBe(`${expectedBox.width}px`);
    expect(dom.studioTemplateArt.style.height).toBe(`${expectedBox.height}px`);
  });

  test("custom: selected face crop matches clamped dimensions without black borders", async () => {
    const cropCanvas = mockFaceCropCanvas("image/png");
    const { __testHooks } = await loadApp();
    await settleApp();

    const source = { width: 100, height: 80 };
    const file = new File(["source-image"], "edge-face.png", { type: "image/png" });
    const face = {
      id: "face-edge",
      boxNatural: { x: -4.4, y: 9.2, width: 34.1, height: 24.3 },
    };

    const crop = await __testHooks.extractFaceCrop(file, face, {
      decodedImage: { source, width: source.width, height: source.height },
      type: "image/png",
    });

    expect(crop.bounds).toEqual({ x: 0, y: 9, width: 30, height: 25 });
    expect(crop.width).toBe(30);
    expect(crop.height).toBe(25);
    expect(crop.blob.type).toBe("image/png");
    expect(cropCanvas.canvas.width).toBe(30);
    expect(cropCanvas.canvas.height).toBe(25);
    expect(cropCanvas.drawImage).toHaveBeenCalledWith(
      source,
      0,
      9,
      30,
      25,
      0,
      0,
      30,
      25
    );

    const [, sourceX, sourceY, sourceWidth, sourceHeight] = cropCanvas.drawImage.mock.calls[0];
    expect(sourceX).toBeGreaterThanOrEqual(0);
    expect(sourceY).toBeGreaterThanOrEqual(0);
    expect(sourceX + sourceWidth).toBeLessThanOrEqual(source.width);
    expect(sourceY + sourceHeight).toBeLessThanOrEqual(source.height);
  });

  test("custom: submit sends the extracted face crop blob to the backend", async () => {
    const cropCanvas = mockFaceCropCanvas("image/png");
    global.fetch = vi.fn(async (url) => {
      if (url === "/templates.json") {
        return { json: async () => ({ templates: catalog.templates }) };
      }
      if (url === "/api/process") {
        return { ok: true, json: async () => ({ generatedImageUrl: "/generated/cropped.png" }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    const { __testHooks } = await loadApp();
    await settleApp();
    const { state, submitSelectedFace } = __testHooks;

    seedStudioEditorState(state);
    state.status = "ready";
    const { source, face } = seedSelectedFaceCrop(state, {
      source: { width: 160, height: 120 },
      face: { id: "face-0", boxNatural: { x: 24, y: 18, width: 50, height: 42 } },
    });

    await submitSelectedFace();

    const processCall = global.fetch.mock.calls.find(([url]) => url === "/api/process");
    expect(processCall).toBeTruthy();
    const [, requestOptions] = processCall;
    expect(requestOptions.method).toBe("POST");
    expect(requestOptions.headers["Content-Type"]).toBe("image/png");
    expect(requestOptions.headers["X-MemeBro-Mode"]).toBe("face_swap");
    expect(requestOptions.headers["X-MemeBro-Filename"]).toBe("portrait-face-crop.png");
    expect(JSON.parse(requestOptions.headers["X-MemeBro-Face-Crop"])).toEqual({
      x: 24,
      y: 18,
      width: 50,
      height: 42,
    });
    expect(requestOptions.body).toBeInstanceOf(Blob);
    expect(requestOptions.body.type).toBe("image/png");
    expect(cropCanvas.canvas.width).toBe(50);
    expect(cropCanvas.canvas.height).toBe(42);
    expect(cropCanvas.drawImage).toHaveBeenCalledWith(
      source,
      face.boxNatural.x,
      face.boxNatural.y,
      face.boxNatural.width,
      face.boxNatural.height,
      0,
      0,
      face.boxNatural.width,
      face.boxNatural.height
    );
  });

  test("custom: loader shows immediately, shows slower message at 5s, then hides", async () => {
    vi.useFakeTimers();
    mockFaceCropCanvas("image/png");
    let resolveRequest;
    global.fetch = vi.fn((url) => {
      if (url === "/templates.json") {
        return Promise.resolve({ json: async () => ({ templates: catalog.templates }) });
      }
      if (url === "/api/process") {
        return new Promise((resolve) => {
          resolveRequest = resolve;
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const { __testHooks } = await loadApp();
    await settleApp();
    const { state, dom, submitSelectedFace } = __testHooks;

    seedStudioEditorState(state);
    state.status = "ready";
    state.selectedTemplateId = catalog.templates[0].id;
    seedSelectedFaceCrop(state, {
      face: { id: "face-0", boxNatural: { x: 0, y: 0, width: 10, height: 10 } },
    });

    const pending = submitSelectedFace();
    expect(dom.faceSwapLoader.classList.contains("hidden")).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    vi.advanceTimersByTime(5001);
    expect(dom.faceSwapLoaderDelay.classList.contains("hidden")).toBe(false);

    resolveRequest({ ok: true, json: async () => ({ generatedImageUrl: "/generated/slow.png" }) });
    await pending;

    expect(dom.faceSwapLoader.classList.contains("hidden")).toBe(true);
  });

  test("custom: face swap result replaces the template image and stays editable", async () => {
    mockFaceCropCanvas("image/png");
    global.fetch = vi.fn(async (url) => {
      if (url === "/templates.json") {
        return { json: async () => ({ templates: catalog.templates }) };
      }
      if (url === "/api/process") {
        return { ok: true, json: async () => ({ generatedImageUrl: "/generated/swapped.png" }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    const { __testHooks } = await loadApp();
    await settleApp();
    const { state, dom, render, submitSelectedFace } = __testHooks;

    seedStudioEditorState(state);
    state.status = "ready";
    seedSelectedFaceCrop(state, {
      face: { id: "face-0", boxNatural: { x: 0, y: 0, width: 10, height: 10 } },
    });
    render();

    await submitSelectedFace();
    expect(dom.studioTemplateImage.getAttribute("src")).toBe("/generated/swapped.png");

    dom.memeTextPreview.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    dom.memeTextPreview.textContent = "fresh text";
    dom.memeTextPreview.dispatchEvent(new Event("input", { bubbles: true }));

    expect(state.editor.overlayText).toBe("fresh text");
    expect(dom.memeTextPreview.textContent).toBe("fresh text");
  });

  test("custom: undo restores the previous snapshot and reset clears history", async () => {
    mockFaceCropCanvas("image/png");
    global.fetch = vi.fn(async (url) => {
      if (url === "/templates.json") {
        return { json: async () => ({ templates: catalog.templates }) };
      }
      if (url === "/api/process") {
        return { ok: true, json: async () => ({ generatedImageUrl: "/generated/undoable.png" }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    const { __testHooks } = await loadApp();
    await settleApp();
    const { state, dom, render, submitSelectedFace } = __testHooks;

    seedStudioEditorState(state);
    state.status = "ready";
    seedSelectedFaceCrop(state, {
      face: { id: "face-0", boxNatural: { x: 0, y: 0, width: 10, height: 10 } },
    });
    render();

    await submitSelectedFace();
    dom.memeTextPreview.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    dom.memeTextPreview.textContent = "edited once";
    dom.memeTextPreview.dispatchEvent(new Event("input", { bubbles: true }));
    dom.memeTextPreview.dispatchEvent(new Event("blur", { bubbles: true }));

    const historyLengthAfterEdit = state.editor.historyStack.length;
    dom.undoCta.click();
    expect(state.editor.overlayText).toBe("Tap to edit text");
    expect(state.editor.generatedImage).toBe("/generated/undoable.png");
    expect(state.editor.historyStack.length).toBe(historyLengthAfterEdit - 1);

    dom.resetCta.click();
    expect(dom.resetConfirmation.classList.contains("hidden")).toBe(false);
    dom.resetCancelCta.click();
    expect(dom.resetConfirmation.classList.contains("hidden")).toBe(true);

    dom.resetCta.click();
    dom.resetConfirmCta.click();
    expect(state.editor.generatedImage).toBe("");
    expect(state.editor.overlayText).toBe("TAP TO EDIT TEXT");
    expect(state.editor.historyStack).toEqual([]);
    expect(localStorage.getItem("meme-editor-history")).toBeNull();
  });
});
