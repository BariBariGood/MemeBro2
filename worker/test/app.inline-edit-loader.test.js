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
      return { ok: true, json: async () => ({}) };
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("custom: text is editable inline and preview updates live", async () => {
    const { __testHooks } = await loadApp();
    const { state, dom, render } = __testHooks;

    state.view = "studio";
    state.selectedTemplateId = catalog.templates[0].id;
    render();

    dom.memeTextPreview.click();
    expect(state.isEditingMemeText).toBe(true);
    expect(dom.memeTextEditor.classList.contains("hidden")).toBe(false);

    dom.memeTextInput.value = "new meme text";
    dom.memeTextInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(dom.memeTextPreview.textContent).toBe("new meme text");

    dom.memeTextInput.dispatchEvent(new Event("blur", { bubbles: true }));
    expect(state.isEditingMemeText).toBe(false);
    expect(dom.memeTextEditor.classList.contains("hidden")).toBe(true);
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
    const { state, dom, submitSelectedFace } = __testHooks;

    state.status = "ready";
    state.selectedTemplateId = catalog.templates[0].id;
    state.faces = [{ id: "face-0", boxNatural: { x: 0, y: 0, width: 10, height: 10 } }];
    state.selectedFaceIds = ["face-0"];
    state.selectedFaceId = "face-0";

    const pending = submitSelectedFace();
    expect(dom.faceSwapLoader.classList.contains("hidden")).toBe(false);

    vi.advanceTimersByTime(5001);
    expect(dom.faceSwapLoaderDelay.classList.contains("hidden")).toBe(false);

    resolveRequest({ ok: true, json: async () => ({}) });
    await pending;

    expect(dom.faceSwapLoader.classList.contains("hidden")).toBe(true);
  });
});
