/**
 * @module storage
 * IndexedDB-backed key-value store for large project data.
 * Falls back to localStorage when IndexedDB is unavailable.
 */

const DB_NAME = "memebro";
const DB_VERSION = 1;
const STORE_NAME = "kv";

let dbPromise = null;

function hasIDB() {
    return typeof indexedDB !== "undefined";
}

function openDB() {
    if (dbPromise) return dbPromise;
    if (!hasIDB()) {
        dbPromise = Promise.resolve(null);
        return dbPromise;
    }
    dbPromise = new Promise((resolve) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            dbPromise = null;
            resolve(null);
        };
    });
    return dbPromise;
}

export async function idbSet(key, value) {
    const db = await openDB();
    if (!db) {
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
        return;
    }
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function idbGet(key) {
    const db = await openDB();
    if (!db) {
        return localStorage.getItem(key);
    }
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
    });
}

export async function idbRemove(key) {
    const db = await openDB();
    if (!db) {
        localStorage.removeItem(key);
        return;
    }
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Synchronous localStorage remove — used by fire-and-forget callers
 * that need the localStorage fallback to take effect immediately.
 */
export function idbRemoveSync(key) {
    if (!hasIDB()) {
        localStorage.removeItem(key);
        return;
    }
    idbRemove(key).catch(() => {});
}

/**
 * Synchronous localStorage set — used by fire-and-forget callers
 * that need the localStorage fallback to take effect immediately.
 */
export function idbSetSync(key, value) {
    if (!hasIDB()) {
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
        return;
    }
    idbSet(key, value).catch(() => {});
}
