import { describe, expect, it } from "vitest";
import { buildMemeFilename } from "../public/lib/memeExport.js";

describe("buildMemeFilename", () => {
  it("uses memebro prefix and png extension", () => {
    const name = buildMemeFilename();
    expect(name).toMatch(/^memebro-.+\.png$/);
  });
});
