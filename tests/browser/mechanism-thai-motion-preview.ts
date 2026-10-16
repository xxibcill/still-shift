import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import {
  CompositionSchema,
  type Composition,
} from "@still-shift/scene-contract";
import type * as Renderer from "@still-shift/renderer-core";

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
  output = await mkdtemp(join(tmpdir(), "still-shift-ms2-thai49-preview-"));
const hash = (x: Uint8Array | string) =>
  createHash("sha256").update(x).digest("hex");
assert.equal(
  hash(await readFile(join(proof.finalRoot, "run.json"))),
  proof.independentAudit.runSha256,
);
const evidence: Record<string, unknown> = {
  version: "mechanism-thai-native-preview-1",
  status: "running",
  output,
  preflightRoot: proof.finalRoot,
  preflightRunSha256: proof.independentAudit.runSha256,
  backend: "webgl2",
  cases: [],
  settledComparisons: [],
};
const cases: {
  id: string;
  copyIndex: number;
  route: string;
  tracking: string;
  hashes: string[];
  draws: number;
  compositionFileSha256: string;
}[] = [];
evidence.cases = cases;
const write = () =>
  writeFile(join(output, "run.json"), JSON.stringify(evidence, null, 2) + "\n");
await write();
console.log(JSON.stringify({ status: "started", output }));
const server = await createServer({
  root,
  cacheDir: join(output, "vite-cache"),
  configFile: false,
  logLevel: "silent",
  server: {
    host: "127.0.0.1",
    port: 0,
    fs: { allow: [root, proof.finalRoot, output] },
  },
});
await server.listen();
const browser = await launchRenderBrowser();
try {
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript("window.__name = fn => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  await page.addScriptTag({
    type: "module",
    content: `import * as renderer from ${JSON.stringify(`/@fs/${root}/packages/renderer-core/src/index.ts`)};globalThis.__thaiPreview=renderer;`,
  });
  await page.waitForFunction(() => "__thaiPreview" in globalThis);
  for (const item of proof.independentAudit.matrix) {
    assert.match(item.id, /^copy[1-7]-[a-z-]+$/);
    const compositionPath = join(proof.finalRoot, item.id, "composition.json"),
      bytes = await readFile(compositionPath),
      composition = CompositionSchema.parse(JSON.parse(bytes.toString()));
    const preview = await page.evaluate(
      async ({ json }) => {
        const composition = JSON.parse(json) as Composition,
          renderer = (
            globalThis as typeof globalThis & { __thaiPreview: typeof Renderer }
          ).__thaiPreview;
        const resources = await renderer.loadCompositionResources(
            composition,
            (id) => `/@fs/${composition.assets.find((a) => a.id === id)!.path}`,
          ),
          canvas = document.createElement("canvas"),
          view = renderer.createCompositionPreview(
            canvas,
            composition,
            resources,
            { backend: "webgl2" },
          );
        const digest = async () =>
          Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new Uint8Array(view.readPixels()).buffer,
              ),
            ),
          )
            .map((n) => n.toString(16).padStart(2, "0"))
            .join("");
        const hashes: string[] = [],
          samples: { frame: number; png: string }[] = [];
        try {
          for (let frame = 0; frame < composition.frameCount; frame++) {
            view.renderFrame(frame);
            hashes.push(await digest());
            if ([8, 23].includes(frame))
              samples.push({ frame, png: canvas.toDataURL() });
          }
          for (const frame of [...hashes.keys()].reverse()) {
            view.renderFrame(frame);
            if ((await digest()) !== hashes[frame])
              throw Error("reverse Thai native seek mismatch");
          }
          for (let i = 0; i < hashes.length; i++) {
            const frame = (i * 7) % hashes.length;
            view.renderFrame(frame);
            if ((await digest()) !== hashes[frame])
              throw Error("shuffled Thai native seek mismatch");
          }
          return { hashes, samples };
        } finally {
          view.dispose();
        }
      },
      { json: JSON.stringify(composition) },
    );
    assert.equal(preview.hashes.length, 24);
    assert.equal(hash(await readFile(compositionPath)), hash(bytes));
    const directory = join(output, item.id);
    await mkdir(directory);
    for (const sample of preview.samples)
      await writeFile(
        join(directory, `native-${sample.frame}.png`),
        Buffer.from(sample.png.split(",")[1]!, "base64"),
      );
    const record = {
      ...item,
      hashes: preview.hashes,
      draws: 72,
      compositionFileSha256: hash(bytes),
    };
    cases.push(record);
    await writeFile(
      join(directory, "preview.json"),
      JSON.stringify(record, null, 2) + "\n",
    );
    await write();
    console.log(
      JSON.stringify({
        id: item.id,
        status: "passed",
        completedCases: cases.length,
      }),
    );
  }
  const comparisons: {
    id: string;
    baseline: string;
    frame: number;
    exact: boolean;
  }[] = [];
  for (let copyIndex = 0; copyIndex < 7; copyIndex++) {
    const zero = cases.find(
      (c) =>
        c.copyIndex === copyIndex &&
        c.route === "intact" &&
        c.tracking === "zero",
    )!;
    for (const tracking of ["default", "explicit-override"])
      assert.deepEqual(
        cases.find(
          (c) =>
            c.copyIndex === copyIndex &&
            c.route === "intact" &&
            c.tracking === tracking,
        )!.hashes,
        zero.hashes,
      );
    for (const tracking of ["zero", "optical"]) {
      const baseline = cases.find(
        (c) =>
          c.copyIndex === copyIndex &&
          c.route === "intact" &&
          c.tracking === tracking,
      )!;
      for (const route of [
        "translate",
        "rotate",
        "opacity",
        "retype",
        "font-alias-boundary",
      ]) {
        const c = cases.find(
          (c) =>
            c.copyIndex === copyIndex &&
            c.route === route &&
            c.tracking === tracking,
        )!;
        comparisons.push({
          id: c.id,
          baseline: baseline.id,
          frame: 23,
          exact: c.hashes[23] === baseline.hashes[23],
        });
      }
    }
  }
  assert.equal(cases.length, 128);
  assert.deepEqual(errors, []);
  evidence.browserErrors = errors;
  evidence.settledComparisons = comparisons;
  evidence.status = "passed";
  evidence.uniqueFrames = 3072;
  evidence.draws = 9216;
  await write();
  console.log(
    JSON.stringify({
      status: "passed",
      output,
      settledExact: comparisons.filter((x) => x.exact).length,
      settledCompared: comparisons.length,
    }),
  );
} catch (error) {
  evidence.status = "failed";
  evidence.error = String(error);
  await write();
  throw error;
} finally {
  await browser.close();
  await server.close();
}
