const DB_NAME = "memebro-recents";
const DB_VERSION = 1;
const SNAPSHOT_STORE = "snapshots";
const THUMBNAIL_STORE = "thumbnails";
const METADATA_KEY = "recent-memes";
const MAX_RECENT_MEMES = 20;
const THUMBNAIL_MAX_SIZE = 256;
const THUMBNAIL_TYPE = "image/webp";
const THUMBNAIL_QUALITY = 0.86;
const EDITOR_MODES = new Set(["face_swap", "ai_prompt", "text"]);

let dbPromise = null;

/**
 * Returns the browser IndexedDB handle from the active global scope.
 *
 * @returns {IDBFactory | undefined} The IndexedDB factory, when available.
 */
function getIndexedDB() {
  return globalThis.indexedDB;
}

/**
 * Returns the browser localStorage handle from the active global scope.
 *
 * @returns {Storage | undefined} The localStorage object, when available.
 */
function getLocalStorage() {
  return globalThis.localStorage;
}

/**
 * Creates a deep clone of plain snapshot data for storage isolation.
 *
 * @param {*} value - The value to clone.
 * @returns {*} A cloned copy of the input value.
 */
function cloneData(value) {
  if (value == null) return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Fall back to JSON for plain editor state objects.
    }
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * Creates a unique identifier for a recently saved meme.
 *
 * @param {number} [now=Date.now()] - Timestamp used as the sortable ID prefix.
 * @returns {string} A unique recent meme ID.
 */
function createRecentMemeId(now = Date.now()) {
  const randomId = globalThis.crypto?.randomUUID?.()
    || Math.random().toString(36).slice(2, 12);
  return `recent-${now}-${randomId}`;
}

/**
 * Converts a saved-at value into a valid millisecond timestamp.
 *
 * @param {number | string | Date} value - Timestamp, date string, or Date-like value.
 * @returns {number} A valid millisecond timestamp.
 */
function normalizeSavedAt(value) {
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

/**
 * Validates the editor mode captured with a recent meme snapshot.
 *
 * @param {string} mode - Candidate editor mode.
 * @returns {"face_swap" | "ai_prompt" | "text"} A supported editor mode.
 */
function normalizeMode(mode) {
  return EDITOR_MODES.has(mode) ? mode : "text";
}

/**
 * Sorts recent meme metadata entries newest first and removes invalid entries.
 *
 * @param {Array<object>} metadata - Metadata entries to sort.
 * @returns {Array<object>} Valid metadata sorted by saved time descending.
 */
function sortMetadata(metadata) {
  return metadata
    .filter((item) => item?.id)
    .sort((a, b) => normalizeSavedAt(b.savedAt) - normalizeSavedAt(a.savedAt));
}

/**
 * Reads all recent meme metadata persisted in localStorage.
 *
 * @returns {Array<object>} Stored metadata sorted newest first.
 */
function readStoredRecentMemeMetadata() {
  try {
    const parsed = JSON.parse(getLocalStorage()?.getItem(METADATA_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return sortMetadata(parsed);
  } catch {
    return [];
  }
}

/**
 * Reads capped recent meme metadata for display or callers.
 *
 * @returns {Array<object>} Up to 20 recent meme metadata entries, newest first.
 */
export function readRecentMemeMetadata() {
  return readStoredRecentMemeMetadata().slice(0, MAX_RECENT_MEMES);
}

/**
 * Writes recent meme metadata to localStorage in newest-first order.
 *
 * @param {Array<object>} metadata - Metadata entries to persist.
 * @returns {Array<object>} The sorted and capped metadata that was written.
 */
function writeRecentMemeMetadata(metadata) {
  const sorted = sortMetadata(metadata).slice(0, MAX_RECENT_MEMES);
  getLocalStorage()?.setItem(METADATA_KEY, JSON.stringify(sorted));
  return sorted;
}

/**
 * Opens the recents IndexedDB database and creates object stores when needed.
 *
 * @returns {Promise<IDBDatabase>} A promise for the open recents database.
 */
function openRecentsDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const indexedDB = getIndexedDB();
    if (!indexedDB) {
      reject(new Error("IndexedDB is not available."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(THUMBNAIL_STORE)) {
        db.createObjectStore(THUMBNAIL_STORE, { keyPath: "id" });
      }
    };

    request.onerror = () => reject(request.error || new Error("Could not open recents storage."));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });

  return dbPromise;
}

/**
 * Converts an IndexedDB request into a promise.
 *
 * @param {IDBRequest} request - IndexedDB request to await.
 * @returns {Promise<*>} The request result.
 */
function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Resolves when an IndexedDB transaction completes successfully.
 *
 * @param {IDBTransaction} transaction - Transaction to await.
 * @returns {Promise<void>} Resolves after commit; rejects on error or abort.
 */
function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted."));
  });
}

