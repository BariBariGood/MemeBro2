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

function seedStudioEditorState(state, templateId = catalog.templates[0].id) {
  const template = catalog.templates.find((entry) => entry.id === templateId) || catalog.templates[0];

  state.templateCatalog = catalog.templates;
  state.view = "studio";
  state.selectedTemplateId = template.id;
  state.editor.templateImage = template.images.main || template.images.preview || "/assets/memes/placeholder.svg";
  state.editor.generatedImage = "";
  state.editor.overlayText = "Tap to edit text";
  state.editor.overlayFontKey = "impact";
  state.editor.overlaySizeMode = "default";
  state.editor.overlayTextColor = "black";
  state.editor.overlayOutlineEnabled = true;
  state.editor.overlayAutoScale = 1;
  state.editor.initialSnapshot = {
    selectedTemplateId: template.id,
    templateImage: state.editor.templateImage,
    generatedImage: "",
    overlayText: "Tap to edit text",
    overlayFontKey: "impact",
    overlaySizeMode: "default",
    overlayTextColor: "black",
    overlayOutlineEnabled: true,
  };
  state.editor.historyStack = [];
}

describe("US-03 scenario 7.4: inline text editing + face-swap loader", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mountAppHtml();
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

    dom.memeTextPreview.click();
    expect(state.isEditingMemeText).toBe(true);
    expect(dom.memeTextEditor.classList.contains("hidden")).toBe(false);
    expect(dom.memeTextPreview.classList.contains("hidden")).toBe(false);

    state.editor.overlayText = "new meme text";
    render();
    expect(dom.memeTextPreview.textContent).toBe("new meme text");

    dom.memeTextInput.dispatchEvent(new Event("blur", { bubbles: true }));
    expect(state.isEditingMemeText).toBe(false);
    expect(dom.memeTextEditor.classList.contains("hidden")).toBe(true);
  });

  test("custom: text settings update preview styles and undo restores them", async () => {
    const { __testHooks } = await loadApp();
    await settleApp();
    const { state, dom, render, updateEditorTextSetting } = __testHooks;

    seedStudioEditorState(state);
    render();

    expect(dom.memeFontSelect.value).toBe("impact");
    expect(dom.memeFontSizeSelect.value).toBe("default");
    expect(dom.memeTextColorSelect.value).toBe("black");
    expect(dom.memeOutlineToggle.checked).toBe(true);

    updateEditorTextSetting("overlayFontKey", "comic-sans");
    updateEditorTextSetting("overlaySizeMode", "small");
    updateEditorTextSetting("overlayTextColor", "red");
    updateEditorTextSetting("overlayOutlineEnabled", false);

    expect(state.editor.overlayFontKey).toBe("comic-sans");
    expect(state.editor.overlaySizeMode).toBe("small");
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
    expect(state.editor.overlaySizeMode).toBe("default");
    expect(state.editor.overlayTextColor).toBe("black");
    expect(state.editor.overlayOutlineEnabled).toBe(true);
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

  test("custom: loader shows immediately, shows slower message at 5s, then hides", async () => {
    vi.useFakeTimers();
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
    state.faces = [{ id: "face-0", boxNatural: { x: 0, y: 0, width: 10, height: 10 } }];
    state.selectedFaceIds = ["face-0"];
    state.selectedFaceId = "face-0";

    const pending = submitSelectedFace();
    expect(dom.faceSwapLoader.classList.contains("hidden")).toBe(false);

    vi.advanceTimersByTime(5001);
    expect(dom.faceSwapLoaderDelay.classList.contains("hidden")).toBe(false);

    resolveRequest({ ok: true, json: async () => ({ generatedImageUrl: "/generated/slow.png" }) });
    await pending;

    expect(dom.faceSwapLoader.classList.contains("hidden")).toBe(true);
  });

  test("custom: face swap result replaces the template image and stays editable", async () => {
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
    state.faces = [{ id: "face-0", boxNatural: { x: 0, y: 0, width: 10, height: 10 } }];
    state.selectedFaceIds = ["face-0"];
    state.selectedFaceId = "face-0";
    render();

    await submitSelectedFace();
    expect(dom.studioTemplateArt.style.backgroundImage).toContain("/generated/swapped.png");

    dom.memeTextPreview.click();
    dom.memeTextInput.value = "fresh text";
    dom.memeTextInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(state.editor.overlayText).toBe("fresh text");
    expect(dom.memeTextPreview.textContent).toBe("fresh text");
  });

  test("custom: undo restores the previous snapshot and reset clears history", async () => {
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
    state.faces = [{ id: "face-0", boxNatural: { x: 0, y: 0, width: 10, height: 10 } }];
    state.selectedFaceIds = ["face-0"];
    state.selectedFaceId = "face-0";
    render();

    await submitSelectedFace();
    dom.memeTextPreview.click();
    dom.memeTextInput.value = "edited once";
    dom.memeTextInput.dispatchEvent(new Event("input", { bubbles: true }));

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
    expect(state.editor.overlayText).toBe("Tap to edit text");
    expect(state.editor.historyStack).toEqual([]);
    expect(localStorage.getItem("meme-editor-history")).toBeNull();
  });
});
