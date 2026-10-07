import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Composition,
  CompositionAsset,
} from "@still-shift/scene-contract";
import type { Page } from "playwright";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as Diagnostics from "../../packages/renderer-core/src/passage-diagnostics.ts";

/** Coverage probes use the actual alpha pipeline, not artwork bounding boxes. */
export async function cameraFailureAcceptance(page: Page, root: string) {
  const manifest = JSON.parse(
    await readFile(
      join(root, "benchmarks/fixtures/composition/ce8/assets.json"),
      "utf8",
    ),
  ) as Record<string, CompositionAsset>;
  const result = await page.evaluate(async (manifest) => {
    const renderUrl = "/packages/renderer-core/src/index.ts",
      diagnosticUrl = "/packages/renderer-core/src/passage-diagnostics.ts",
      m = (await import(renderUrl)) as typeof Render,
      d = (await import(diagnosticUrl)) as typeof Diagnostics,
      image = {
        id: "cover",
        type: "image" as const,
        size: [128, 96] as [number, number],
        fit: "stretch" as const,
        coverage: "required" as const,
        sources: [{ asset: "checker" }, { asset: "hole" }],
        state: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 16, value: 1 },
          ],
        },
        transform: {
          anchor: [0, 0] as [number, number],
          position: [0, 0] as [number, number],
        },
      },
      base: Composition = {
        schemaVersion: "composition-1",
        id: "coverage",
        width: 128,
        height: 96,
        fps: 24,
        frameCount: 32,
        assets: [manifest.checker!, manifest.hole!],
        layers: [image],
      },
      urls = (id: string) =>
        `/benchmarks/fixtures/composition/ce8/${manifest[id]!.path}`,
      resources = await m.loadCompositionResources(base, urls),
      reports = [];
    const mask = {
        id: "hole",
        mode: "subtract" as const,
        path: {
          closed: true,
          vertices: [
            [48, 32],
            [80, 32],
            [80, 64],
            [48, 64],
          ] as [number, number][],
        },
      },
      masked: Composition = {
        ...base,
        id: "masked",
        layers: [
          {
            id: "cover",
            type: "solid",
            size: [128, 96],
            color: "#ffffff",
            coverage: "required",
            transform: { anchor: [0, 0] },
            masks: [mask],
          },
        ],
      },
      matted: Composition = {
        ...base,
        id: "matted",
        layers: [
          {
            id: "cover",
            type: "solid",
            size: [128, 96],
            color: "#ffffff",
            coverage: "required",
            transform: { anchor: [0, 0] },
            trackMatte: { layer: "matte", mode: "alpha" },
          },
          {
            ...image,
            id: "matte",
            coverage: "optional",
            sources: [{ asset: "hole" }],
            state: 0,
          },
        ],
      };
    for (const backend of ["canvas2d", "webgl2"] as const) {
      for (const doc of [base, masked, matted]) {
        let diagnostics: ReturnType<typeof d.passageDiagnostics> = [];
        try {
          const preview = m.createCompositionPreview(
            document.createElement("canvas"),
            doc,
            resources,
            { backend },
          );
          preview.dispose();
        } catch (error) {
          diagnostics = d.passageDiagnostics(error);
        }
        const failure = diagnostics.find(
          (x) => x.code === "comp-camera-coverage",
        );
        if (
          !failure ||
          failure.node !== "cover" ||
          failure.frame !== (doc === base ? 16 : 0)
        )
          throw Error(`${doc.id}/${backend}: ${JSON.stringify(diagnostics)}`);
        reports.push({ fixture: doc.id, backend, diagnostics });
      }
      const warning = m.createCompositionPreview(
        document.createElement("canvas"),
        base,
        resources,
        { backend, coverageSeverity: "warning" },
      );
      try {
        const report = warning.renderFrame(0);
        if (
          !report.diagnostics.some(
            (x) =>
              x.code === "comp-camera-coverage" &&
              x.severity === "warning" &&
              x.frame === 16,
          )
        )
          throw Error("Missing warning coverage diagnostic");
      } finally {
        warning.dispose();
      }
    }
    // The first affine frame succeeds; a later true perspective failure must
    // leave the last complete frame intact, including exposure preflight.
    for (const exposure of [false, true]) {
      const doc: Composition = {
          schemaVersion: "composition-1",
          id: "unsupported",
          width: 128,
          height: 96,
          fps: 24,
          frameCount: 32,
          background: "#17232e",
          assets: [],
          ...(exposure
            ? {
                motionBlur: {
                  enabled: true,
                  shutterAngle: 180,
                  shutterPhase: 0,
                  samples: 4,
                },
              }
            : {}),
          layers: [
            { id: "camera", type: "camera" },
            {
              id: "plane",
              type: "solid",
              size: [48, 40],
              color: "#ffffff",
              threeD: true,
              motionBlur: exposure,
              transform: {
                position: [64, 48, 0],
                rotationY: {
                  keys: [
                    { frame: 0, value: 0 },
                    { frame: 1, value: 0 },
                    { frame: 31, value: 30, interpolation: "linear" },
                  ],
                },
              },
            },
          ],
        },
        preview = m.createCompositionPreview(
          document.createElement("canvas"),
          doc,
          { images: new Map(), fonts: new Map() },
          { backend: "canvas2d" },
        );
      try {
        preview.renderFrame(0);
        const before = preview.readPixels();
        let diagnostics: ReturnType<typeof d.passageDiagnostics> = [];
        try {
          preview.renderFrame(31);
        } catch (error) {
          diagnostics = d.passageDiagnostics(error);
        }
        if (!diagnostics.some((x) => x.code === "comp-feature-backend"))
          throw Error(
            `Expected Canvas perspective diagnostic: ${JSON.stringify(diagnostics)}`,
          );
        const after = preview.readPixels();
        if (before.some((x, i) => x !== after[i]))
          throw Error("Backend rejection changed the last complete frame");
        reports.push({
          fixture: "unsupported",
          exposure,
          diagnostics,
          previousFrame: "unchanged",
        });
      } finally {
        preview.dispose();
      }
    }
    return reports;
  }, manifest);
  assert.equal(result.length, 8);
  return result;
}
