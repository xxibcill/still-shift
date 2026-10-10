import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BoxGeometry } from "three";
import { createServer } from "vite";
import { beforeAll, describe, expect, it } from "vitest";
import {
  MechanismGeometrySchema,
  MechanismSceneSchema,
  type MechanismScene,
  type Composition,
} from "@still-shift/scene-contract";
import {
  evaluateMechanismFrame,
  prepareMechanismScene,
} from "@still-shift/renderer-core";
import {
  assertPinnedRenderEnvironment,
  launchRenderBrowser,
  probeRenderEnvironment,
} from "@still-shift/execution-runtime/render-browser";
import {
  canonicalMechanismHash,
  captureMechanismPlates,
  type MechanismCaptureResult,
} from "../../packages/animation-engine/src/mechanism/capture.ts";
import { checkMechanismFrames } from "../../packages/animation-engine/src/mechanism/assertions.ts";
import {
  loadComposition,
  renderComposition,
} from "../../packages/animation-engine/src/composition-render.ts";
import { mediaPngPixels } from "../helpers/composition-media-png.ts";
import type { captureMechanismCompositionPreviews } from "../helpers/mechanism-bridge-preview.ts";

const width = 96,
  height = 96;
const background = [31, 83, 139];
const sourceOrder = [0, 1, 2, 3, 4, 4, 2, 0, 3, 1, 0];
const previewOrder = [0, 4, 8, 2, 10, 3, 4, 0, 9, 1, 8, 5, 7, 6];
const fontPath = fileURLToPath(
  new URL(
    "../../assets/story-motion/fonts/plex-sans-semibold.ttf",
    import.meta.url,
  ),
);
const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
let directory: string;
let scene: MechanismScene;
let captured: MechanismCaptureResult;
let sourcePixels: Buffer[];
let compositionPath: string;
let bridgeReport: Record<string, unknown>;

function cube(
  id: string,
  partId: string,
  size: [number, number, number],
  position: [number, number, number],
) {
  const geometry = new BoxGeometry(...size).translate(...position);
  geometry.computeBoundingBox();
  const mesh = {
    id,
    partId,
    materialId: "red-emission",
    positions: Array.from(geometry.getAttribute("position").array),
    normals: Array.from(geometry.getAttribute("normal").array),
    indices: Array.from(geometry.getIndex()!.array),
    groups: [{ start: 0, count: geometry.getIndex()!.count, materialIndex: 0 }],
    bounds: {
      min: geometry.boundingBox!.min.toArray(),
      max: geometry.boundingBox!.max.toArray(),
    },
  };
  geometry.dispose();
  return mesh;
}

function fixtureScene() {
  const geometry = MechanismGeometrySchema.parse({
    schemaVersion: "mechanism-geometry-1",
    meshes: [
      cube("hook-box", "hook", [0.18, 1.4, 1.3], [-0.09, 0, 0]),
      cube("fixed-rivet", "blade", [0.05, 0.05, 0.05], [0.6, 0, 0]),
    ],
    materials: [
      {
        id: "red-emission",
        color: "#000000",
        metalness: 0,
        roughness: 1,
        emissive: "#de4b22",
        emissiveIntensity: 1,
      },
    ],
    dimensions: {
      hookThickness: 0.18,
      hookTravel: 0.18,
      bladeLength: 0.6,
      bladeWidth: 0.05,
    },
  });
  return MechanismSceneSchema.parse({
    schemaVersion: "mechanism-scene-1",
    id: "bridge-alpha-seek",
    geometrySha256: canonicalMechanismHash(geometry),
    coordinateSystem: "right-handed-y-up",
    units: { kind: "illustrative", scaleToMeters: 0.01 },
    geometry,
    parts: [
      { id: "model", transform: { rotation: [0, 0, 0.31] } },
      { id: "hook", parent: "model" },
      { id: "blade", parent: "model", visible: false },
    ],
    rigs: [
      {
        id: "slider",
        type: "tape-hook-slider",
        rootPart: "model",
        hookPart: "hook",
        bladePart: "blade",
        rivetMeshIds: ["fixed-rivet"],
        thickness: 0.18,
        travelKeys: [
          { frame: 0, value: 0, easing: "smoothstep" },
          { frame: 4, value: 1 },
        ],
      },
    ],
    anchors: [
      {
        id: "hook.innerFace",
        part: "hook",
        position: [0, 0, 0],
        role: "physical-inner-face",
      },
      {
        id: "hook.outerFace",
        part: "hook",
        position: [-0.18, 0, 0],
        role: "physical-outer-face",
      },
    ],
    camera: {
      position: [3, 2, 4],
      target: [0, 0, 0],
      fovDegrees: 35,
      near: 0.03,
      far: 30,
    },
    profile: {
      toneMapping: "aces-filmic",
      exposure: 1.14,
      output: "srgb-rgba8-straight",
      transparent: true,
      background: "#000000",
      environmentIntensity: 0,
    },
    lights: [],
  });
}

