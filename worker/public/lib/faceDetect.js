/**
 * @module faceDetect
 * MediaPipe face detection adapter and pure helpers.
 *
 * This module owns:
 *   - Loading MediaPipe vision tasks.
 *   - Running the face detector across a full image and across tiled regions.
 *   - Merging and deduplicating detections.
 *
 * It deliberately has no dependency on app state, DOM, or other app helpers,
 * so the adapter can be unit tested and reused. The only consumer in app code
 * is the orchestrator in worker/public/app.js, which wraps adapter.init() and
 * adapter.detect() with state mutations and UI updates.
 */

import {
  FaceDetector as MediaPipeFaceDetector,
  FilesetResolver,
} from "../.generated/mediapipe/vision_bundle.mjs";

// MediaPipe asset paths (served from the static binding).
const MEDIAPIPE_WASM_PATH = "/.generated/mediapipe/wasm";
const MEDIAPIPE_FACE_MODEL_PATH =
  "/.generated/mediapipe/models/blaze_face_short_range.tflite";

// Detection tuning knobs. Tweaking these affects multi-face coverage and
// duplicate suppression; they're intentionally local to this module.
const DETECTION_TILE_OVERLAP = 0.18;
const DETECTION_TILE_MAX_EDGE = 900;
const DETECTION_TILE_MAX_PASSES = 12;
const DETECTION_DUPLICATE_OVERLAP = 0.45;
const DETECTION_MIN_CONFIDENCE = 0.7;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createFaceDetectionAdapter() {
  let detector = null;
  let vision = null;
  let available = true;
  let initPromise = null;

  return {
    async init() {
      if (detector) return true;
      if (initPromise) return initPromise;

      initPromise = (async () => {
        try {
          vision = vision || await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
          detector = await MediaPipeFaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MEDIAPIPE_FACE_MODEL_PATH,
              delegate: "CPU",
            },
            runningMode: "IMAGE",
            minDetectionConfidence: 0.35,
            minSuppressionThreshold: 0.3,
          });
          available = true;
          return true;
        } catch (error) {
          console.warn("Face detection failed to initialize.", error);
          detector = null;
          available = false;
          return false;
        } finally {
          initPromise = null;
        }
      })();

      return initPromise;
    },

    async detect(decodedImage, options = {}) {
      if (!detector) return [];

      const targetFaceCount = Math.max(1, Number(options.faceLimit) || 1);
      let faces = detectFacesInRegion(detector, decodedImage.source, {
        x: 0,
        y: 0,
        width: decodedImage.width,
        height: decodedImage.height,
      });
      faces = mergeDetectedFaces(faces, decodedImage);

      if (targetFaceCount <= 1 || faces.length >= targetFaceCount) {
        return assignFaceIds(faces);
      }

      const tilePlan = buildDetectionTiles(decodedImage, targetFaceCount);

      for (let index = 0; index < tilePlan.length; index += 1) {
        const tileCanvas = createDetectionTileCanvas(decodedImage.source, tilePlan[index]);
        const tileFaces = detectFacesInRegion(detector, tileCanvas, tilePlan[index]);
        faces = mergeDetectedFaces([...faces, ...tileFaces], decodedImage);

        if (faces.length >= targetFaceCount) break;
      }

      return assignFaceIds(faces);
    },

    isAvailable() {
      return available;
    },
  };
}

function detectFacesInRegion(detector, source, region) {
  const result = detector.detect(source);
  const detections = Array.isArray(result?.detections) ? result.detections : [];
  const sourceWidth = source.naturalWidth || source.width || region.width;
  const sourceHeight = source.naturalHeight || source.height || region.height;
  const scaleX = region.width / sourceWidth;
  const scaleY = region.height / sourceHeight;

  return detections
    .filter((face) => face.boundingBox)
    .map((face) => {
      const box = face.boundingBox;
      const x = region.x + box.originX * scaleX;
      const y = region.y + box.originY * scaleY;
      const width = box.width * scaleX;
      const height = box.height * scaleY;

      return {
        score: Number(face.categories?.[0]?.score ?? 1),
        boxNatural: {
          x,
          y,
          width,
          height,
        },
      };
    })
    .filter((face) => face.score >= DETECTION_MIN_CONFIDENCE);
}

