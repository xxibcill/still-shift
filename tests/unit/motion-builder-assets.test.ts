import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { imageAsset, fontAsset } from "@still-shift/motion/node";
import { comp, image, builderSource, BuilderError } from "@still-shift/motion";
const folders: string[] = [];
async function directory() {
  const value = await mkdtemp(join(tmpdir(), "motion-builder-assets-"));
  folders.push(value);
  return value;
}
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
it("hashes and dimensions SVGs at build time and retains original asset call sites", async () => {
  const root = await directory(),
    file = join(root, "art.svg"),
    bytes =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><rect width="24" height="16"/></svg>';
  await writeFile(file, bytes);
  const asset = await imageAsset("art", "art.svg", { relativeTo: root });
  expect(asset).toMatchObject({
    width: 24,
    height: 16,
    path: file,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  });
  const result = comp({ width: 64, height: 64, fps: 24, frames: 24 }, (c) => {
    c.add(image("drawing", asset).anchor("center"));
  });
  expect(builderSource(result, "assets[0]")?.file).toContain(
    "motion-builder-assets.test.ts",
  );
  expect(result.layers[0]!.transform!.anchor).toEqual([12, 8]);
});
it("accepts physical SVG dimensions and detects PNG, GIF, BMP and WebP metadata", async () => {
  const root = await directory();
  await writeFile(
    join(root, "physical.svg"),
    '<svg width="1in" height="2.54cm"/>',
  );
  expect(
    await imageAsset("physical", "physical.svg", { relativeTo: root }),
  ).toMatchObject({ width: 96, height: 96 });
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(7, 16);
  png.writeUInt32BE(9, 20);
  const gif = Buffer.alloc(10);
  gif.write("GIF89a");
  gif.writeUInt16LE(7, 6);
  gif.writeUInt16LE(9, 8);
  const bmp = Buffer.alloc(26);
  bmp.write("BM");
  bmp.writeInt32LE(7, 18);
  bmp.writeInt32LE(-9, 22);
  const webp = Buffer.alloc(30);
  webp.write("RIFF");
  webp.write("WEBP", 8);
  webp.write("VP8X", 12);
  webp.writeUIntLE(6, 24, 3);
  webp.writeUIntLE(8, 27, 3);
  for (const [name, bytes] of Object.entries({ png, gif, bmp, webp })) {
    const path = join(root, `art.${name}`);
    await writeFile(path, bytes);
    expect(await imageAsset(name, path)).toMatchObject({ width: 7, height: 9 });
  }
});
it("returns located missing-file, invalid-image and native asset errors", async () => {
  const root = await directory();
  for (const [file, bytes, code] of [
    ["invalid.svg", "not an image", "comp-builder-image"],
    ["zero.svg", '<svg width="0" height="8"/>', "comp-builder-asset"],
  ] as const) {
    const path = join(root, file);
    await writeFile(path, bytes);
    try {
      await imageAsset("bad", path);
      expect.fail();
    } catch (error) {
      expect(error).toBeInstanceOf(BuilderError);
      expect((error as BuilderError).code).toBe(code);
      expect((error as BuilderError).location.file).toContain(
        "motion-builder-assets.test.ts",
      );
    }
  }
  await expect(
    imageAsset("missing", join(root, "missing.png")),
  ).rejects.toMatchObject({ code: "comp-builder-asset-file" });
});
it("hashes font assets and validates weights and variable-axis bounds", async () => {
  const root = await directory(),
    path = join(root, "pinned.ttf");
  await writeFile(path, "author's pinned font bytes");
  expect(
    await fontAsset("font", path, {
      weight: "700",
      style: "italic",
      variable: { wght: { min: 100, default: 400, max: 900 } },
    }),
  ).toMatchObject({
    type: "font",
    weight: "700",
    style: "italic",
    variable: { wght: { min: 100, default: 400, max: 900 } },
  });
  await expect(
    fontAsset("font", path, { weight: "bad" }),
  ).rejects.toMatchObject({ code: "comp-builder-asset" });
  await expect(
    fontAsset("font", path, {
      variable: { wght: { min: 100, default: 950, max: 900 } },
    }),
  ).rejects.toMatchObject({ code: "comp-builder-asset" });
});

it("infers SVG viewport aspect ratio from a single dimension without reading data-width", async () => {
  const root = await directory();
  const inputs = [
    ["width", '<svg width="400" viewBox="0 0 200 100"/>', 400, 200],
    ["height", '<svg height="400" viewBox="0 0 200 100"/>', 800, 400],
    ["data", '<svg data-width="900" viewBox="0 0 200 100"/>', 200, 100],
  ] as const;
  for (const [id, bytes, width, height] of inputs) {
    const file = join(root, `${id}.svg`);
    await writeFile(file, bytes);
    expect(await imageAsset(id, file)).toMatchObject({ width, height });
  }
});