function difference(actual: Uint8Array, expected: Uint8Array) {
  expect(actual.length).toBe(expected.length);
  let maximum = 0;
  for (let byte = 0; byte < actual.length; byte++)
    maximum = Math.max(maximum, Math.abs(actual[byte]! - expected[byte]!));
  return maximum;
}

function independentSrgbOver(source: Uint8Array) {
  const output = Buffer.alloc(source.length);
  for (let offset = 0; offset < source.length; offset += 4) {
    const alpha = source[offset + 3]! / 255;
    for (let channel = 0; channel < 3; channel++)
      output[offset + channel] = Math.round(
        source[offset + channel]! * alpha + background[channel]! * (1 - alpha),
      );
    output[offset + 3] = 255;
  }
  return output;
}

/** Independent delivery oracle: PNG8 declares BT.709 RGB transfer rather than sRGB. */
function independentBt709Transfer(source: Uint8Array) {
  return Buffer.from(
    source.map((byte, index) => {
      if (index % 4 === 3) return byte;
      const srgb = byte / 255;
      const linear =
        srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      const encoded =
        linear < 0.018 ? 4.5 * linear : 1.099 * linear ** 0.45 - 0.099;
      return Math.round(encoded * 255);
    }),
  );
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "still-shift-mechanism-bridge-"));
  scene = fixtureScene();
  const prepared = prepareMechanismScene(scene);
  const rows = sourceOrder.map((frame) => {
    const request = { frame, width, height };
    return {
      shotId: "compact-alpha",
      request,
      frame: evaluateMechanismFrame(prepared, request),
    };
  });
  const mechanics = checkMechanismFrames(scene, rows);
  expect(mechanics.valid).toBe(true);
  const started = performance.now();
  captured = await captureMechanismPlates({
    scene,
    width,
    height,
    fps: 24,
    frames: rows.map((row) => row.frame),
    shotId: "compact-alpha",
    outputDirectory: join(directory, "plates"),
    font: {
      path: fontPath,
      sha256: hash(await readFile(fontPath)),
      weight: "600",
      family: "IBM Plex Sans",
    },
  });
  sourcePixels = await Promise.all(
    captured.frames.map(async (frame) =>
      mediaPngPixels(
        await readFile(join(captured.outputDirectory, frame.path)),
      ),
    ),
  );
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: "mechanism-native-alpha",
    width,
    height,
    fps: 24,
    frameCount: sourceOrder.length,
    background: "#1f538b",
    colorSpace: "srgb",
    assets: [
      {
        id: "plates",
        type: "sequence",
        path: captured.patternPath,
        firstFrame: 0,
        manifestPath: captured.sequenceManifestPath,
        sha256: captured.sequenceManifestSha256,
        width,
        height,
        frameCount: sourceOrder.length,
        frameRate: { numerator: 24, denominator: 1 },
        color: {
          primaries: "bt709",
          transfer: "iec61966-2-1",
          matrix: "gbr",
          range: "pc",
        },
      },
    ],
    layers: [
      {
        id: "mechanism",
        type: "sequence",
        asset: "plates",
        transform: { anchor: [0, 0] },
      },
    ],
  };
  compositionPath = join(directory, "composition.json");
  await writeFile(compositionPath, JSON.stringify(composition, null, 2) + "\n");
  bridgeReport = {
    schemaVersion: "mechanism-bridge-proof-1",
    directory,
    sourceOrder,
    previewOrder,
    width,
    height,
    mechanics,
    capture: captured,
    captureSeconds: (performance.now() - started) / 1000,
    nodeRssBytes: process.memoryUsage().rss,
  };
  await writeFile(
    join(directory, "proof-report.json"),
    JSON.stringify(bridgeReport, null, 2) + "\n",
  );
  process.stdout.write(
    `BRIDGE_RUNTIME_EVIDENCE ${JSON.stringify({ directory, captureSeconds: bridgeReport.captureSeconds, nodeRssBytes: bridgeReport.nodeRssBytes })}\n`,
  );
}, 120_000);

