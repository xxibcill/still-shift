import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { renderComposition } from "@still-shift/animation-engine";
import { storyToComposition, evaluateComp } from "@still-shift/renderer-core";
import {
  StorySceneSchema,
  type Composition,
} from "@still-shift/scene-contract";
import { loadProgram } from "../../tools/still-shift-cli/src/composition/program.ts";
import { writeComposition } from "../../tools/still-shift-cli/src/composition/files.ts";
import type * as Render from "../../packages/renderer-core/src/index.ts";

const root = resolve(import.meta.dirname, "../.."),
  input = resolve(root, "examples/composition/unequal-margins/program.ts"),
  original = resolve(
    root,
    "benchmarks/fixtures/story-motion-continuous/unequal-margins.json",
  );
const lines = (await readFile(input, "utf8")).trimEnd().split("\n").length;
assert(lines < 200, `Authored program has ${lines} lines`);
const program = await loadProgram(input),
  built = program.composition;
const reference = storyToComposition(
  StorySceneSchema.parse(JSON.parse(await readFile(original, "utf8"))),
);
let maxNumericDelta = 0,
  numericValues = 0;
function compareNumbers(a: unknown, b: unknown, path: string) {
  if (typeof a === "number" && typeof b === "number") {
    const delta = Math.abs(a - b);
    maxNumericDelta = Math.max(maxNumericDelta, delta);
    numericValues++;
    assert(delta <= 1e-8, `${path}: ${a} != ${b}`);
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    const left = a as Record<string, unknown>,
      right = b as Record<string, unknown>;
    for (const key of Object.keys(left))
      compareNumbers(left[key], right[key], `${path}.${key}`);
  } else assert.deepEqual(b, a, path);
}
for (let frame = 0; frame < reference.frameCount; frame++) {
  const a = evaluateComp(reference, frame),
    b = evaluateComp(built, frame);
  assert.equal(a.layers.length, b.layers.length);
  for (const node of a.layers) {
    const other = b.layers.find((n) => n.id === node.id)!;
    assert(other, `Missing ${node.id}`);
    compareNumbers(
      node.transform,
      other.transform,
      `${frame}:${node.id}.transform`,
    );
    compareNumbers(node.opacity, other.opacity, `${frame}:${node.id}.opacity`);
  }
}
compareNumbers(reference.camera2d, built.camera2d, "camera2d");
const urls = Object.fromEntries(
  built.assets.map((a) => [a.id, `/@fs${a.path}`]),
);
for (const asset of reference.assets) {
  const other = built.assets.find((a) => a.id === asset.id);
  assert(other);
  assert.equal(other.sha256, asset.sha256);
  asset.path = resolve(dirname(original), asset.path);
}
const server = await createServer({
  root,
  configFile: false,
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await server.listen();
const browser = await launchRenderBrowser(),
  directory = await mkdtemp(join(tmpdir(), "ce10-builder-proof-"));
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = fn => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const pixels = await page.evaluate(
    async ({ builtJson, referenceJson, urls }) => {
      const moduleUrl = "/packages/renderer-core/src/index.ts";
      const m = (await import(moduleUrl)) as typeof Render;
      const built = JSON.parse(builtJson) as Composition,
        reference = JSON.parse(referenceJson) as Composition;
      const resources = await m.loadCompositionResources(
        built,
        (id) => urls[id]!,
      );
      const reports = [];
      for (const backend of ["canvas2d", "webgl2"] as const) {
        const a = document.createElement("canvas"),
          b = document.createElement("canvas");
        const old = m.createCompositionPreview(a, reference, resources, {
            backend,
          }),
          current = m.createCompositionPreview(b, built, resources, {
            backend,
          });
        const hash = async (bytes: Uint8ClampedArray) =>
          Array.from(
            new Uint8Array(
              await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
            ),
          )
            .map((n) => n.toString(16).padStart(2, "0"))
            .join("");
        const hashes = new Map<number, string>();
        let maxChannelDelta = 0,
          minimumPsnr = Infinity;
        for (let frame = 0; frame < built.frameCount; frame++) {
          const results = [old.renderFrame(frame), current.renderFrame(frame)];
          if (
            results.some((result) =>
              result.diagnostics.some((d) => d.severity === "error"),
            )
          )
            throw new Error(JSON.stringify(results));
          const before = old.readPixels(),
            after = current.readPixels();
          const comparison = m.compareFrames(
            before,
            after,
            built.width,
            built.height,
          );
          maxChannelDelta = Math.max(
            maxChannelDelta,
            comparison.maxChannelDelta,
          );
          minimumPsnr = Math.min(minimumPsnr, comparison.psnr);
          if (!m.meetsTier(comparison, "near"))
            throw new Error(
              `${backend} frame ${frame}: ${JSON.stringify(comparison)}`,
            );
          if ([0, 15, 48, 85, 124, 164, 191].includes(frame))
            hashes.set(frame, await hash(after));
        }
        for (const frame of [191, 0, 85, 164, 15, 124, 48]) {
          current.renderFrame(frame);
          if (hashes.get(frame) !== (await hash(current.readPixels())))
            throw new Error(`Seek differs at ${backend}:${frame}`);
        }
        reports.push({
          backend,
          frames: built.frameCount,
          maxChannelDelta,
          minimumPsnr: Number.isFinite(minimumPsnr) ? minimumPsnr : "Infinity",
          backwardSeeks: 7,
        });
        old.dispose();
        current.dispose();
      }
      return reports;
    },
    {
      builtJson: JSON.stringify(built),
      referenceJson: JSON.stringify(reference),
      urls,
    },
  );
  await browser.close();
  await server.close();
  const json = join(directory, "built.json");
  await writeComposition(built, input, json);
  const hashes = [];
  for (const [path, name] of [
    [input, "typescript"],
    [json, "json"],
  ] as const) {
    const loaded = await loadProgram(path),
      prepared = join(directory, `${name}-source.json`);
    await writeComposition(loaded.composition, path, prepared);
    const output = join(directory, `${name}.mp4`);
    await renderComposition({ compositionPath: prepared, outputPath: output });
    hashes.push(
      createHash("sha256")
        .update(await readFile(output))
        .digest("hex"),
    );
  }
  assert.equal(hashes[0], hashes[1]);
  const report = {
    status: "passed",
    lines,
    frames: built.frameCount,
    numericValues,
    maxNumericDelta,
    pixels,
    exports: { typescriptJsonByteIdentical: true, sha256: hashes[0] },
  };
  const evidence = resolve(
    root,
    "benchmarks/results/composition-ce10-builder-proof.json",
  );
  await writeFile(evidence, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
