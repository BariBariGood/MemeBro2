const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const mediapipePackageDir = path.join(rootDir, "node_modules", "@mediapipe", "tasks-vision");
const outputDir = path.join(rootDir, "public", ".generated", "mediapipe");
const wasmOutputDir = path.join(outputDir, "wasm");
const modelOutputDir = path.join(outputDir, "models");
const modelFile = "blaze_face_short_range.tflite";
const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

const requiredWasmFiles = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_module_internal.js",
  "vision_wasm_module_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyRequiredFile(source, destination) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing MediaPipe source asset: ${source}`);
  }

  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

function downloadFile(url, destination, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new Error(`Too many redirects while downloading ${url}`));
  }

  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        const nextUrl = response.headers.location;
        if (!nextUrl) {
          reject(new Error(`Redirect from ${url} did not include a location header`));
          return;
        }
        resolve(downloadFile(new URL(nextUrl, url).toString(), destination, redirectCount + 1));
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
        return;
      }

      ensureDir(path.dirname(destination));
      const tempDestination = `${destination}.tmp`;
      const file = fs.createWriteStream(tempDestination);

      response.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          fs.renameSync(tempDestination, destination);
          resolve();
        });
      });
      file.on("error", (error) => {
        fs.rmSync(tempDestination, { force: true });
        reject(error);
      });
    });

    request.on("error", reject);
  });
}

async function ensureModel() {
  const modelDestination = path.join(modelOutputDir, modelFile);
  const localModelPath = process.env.MEMEBRO_MEDIAPIPE_MODEL_PATH;

  if (fs.existsSync(modelDestination) && fs.statSync(modelDestination).size > 0) {
    return;
  }

  if (localModelPath) {
    copyRequiredFile(path.resolve(localModelPath), modelDestination);
    return;
  }

  await downloadFile(modelUrl, modelDestination);
}

async function main() {
  ensureDir(outputDir);
  ensureDir(wasmOutputDir);
  ensureDir(modelOutputDir);

  copyRequiredFile(
    path.join(mediapipePackageDir, "vision_bundle.mjs"),
    path.join(outputDir, "vision_bundle.mjs")
  );

  requiredWasmFiles.forEach((file) => {
    copyRequiredFile(
      path.join(mediapipePackageDir, "wasm", file),
      path.join(wasmOutputDir, file)
    );
  });

  await ensureModel();

  console.log("MediaPipe browser assets are ready in public/.generated/mediapipe");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