describe("actual Three plate bridge", () => {
  it("captures real transparent antialiased edges and preserves exact state and plate hashes across repeated reverse random seeking", async () => {
    const sidecar = JSON.parse(await readFile(captured.sidecarPath, "utf8"));
    const originals = new Map<number, number>();
    const partialEdges = [];
    for (const [ordinal, frame] of sourceOrder.entries()) {
      const previous = originals.get(frame);
      if (previous === undefined) originals.set(frame, ordinal);
      else {
        expect(captured.frames[ordinal]!.sha256).toBe(
          captured.frames[previous]!.sha256,
        );
        for (const field of [
          "sourceFrame",
          "seed",
          "camera",
          "parts",
          "rigs",
          "anchors",
          "assertions",
          "protectedRegions",
        ])
          expect(sidecar.frames[ordinal][field]).toEqual(
            sidecar.frames[previous][field],
          );
      }
      let partial = 0,
        opaque = 0,
        clear = 0;
      const samples = [];
      for (
        let offset = 0;
        offset < sourcePixels[ordinal]!.length;
        offset += 4
      ) {
        const rgba = Array.from(
          sourcePixels[ordinal]!.subarray(offset, offset + 4),
        );
        if (rgba[3] === 0) clear++;
        else if (rgba[3] === 255) opaque++;
        else {
          partial++;
          if (samples.length < 5) samples.push(rgba);
        }
      }
      expect(partial).toBeGreaterThan(0);
      expect(opaque).toBeGreaterThan(0);
      expect(clear).toBeGreaterThan(0);
      const opaqueColors = new Map<string, number>();
      for (
        let offset = 0;
        offset < sourcePixels[ordinal]!.length;
        offset += 4
      ) {
        if (sourcePixels[ordinal]![offset + 3] !== 255) continue;
        const key = sourcePixels[ordinal]!.subarray(offset, offset + 3).join(
          ",",
        );
        opaqueColors.set(key, (opaqueColors.get(key) ?? 0) + 1);
      }
      const interiorColor = [...opaqueColors]
        .sort((a, b) => b[1] - a[1])[0]![0]
        .split(",")
        .map(Number);
      let maximumStraightEdgeColorError = 0;
      for (
        let offset = 0;
        offset < sourcePixels[ordinal]!.length;
        offset += 4
      ) {
        const alpha = sourcePixels[ordinal]![offset + 3]!;
        if (alpha === 0 || alpha === 255) continue;
        for (let channel = 0; channel < 3; channel++)
          maximumStraightEdgeColorError = Math.max(
            maximumStraightEdgeColorError,
            Math.abs(
              sourcePixels[ordinal]![offset + channel]! -
                interiorColor[channel]!,
            ),
          );
      }
      // Four-sample coverage plus RGBA8 unpremultiplication can round at most two RGB bytes.
      expect(
        maximumStraightEdgeColorError,
        `straight edge source frame ${frame}`,
      ).toBeLessThanOrEqual(2);
      partialEdges.push({
        interiorColor,
        maximumStraightEdgeColorError,
        ordinal,
        sourceFrame: frame,
        partial,
        opaque,
        clear,
        samples,
      });
    }
    expect(
      new Set(
        [...originals.values()].map(
          (ordinal) => captured.frames[ordinal]!.sha256,
        ),
      ).size,
    ).toBe(5);
    bridgeReport.partialEdges = partialEdges;
    await writeFile(
      join(directory, "proof-report.json"),
      JSON.stringify(bridgeReport, null, 2) + "\n",
    );
  });

  it("composites the already tone-mapped sRGB plate over a known background within one byte on each native backend and preserves each backend's own preview/export hashes", async () => {
    const loaded = await loadComposition(compositionPath, "canvas2d", {
      cacheDirectory: join(directory, "media-cache"),
    });
    const root = resolve(import.meta.dirname, "../..");
    const server = await createServer({
      root,
      configFile: false,
      cacheDir: join(directory, "vite"),
      logLevel: "error",
      server: {
        host: "127.0.0.1",
        port: 0,
        watch: null,
        fs: { allow: [root, directory] },
      },
    });
    let browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
    try {
      await server.listen();
      browser = await launchRenderBrowser();
      const page = await browser.newPage();
      await page.addInitScript("window.__name=(fn)=>fn;");
      await page.goto(server.resolvedUrls!.local[0]!);
      const environment = await probeRenderEnvironment(page);
      assertPinnedRenderEnvironment(environment);
      await page.addScriptTag({
        type: "module",
        content:
          "import {captureMechanismCompositionPreviews} from '/tests/helpers/mechanism-bridge-preview.ts';window.mechanismBridgeProof=captureMechanismCompositionPreviews;",
      });
      await page.waitForFunction(() => "mechanismBridgeProof" in window);
      const previews = await page.evaluate(
        async (json) => {
          const proof = (
            window as unknown as {
              mechanismBridgeProof: typeof captureMechanismCompositionPreviews;
            }
          ).mechanismBridgeProof;
          return proof(
            JSON.parse(json) as Parameters<
              typeof captureMechanismCompositionPreviews
            >[0],
          );
        },
        JSON.stringify({
          composition: loaded.composition,
          preparedMedia: loaded.preparedMedia!,
          assetPaths: loaded.assetPaths,
          order: previewOrder,
        }),
      );
      const reports = [];
      for (const preview of previews) {
        const tolerance = { canvas2d: 1, webgl2: 1 }[preview.backend];
        const previewDirectory = join(directory, `${preview.backend}-preview`);
        await mkdir(previewDirectory);
        for (const row of preview.frames)
          await writeFile(
            join(previewDirectory, `${row.frame}.rgba`),
            Buffer.from(row.pixelsBase64, "base64"),
          );
        const hashes = new Map<number, string>();
        let maximumBlendError = 0,
          maximumPreviewExportError = 0;
        for (const row of preview.frames) {
          expect(row.sha256).toBe(row.freshHash);
          if (hashes.has(row.frame))
            expect(row.sha256).toBe(hashes.get(row.frame));
          hashes.set(row.frame, row.sha256);
          const actual = Buffer.from(row.pixelsBase64, "base64");
          const error = difference(
            actual,
            independentSrgbOver(sourcePixels[row.frame]!),
          );
          maximumBlendError = Math.max(maximumBlendError, error);
          expect(
            error,
            `${preview.backend} independent blend frame ${row.frame}`,
          ).toBeLessThanOrEqual(tolerance);
        }
        const outputDirectory = join(directory, preview.backend);
        await mkdir(outputDirectory);
        const rendered = await renderComposition({
          compositionPath,
          outputPath: join(outputDirectory, "%06d.png"),
          backend: preview.backend,
          format: "png8",
          cacheDirectory: join(directory, "media-cache"),
        });
        for (let frame = 0; frame < sourceOrder.length; frame++) {
          const pixels = mediaPngPixels(
            await readFile(
              join(outputDirectory, `${String(frame).padStart(6, "0")}.png`),
            ),
          );
          const original = preview.frames.find((row) => row.frame === frame)!;
          const error = difference(
            pixels,
            independentBt709Transfer(
              Buffer.from(original.pixelsBase64, "base64"),
            ),
          );
          maximumPreviewExportError = Math.max(
            maximumPreviewExportError,
            error,
          );
          expect(
            error,
            `${preview.backend} preview/export frame ${frame}`,
          ).toBeLessThanOrEqual(tolerance);
          expect(
            difference(
              pixels,
              independentBt709Transfer(
                independentSrgbOver(sourcePixels[frame]!),
              ),
            ),
            `${preview.backend} export blend frame ${frame}`,
          ).toBeLessThanOrEqual(tolerance);
        }
        reports.push({
          backend: preview.backend,
          toleranceBytes: tolerance,
          maximumBlendError,
          maximumPreviewExportError,
          repeatedAndFreshHashes: "exact",
          frameHashes: Object.fromEntries(hashes),
          rendered,
        });
      }
      bridgeReport.native = {
        environment,
        compositionPath,
        background,
        blend: "round(sourceSrgbByte*alpha+backgroundSrgbByte*(1-alpha))",
        exportTransfer:
          "PNG8 declared sRGB → linear-light → BT.709 transfer; independent formula applied before preview/export byte comparison",
        doubleToneMapping:
          "opaque plate pixels retain captured sRGB values; partially covered pixels use only source-over alpha",
        backendComparison:
          "each backend checked against independent blend and its own fresh/reused preview and export",
        reports,
      };
      await writeFile(
        join(directory, "proof-report.json"),
        JSON.stringify(bridgeReport, null, 2) + "\n",
      );
      process.stdout.write(
        `BRIDGE_NATIVE_EVIDENCE ${JSON.stringify({ directory, reports: reports.map((report) => ({ backend: report.backend, maximumBlendError: report.maximumBlendError, maximumPreviewExportError: report.maximumPreviewExportError })) })}\n`,
      );
    } catch (error) {
      await writeFile(
        join(directory, "failure.json"),
        JSON.stringify(
          {
            error: String(error),
            cause: String((error as Error).cause),
            context: (error as { context?: unknown }).context,
          },
          null,
          2,
        ) + "\n",
      );
      throw error;
    } finally {
      await browser?.close();
      await server.close();
    }
  }, 120_000);
});
