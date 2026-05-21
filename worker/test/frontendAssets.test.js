import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import catalog from "../public/templates.json";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.resolve(testDir, "..");
const publicDir = path.join(workerDir, "public");

async function expectPublicFile(relativePath, minBytes = 1) {
  const filePath = path.join(publicDir, relativePath);
  await access(filePath);
  const stats = await stat(filePath);
  expect(stats.size).toBeGreaterThanOrEqual(minBytes);
}

describe("frontend runtime assets", () => {
  test("MediaPipe files required by public/app.js are generated", async () => {
    const appSource = await readFile(path.join(publicDir, "app.js"), "utf8");
    const importMatch = appSource.match(/from "\.\/([^"]*vision_bundle\.mjs)"/);

    expect(importMatch?.[1]).toBe(".generated/mediapipe/vision_bundle.mjs");

    await expectPublicFile(".generated/mediapipe/vision_bundle.mjs", 100_000);
    await expectPublicFile(".generated/mediapipe/models/blaze_face_short_range.tflite", 100_000);
    await expectPublicFile(".generated/mediapipe/wasm/vision_wasm_internal.js", 100_000);
    await expectPublicFile(".generated/mediapipe/wasm/vision_wasm_internal.wasm", 1_000_000);
    await expectPublicFile(".generated/mediapipe/wasm/vision_wasm_module_internal.js", 100_000);
    await expectPublicFile(".generated/mediapipe/wasm/vision_wasm_module_internal.wasm", 1_000_000);
    await expectPublicFile(".generated/mediapipe/wasm/vision_wasm_nosimd_internal.js", 100_000);
    await expectPublicFile(".generated/mediapipe/wasm/vision_wasm_nosimd_internal.wasm", 1_000_000);
  });

  test("template catalog image paths resolve to public assets", async () => {
    const imagePaths = new Set();

    catalog.templates.forEach((template) => {
      imagePaths.add(template.images.main);
      imagePaths.add(template.images.preview);
      imagePaths.add(template.images.thumbnail);
    });

    await Promise.all(
      [...imagePaths].map((imagePath) =>
        expectPublicFile(imagePath.replace(/^\//, ""))
      )
    );
  });
});
