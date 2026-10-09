import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import {
  CompositionSchema,
  StorySceneSchema,
  type Composition,
  type TextNode,
} from "@still-shift/scene-contract";
import type * as Renderer from "@still-shift/renderer-core";
import type * as Shaping from "../../packages/renderer-core/src/shaped-text.ts";
import { compileStoryComposition } from "../../packages/animation-engine/src/composition-compile.ts";
import {
  loadComposition,
  renderComposition,
} from "../../packages/animation-engine/src/composition-render.ts";
import { lintCompositionFile } from "../../packages/animation-engine/src/composition-lint.ts";
import { resolveDisplayedText } from "../../packages/renderer-core/src/typography-transition.ts";
import { compositionQualityFrame } from "../../packages/renderer-core/src/composition/quality-samples.ts";
import {
  createMechanismSemanticTypographyContractSources,
  createMechanismSemanticTypographyFixtures,
  MECHANISM_SEMANTIC_FONTS,
  MECHANISM_SEMANTIC_HISTORICAL_INPUTS,
  type MechanismSemanticTypographyInput,
} from "../helpers/mechanism-semantic-typography-proof.ts";

const sha256 = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const run = promisify(execFile);
type Rect = { left: number; top: number; right: number; bottom: number };

function pixelMetrics(
  pixels: Uint8Array,
  width: number,
  rect: Rect,
  scale = 1,
) {
  const left = Math.max(0, Math.floor(rect.left * scale));
  const right = Math.min(width, Math.ceil(rect.right * scale));
  const top = Math.max(0, Math.floor(rect.top * scale));
  const bottom = Math.min(
    pixels.length / 4 / width,
    Math.ceil(rect.bottom * scale),
  );
  const gray: number[] = [];
  let darkPixels = 0;
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) {
      const index = (y * width + x) * 4;
      const luma =
        0.2126 * pixels[index]! +
        0.7152 * pixels[index + 1]! +
        0.0722 * pixels[index + 2]!;
      gray.push(luma);
      if (luma < 150) darkPixels++;
    }
  gray.sort((a, b) => a - b);
  return {
    rect: { left, top, right, bottom },
    sampledPixels: gray.length,
    darkPixels,
    p10Luma: gray[Math.floor(gray.length * 0.1)] ?? null,
    minimumLuma: gray[0] ?? null,
  };
}

function comparePixels(
  actual: Uint8Array,
  expected: Uint8Array,
  width: number,
  rect: Rect,
) {
  assert.equal(actual.length, expected.length);
  let squared = 0,
    samples = 0,
    changedPixels = 0;
  for (
    let y = Math.max(0, Math.floor(rect.top));
    y < Math.min(actual.length / 4 / width, Math.ceil(rect.bottom));
    y++
  )
    for (
      let x = Math.max(0, Math.floor(rect.left));
      x < Math.min(width, Math.ceil(rect.right));
      x++
    ) {
      const i = (y * width + x) * 4;
      let changed = false;
      for (let c = 0; c < 3; c++) {
        const delta = actual[i + c]! - expected[i + c]!;
        squared += delta * delta;
        samples++;
        changed ||= Math.abs(delta) > 4;
      }
      if (changed) changedPixels++;
    }
  return {
    samples,
    changedPixels,
    psnr:
      squared === 0 ? null : 10 * Math.log10((255 * 255) / (squared / samples)),
    exact: squared === 0,
  };
}

/** Spatial evidence only: faint/subthreshold ink remains outside this check. */
function strongInkCoverage(
  actual: Uint8Array,
  reference: Uint8Array,
  width: number,
  rect: Rect,
) {
  const height = actual.length / 4 / width;
  const count = (source: Uint8Array, target: Uint8Array) => {
    let inkPixels = 0,
      unmatchedPixels = 0;
    for (
      let y = Math.max(0, Math.floor(rect.top));
      y < Math.min(height, Math.ceil(rect.bottom));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(rect.left));
        x < Math.min(width, Math.ceil(rect.right));
        x++
      ) {
        if (246 - source[(y * width + x) * 4]! <= 64) continue;
        inkPixels++;
        let matched = false;
        for (let dy = -1; dy <= 1 && !matched; dy++)
          for (let dx = -1; dx <= 1 && !matched; dx++)
            if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height)
              matched = 246 - target[((y + dy) * width + x + dx) * 4]! > 64;
        if (!matched) unmatchedPixels++;
      }
    return { inkPixels, unmatchedPixels };
  };
  return {
    method: "local-strong-ink-mutual-neighborhood",
    inkThreshold: 64,
    neighborhoodRadius: 1,
    actual: count(actual, reference),
    reference: count(reference, actual),
    limitation:
      "Subthreshold ink and details within1px of other ink are unassessed",
  };
}