function buildDetectionTiles(decodedImage, targetFaceCount) {
  const tiles = [];
  const seen = new Set();
  const gridPlans = targetFaceCount >= 3
    ? [[2, 1], [1, 2], [2, 2], [3, 2]]
    : [[2, 1], [1, 2], [2, 2]];

  gridPlans.forEach(([columns, rows]) => {
    const tileWidth = decodedImage.width / (columns - (columns - 1) * DETECTION_TILE_OVERLAP);
    const tileHeight = decodedImage.height / (rows - (rows - 1) * DETECTION_TILE_OVERLAP);
    const stepX = columns === 1 ? 0 : (decodedImage.width - tileWidth) / (columns - 1);
    const stepY = rows === 1 ? 0 : (decodedImage.height - tileHeight) / (rows - 1);

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = Math.round(column * stepX);
        const y = Math.round(row * stepY);
        const width = Math.round(Math.min(tileWidth, decodedImage.width - x));
        const height = Math.round(Math.min(tileHeight, decodedImage.height - y));
        const key = `${x}:${y}:${width}:${height}`;

        if (seen.has(key)) continue;
        seen.add(key);
        tiles.push({ x, y, width, height });
      }
    }
  });

  return tiles.slice(0, DETECTION_TILE_MAX_PASSES);
}

function createDetectionTileCanvas(source, tile) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, DETECTION_TILE_MAX_EDGE / Math.max(tile.width, tile.height));
  canvas.width = Math.max(1, Math.round(tile.width * scale));
  canvas.height = Math.max(1, Math.round(tile.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    source,
    tile.x,
    tile.y,
    tile.width,
    tile.height,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas;
}

function mergeDetectedFaces(faces, decodedImage) {
  const candidates = faces
    .map((face) => {
      const box = face.boxNatural;
      const x = clamp(box.x, 0, decodedImage.width);
      const y = clamp(box.y, 0, decodedImage.height);
      const right = clamp(box.x + box.width, x, decodedImage.width);
      const bottom = clamp(box.y + box.height, y, decodedImage.height);

      return {
        ...face,
        boxNatural: {
          x,
          y,
          width: right - x,
          height: bottom - y,
        },
      };
    })
    .filter((face) => face.boxNatural.width >= 8 && face.boxNatural.height >= 8)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return getFaceArea(right) - getFaceArea(left);
    });

  const merged = [];

  candidates.forEach((candidate) => {
    const duplicateIndex = merged.findIndex((face) => areDuplicateFaces(face, candidate));

    if (duplicateIndex === -1) {
      merged.push(candidate);
      return;
    }

    const existing = merged[duplicateIndex];
    if (
      candidate.score > existing.score ||
      (candidate.score >= existing.score - 0.08 && getFaceArea(candidate) > getFaceArea(existing) * 1.35)
    ) {
      merged[duplicateIndex] = candidate;
    }
  });

  return merged.sort((left, right) => (
    left.boxNatural.y - right.boxNatural.y || left.boxNatural.x - right.boxNatural.x
  ));
}

function assignFaceIds(faces) {
  return faces.map((face, index) => ({
    ...face,
    id: `face-${index}`,
  }));
}

function getFaceArea(face) {
  return face.boxNatural.width * face.boxNatural.height;
}

function areDuplicateFaces(left, right) {
  const overlap = getFaceOverlap(left.boxNatural, right.boxNatural);
  const leftCenter = getBoxCenter(left.boxNatural);
  const rightCenter = getBoxCenter(right.boxNatural);
  const centerDistance = Math.hypot(leftCenter.x - rightCenter.x, leftCenter.y - rightCenter.y);
  const smallerFaceEdge = Math.min(
    left.boxNatural.width,
    left.boxNatural.height,
    right.boxNatural.width,
    right.boxNatural.height
  );

  return overlap >= DETECTION_DUPLICATE_OVERLAP || (overlap >= 0.18 && centerDistance <= smallerFaceEdge * 0.45);
}

function getFaceOverlap(left, right) {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.width, right.x + right.width);
  const y2 = Math.min(left.y + left.height, right.y + right.height);
  const width = Math.max(0, x2 - x1);
  const height = Math.max(0, y2 - y1);
  const intersection = width * height;
  const smallerArea = Math.min(left.width * left.height, right.width * right.height);

  return smallerArea ? intersection / smallerArea : 0;
}

function getBoxCenter(box) {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

const adapter = createFaceDetectionAdapter();
export default adapter;