/**
 * Stores a record in one IndexedDB object store.
 *
 * @param {string} storeName - Name of the object store.
 * @param {object} value - Record to store.
 * @returns {Promise<void>} Resolves after the record is written.
 */
async function putInStore(storeName, value) {
  const db = await openRecentsDB();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
}

/**
 * Reads a record from one IndexedDB object store.
 *
 * @param {string} storeName - Name of the object store.
 * @param {string} id - Record ID.
 * @returns {Promise<object | undefined>} The stored record, if found.
 */
async function getFromStore(storeName, id) {
  const db = await openRecentsDB();
  const transaction = db.transaction(storeName, "readonly");
  return requestToPromise(transaction.objectStore(storeName).get(id));
}

/**
 * Deletes a record from one IndexedDB object store.
 *
 * @param {string} storeName - Name of the object store.
 * @param {string} id - Record ID to delete.
 * @returns {Promise<void>} Resolves after deletion commits.
 */
async function deleteFromStore(storeName, id) {
  const db = await openRecentsDB();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(id);
  await transactionDone(transaction);
}

/**
 * Deletes both the snapshot and thumbnail records for a recent meme.
 *
 * @param {string} id - Recent meme ID to delete.
 * @returns {Promise<void>} Resolves after both records are removed.
 */
async function deleteRecentMemeData(id) {
  const db = await openRecentsDB();
  const transaction = db.transaction([SNAPSHOT_STORE, THUMBNAIL_STORE], "readwrite");
  transaction.objectStore(SNAPSHOT_STORE).delete(id);
  transaction.objectStore(THUMBNAIL_STORE).delete(id);
  await transactionDone(transaction);
}

/**
 * Reads natural media dimensions from an image-like source.
 *
 * @param {HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap | object} source - Image-like source.
 * @returns {{width: number, height: number}} Positive width and height values.
 */
function getImageDimensions(source) {
  const width = Number(source?.naturalWidth || source?.videoWidth || source?.width) || 1;
  const height = Number(source?.naturalHeight || source?.videoHeight || source?.height) || 1;
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

/**
 * Loads a current meme image from an element, canvas, ImageBitmap, Blob, or URL.
 *
 * @param {HTMLImageElement | HTMLCanvasElement | ImageBitmap | Blob | string} currentImage - Image source to load.
 * @returns {Promise<HTMLImageElement | HTMLCanvasElement | ImageBitmap>} Loaded image-like source.
 */
function loadImageSource(currentImage) {
  const hasHtmlImage = typeof HTMLImageElement !== "undefined";
  const hasHtmlCanvas = typeof HTMLCanvasElement !== "undefined";
  const hasImageBitmap = typeof ImageBitmap !== "undefined";

  if (
    (hasHtmlImage && currentImage instanceof HTMLImageElement)
    || (hasHtmlCanvas && currentImage instanceof HTMLCanvasElement)
    || (hasImageBitmap && currentImage instanceof ImageBitmap)
  ) {
    return Promise.resolve(currentImage);
  }

  if (typeof Blob !== "undefined" && currentImage instanceof Blob) {
    const objectUrl = URL.createObjectURL(currentImage);
    return loadImageSource(objectUrl).finally(() => URL.revokeObjectURL(objectUrl));
  }

  if (typeof currentImage !== "string" || !currentImage.trim()) {
    return Promise.reject(new Error("A current image is required to save a recent meme."));
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the current image for thumbnail generation."));
    image.src = currentImage;
  });
}

/**
 * Exports a canvas into a Blob.
 *
 * @param {HTMLCanvasElement} canvas - Canvas to export.
 * @param {string} [type="image/webp"] - Target MIME type.
 * @param {number} [quality=0.86] - Encoding quality for lossy formats.
 * @returns {Promise<Blob>} Encoded canvas blob.
 */
function canvasToBlob(canvas, type = THUMBNAIL_TYPE, quality = THUMBNAIL_QUALITY) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Could not create the recent meme thumbnail."));
    }, type, quality);
  });
}

/**
 * Creates a 256px-max WEBP thumbnail for a saved meme image.
 *
 * @param {HTMLImageElement | HTMLCanvasElement | ImageBitmap | Blob | string} currentImage - Current meme image source.
 * @param {{maxSize?: number, type?: string, quality?: number}} [options={}] - Thumbnail export options.
 * @returns {Promise<{blob: Blob, width: number, height: number, type: string}>} Thumbnail blob and dimensions.
 */
