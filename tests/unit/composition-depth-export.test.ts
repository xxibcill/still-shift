import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { prepareDepthExportComposition } from "../../packages/animation-engine/src/composition-depth.ts";
import { depthReferenceFixtures, extendedDepthReferenceFixtures } from "../helpers/composition-depth-fixtures.ts";

const directory = resolve("benchmarks/fixtures/composition/ce4d"),
  sourcePath = resolve(directory, "source.svg"), depthPath = resolve(directory, "depth.svg");
const hash = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

it("prepares all seven presets from actual bytes for one native export path", async () => {
  const expectedSourceHash = hash(await readFile(sourcePath)), expectedDepthHash = hash(await readFile(depthPath));
  for (const fixture of depthReferenceFixtures().slice(0,7)) {
    const result = await prepareDepthExportComposition(fixture.scene, {
      sourcePath, depthPath: fixture.scene.motion.mode === "depth" ? depthPath : null,
      expectedSourceHash, expectedDepthHash,
      requestedPreset: fixture.requestedPreset, requestedIntensity:"standard",
      originalSourceHash:`sha256:${"b".repeat(64)}`,
    });
    expect(result.scene.backend).toBe("webgl2");
    expect(result.scene.composition).toEqual(result.composition);
    expect(result.composition.assets[0]!.sha256).toBe(expectedSourceHash);
    expect(result.composition.assets[0]).toMatchObject({width:1600, height:900});
    expect(result.composition.metadata).toMatchObject({requestedPreset:fixture.requestedPreset,
      resolvedPreset:fixture.scene.motion.preset, originalSourceHash:`sha256:${"b".repeat(64)}`});
    expect(result.assetPaths.source).toBe(sourcePath);
    expect(Object.keys(result.assetPaths)).toHaveLength(fixture.scene.motion.mode === "depth" ? 2 : 1);
  }
});

it("checks prepared hashes and uses actual depth-map dimensions before export", async () => {
  const scene = depthReferenceFixtures()[0]!.scene;
  await expect(prepareDepthExportComposition(scene, {sourcePath, depthPath,
    expectedSourceHash:`sha256:${"a".repeat(64)}`})).rejects.toThrow("asset changed: source");
  await expect(prepareDepthExportComposition(scene, {sourcePath, depthPath,
    expectedDepthHash:`sha256:${"a".repeat(64)}`})).rejects.toThrow("asset changed: depth");
  await expect(prepareDepthExportComposition(scene, {sourcePath:resolve(directory,"missing.png"), depthPath})).rejects.toThrow("asset unavailable: source");
  await expect(prepareDepthExportComposition(scene, {sourcePath, depthPath:null})).rejects.toThrow("prepared depth asset");
  const reduced = await prepareDepthExportComposition(scene, {sourcePath, depthPath:resolve(directory,"depth-half.svg")});
  const photo = reduced.composition.layers[0]!;
  expect(photo.type).toBe("depth-image");
  if (photo.type !== "depth-image") throw Error("depth missing");
  expect(photo.depth).toMatchObject({width:800, height:450});
  expect(reduced.composition.assets[1]).toMatchObject({width:800,height:450});
  await expect(prepareDepthExportComposition({...scene, source:{width:1200,height:900}}, {sourcePath, depthPath})).rejects.toThrow("actual normalized prepared source dimensions");
});

it("retains auto selection, transparent compatibility and half-resolution depth provenance", async () => {
  const fixtures = extendedDepthReferenceFixtures(hash(await readFile(sourcePath)));
  expect(fixtures).toHaveLength(6);
  for (const fixture of fixtures) {
    const input = resolve(directory, fixture.source), map = resolve(directory, fixture.depth!);
    const result = await prepareDepthExportComposition(fixture.scene, {sourcePath:input, depthPath:map,
      requestedPreset:fixture.requestedPreset});
    expect(result.composition.metadata).toMatchObject({requestedPreset:fixture.requestedPreset,
      resolvedPreset:fixture.scene.motion.preset, sourceHash:hash(await readFile(input)),
      depthHash:hash(await readFile(map))});
    const photo = result.composition.layers[0]!;
    expect(photo.type).toBe("depth-image");
    if (photo.type !== "depth-image") throw Error("depth missing");
    expect(photo.alphaMode).toBe("opaque");
    expect(photo.depth.width).toBe(fixture.depthWidth ?? 1600);
    expect(photo.depth.height).toBe(fixture.depthHeight ?? 900);
  }
});

it("flat preparation never opens an unused depth input", async () => {
  const fixture = depthReferenceFixtures().find(fixture => fixture.scene.motion.preset === "locked_hold")!;
  const result = await prepareDepthExportComposition(fixture.scene, {sourcePath, depthPath:resolve(directory,"missing-depth.png")});
  expect(result.composition.assets).toHaveLength(1);
  expect(result.composition.layers[0]!.type).toBe("image");
});
