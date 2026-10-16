import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, open } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import {
  StorySceneSchema,
  inspectTextWeightTreatments,
  compileTextEvents,
  type StoryScene,
  type Composition,
  type TextNode,
} from "@still-shift/scene-contract";
import { compileStoryComposition } from "../../packages/animation-engine/src/composition-compile.ts";
import { renderComposition } from "../../packages/animation-engine/src/composition-render.ts";
import {
  inspectFontText,
  readFontIdentity,
} from "../../packages/renderer-core/src/font-identity.ts";
import { MECHANISM_SEMANTIC_FONTS } from "../helpers/mechanism-semantic-typography-proof.ts";
import type * as Renderer from "@still-shift/renderer-core";
import type * as Shaping from "../../packages/renderer-core/src/shaped-text.ts";
import type * as Axes from "../../packages/renderer-core/src/typography-axes.ts";

const run = promisify(execFile),
  root = resolve(import.meta.dirname, "../.."),
  historicalCommit = "0022840c11b76c1cf1b1705d63c96a606020fa1f";
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const backend = process.argv.includes("--canvas2d") ? "canvas2d" : "webgl2";
const width = 1920,
  height = 1080,
  frameBytes = width * height * 3;
async function fileHash(path: string) {
  const digest = createHash("sha256");
  for await (const bytes of createReadStream(path, { highWaterMark: 65536 }))
    digest.update(bytes);
  return digest.digest("hex");
}
const output = await mkdtemp(join(tmpdir(), "still-shift-ms2-weight46-"));
const evidence: Record<string, unknown> = {
  version: "mechanism-text-weight-render-proof-1",
  status: "running",
  output,
  backend,
  historicalCommit,
  cases: [],
};
const results = evidence.cases as Record<string, unknown>[];
let server: Awaited<ReturnType<typeof createServer>> | undefined;
let browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
const write = async () =>
  writeFile(join(output, "run.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify({ status: "started", output }));
await write();
try {
  const original = (
    await run(
      "git",
      [
        "show",
        `${historicalCommit}:packages/scene-contract/src/typography-events.ts`,
      ],
      { cwd: root },
    )
  ).stdout;
  await writeFile(join(output, "historical-compiler.ts"), original);
  const rewritten = original.replace(
    /from "\.\/(.*?)"/g,
    (_, name: string) =>
      `from ${JSON.stringify(join(root, "packages/scene-contract/src", name))}`,
  );
  const oldPath = join(output, "historical-compiler-runtime.ts");
  await writeFile(oldPath, rewritten);
  const historical = (await import(pathToFileURL(oldPath).href)) as {
    compileTextEvents: typeof compileTextEvents;
  };
  evidence.historicalCompiler = {
    sha256: hash(original),
    runtimeSha256: hash(rewritten),
    qualification:
      "Exact historical event-compiler body; unchanged shared style helpers and current supported pinned-font renderer. No old renderer parity inferred from a changed raster.",
  };
  const rendererInputs = [
    "typography-renderer.ts",
    "typography-animation.ts",
    "typography-axes.ts",
    "typography-style.ts",
    "shaped-text.ts",
    "prepared-fonts.ts",
    "font-identity.ts",
    "font-metrics.ts",
  ];
  evidence.unchangedRendererInputs = await Promise.all(
    rendererInputs.map(async (name) => {
      const path = `packages/renderer-core/src/${name}`,
        current = await readFile(join(root, path));
      const prior = await run("git", ["show", `${historicalCommit}:${path}`], {
        cwd: root,
      });
      assert.equal(
        hash(current),
        hash(prior.stdout),
        `${name}: historical draw/shaping source changed`,
      );
      return { path, sha256: hash(current) };
    }),
  );
  const thai = MECHANISM_SEMANTIC_FONTS.thai,
    plex = MECHANISM_SEMANTIC_FONTS.semibold;
  const fonts = [
    {
      id: "variable",
      path: resolve(root, thai.path),
      sha256: thai.sha256,
      weight: thai.weight,
      variable: {
        wght: { min: 100, default: 400, max: 900 },
        wdth: { min: 62.5, default: 100, max: 100 },
      },
    },
    {
      id: "static",
      path: resolve(root, plex.path),
      sha256: plex.sha256,
      weight: plex.weight,
    },
  ];
  evidence.fonts = await Promise.all(
    fonts.map(async (font) => {
      const bytes = await readFile(font.path),
        identity = readFontIdentity(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        );
      assert.equal(`sha256:${hash(bytes)}`, font.sha256);
      const diagnostics = inspectFontText(
        identity,
        font,
        [
          {
            text: "Room to move",
            axes: font.id === "variable" ? { wght: 600, wdth: 100 } : {},
          },
        ],
        { profile: "strict" },
      );
      assert.equal(diagnostics.length, 0, JSON.stringify(diagnostics));
      return {
        ...font,
        actual: {
          fullName: identity.fullName,
          weight: identity.weight,
          axes: identity.axes,
        },
        strictDiagnostics: diagnostics,
      };
    }),
  );
  const artPath = join(output, "empty.svg"),
    art = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
  await writeFile(artPath, art);
  const source = (kind: string): StoryScene =>
    StorySceneSchema.parse({
      schemaVersion: "story-scene-1",
      title: "Explicit weight treatment proof",
      width,
      height,
      fps: 30,
      frameCount: 60,
      background: "#ffffff",
      motionModel: "curves-1",
      authoringVersion: "1",
      typography: "type-1",
      assets: [
        {
          id: "unused",
          path: artPath,
          sha256: `sha256:${hash(art)}`,
          width: 1,
          height: 1,
        },
      ],
      fonts,
      textStyles: {
        variable: {
          fontAsset: "variable",
          axes: { wght: kind === "maximum" ? 900 : 600, wdth: 100 },
        },
        static: { fontAsset: "static", axes: {} },
        limited: { fontAsset: "variable", axes: { wght: 850, wdth: 100 } },
      },
      nodes: [
        {
          id: "phrase",
          type: "text",
          text: "Room to move",
          textRole: "heading",
          fontAsset:
            kind === "static" || kind === "covered-base"
              ? "static"
              : "variable",
          style:
            kind === "static" || kind === "covered-base"
              ? "static"
              : "variable",
          fontSize: 180,
          color: "#202020",
          x: 120,
          y: 240,
          origin: [0, 0],
          anchor: "cap",
          align: "left",
          ...(kind === "mixed-headroom"
            ? {
                spans: [
                  { id: "limited-run", start: 5, end: 12, style: "limited" },
                ],
              }
            : kind === "mixed"
              ? {
                  spans: [
                    { id: "static-run", start: 5, end: 12, style: "static" },
                  ],
                }
              : kind === "covered-base"
                ? {
                    spans: [
                      { id: "all", start: 0, end: 12, style: "variable" },
                    ],
                  }
                : {}),
        },
      ],
      recipe: { preset: "generic" },
      textEvents: [
        {
          id: "weight",
          node: "phrase",
          verb: "emphasize",
          manner: "weight",
          at: 0,
          duration: 10,
        },
        { node: "phrase", verb: "release", at: 35, duration: 10 },
      ],
    });
  const cases: {
    id: string;
    source: StoryScene;
    compiled: StoryScene;
    repeat: boolean;
    parity?: string;
  }[] = [];
  const negatives: unknown[] = [];
  for (const kind of [
    "variable",
    "static",
    "maximum",
    "mixed",
    "mixed-headroom",
  ]) {
    const input = source(kind),
      old = historical.compileTextEvents(input),
      current = compileTextEvents(input);
    assert.deepEqual(current, old, `${kind}: complete legacy compiler result`);
    const explicit = structuredClone(input);
    explicit.textEvents![0]!.weightTreatment =
      kind === "variable" || kind === "mixed-headroom"
        ? "genuine-weight"
        : "outline";
    if (kind === "mixed-headroom") explicit.textEvents![0]!.amount = 50;
    const receipt = inspectTextWeightTreatments(explicit).receipts[0]!;
    assert.equal(
      receipt.resolvedTreatment,
      kind === "variable" || kind === "mixed-headroom"
        ? "genuine-weight"
        : "outline",
    );
    assert.deepEqual(
      compileTextEvents(explicit).textAnimators,
      current.textAnimators,
    );
    cases.push(
      { id: `${kind}-historical`, source: input, compiled: old, repeat: false },
      {
        id: `${kind}-auto`,
        source: input,
        compiled: current,
        repeat: false,
        parity: `${kind}-historical`,
      },
      {
        id: `${kind}-explicit`,
        source: explicit,
        compiled: compileTextEvents(explicit),
        repeat: true,
        parity: `${kind}-historical`,
      },
    );
    const rejected = structuredClone(input);
    rejected.textEvents![0]!.weightTreatment = "genuine-weight";
    if (kind === "variable") rejected.textEvents![0]!.amount = 301;
    if (kind === "mixed-headroom") rejected.textEvents![0]!.amount = 51;
    const unavailable = inspectTextWeightTreatments(rejected).receipts[0]!;
    assert.equal(unavailable.status, "unavailable");
    assert.throws(() => compileTextEvents(rejected), /text-weight-unavailable/);
    negatives.push({
      id: `${kind}-unavailable`,
      source: rejected,
      receipt: unavailable,
    });
  }
  const outline = source("variable");
  outline.textEvents![0]!.weightTreatment = "outline";
  cases.push({
    id: "variable-outline",
    source: outline,
    compiled: compileTextEvents(outline),
    repeat: true,
  });
  const covered = source("covered-base");
  covered.textEvents![0]!.weightTreatment = "genuine-weight";
  cases.push({
    id: "covered-base-genuine",
    source: covered,
    compiled: compileTextEvents(covered),
    repeat: true,
  });
  await writeFile(
    join(output, "negative-controls.json"),
    JSON.stringify(negatives, null, 2) + "\n",
  );
  evidence.negativeControls = negatives;
  server = await createServer({
    root,
    cacheDir: join(output, "vite-cache"),
    configFile: false,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root, output] } },
  });
  await server.listen();
  browser = await launchRenderBrowser();
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.addInitScript("window.__name = fn => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  await page.addScriptTag({
    type: "module",
    content: `import * as renderer from ${JSON.stringify(`/@fs/${root}/packages/renderer-core/src/index.ts`)}; import * as shaping from ${JSON.stringify(`/@fs/${root}/packages/renderer-core/src/shaped-text.ts`)}; import * as axes from ${JSON.stringify(`/@fs/${root}/packages/renderer-core/src/typography-axes.ts`)}; globalThis.__weightProof = {renderer,shaping,axes};`,
  });
  await page.waitForFunction(() => "__weightProof" in globalThis);
  const comparisons = new Map<
    string,
    { preview: string[]; encoded: string; decoded: string }
  >();
  let exports = 0;
  for (const item of cases) {
    const directory = join(output, item.id);
    await mkdir(directory);
    await writeFile(
      join(directory, "source.json"),
      JSON.stringify(item.source, null, 2) + "\n",
    );
    await writeFile(
      join(directory, "compiled-events.json"),
      JSON.stringify(item.compiled, null, 2) + "\n",
    );
    const receipts = inspectTextWeightTreatments(item.source);
    await writeFile(
      join(directory, "receipts.json"),
      JSON.stringify(receipts, null, 2) + "\n",
    );
    const prepared = structuredClone(item.compiled);
    delete prepared.textEvents;
    delete prepared.intentPresets;
    const composition = await compileStoryComposition(prepared, root);
    for (const asset of composition.assets)
      asset.path = resolve(root, asset.path);
    const compositionPath = join(directory, "composition.json");
    await writeFile(
      compositionPath,
      JSON.stringify(composition, null, 2) + "\n",
    );
    const node = item.compiled.nodes.find(
      (node) => node.id === "phrase",
    ) as TextNode;
    const probe = await page.evaluate(
      async ({ compositionJson, nodeJson, samples, backend }) => {
        if (backend !== "webgl2" && backend !== "canvas2d")
          throw Error("unsupported proof backend");
        const composition = JSON.parse(compositionJson) as Composition;
        const node = JSON.parse(nodeJson) as TextNode;
        const { renderer, shaping, axes } = (
          globalThis as typeof globalThis & {
            __weightProof: {
              renderer: typeof Renderer;
              shaping: typeof Shaping;
              axes: typeof Axes;
            };
          }
        ).__weightProof;
        const resources = await renderer.loadCompositionResources(
          composition,
          (id) =>
            `/@fs/${composition.assets.find((asset) => asset.id === id)!.path}`,
        );
        const canvas = document.createElement("canvas"),
          preview = renderer.createCompositionPreview(
            canvas,
            composition,
            resources,
            { backend },
          );
        const digest = async (pixels: Uint8ClampedArray) =>
          Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new Uint8Array(pixels).buffer,
              ),
            ),
          )
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
        const layout = shaping.shapeText(
          document.createElement("canvas").getContext("2d")!,
          node,
          node.text,
          resources.fonts,
          composition.textStyles,
        );
        const hashes: string[] = [],
          frames: {
            frame: number;
            png: string;
            poses: unknown;
            gaps: { centerX: number; advance: number }[];
          }[] = [];
        try {
          for (let frame = 0; frame < composition.frameCount; frame++) {
            preview.renderFrame(frame);
            hashes.push(await digest(preview.readPixels()));
            if (samples.includes(frame)) {
              const poses = renderer.evaluateTextPoses(
                  node,
                  layout,
                  composition.textAnimators ?? [],
                  frame,
                  composition,
                ),
                delta =
                  poses.find((pose) => Object.keys(pose.axes).length)?.axes ??
                  {};
              const varied = Object.keys(delta).length
                ? axes.axisLayout(
                    document.createElement("canvas").getContext("2d")!,
                    node,
                    node.text,
                    composition.textStyles ?? {},
                    resources.fonts,
                    delta,
                  )
                : layout;
              const gaps = varied.clusters
                .filter((cluster) => cluster.text === " ")
                .map((cluster) => ({
                  centerX: node.x + cluster.x + cluster.advance / 2,
                  advance: cluster.advance,
                }));
              if (gaps.length !== 2 || gaps.some((gap) => gap.advance <= 2))
                throw Error("natural English gap advance missing");
              frames.push({ frame, png: canvas.toDataURL(), poses, gaps });
            }
          }
          for (const frame of [...hashes.keys()].reverse()) {
            preview.renderFrame(frame);
            if ((await digest(preview.readPixels())) !== hashes[frame])
              throw Error(`reverse seek changed frame ${frame}`);
          }
          for (let i = 0; i < hashes.length; i++) {
            const frame = (i * 17) % hashes.length;
            preview.renderFrame(frame);
            if ((await digest(preview.readPixels())) !== hashes[frame])
              throw Error(`shuffled seek changed frame ${frame}`);
          }
          return { hashes, frames, draws: hashes.length * 3 };
        } finally {
          preview.dispose();
        }
      },
      {
        compositionJson: JSON.stringify(composition),
        nodeJson: JSON.stringify(node),
        samples: [0, 9, 10, 34, 35, 40, 45, 59],
        backend,
      },
    );
    for (const sample of probe.frames)
      await writeFile(
        join(directory, `preview-${sample.frame}.png`),
        Buffer.from(sample.png.split(",")[1]!, "base64"),
      );
    const report: Record<string, unknown> = {
      id: item.id,
      receipts,
      animators: item.compiled.textAnimators,
      preview: {
        hashes: probe.hashes,
        draws: probe.draws,
        samples: probe.frames.map(({ png: _png, ...sample }) => sample),
      },
    };
    results.push(report);
    await write();
    const first = await renderComposition({
      compositionPath,
      outputPath: join(directory, "first.mp4"),
      backend,
      workers: 1,
      cacheStatic: false,
    });
    exports++;
    assert.equal(first.frameCount, 60);
    report.first = first;
    const encoded = hash(await readFile(first.outputPath));
    if (item.repeat) {
      const repeat = await renderComposition({
        compositionPath,
        outputPath: join(directory, "repeat.mp4"),
        backend,
        workers: 1,
        cacheStatic: false,
      });
      exports++;
      assert.equal(repeat.frameCount, 60);
      assert.equal(hash(await readFile(repeat.outputPath)), encoded);
      report.repeat = repeat;
    }
    const ffprobe = await run("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,nb_read_frames,r_frame_rate",
      "-of",
      "json",
      first.outputPath,
    ]);
    const stream = JSON.parse(ffprobe.stdout).streams[0];
    assert.deepEqual(
      [
        stream.width,
        stream.height,
        Number(stream.nb_read_frames),
        stream.r_frame_rate,
      ],
      [width, height, 60, "30/1"],
    );
    report.ffprobe = stream;
    const rawPath = join(directory, "decoded.rgb");
    await run("ffmpeg", [
      "-v",
      "error",
      "-i",
      first.outputPath,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-y",
      rawPath,
    ]);
    const decodedHash = await fileHash(rawPath);
    report.decodedSha256 = decodedHash;
    const decoded = await open(rawPath, "r");
    assert.equal((await decoded.stat()).size, frameBytes * 60);
    const decodedSamples = [];
    try {
      for (const sample of probe.frames) {
        const pixels = Buffer.alloc(frameBytes);
        const { bytesRead } = await decoded.read(
          pixels,
          0,
          frameBytes,
          sample.frame * frameBytes,
        );
        assert.equal(bytesRead, frameBytes);
        const gaps = sample.gaps.map((gap) => {
          let dark = 0;
          const x = Math.round(gap.centerX);
          for (let y = 0; y < height; y++)
            for (let dx = -1; dx <= 1; dx++) {
              const offset = (y * width + x + dx) * 3;
              if (
                pixels[offset]! < 150 &&
                pixels[offset + 1]! < 150 &&
                pixels[offset + 2]! < 150
              )
                dark++;
            }
          return { ...gap, darkPixels: dark };
        });
        assert.ok(
          gaps.every((gap) => gap.darkPixels === 0),
          `${item.id}:${sample.frame}: encoded English space occupied: ${JSON.stringify(gaps)}`,
        );
        decodedSamples.push({ frame: sample.frame, gaps });
      }
    } finally {
      await decoded.close();
    }
    await run("ffmpeg", [
      "-v",
      "error",
      "-i",
      first.outputPath,
      "-vf",
      `select=${probe.frames.map((sample) => `eq(n\\,${sample.frame})`).join("+")}`,
      "-vsync",
      "0",
      "-y",
      join(directory, "encoded-%02d.png"),
    ]);
    report.decodedSamples = decodedSamples;
    const comparison = { preview: probe.hashes, encoded, decoded: decodedHash };
    if (item.parity) {
      const expected = comparisons.get(item.parity)!;
      assert.deepEqual(
        comparison,
        expected,
        `${item.id}: historical/current/explicit complete output parity`,
      );
      report.historicalParity = "exact-all-preview-encoded-decoded-frames";
    }
    if (item.id === "variable-outline")
      assert.notEqual(
        comparison.preview[10],
        comparisons.get("variable-historical")!.preview[10],
        "outline must differ from genuine axis raster",
      );
    assert.notEqual(
      probe.hashes[0],
      probe.hashes[10],
      `${item.id}: emphasis must actually paint`,
    );
    assert.equal(
      probe.hashes[0],
      probe.hashes[45],
      `${item.id}: release endpoint restores baseline`,
    );
    assert.equal(
      probe.hashes[45],
      probe.hashes[59],
      `${item.id}: final state remains settled`,
    );
    comparisons.set(item.id, comparison);
    evidence.counts = {
      cases: results.length,
      exports,
      encodedFrames: exports * 60,
      previewFrames: results.length * 60,
      previewDraws: results.length * 180,
    };
    await write();
    console.log(JSON.stringify({ id: item.id, status: "passed", exports }));
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  evidence.browserErrors = errors;
  evidence.status = "passed";
} catch (error) {
  evidence.status = "failed";
  evidence.error = String(error);
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  await write();
  console.log(JSON.stringify({ status: evidence.status, output }));
}
