import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  StorySceneSchema,
  CompositionSchema,
} from "@still-shift/scene-contract";
import { compileStoryComposition } from "../../packages/animation-engine/src/composition-compile.ts";
import { renderComposition } from "../../packages/animation-engine/src/composition-render.ts";

const root = resolve(import.meta.dirname, "../.."),
  proof = JSON.parse(
    await readFile(
      join(root, "docs/mechanism-shorts-ms2-thai-preflight-results.json"),
      "utf8",
    ),
  ) as {
    finalRoot: string;
    independentAudit: {
      runSha256: string;
      matrix: {
        id: string;
        copyIndex: number;
        route: string;
        tracking: string;
      }[];
    };
  },
  output = await mkdtemp(join(tmpdir(), "still-shift-ms2-thai49-"));
const hash = (x: Uint8Array | string) =>
  createHash("sha256").update(x).digest("hex");
assert.equal(
  hash(await readFile(join(proof.finalRoot, "run.json"))),
  proof.independentAudit.runSha256,
);
assert.equal(proof.independentAudit.matrix.length, 128);
const evidence: Record<string, unknown> = {
  version: "mechanism-thai-motion-native-render-1",
  status: "running",
  output,
  preflightRoot: proof.finalRoot,
  preflightRunSha256: proof.independentAudit.runSha256,
  backend: "webgl2",
  scope:
    "Exact saved 128-case Thai preflight matrix through supported native composition rendering; visual interpretation is a separate artifact audit.",
  cases: [],
};
const cases: {
  id: string;
  copyIndex: number;
  route: string;
  tracking: string;
  sourcePath: string;
  compositionPath: string;
  sourceFileSha256: string;
  compositionFileSha256: string;
  exports: Awaited<ReturnType<typeof renderComposition>>[];
}[] = [];
evidence.cases = cases;
const write = () =>
  writeFile(join(output, "run.json"), JSON.stringify(evidence, null, 2) + "\n");
await write();
console.log(JSON.stringify({ status: "started", output }));
try {
  for (const item of proof.independentAudit.matrix) {
    assert.match(item.id, /^copy[1-7]-[a-z-]+$/);
    const sourcePath = join(proof.finalRoot, item.id, "source.json"),
      compositionPath = join(proof.finalRoot, item.id, "composition.json"),
      sourceBytes = await readFile(sourcePath),
      compositionBytes = await readFile(compositionPath),
      source = StorySceneSchema.parse(JSON.parse(sourceBytes.toString())),
      saved = CompositionSchema.parse(JSON.parse(compositionBytes.toString())),
      fresh = await compileStoryComposition(source, root);
    for (const asset of fresh.assets) asset.path = resolve(root, asset.path);
    assert.deepEqual(
      fresh,
      saved,
      `saved native composition drifted: ${item.id}`,
    );
    const dir = join(output, item.id);
    await mkdir(dir);
    const first = await renderComposition({
      compositionPath,
      outputPath: join(dir, "first.mp4"),
      backend: "webgl2",
      workers: 1,
      cacheStatic: false,
    });
    assert.equal(first.frameCount, 24);
    assert.deepEqual(first.systemFontLayers, []);
    const exports = [first];
    if (
      item.route === "intact" &&
      (item.tracking === "zero" || item.tracking === "optical")
    ) {
      const repeat = await renderComposition({
        compositionPath,
        outputPath: join(dir, "repeat.mp4"),
        backend: "webgl2",
        workers: 1,
        cacheStatic: false,
      });
      assert.equal(repeat.frameCount, 24);
      assert.equal(first.checksums.output, repeat.checksums.output);
      exports.push(repeat);
    }
    assert.equal(hash(await readFile(sourcePath)), hash(sourceBytes));
    assert.equal(hash(await readFile(compositionPath)), hash(compositionBytes));
    const record = {
      ...item,
      sourcePath,
      compositionPath,
      sourceFileSha256: hash(sourceBytes),
      compositionFileSha256: hash(compositionBytes),
      exports,
    };
    cases.push(record);
    await writeFile(
      join(dir, "render.json"),
      JSON.stringify(record, null, 2) + "\n",
    );
    await write();
    console.log(
      JSON.stringify({
        id: item.id,
        status: "passed",
        completedCases: cases.length,
        exports: exports.length,
      }),
    );
  }
  for (let copyIndex = 0; copyIndex < 7; copyIndex++) {
    const controls = cases.filter(
        (c) => c.copyIndex === copyIndex && c.route === "intact",
      ),
      zero = controls.find((c) => c.tracking === "zero")!;
    for (const tracking of ["default", "explicit-override"])
      assert.equal(
        controls.find((c) => c.tracking === tracking)!.exports[0]!.checksums
          .output,
        zero.exports[0]!.checksums.output,
        `${tracking} encoded output changed for copy ${copyIndex}`,
      );
  }
  evidence.status = "passed";
  evidence.encodedFrames = cases.reduce((n, c) => n + c.exports.length * 24, 0);
  await write();
  console.log(
    JSON.stringify({
      status: "passed",
      output,
      cases: cases.length,
      encodedFrames: evidence.encodedFrames,
    }),
  );
} catch (error) {
  evidence.status = "failed";
  evidence.error = String(error);
  await write();
  throw error;
}