async function rawPixels(path: string, width?: number): Promise<Buffer> {
  const args = ["-v", "error", "-i", path];
  if (width) args.push("-vf", `scale=${width}:-1:flags=lanczos`);
  args.push("-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1");
  const result = await run("ffmpeg", args, {
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.stdout;
}

/** Hermetic by default. Explicit historical acceptance reads private inputs and retains them locally. */
export async function runMechanismSemanticTypographyProof(
  options: { outputDirectory?: string; historicalInputs?: boolean } = {},
) {
  const root = resolve(import.meta.dirname, "../..");
  const output =
    options.outputDirectory ??
    (await mkdtemp(
      join("/private/tmp", "still-shift-ms1-semantic-typography-"),
    ));
  await mkdir(output, { recursive: true });
  const startedAt = new Date().toISOString();
  const evidence: Record<string, unknown> = {
    schemaVersion: "mechanism-ms1-semantic-typography-evidence-1",
    startedAt,
    outputDirectory: output,
    status: "running",
    humanAcceptance: "pending",
    numericalTruth: "unassessed",
    sourceBasis: options.historicalInputs
      ? "historical-hashed-source"
      : "hermetic-authored-contract",
    failures: [],
    cases: [],
  };
  const sourcePaths = [
    "tests/browser/mechanism-semantic-typography-proof.ts",
    "tests/helpers/mechanism-semantic-typography-proof.ts",
    "packages/renderer-core/src/index.ts",
    "packages/renderer-core/src/composition/quality-policy.ts",
    "packages/renderer-core/src/composition/quality-samples.ts",
    "packages/renderer-core/src/composition/quality-render.ts",
    "packages/renderer-core/src/composition/typography-source-frame.ts",
    "packages/renderer-core/src/composition/adapters/numeric-typography.ts",
    "packages/renderer-core/src/composition/semantic-quality.ts",
    "packages/renderer-core/src/story-quality.ts",
    "packages/renderer-core/src/typography-transition.ts",
    "packages/renderer-core/src/typography-animation.ts",
    "packages/renderer-core/src/typography-renderer.ts",
    "packages/animation-engine/src/composition-compile.ts",
    "packages/animation-engine/src/composition-lint.ts",
    "packages/animation-engine/src/composition-render.ts",
    "tools/still-shift-cli/src/composition/commands.ts",
  ];
  const sourceHashes = async () =>
    Object.fromEntries(
      await Promise.all(
        sourcePaths.map(async (path) => [
          path,
          sha256(await readFile(resolve(root, path))),
        ]),
      ),
    );
  const startedSourceHashes = await sourceHashes();
  evidence.source = {
    head: (
      await run("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim(),
    method: "working-tree-byte-hash-snapshot",
    files: startedSourceHashes,
  };
  const save = () =>
    writeFile(
      join(output, "result.json"),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
  await save();
  console.log(`Semantic typography evidence: ${output}`);
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  let browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
  try {
    const fonts = {} as MechanismSemanticTypographyInput["fonts"];
    await mkdir(join(output, "assets"), { recursive: true });
    for (const key of ["semibold", "medium", "thai"] as const) {
      const expected = MECHANISM_SEMANTIC_FONTS[key];
      const source = resolve(root, expected.path);
      assert.equal(`sha256:${sha256(await readFile(source))}`, expected.sha256);
      const path = join(output, "assets", basename(source));
      await copyFile(source, path);
      fonts[key] = {
        id: key,
        type: "font",
        path,
        sha256: expected.sha256,
        weight: expected.weight,
        ...(key === "thai"
          ? { variable: MECHANISM_SEMANTIC_FONTS.thai.axes }
          : {}),
      };
    }
    const historical = options.historicalInputs
      ? ({} as MechanismSemanticTypographyInput["historical"])
      : createMechanismSemanticTypographyContractSources(fonts);
    const inputs = [];
    for (const key of ["ss02", "ss03", "ss04"] as const) {
      if (!options.historicalInputs) {
        const bytes = `${JSON.stringify(historical[key], null, 2)}\n`;
        await writeFile(join(output, `${key}-generated-contract.json`), bytes);
        inputs.push({
          id: key,
          basis: "hermetic-authored-contract",
          sha256: sha256(bytes),
          frameCount: historical[key].frameCount,
          fps: historical[key].fps,
        });
        continue;
      }
      const expected = MECHANISM_SEMANTIC_HISTORICAL_INPUTS[key];
      const bytes = await readFile(expected.path);
      assert.equal(sha256(bytes), expected.sha256);
      await writeFile(join(output, `${key}-original.json`), bytes);
      historical[key] = await compileStoryComposition(
        StorySceneSchema.parse(JSON.parse(bytes.toString())),
        dirname(expected.path),
      );
      for (const asset of historical[key].assets) {
        const source = resolve(dirname(expected.path), asset.path);
        const target = join(
          output,
          "assets",
          `${asset.id}-${basename(source)}`,
        );
        await copyFile(source, target);
        asset.path = target;
        assert.equal(`sha256:${sha256(await readFile(target))}`, asset.sha256);
      }
      inputs.push({
        id: key,
        originalPath: expected.path,
        sha256: expected.sha256,
        unchangedFrameCount: historical[key].frameCount,
        unchangedFps: historical[key].fps,
      });
    }
    evidence.inputs = inputs;
    evidence.fonts = fonts;
    evidence.scope =
      "Declared copy and measured layer context plus actual H.264/native and 360-wide decoded states; no factual intermediate quantity assertion or human comprehension verdict";
    const fixtures = createMechanismSemanticTypographyFixtures({
      historical,
      fonts,
      basis: options.historicalInputs
        ? "historical-hashed-source"
        : "hermetic-authored-contract",
    });
    server = await createServer({
      root,
      cacheDir: join(output, "vite-cache"),
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, fs: { allow: [root, output] } },
    });
    await server.listen();
    browser = await launchRenderBrowser();
    const page = await browser.newPage();
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(String(error)));
    evidence.browserErrors = browserErrors;
    await page.addInitScript("window.__name = fn => fn;");
    await page.goto(server.resolvedUrls!.local[0]!);
    await page.addScriptTag({
      type: "module",
      content: `import * as renderer from ${JSON.stringify(`/@fs/${root}/packages/renderer-core/src/index.ts`)}; import * as shaping from ${JSON.stringify(`/@fs/${root}/packages/renderer-core/src/shaped-text.ts`)}; globalThis.__semanticProof = {renderer,shaping};`,
    });
    await page.waitForFunction(() => "__semanticProof" in globalThis);
    for (const fixture of fixtures) {
      const directory = join(output, fixture.id);
      await mkdir(directory, { recursive: true });
      const sourcePath = join(directory, "composition.json");
      const reloadedPath = join(directory, "reloaded.json");
      const sourceBytes = `${JSON.stringify(fixture.composition, null, 2)}\n`;
      await writeFile(sourcePath, sourceBytes);
      const reloaded = CompositionSchema.parse(
        JSON.parse(await readFile(sourcePath, "utf8")),
      );
      assert.deepEqual(reloaded.metadata?.readingPolicy, fixture.policy);
      await writeFile(reloadedPath, `${JSON.stringify(reloaded, null, 2)}\n`);
      const loaded = await loadComposition(reloadedPath);
      assert.deepEqual(loaded.composition, reloaded);
      const probe = await page.evaluate(
        async ({ compositionJson, frames }) => {
          const composition = JSON.parse(compositionJson) as Composition;
          const { renderer, shaping } = (
            globalThis as typeof globalThis & {
              __semanticProof: {
                renderer: typeof Renderer;
                shaping: typeof Shaping;
              };
            }
          ).__semanticProof;
          const resources = await renderer.loadCompositionResources(
            composition,
            (id) =>
              `/@fs/${composition.assets.find((asset) => asset.id === id)!.path}`,
          );
          const canvas = document.createElement("canvas");
          const preview = renderer.createCompositionPreview(
            canvas,
            composition,
            resources,
            { backend: "canvas2d" },
          );
          try {
            let quality:
              | ReturnType<typeof renderer.analyzeCompositionQuality>
              | undefined;
            let error:
              | ReturnType<typeof renderer.passageDiagnostics>
              | undefined;
            try {
              quality = renderer.analyzeCompositionQuality(composition, {
                evaluation: { textBounds: preview.textBounds },
              });
            } catch (caught) {
              error = renderer.passageDiagnostics(caught);
            }
            const phrase = composition.layers.find(
              (layer) => layer.id === "phrase" && layer.type === "text",
            );
            const samples = [];
            for (const frame of frames) {
              preview.renderFrame(frame);
              const png = canvas.toDataURL();
              const tree = renderer.evaluateComp(composition, frame, {
                textBounds: preview.textBounds,
              });
              const text = tree.layers
                .filter((layer) => layer.layer.type === "text")
                .map((layer) => ({
                  id: layer.id,
                  text:
                    layer.text ??
                    (layer.layer.type === "text" ? layer.layer.text : ""),
                  bounds: layer.bounds,
                  opacity: layer.opacity,
                  reveal: layer.reveal ?? 1,
                  state: layer.state ?? 0,
                }));
              let intact:
                | {
                    clusters: string[];
                    uniformPose: boolean;
                    maskNone: boolean;
                    controlPng: string;
                    comparison: { changedPixels: number; maximumDelta: number };
                    representativePose: {
                      x: number;
                      y: number;
                      opacity: number;
                      anchorX: number;
                      anchorY: number;
                    };
                    inkRegions: {
                      id: string;
                      kind: "word" | "upper-mark" | "lower-mark";
                      rect: Rect;
                    }[];
                    coverage: {
                      actual: { energy: number; bbox: number[] | null };
                      reference: { energy: number; bbox: number[] | null };
                      inkThreshold: number;
                      neighborhoodRadius: number;
                      unmatchedActualPixels: number;
                      unmatchedReferencePixels: number;
                    };
                  }
                | undefined;
              if (phrase?.type === "text") {
                const node = {
                  ...phrase,
                  x: 0,
                  y: 0,
                  width: 0,
                  height: 0,
                  opacity: 1,
                  rotation: 0,
                  origin: [0, 0] as [number, number],
                  font: "sans-serif" as const,
                  weight: "normal" as const,
                  align: phrase.align ?? "left",
                  color:
                    typeof phrase.color === "string" ? phrase.color : "#14252b",
                };
                const layout = shaping.shapeText(
                  document.createElement("canvas").getContext("2d")!,
                  node,
                  phrase.text,
                  resources.fonts,
                  composition.textStyles,
                );
                const poses = renderer.evaluateTextPoses(
                  node,
                  layout,
                  composition.textAnimators ?? [],
                  frame,
                  composition,
                );
                const pose = poses[0]!;
                const uniformPose = poses.every(
                  (other) =>
                    other.x === pose.x &&
                    other.y === pose.y &&
                    other.opacity === pose.opacity &&
                    other.scale === pose.scale &&
                    other.rotation === pose.rotation &&
                    other.anchorX === pose.anchorX &&
                    other.anchorY === pose.anchorY,
                );
                const control = structuredClone(composition);
                control.textAnimators = [];
                const layer = control.layers.find(
                  (entry) => entry.id === "phrase",
                )!;
                const state = tree.layers.find(
                  (entry) => entry.id === "phrase",
                )!;
                layer.transform = {
                  position: [
                    state.transform.position[0] + pose.x,
                    state.transform.position[1] + pose.y,
                  ],
                  opacity: state.opacity * pose.opacity,
                };
                const controlCanvas = document.createElement("canvas");
                const controlPreview = renderer.createCompositionPreview(
                  controlCanvas,
                  control,
                  resources,
                  { backend: "canvas2d" },
                );
                try {
                  controlPreview.renderFrame(frame);
                  const actual = preview.readPixels(),
                    reference = controlPreview.readPixels();
                  const coverage = (pixels: Uint8ClampedArray) => {
                    let energy = 0,
                      left = composition.width,
                      top = composition.height,
                      right = -1,
                      bottom = -1;
                    for (let i = 0; i < pixels.length; i += 4) {
                      const ink = Math.max(0, 246 - pixels[i]!);
                      energy += ink;
                      if (ink > 4) {
                        const x = (i / 4) % composition.width,
                          y = Math.floor(i / 4 / composition.width);
                        left = Math.min(left, x);
                        right = Math.max(right, x);
                        top = Math.min(top, y);
                        bottom = Math.max(bottom, y);
                      }
                    }
                    return {
                      energy,
                      bbox: right < 0 ? null : [left, top, right, bottom],
                    };
                  };
                  let changedPixels = 0,
                    maximumDelta = 0;
                  for (let i = 0; i < actual.length; i += 4) {
                    let changed = false;
                    for (let c = 0; c < 3; c++) {
                      const delta = Math.abs(
                        actual[i + c]! - reference[i + c]!,
                      );
                      maximumDelta = Math.max(maximumDelta, delta);
                      changed ||= delta > 4;
                    }
                    if (changed) changedPixels++;
                  }
                  // Compare every ink pixel, including detached Thai marks. A
                  // shared fractional translation may change the outer AA edge
                  // by one pixel; a whole-image bbox cannot detect a lost mark.
                  const unmatchedInk = (
                    source: Uint8ClampedArray,
                    target: Uint8ClampedArray,
                  ) => {
                    let unmatched = 0;
                    for (let i = 0; i < source.length; i += 4) {
                      if (246 - source[i]! <= 4) continue;
                      const x = (i / 4) % composition.width,
                        y = Math.floor(i / 4 / composition.width);
                      let matched = false;
                      for (let dy = -1; dy <= 1 && !matched; dy++)
                        for (let dx = -1; dx <= 1 && !matched; dx++) {
                          const tx = x + dx,
                            ty = y + dy;
                          if (
                            tx >= 0 &&
                            tx < composition.width &&
                            ty >= 0 &&
                            ty < composition.height
                          )
                            matched =
                              246 - target[(ty * composition.width + tx) * 4]! >
                              4;
                        }
                      if (!matched) unmatched++;
                    }
                    return unmatched;
                  };
                  intact = {
                    clusters: layout.clusters.map((cluster) => cluster.text),
                    uniformPose,
                    maskNone: poses.every((other) => other.mask === "none"),
                    controlPng: controlCanvas.toDataURL(),
                    comparison: { changedPixels, maximumDelta },
                    representativePose: {
                      x: pose.x,
                      y: pose.y,
                      opacity: pose.opacity,
                      anchorX: pose.anchorX,
                      anchorY: pose.anchorY,
                    },
                    inkRegions: [
                      ...new Set(
                        layout.clusters
                          .filter((cluster) => cluster.text.trim())
                          .map(
                            (cluster) =>
                              `${cluster.lineIndex}:${cluster.wordIndex}`,
                          ),
                      ),
                    ].flatMap((key) => {
                      const clusters = layout.clusters.filter(
                        (cluster) =>
                          `${cluster.lineIndex}:${cluster.wordIndex}` === key &&
                          cluster.text.trim(),
                      );
                      const originX = state.transform.position[0] + pose.x,
                        originY = state.transform.position[1] + pose.y;
                      const rect = {
                        left:
                          originX +
                          Math.min(
                            ...clusters.map((cluster) => cluster.ink!.x),
                          ),
                        top:
                          originY +
                          Math.min(
                            ...clusters.map((cluster) => cluster.ink!.y),
                          ),
                        right:
                          originX +
                          Math.max(
                            ...clusters.map(
                              (cluster) => cluster.ink!.x + cluster.ink!.width,
                            ),
                          ),
                        bottom:
                          originY +
                          Math.max(
                            ...clusters.map(
                              (cluster) => cluster.ink!.y + cluster.ink!.height,
                            ),
                          ),
                      };
                      const baseline = originY + clusters[0]!.baseline;
                      return [
                        { id: key, kind: "word" as const, rect },
                        {
                          id: `${key}:upper`,
                          kind: "upper-mark" as const,
                          rect: {
                            ...rect,
                            bottom: Math.min(
                              rect.bottom,
                              baseline - phrase.fontSize! * 0.6,
                            ),
                          },
                        },
                        {
                          id: `${key}:lower`,
                          kind: "lower-mark" as const,
                          rect: {
                            ...rect,
                            top: Math.max(rect.top, baseline + 1),
                          },
                        },
                      ];
                    }),
                    coverage: {
                      actual: coverage(actual),
                      reference: coverage(reference),
                      inkThreshold: 4,
                      neighborhoodRadius: 1,
                      unmatchedActualPixels: unmatchedInk(actual, reference),
                      unmatchedReferencePixels: unmatchedInk(reference, actual),
                    },
                  };
                } finally {
                  controlPreview.dispose();
                }
              }
              samples.push({ frame, png, text, ...(intact ? { intact } : {}) });
            }
            const seekFrames = [...samples]
              .reverse()
              .concat([
                samples[Math.floor(samples.length / 2)]!,
                samples[0]!,
                samples.at(-1)!,
              ]);
            const reverseStable = seekFrames.every((sample) => {
              preview.renderFrame(sample.frame);
              return canvas.toDataURL() === sample.png;
            });
            return {
              browser: navigator.userAgent,
              textBounds: preview.textBounds,
              quality,
              error,
              reverseStable,
              samples,
            };
          } finally {
            preview.dispose();
          }
        },
        {
          compositionJson: JSON.stringify(reloaded),
          frames: fixture.snapshotFrames,
        },
      );
      assert.ok(
        probe.reverseStable,
        `${fixture.id}: repeated/backward seek changed pixels`,
      );
      await writeFile(
        join(directory, "probe.json"),
        `${JSON.stringify({ ...probe, samples: probe.samples.map(({ png: _png, intact, ...sample }) => ({ ...sample, ...(intact ? { intact: { ...intact, controlPng: undefined } } : {}) })) }, null, 2)}\n`,
      );
      const codes =
        probe.error?.map((error) => error.code) ??
        probe.quality!.diagnostics.map((diagnostic) => diagnostic.code);
      if (fixture.expectedCodes.includes("comp-lint-semantic-member"))
        assert.ok(
          probe.error && codes.includes("comp-lint-semantic-member"),
          `${fixture.id}: malformed policy must fail parsing`,
        );
      else {
        assert.equal(
          probe.quality!.semantic.status,
          fixture.expectedSemantic,
          fixture.id,
        );
        for (const code of fixture.expectedCodes)
          assert.ok(codes.includes(code), `${fixture.id}: missing ${code}`);
        if (
          fixture.id.startsWith("complete-endpoint-") ||
          fixture.id === "opaque-color-only-reading"
        ) {
          const hold = probe.quality!.readingDeclarations?.find(
            (declaration) => declaration.id === "complete-example-quantity",
          );
          assert.ok(
            hold?.eligible && hold.longestReadableFrames >= hold.requiredFrames,
            `${fixture.id}: complete authored context needs its declared reading hold`,
          );
          assert.equal(probe.quality!.status, "passed", fixture.id);
        }
        if (
          fixture.id.startsWith("intact-") ||
          fixture.id === "ss02-intact-thai-resolved"
        ) {
          const hold = probe.quality!.readingDeclarations?.find(
            (declaration) => declaration.id === "intact-phrase",
          );
          assert.ok(
            hold?.eligible && hold.longestReadableFrames === 76,
            `${fixture.id}: intact-phrase needs its actual76-frame resolved hold`,
          );
          assert.equal(probe.quality!.status, "failed", fixture.id);
          for (const [code, start, end] of [
            ["reading-time", 0, 41],
            ["frozen-run", 1, 17],
            ["frozen-run", 44, 119],
          ] as const)
            assert.ok(
              probe.quality!.diagnostics.some(
                (diagnostic) =>
                  diagnostic.code === code &&
                  diagnostic.severity === "error" &&
                  diagnostic.path &&
                  diagnostic.frames[0] === start &&
                  diagnostic.frames[1] === end,
              ),
              `${fixture.id}: retained located ${code}${start}..${end} fault`,
            );
        }
      }
      const unmeasuredPreflight = await lintCompositionFile(reloadedPath)
        .then((report) => ({
          semantic: report.semantic,
          measured: report.measured,
          diagnosticCodes: [
            ...new Set(report.diagnostics.map((diagnostic) => diagnostic.code)),
          ],
        }))
        .catch((error: unknown) => ({ error: String(error) }));
      const pure = await lintCompositionFile(reloadedPath, {
        evaluation: { textBounds: probe.textBounds },
      })
        .then((report) => ({
          semantic: report.semantic,
          codes: report.diagnostics.map((diagnostic) => diagnostic.code),
        }))
        .catch((error) => ({
          error: String(error),
          diagnostics:
            (error as { diagnostics?: { code: string; path?: string }[] })
              .diagnostics ?? [],
          codes:
            (error as { diagnostics?: { code: string }[] }).diagnostics?.map(
              (diagnostic) => diagnostic.code,
            ) ?? [],
        }));
      if (fixture.expectedCodes.includes("comp-lint-semantic-member")) {
        assert.ok(
          "error" in pure,
          `${fixture.id}: malformed saved policy must throw`,
        );
        assert.ok(
          "diagnostics" in pure &&
            pure.diagnostics.some(
              (diagnostic) =>
                diagnostic.code === "comp-lint-semantic-member" &&
                diagnostic.path?.startsWith("semanticAssociations.0.members"),
            ),
          `${fixture.id}: parser fault must retain its located member path`,
        );
      } else
        assert.ok(
          "semantic" in pure,
          `${fixture.id}: unexpected production lint exception`,
        );
      if ("semantic" in pure) {
        assert.equal(
          pure.semantic.status,
          fixture.expectedSemantic,
          `${fixture.id}: saved-policy production lint status`,
        );
        assert.equal(pure.semantic.profile, fixture.policy.semanticProfile);
        assert.deepEqual(
          pure.semantic.policy.associations,
          fixture.policy.semanticAssociations ?? [],
        );
      }
      for (const code of fixture.expectedCodes)
        assert.ok(
          pure.codes.includes(code),
          `${fixture.id}: persisted production lint lacks ${code}`,
        );
      const semanticIntervals =
        probe.quality?.semantic.associations.flatMap(
          (association) => association.violationIntervals,
        ) ?? [];
      if (fixture.id === "ss04-strict-whole-interval")
        for (const member of ["unit", "qualifier"])
          assert.ok(
            semanticIntervals.some(
              (interval) =>
                interval.member === member &&
                interval.code === "semantic-context-incomplete" &&
                interval.frames[1] === 69,
            ),
            `SS04 must identify ${member} through frame69`,
          );
      if (fixture.id === "unit-changes-mid-count") {
        assert.ok(
          semanticIntervals.some(
            (interval) =>
              interval.member === "value" &&
              interval.code === "semantic-copy-changed" &&
              interval.path === "semanticAssociations.0.members.0.text" &&
              interval.frames[0] === 44 &&
              interval.frames[1] === 119,
          ),
          "Actual displayed count must have its own exact44..119 copy-change interval",
        );
        assert.ok(
          semanticIntervals.some(
            (interval) =>
              interval.member === "unit" &&
              interval.code === "semantic-copy-changed" &&
              interval.frames[0] === 60 &&
              interval.frames[1] === 119,
          ),
          "Unit swap must have its own exact60..119 interval",
        );
      }
      if (fixture.id === "partial-retype-copy")
        assert.ok(
          semanticIntervals.some(
            (interval) =>
              interval.member === "value" &&
              interval.code === "semantic-copy-changed" &&
              interval.path === "semanticAssociations.0.members.0.text" &&
              interval.frames[0] === 31 &&
              interval.frames[1] === 119,
          ),
          "Mixed/partial retype and settled changed copy need exact31..119 located failure",
        );
      const caseResult: Record<string, unknown> = {
        id: fixture.id,
        expectedSemantic: fixture.expectedSemantic,
        expectedCodes: fixture.expectedCodes,
        sourceMetadata: fixture.sourceMetadata,
        sourceSha256: sha256(sourceBytes),
        jsonRoundtrip: true,
        productionLoadRoundtrip: true,
        reverseAndRandomSeekStable: probe.reverseStable,
        browser: probe.browser,
        measuredQuality: probe.quality ?? { parserErrors: probe.error },
        pureProductionLint: pure,
        productionApiMeasurementBasis:
          "Pinned-browser actual textBounds supplied through evaluation; saved semantic/reading policy unchanged",
        unmeasuredPreflight,
        samples: [],
      };
      if (
        [
          "complete-endpoint-en-24",
          "complete-endpoint-th-30",
          "unit-changes-mid-count",
          "missing-required-unit",
          "strict-undeclared-context",
        ].includes(fixture.id)
      ) {
        const cli = await run(
          process.execPath,
          [
            "--import",
            "tsx",
            join(root, "tools/still-shift-cli/src/cli.ts"),
            "comp",
            "lint",
            "--input",
            reloadedPath,
            "--pixels",
            "true",
          ],
          { cwd: root, maxBuffer: 4 * 1024 * 1024 },
        )
          .then((result) => ({
            code: 0,
            stdout: result.stdout,
            stderr: result.stderr,
          }))
          .catch((error: unknown) => {
            const result = error as {
              code?: number;
              stdout?: string;
              stderr?: string;
            };
            if (typeof result.code !== "number") throw error;
            return {
              code: result.code,
              stdout: result.stdout ?? "",
              stderr: result.stderr ?? "",
            };
          });
        await writeFile(join(directory, "cli-stdout.json"), cli.stdout);
        await writeFile(join(directory, "cli-stderr.json"), cli.stderr);
        const report = JSON.parse(cli.stdout || cli.stderr) as {
          status: string;
          semantic?: { status: string; profile: string };
          diagnostics: { code: string; path?: string }[];
        };
        if (fixture.expectedCodes.includes("comp-lint-semantic-member"))
          assert.ok(
            report.diagnostics.some(
              (diagnostic) =>
                diagnostic.code === "comp-lint-semantic-member" &&
                diagnostic.path?.startsWith("semanticAssociations.0.members"),
            ),
            "CLI must preserve located saved-policy errors",
          );
        else
          assert.equal(
            report.semantic?.status,
            fixture.expectedSemantic,
            `${fixture.id}: default CLI must honor saved semantic policy`,
          );
        assert.equal(cli.code, report.status === "failed" ? 1 : 0);
        if (
          fixture.id === "complete-endpoint-en-24" ||
          fixture.id === "complete-endpoint-th-30"
        ) {
          assert.equal(report.status, "passed", fixture.id);
          assert.equal(cli.code, 0, fixture.id);
        }
        caseResult.cliSavedPolicy = {
          exitCode: cli.code,
          overallQuality: report.status,
          semanticStatus: report.semantic?.status,
          diagnosticCodes: [
            ...new Set(report.diagnostics.map((diagnostic) => diagnostic.code)),
          ],
          stdoutPath: join(directory, "cli-stdout.json"),
          stderrPath: join(directory, "cli-stderr.json"),
        };
      }
      (evidence.cases as unknown[]).push(caseResult);
      await save();
      for (const sample of probe.samples) {
        const filename = `preview-${sample.frame}.png`;
        await writeFile(
          join(directory, filename),
          Buffer.from(sample.png.split(",")[1]!, "base64"),
        );
        if (sample.intact) {
          await writeFile(
            join(directory, `control-${sample.frame}.png`),
            Buffer.from(sample.intact.controlPng.split(",")[1]!, "base64"),
          );
          assert.ok(
            sample.intact.uniformPose && sample.intact.maskNone,
            `${fixture.id}: phrase split or masked`,
          );
          const coverage = sample.intact.coverage;
          assert.equal(
            coverage.unmatchedActualPixels + coverage.unmatchedReferencePixels,
            0,
            `${fixture.id}:${sample.frame}: phrase ink or detached marks differ beyond the one-pixel AA edge`,
          );
          if (coverage.actual.bbox && coverage.reference.bbox) {
            assert.ok(
              coverage.actual.bbox.every(
                (edge, index) =>
                  Math.abs(edge - coverage.reference.bbox![index]!) <= 1,
              ),
              `${fixture.id}:${sample.frame}: intact phrase extent moved or clipped`,
            );
            assert.ok(
              Math.abs(
                coverage.actual.energy / coverage.reference.energy - 1,
              ) <= 0.01,
              `${fixture.id}:${sample.frame}: intact phrase ink energy changed`,
            );
          } else
            assert.deepEqual(coverage.actual.bbox, coverage.reference.bbox);
          if (
            sample.frame >=
            Math.max(
              ...(reloaded.textAnimators ?? []).map((animator) => animator.end),
            )
          ) {
            assert.deepEqual(coverage.actual.bbox, coverage.reference.bbox);
            assert.equal(
              sample.intact.comparison.changedPixels,
              0,
              `${fixture.id}: settled full phrase coverage differs from composed control`,
            );
            assert.equal(
              sample.intact.comparison.maximumDelta,
              0,
              `${fixture.id}: settled full phrase must be pixel-exact`,
            );
          }
        }
      }
      const rendered = await renderComposition({
        compositionPath: reloadedPath,
        outputPath: join(directory, "encoded.mp4"),
        backend: "canvas2d",
        workers: 1,
        cacheStatic: false,
      });
      assert.equal(rendered.frameCount, reloaded.frameCount);
      caseResult.render = rendered;
      const metadata = await run("ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,nb_read_frames,r_frame_rate",
        "-of",
        "json",
        rendered.outputPath,
      ]);
      const stream = JSON.parse(metadata.stdout).streams[0] as {
        width: number;
        height: number;
        nb_read_frames: string;
        r_frame_rate: string;
      };
      assert.equal(Number(stream.nb_read_frames), reloaded.frameCount);
      assert.equal(stream.width, reloaded.width);
      assert.equal(stream.height, reloaded.height);
      const [fpsNumerator, fpsDenominator] = stream.r_frame_rate
        .split("/")
        .map(Number);
      assert.equal(
        fpsNumerator! / fpsDenominator!,
        reloaded.fps,
        `${fixture.id}: encoded fps`,
      );
      caseResult.ffprobe = stream;
      for (const sample of probe.samples) {
        const nativePath = join(directory, `encoded-${sample.frame}.png`);
        const reducedPath = join(directory, `encoded-${sample.frame}-360.png`);
        await run("ffmpeg", [
          "-v",
          "error",
          "-i",
          rendered.outputPath,
          "-vf",
          `select=eq(n\\,${sample.frame})`,
          "-frames:v",
          "1",
          nativePath,
        ]);
        await run("ffmpeg", [
          "-v",
          "error",
          "-i",
          nativePath,
          "-vf",
          "scale=360:-1:flags=lanczos",
          "-frames:v",
          "1",
          reducedPath,
        ]);
        const native = await rawPixels(nativePath),
          reduced = await rawPixels(reducedPath),
          reference = await rawPixels(
            join(directory, `preview-${sample.frame}.png`),
          );
        const measuredFrame = compositionQualityFrame(reloaded, sample.frame, {
          textBounds: probe.textBounds,
        });
        const memberInk = sample.text
          .filter((member) => member.bounds)
          .map((member) => {
            const layer = reloaded.layers.find(
              (layer) => layer.id === member.id,
            )!;
            assert.equal(layer.type, "text");
            const displayed = resolveDisplayedText(
              {
                ...layer,
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                opacity: 1,
                rotation: 0,
                origin: [0, 0],
                font: "sans-serif",
                weight: "normal",
                align: "left",
                color: "#14252b",
              } as TextNode,
              sample.frame,
              member.state,
            );
            const measuredCopy = measuredFrame.layers.get(member.id);
            if (
              fixture.id === "unit-changes-mid-count" &&
              member.id === "value" &&
              (sample.frame === 90 || sample.frame === 119)
            ) {
              assert.equal(measuredCopy?.text, "24");
              assert.deepEqual(displayed, { kind: "single", text: "24" });
            }
            if (fixture.id === "partial-retype-copy" && member.id === "value") {
              if (sample.frame === 59 || sample.frame === 60) {
                assert.equal(measuredCopy?.text, undefined);
                assert.deepEqual(measuredCopy?.textCopies, ["12", "24"]);
                assert.equal(displayed.kind, "transition");
              } else if (sample.frame === 90 || sample.frame === 119)
                assert.equal(measuredCopy?.text, "24");
            }
            return {
              id: member.id,
              text: member.text,
              displayedCopy: displayed,
              measuredDisplayedText: measuredCopy?.text ?? null,
              measuredTextCopies: measuredCopy?.textCopies ?? [],
              opacity: member.opacity,
              reveal: member.reveal,
              native: pixelMetrics(native, reloaded.width, member.bounds!),
              reduced: pixelMetrics(
                reduced,
                360,
                member.bounds!,
                360 / reloaded.width,
              ),
              encodedComparison: comparePixels(
                native,
                reference,
                reloaded.width,
                {
                  left: member.bounds!.left - 4,
                  top: member.bounds!.top - 4,
                  right: member.bounds!.right + 4,
                  bottom: member.bounds!.bottom + 4,
                },
              ),
            };
          });
        for (const member of memberInk)
          assert.ok(
            member.encodedComparison.exact ||
              member.encodedComparison.psnr! > 28,
            `${fixture.id}:${sample.frame}:${member.id}: encoded ink differs from preview`,
          );
        let encodedIntactControl;
        if (sample.intact) {
          const controlPath = join(directory, `control-${sample.frame}.png`);
          const controlNative = await rawPixels(controlPath),
            controlReduced = await rawPixels(controlPath, 360);
          const bounds = sample.text.find(
            (member) => member.id === "phrase",
          )!.bounds!;
          const nativeRect = {
            left: bounds.left - 4,
            top: bounds.top - 4,
            right: bounds.right + 4,
            bottom: bounds.bottom + 4,
          };
          const factor = 360 / reloaded.width;
          const reducedRect = {
            left: nativeRect.left * factor,
            top: nativeRect.top * factor,
            right: nativeRect.right * factor,
            bottom: nativeRect.bottom * factor,
          };
          encodedIntactControl = {
            method:
              "actual-decoded-H264-versus-complete-phrase-PNG; same-Lanczos-scale",
            controlPath,
            controlSha256: sha256(await readFile(controlPath)),
            native: comparePixels(
              native,
              controlNative,
              reloaded.width,
              nativeRect,
            ),
            reduced: comparePixels(reduced, controlReduced, 360, reducedRect),
            referenceInk: {
              native: pixelMetrics(controlNative, reloaded.width, bounds),
              reduced: pixelMetrics(controlReduced, 360, bounds, factor),
            },
            ...(reloaded.layers.find((layer) => layer.id === "phrase")?.type ===
              "text" &&
            (
              reloaded.layers.find((layer) => layer.id === "phrase") as {
                locale?: string;
              }
            ).locale === "th"
              ? {
                  localStrongInk: sample.intact.inkRegions.map((region) => ({
                    id: region.id,
                    kind: region.kind,
                    rect: region.rect,
                    native: strongInkCoverage(
                      native,
                      controlNative,
                      reloaded.width,
                      region.rect,
                    ),
                    reduced: strongInkCoverage(reduced, controlReduced, 360, {
                      left: region.rect.left * factor,
                      top: region.rect.top * factor,
                      right: region.rect.right * factor,
                      bottom: region.rect.bottom * factor,
                    }),
                  })),
                }
              : {}),
          };
          for (const comparison of [
            encodedIntactControl.native,
            encodedIntactControl.reduced,
          ])
            assert.ok(
              comparison.exact || comparison.psnr! > 28,
              `${fixture.id}:${sample.frame}: encoded intact phrase differs from complete-phrase control`,
            );
          for (const region of encodedIntactControl.localStrongInk ?? [])
            for (const [scale, coverage] of [
              ["native", region.native],
              ["reduced", region.reduced],
            ] as const) {
              assert.equal(
                coverage.actual.unmatchedPixels +
                  coverage.reference.unmatchedPixels,
                0,
                `${fixture.id}:${sample.frame}:${region.id}:${scale}: encoded strong-ink loss or displacement`,
              );
              if (
                sample.intact.representativePose.opacity >= 0.5 &&
                region.kind === "word"
              )
                assert.ok(
                  coverage.actual.inkPixels > 0 &&
                    coverage.reference.inkPixels > 0,
                  `${fixture.id}:${sample.frame}:${region.id}:${scale}: missing encoded word ink`,
                );
            }
          const phraseLayer = reloaded.layers.find(
            (layer) => layer.id === "phrase",
          );
          if (
            phraseLayer?.type === "text" &&
            phraseLayer.locale === "th" &&
            sample.intact.representativePose.opacity >= 0.5
          )
            for (const [kind, present] of [
              ["upper-mark", /[ัิีึื็่้๊๋ำ]/u.test(phraseLayer.text)],
              ["lower-mark", /[ุู]/u.test(phraseLayer.text)],
            ] as const)
              if (present)
                for (const scale of ["native", "reduced"] as const)
                  assert.ok(
                    encodedIntactControl.localStrongInk?.some(
                      (region) =>
                        region.kind === kind &&
                        region[scale].actual.inkPixels > 0 &&
                        region[scale].reference.inkPixels > 0,
                    ),
                    `${fixture.id}:${sample.frame}:${scale}: authored ${kind} has no encoded strong-ink evidence`,
                  );
          const upperMark = encodedIntactControl.localStrongInk?.find(
            (region) =>
              region.kind === "upper-mark" &&
              region.native.reference.inkPixels > 0,
          );
          if (upperMark && sample.intact.representativePose.opacity >= 0.5) {
            const removedMark = Buffer.from(controlNative);
            let removedStrongInkPixels = 0;
            for (
              let y = Math.max(0, Math.floor(upperMark.rect.top));
              y < Math.min(reloaded.height, Math.ceil(upperMark.rect.bottom));
              y++
            )
              for (
                let x = Math.max(0, Math.floor(upperMark.rect.left));
                x < Math.min(reloaded.width, Math.ceil(upperMark.rect.right));
                x++
              ) {
                const at = (y * reloaded.width + x) * 4;
                if (246 - removedMark[at]! > 64) {
                  removedStrongInkPixels++;
                  removedMark.set([246, 241, 231, 255], at);
                }
              }
            const detected = strongInkCoverage(
              removedMark,
              controlNative,
              reloaded.width,
              upperMark.rect,
            );
            assert.ok(
              detected.reference.unmatchedPixels > 0,
              `${fixture.id}:${sample.frame}: local detector must reject removed upper-mark strong ink`,
            );
            Object.assign(encodedIntactControl, {
              removedMarkDetectorControl: {
                method:
                  "CPU-only detector negative derived from the retained complete-phrase PNG; not an additional native export",
                region: upperMark.id,
                rect: upperMark.rect,
                removedStrongInkPixels,
                alteredRGBABytesSha256: sha256(removedMark),
                detected,
                rejected: true,
              },
            });
          }
        }
        (caseResult.samples as unknown[]).push({
          frame: sample.frame,
          nativePath,
          nativeSha256: sha256(await readFile(nativePath)),
          reducedPath,
          reducedSha256: sha256(await readFile(reducedPath)),
          memberInk,
          ...(sample.intact
            ? {
                intact: {
                  measurementBasis: "browser-preview-and-evaluated-glyph-poses",
                  clusters: sample.intact.clusters,
                  uniformPose: sample.intact.uniformPose,
                  maskNone: sample.intact.maskNone,
                  comparison: sample.intact.comparison,
                  representativePose: sample.intact.representativePose,
                  coverage: sample.intact.coverage,
                  encodedIntactControl,
                },
              }
            : {}),
        });
      }
      await writeFile(
        join(directory, "evidence.json"),
        `${JSON.stringify(caseResult, null, 2)}\n`,
      );
      await save();
      console.log(
        `Semantic typography ${fixture.id}: expected ${fixture.expectedSemantic}; ${probe.samples.length} native/reduced encoded states retained`,
      );
    }
    const results = evidence.cases as {
      id: string;
      samples: {
        frame: number;
        memberInk: {
          id: string;
          native: ReturnType<typeof pixelMetrics>;
          reduced: ReturnType<typeof pixelMetrics>;
        }[];
      }[];
    }[];
    const complete = results
      .find((result) => result.id === "complete-endpoint-en-30")!
      .samples[0]!.memberInk.find((member) => member.id === "qualifier")!;
    const faint = results
      .find((result) => result.id === "faint-qualification")!
      .samples[0]!.memberInk.find((member) => member.id === "qualifier")!;
    assert.ok(
      complete.native.darkPixels > 0 && complete.reduced.darkPixels > 0,
      "Complete qualifier must retain actual encoded dark ink at native and reduced sizes",
    );
    assert.ok(
      faint.native.p10Luma! > complete.native.p10Luma! + 50 &&
        faint.reduced.p10Luma! > complete.reduced.p10Luma! + 50,
      "Faint qualifier encoded pixels must differ materially from complete control",
    );
    evidence.faintQualificationEncodedControl = {
      complete,
      faint,
      conclusion:
        "Authored low alpha loses dark ink at both scales; matching context opacity is not a general readability verdict",
    };
    const glyphResult = results.find(
      (result) => result.id === "faint-glyph-qualification",
    )!;
    const glyph = glyphResult.samples[0]!.memberInk.find(
      (member) => member.id === "qualifier",
    )!;
    assert.equal(
      glyph.native.darkPixels,
      0,
      "Glyph opacity must retain the deliberate native faint-ink negative",
    );
    assert.equal(
      glyph.reduced.darkPixels,
      0,
      "Glyph opacity must retain the deliberate reduced faint-ink negative",
    );
    assert.ok(
      glyph.native.p10Luma! > complete.native.p10Luma! + 50 &&
        glyph.reduced.p10Luma! > complete.reduced.p10Luma! + 50,
      "Qualification glyph opacity must materially reduce actual encoded ink",
    );
    evidence.glyphOpacityReadabilityBoundary = {
      glyph,
      comparedTo: "complete-endpoint-en-30",
      semanticLayerContext: "passed",
      renderedGlyphReadability: "requires-encoded-review",
      conclusion:
        "Opaque layer context can pass while qualification glyph opacity is faint; this report does not infer readability from matching layer opacity",
    };
    evidence.status = "passed";
    assert.deepEqual(
      evidence.browserErrors,
      [],
      "Browser bootstrap/render emitted an unexpected uncaught error",
    );
    assert.deepEqual(
      await sourceHashes(),
      startedSourceHashes,
      "Measured proof source bytes changed during execution",
    );
    evidence.completedAt = new Date().toISOString();
    evidence.caseCount = fixtures.length;
    await save();
    return evidence;
  } catch (error) {
    evidence.status = "failed";
    (evidence.failures as unknown[]).push({
      at: new Date().toISOString(),
      message: String(error),
    });
    await save();
    throw error;
  } finally {
    try {
      await browser?.close();
    } finally {
      await server?.close();
    }
  }
}