export async function createRecentMemeThumbnail(currentImage, options = {}) {
  const image = await loadImageSource(currentImage);
  const { width, height } = getImageDimensions(image);
  const maxSize = Math.max(1, options.maxSize || THUMBNAIL_MAX_SIZE);
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const thumbnailWidth = Math.max(1, Math.round(width * scale));
  const thumbnailHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = thumbnailWidth;
  canvas.height = thumbnailHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not available for recent meme thumbnail generation.");
  }

  context.drawImage(image, 0, 0, thumbnailWidth, thumbnailHeight);
  const blob = await canvasToBlob(canvas, options.type || THUMBNAIL_TYPE, options.quality ?? THUMBNAIL_QUALITY);

  return {
    blob,
    width: thumbnailWidth,
    height: thumbnailHeight,
    type: blob.type || options.type || THUMBNAIL_TYPE,
  };
}

/**
 * Builds the persisted snapshot payload for a recent meme.
 *
 * @param {object} [options={}] - Snapshot creation options.
 * @param {string} [options.id] - Recent meme ID.
 * @param {string} [options.currentImage] - Current rendered image URL or data URL.
 * @param {object} [options.editorSnapshot] - Editor state snapshot at save/export time.
 * @param {Array<object>} [options.historyStack=[]] - Undo history at save/export time.
 * @param {Array<object>} [options.futureStack=[]] - Redo history at save/export time.
 * @param {string | object} [options.textContent] - Text content override.
 * @param {object} [options.transformation] - Transformation override.
 * @param {"face_swap" | "ai_prompt" | "text"} [options.mode="text"] - Editor mode at save/export time.
 * @param {number | string | Date} [options.savedAt=Date.now()] - Save/export time.
 * @param {{width?: number, height?: number, type?: string}} [options.thumbnail] - Thumbnail metadata.
 * @param {object} [options.extra={}] - Additional snapshot fields to merge.
 * @returns {object} Snapshot record ready for IndexedDB storage.
 */
export function createRecentMemeSnapshot({
  id,
  currentImage,
  editorSnapshot,
  historyStack = [],
  futureStack = [],
  textContent,
  transformation,
  mode = "text",
  savedAt = Date.now(),
  thumbnail,
  extra = {},
} = {}) {
  const normalizedSavedAt = normalizeSavedAt(savedAt);
  const snapshot = cloneData(editorSnapshot) || {};

  return {
    id,
    currentImage: currentImage || snapshot.generatedImage || snapshot.templateImage || "",
    editHistory: {
      historyStack: cloneData(historyStack) || [],
      futureStack: cloneData(futureStack) || [],
    },
    textContent: textContent ?? {
      activeText: snapshot.overlayText || "",
      frozenTextItems: cloneData(snapshot.frozenTextItems) || [],
    },
    transformation: transformation ?? {
      x: snapshot.overlayX ?? 50,
      y: snapshot.overlayY ?? 80,
      widthPct: snapshot.overlayWidthPct ?? 48,
      rotation: snapshot.overlayRotation ?? 0,
      visible: snapshot.overlayVisible ?? false,
    },
    savedAt: normalizedSavedAt,
    mode: normalizeMode(mode),
    editorSnapshot: snapshot,
    thumbnail: thumbnail ? {
      id,
      width: thumbnail.width,
      height: thumbnail.height,
      type: thumbnail.type || THUMBNAIL_TYPE,
    } : null,
    ...cloneData(extra),
  };
}

/**
 * Builds the lightweight localStorage metadata for a recent meme.
 *
 * @param {object} snapshot - Full recent meme snapshot.
 * @param {{width?: number, height?: number, type?: string}} thumbnail - Thumbnail metadata.
 * @returns {object} Metadata record for the recent meme list.
 */
function createRecentMemeMetadata(snapshot, thumbnail) {
  return {
    id: snapshot.id,
    savedAt: snapshot.savedAt,
    mode: snapshot.mode,
    currentImage: snapshot.currentImage,
    textContent: typeof snapshot.textContent === "string"
      ? snapshot.textContent
      : snapshot.textContent?.activeText || "",
    thumbnail: {
      id: snapshot.id,
      width: thumbnail?.width || snapshot.thumbnail?.width || THUMBNAIL_MAX_SIZE,
      height: thumbnail?.height || snapshot.thumbnail?.height || THUMBNAIL_MAX_SIZE,
      type: thumbnail?.type || snapshot.thumbnail?.type || THUMBNAIL_TYPE,
    },
  };
}

/**
 * Enforces the maximum recent meme capacity and removes evicted IndexedDB data.
 *
 * @param {Array<object>} metadata - Candidate metadata entries.
 * @returns {Promise<Array<object>>} Capped metadata entries, newest first.
 */
