import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { renderComposition } from "@still-shift/animation-engine";
import { cameraPreview } from "./camera-preview.ts";

/** Implicit lights must match the already-supported explicit XYZ dependency path. */
export async function lightingDependencyAcceptance(page: Page, output: string) {
  const reports = [];
  for (const lightType of ["ambient", "point", "spot"] as const)
    for (const lightFirst of [false, true]) {
      const light: CompositionLayer = {
          id: "light",
          type: "light",
          lightType,
          intensity: 0.8,
          color: "#ffe0c0",
          transform: { position: [48, 32, -70] },
        },
        plane: CompositionLayer = {
          id: "plane",
          type: "solid",
          size: [32, 24],
          color: "#a0a0a0",
          threeD: true,
          receivesLight: true,
          transform: { position: [48, 32, 0] },
        },
        doc: Composition = {
          schemaVersion: "composition-1",
          id: "light-dependencies",
          width: 96,
          height: 64,
          fps: 24,
          frameCount: 8,
          background: "#102030",
          assets: [],
          layers: lightFirst ? [light, plane] : [plane, light],
          expressions: {
            "light.transform.anchor.z": { source: "20 + frame" },
            "plane.transform.position.z": {
              source: "ref('light.constraintReference.z')",
            },
          },
        },
        control = structuredClone(doc);
      control.layers.find((layer) => layer.id === "light")!.threeD = true;
      const forward = Array.from(
          { length: doc.frameCount },
          (_, frame) => frame,
        ),
        frames = [...forward, ...forward.toReversed(), 5, 1, 7, 0],
        actual = await cameraPreview(page, doc, {}, "webgl2", frames),
        expected = await cameraPreview(page, control, {}, "webgl2", frames),
        name = `${lightType}-${lightFirst ? "light-first" : "reader-first"}`;
      assert.deepEqual(actual.hashes, expected.hashes, `${name}: XYZ pixels`);
      const sourcePath = join(output, `${name}.json`),
        controlPath = join(output, `${name}-control.json`);
      await writeFile(sourcePath, JSON.stringify(doc));
      await writeFile(controlPath, JSON.stringify(control));
      const exports = [];
      for (const variant of ["implicit", "explicit", "repeat", "raw"] as const)
        exports.push(
          await renderComposition({
            compositionPath: variant === "explicit" ? controlPath : sourcePath,
            outputPath: join(output, `${name}-${variant}.mp4`),
            backend: "webgl2",
            ...(variant === "raw" ? { transport: "raw_rgba" as const } : {}),
          }),
        );
      for (const exported of exports)
        assert.equal(
          exported.checksums.output,
          exports[0]!.checksums.output,
          `${name}: production/control/repeat/raw exports`,
        );
      reports.push({
        lightType,
        lightFirst,
        previewFrames: frames.length * 2,
        pixelParity: "exact against explicit XYZ",
        exports: exports.length,
        exportFrames: doc.frameCount * exports.length,
        exportParity: "byte-identical implicit/explicit/repeat/raw",
      });
    }
  return reports;
}
