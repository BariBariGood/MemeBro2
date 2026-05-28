//Imports
import {
  FaceDetector as MediaPipeFaceDetector,
  FilesetResolver,
} from "./.generated/mediapipe/vision_bundle.mjs";

//Face Detection Adapter
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