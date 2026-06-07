/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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

function createRequest() {
  return {
    error: null,
    result: undefined,
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null,
  };
}

function createFakeIndexedDB() {
  const stores = new Map();
  let opened = false;

  function ensureStore(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  }

  const db = {
    objectStoreNames: {
      contains: (name) => stores.has(name),
    },
    createObjectStore: (name) => {
      ensureStore(name);
    },
    transaction: (storeNames) => {
      const transaction = {
        error: null,
        onabort: null,
        oncomplete: null,
        onerror: null,
        objectStore: (name) => ({
          put: (value) => {
            ensureStore(name).set(value.id, value);
          },
          delete: (id) => {
            ensureStore(name).delete(id);
          },
          get: (id) => {
            const request = createRequest();
            setTimeout(() => {
              request.result = ensureStore(name).get(id);
              request.onsuccess?.();
            }, 0);
            return request;
          },
        }),
      };

      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      names.forEach(ensureStore);
      setTimeout(() => transaction.oncomplete?.(), 0);
      return transaction;
    },
    close: vi.fn(),
    onversionchange: null,
  };

  return {
    open: vi.fn(() => {
      const request = createRequest();
      setTimeout(() => {
        request.result = db;
        if (!opened) {
          opened = true;
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      }, 0);
      return request;
    }),
    dump: (name) => new Map(stores.get(name) || []),
  };
}

async function loadRecentsModule() {
  vi.resetModules();
  return import("../public/js/recents.js");
}

describe("recent meme storage", () => {
  let indexedDB;

  beforeEach(() => {
    indexedDB = createFakeIndexedDB();
    const localStorage = createMemoryStorage();

    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: indexedDB,
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorage,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: localStorage,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("stores snapshot and thumbnail in IndexedDB with newest metadata first", async () => {
    const { saveRecentMeme, listRecentMemes, getRecentMeme } = await loadRecentsModule();

    await saveRecentMeme({
      id: "old",
      savedAt: 1000,
      currentImage: "/old.png",
      mode: "text",
      editorSnapshot: {
        overlayText: "older meme",
        overlayX: 12,
        overlayY: 34,
        overlayWidthPct: 56,
        overlayRotation: 90,
      },
      historyStack: [{ overlayText: "older seed" }],
      thumbnail: {
        blob: new Blob(["old-thumb"], { type: "image/webp" }),
        width: 128,
        height: 128,
        type: "image/webp",
      },
    });

    await saveRecentMeme({
      id: "new",
      savedAt: 2000,
      currentImage: "/new.png",
      mode: "face_swap",
      editorSnapshot: {
        generatedImage: "/new.png",
        overlayText: "newer meme",
        frozenTextItems: [{ text: "bottom text" }],
      },
      historyStack: [{ overlayText: "new seed" }, { overlayText: "newer meme" }],
      futureStack: [{ overlayText: "redo text" }],
      thumbnail: {
        blob: new Blob(["new-thumb"], { type: "image/webp" }),
        width: 256,
        height: 144,
        type: "image/webp",
      },
    });

    expect(listRecentMemes().map((item) => item.id)).toEqual(["new", "old"]);
    expect(JSON.parse(localStorage.getItem("recent-memes")).map((item) => item.id)).toEqual(["new", "old"]);

    const recent = await getRecentMeme("new");
    expect(recent.snapshot.currentImage).toBe("/new.png");
    expect(recent.snapshot.mode).toBe("face_swap");
    expect(recent.snapshot.editHistory.historyStack).toHaveLength(2);
    expect(recent.snapshot.editHistory.futureStack).toHaveLength(1);
    expect(recent.snapshot.textContent).toEqual({
      activeText: "newer meme",
      frozenTextItems: [{ text: "bottom text" }],
    });
    expect(recent.thumbnail.blob.type).toBe("image/webp");
    expect(recent.thumbnail.width).toBe(256);
  });

  test("evicts the oldest meme metadata, snapshot, and thumbnail when saving item 21", async () => {
    const { saveRecentMeme, listRecentMemes, getRecentMeme } = await loadRecentsModule();

    for (let index = 1; index <= 21; index += 1) {
      await saveRecentMeme({
        id: `recent-${index}`,
        savedAt: index,
        currentImage: `/meme-${index}.png`,
        mode: "ai_prompt",
        editorSnapshot: { overlayText: `meme ${index}` },
        historyStack: [{ overlayText: `meme ${index}` }],
        thumbnail: {
          blob: new Blob([`thumb-${index}`], { type: "image/webp" }),
          width: 256,
          height: 256,
          type: "image/webp",
        },
      });
    }

    const metadata = listRecentMemes();
    expect(metadata).toHaveLength(20);
    expect(metadata[0].id).toBe("recent-21");
    expect(metadata.at(-1).id).toBe("recent-2");
    expect(metadata.some((item) => item.id === "recent-1")).toBe(false);
    expect(await getRecentMeme("recent-1")).toBeNull();
    expect(indexedDB.dump("snapshots").has("recent-1")).toBe(false);
    expect(indexedDB.dump("thumbnails").has("recent-1")).toBe(false);
  });

  test("rejects empty current image saves before writing metadata", async () => {
    const { saveRecentMeme } = await loadRecentsModule();

    await expect(saveRecentMeme({
      id: "empty-image",
      currentImage: "",
      editorSnapshot: {},
      thumbnail: {
        blob: new Blob(["thumb"], { type: "image/webp" }),
        width: 256,
        height: 256,
        type: "image/webp",
      },
    })).rejects.toMatchObject({
      code: "MISSING_CURRENT_IMAGE",
      message: "A current image is required to save this meme.",
    });
    expect(localStorage.getItem("recent-memes")).toBeNull();
  });

  test("retries opening IndexedDB after a transient open failure", async () => {
    const successfulIndexedDB = createFakeIndexedDB();
    const transientError = new Error("temporary idb failure");
    let openCount = 0;
    indexedDB = {
      open: vi.fn((...args) => {
        openCount += 1;
        if (openCount === 1) {
          const request = createRequest();
          setTimeout(() => {
            request.error = transientError;
            request.onerror?.();
          }, 0);
          return request;
        }
        return successfulIndexedDB.open(...args);
      }),
      dump: successfulIndexedDB.dump,
    };
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: indexedDB,
    });

    const { saveRecentMeme, getRecentMeme } = await loadRecentsModule();
    const thumbnail = {
      blob: new Blob(["thumb"], { type: "image/webp" }),
      width: 256,
      height: 256,
      type: "image/webp",
    };

    await expect(saveRecentMeme({
      id: "first-attempt",
      currentImage: "/first.png",
      editorSnapshot: { generatedImage: "/first.png" },
      thumbnail,
    })).rejects.toThrow("temporary idb failure");

    await saveRecentMeme({
      id: "second-attempt",
      currentImage: "/second.png",
      editorSnapshot: { generatedImage: "/second.png" },
      thumbnail,
    });

    expect(indexedDB.open).toHaveBeenCalledTimes(2);
    expect((await getRecentMeme("second-attempt")).snapshot.currentImage).toBe("/second.png");
  });
});