async function enforceRecentMemeLimit(metadata) {
  const sorted = sortMetadata(metadata);
  const evicted = sorted.slice(MAX_RECENT_MEMES);

  if (evicted.length) {
    await Promise.all(evicted.map((item) => deleteRecentMemeData(item.id)));
  }

  return sorted.slice(0, MAX_RECENT_MEMES);
}

/**
 * Saves a recent meme snapshot, thumbnail, and metadata.
 *
 * @param {object} [options={}] - Save options.
 * @param {string} [options.id] - Optional stable recent meme ID.
 * @param {number | string | Date} [options.savedAt=Date.now()] - Save/export time.
 * @param {HTMLImageElement | HTMLCanvasElement | ImageBitmap | Blob | string} [options.currentImage] - Current meme image.
 * @param {object} [options.editorSnapshot] - Editor state snapshot.
 * @param {Array<object>} [options.historyStack] - Undo history.
 * @param {Array<object>} [options.futureStack] - Redo history.
 * @param {"face_swap" | "ai_prompt" | "text"} [options.mode="text"] - Editor mode at save/export time.
 * @param {{blob: Blob, width: number, height: number, type?: string}} [options.thumbnail] - Prebuilt thumbnail.
 * @param {{maxSize?: number, type?: string, quality?: number}} [options.thumbnailOptions] - Thumbnail generation options.
 * @returns {Promise<{metadata: object, snapshot: object}>} Saved metadata and snapshot.
 */
export async function saveRecentMeme(options = {}) {
  const savedAt = normalizeSavedAt(options.savedAt ?? Date.now());
  const id = options.id || createRecentMemeId(savedAt);
  const currentImage = options.currentImage
    || options.editorSnapshot?.generatedImage
    || options.editorSnapshot?.templateImage
    || "";
  const thumbnail = options.thumbnail || await createRecentMemeThumbnail(currentImage, options.thumbnailOptions);
  const snapshot = createRecentMemeSnapshot({
    ...options,
    id,
    currentImage,
    savedAt,
    thumbnail,
  });
  const metadata = createRecentMemeMetadata(snapshot, thumbnail);
  const existingMetadata = readStoredRecentMemeMetadata().filter((item) => item.id !== id);
  const nextMetadata = await enforceRecentMemeLimit([metadata, ...existingMetadata]);

  writeRecentMemeMetadata(nextMetadata);
  await putInStore(SNAPSHOT_STORE, snapshot);
  await putInStore(THUMBNAIL_STORE, {
    id,
    blob: thumbnail.blob,
    width: thumbnail.width,
    height: thumbnail.height,
    type: thumbnail.type || thumbnail.blob?.type || THUMBNAIL_TYPE,
    savedAt,
  });

  return { metadata, snapshot };
}

/**
 * Lists recent meme metadata for display.
 *
 * @returns {Array<object>} Up to 20 metadata entries, newest first.
 */
export function listRecentMemes() {
  return readRecentMemeMetadata();
}

/**
 * Loads a recent meme snapshot and thumbnail by ID.
 *
 * @param {string} id - Recent meme ID.
 * @returns {Promise<{metadata: object | null, snapshot: object, thumbnail: object | null} | null>} Stored recent meme data, if found.
 */
export async function getRecentMeme(id) {
  const [snapshot, thumbnail] = await Promise.all([
    getFromStore(SNAPSHOT_STORE, id),
    getFromStore(THUMBNAIL_STORE, id),
  ]);

  if (!snapshot) return null;

  return {
    metadata: readRecentMemeMetadata().find((item) => item.id === id) || null,
    snapshot,
    thumbnail: thumbnail || null,
  };
}

/**
 * Removes a recent meme from metadata, snapshot storage, and thumbnail storage.
 *
 * @param {string} id - Recent meme ID to remove.
 * @returns {Promise<void>} Resolves after the recent meme is removed.
 */
export async function removeRecentMeme(id) {
  const nextMetadata = readRecentMemeMetadata().filter((item) => item.id !== id);
  writeRecentMemeMetadata(nextMetadata);
  await deleteFromStore(SNAPSHOT_STORE, id);
  await deleteFromStore(THUMBNAIL_STORE, id);
}

export const recentMemeStorage = {
  maxItems: MAX_RECENT_MEMES,
  metadataKey: METADATA_KEY,
  save: saveRecentMeme,
  list: listRecentMemes,
  get: getRecentMeme,
  remove: removeRecentMeme,
  createSnapshot: createRecentMemeSnapshot,
  createThumbnail: createRecentMemeThumbnail,
};
