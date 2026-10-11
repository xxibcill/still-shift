import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import {
  compileMechanismCueProject,
  renderMechanismCueProject,
  checkMechanismCueOutput,
  readMechanismCueAuthoring,
  saveMechanismCueAuthoring,
  loadComposition,
  compileMechanismNarratedCycle,
} from "@still-shift/animation-engine";
import { MechanismNarratedCycleSchema } from "@still-shift/scene-contract";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import { createCueProjectFixture } from "../helpers/mechanism-cue-project.ts";
import { prepareNative3DSceneV2 } from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import {
  parallelOutputProof,
  parallelChecksum,
} from "../helpers/composition-parallel-proof.ts";
import type * as LayoutProof from "../helpers/mechanism-cue-layout-browser.ts";

const root = resolve(import.meta.dirname, "../.."),
  directory = await mkdtemp("/private/tmp/still-shift-ms2-annotation-styles-");
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  resolve: {
    alias: [
      {
        find: /^@still-shift\/scene-contract$/,
        replacement: join(root, "packages/scene-contract/src/index.ts"),
      },
    ],
  },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root, directory] } },
});
server.middlewares.use((req, res, next) => {
  if (req.url !== "/annotation-proof") return next();
  res.setHeader("Content-Type", "text/html");
  res.end("<!doctype html><html><body></body></html>");
});
await server.listen();
const browser = await launchRenderBrowser(),
  page = await browser.newPage();
const fixtures: unknown[] = [];
try {
  await page.addInitScript("window.__name=(fn)=>fn;");
  await page.goto(server.resolvedUrls!.local[0] + "annotation-proof");
  const environment = await probeRenderEnvironment(page);
  assertPinnedRenderEnvironment(environment);
  for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
    const base = join(directory, family),
      fixture = await createCueProjectFixture(base, family);
    const primary =
      family === "tape-hook"
        ? "hook.outerFace"
        : family === "cable-tie"
          ? "strap.outerSurface"
          : "lower.seat";
    const original = await readMechanismCueAuthoring(
      fixture.instance,
      fixture.cuePath,
    );
    const framed =
      family === "cable-tie"
        ? {
            ...fixture.document,
            cues: fixture.document.cues.map((cue, index) => ({
              ...cue,
              camera: {
                ...fixture.instance.scene.camera,
                position: [8, 5, 2] as [number, number, number],
              },
              editing: index === 0 ? ("cut" as const) : ("hold" as const),
            })),
          }
        : fixture.document;
    const legacy = compileMechanismNarratedCycle(fixture.instance, framed);
    const prepared = await prepareNative3DSceneV2(
      fixture.instance.scene,
      fixture.document.source.sha256,
    );
    const possible = new Set(
      fixture.instance.scene.anchors
        .map((anchor) => anchor.id)
        .filter((id) => id !== primary),
    );
    for (let frame = 15; frame < 30; frame++) {
      const world = evaluateComp(legacy.composition, frame / 30, {
        preparedNative3D: { [fixture.document.source.id]: prepared },
      }).layers.find((layer) => layer.layer.type === "native3d")!;
      for (const id of possible)
        if (world.nativeFrame!.anchors[id]!.visibility !== "visible")
          possible.delete(id);
    }
    const secondary = [...possible].sort()[0];
    assert(secondary, "Bracket requires two distinct visible physical anchors");
    const authored = MechanismNarratedCycleSchema.parse({
      ...framed,
      revision: 1,
      cues: framed.cues.map((cue, index) => ({
        ...cue,
        annotations: [
          {
            ...cue.annotations[0]!,
            anchor: primary,
            layout: { locked: true },
            style:
              index === 0
                ? { kind: "tab" }
                : index === 1
                  ? {
                      kind: "bracket",
                      toAnchor: secondary,
                      offsetPixels: [0, 16],
                      tickPixels: 6,
                    }
                  : index === 2
                    ? { kind: "arrow" }
                    : { kind: "highlight", sizePixels: [28, 20] },
            visibility: { policy: "hide-occluded" },
          },
          ...(index === 0
            ? [
                {
                  ...cue.annotations[0]!,
                  id: "open",
                  text: "Pin",
                  anchor: primary,
                  position: [140, 18],
                  layout: { locked: true },
                  style: { kind: "open-callout" },
                  visibility: { policy: "hide-occluded" },
                },
              ]
            : []),
        ],
      })),
    });
    await saveMechanismCueAuthoring(
      fixture.instance,
      authored,
      fixture.cuePath,
      { revision: original.document.revision, hash: original.projectHash },
    );
    const compiled = await compileMechanismCueProject(
      fixture.familyPath,
      fixture.cuePath,
      join(base, "compiled"),
    );
    const loaded = await loadComposition(compiled.compositionPath, "webgl2");
    const serialized = await page.evaluate(
      async (input) => {
        const path = "/tests/helpers/mechanism-cue-layout-browser.ts";
        const helper = (await import(path)) as typeof LayoutProof;
        return JSON.stringify(
          await helper.cueLayoutBrowserProof(
            ...(JSON.parse(input) as Parameters<
              typeof helper.cueLayoutBrowserProof
            >),
          ),
        );
      },
      JSON.stringify([
        loaded.composition,
        loaded.preparedNative3D!,
        loaded.nativeAppearanceCodeIdentity!,
        [7, 22, 37, 52],
      ]),
    );
    const measured = JSON.parse(serialized) as Awaited<
      ReturnType<typeof LayoutProof.cueLayoutBrowserProof>
    >;
    assert.equal(measured.measuredFrames, 60);
    assert.equal(measured.forwardReverseRandomStable, true);
    assert.equal(measured.sampledPngs.length, 4);
    for (const sample of measured.sampledPngs)
      await writeFile(
        join(base, `frame-${sample.frame}.png`),
        Buffer.from(sample.png.split(",")[1]!, "base64"),
        { flag: "wx" },
      );
    const facts = {
      frames: measured.frames,
      forwardReverseRandomStable: measured.forwardReverseRandomStable,
      measuredFrames: measured.measuredFrames,
    };
    await writeFile(
      join(base, "preview.json"),
      JSON.stringify(facts, null, 2) + "\n",
      { flag: "wx" },
    );
    const outputs: {
      render: Awaited<ReturnType<typeof renderMechanismCueProject>>;
      check: Awaited<ReturnType<typeof checkMechanismCueOutput>>;
      proof: Awaited<ReturnType<typeof parallelOutputProof>>;
    }[] = [];
    for (const suffix of ["first", "repeat"]) {
      const render = await renderMechanismCueProject(
        fixture.familyPath,
        fixture.cuePath,
        join(base, "compiled"),
        join(base, suffix),
      );
      const check = await checkMechanismCueOutput(
        fixture.familyPath,
        fixture.cuePath,
        join(base, "compiled"),
        render.outputPath,
      );
      assert.equal(check.nativeFrames, 60);
      assert.equal(check.nativePasses, 60);
      const proof = await parallelOutputProof(
        render.outputPath,
        render.metrics,
      );
      if (outputs.length) assert.deepEqual(proof, outputs[0]!.proof);
      outputs.push({ render, check, proof });
    }
    assert.equal(
      parallelChecksum(await readFile(join(base, "narration.wav"))),
      authored.narration.sha256,
    );
    fixtures.push({
      family,
      primary,
      secondary,
      styles: ["tab", "open-callout", "bracket", "arrow", "highlight"],
      compiled,
      preview: join(base, "preview.json"),
      sampleFrames: [7, 22, 37, 52],
      outputs,
    });
    process.stdout.write(
      JSON.stringify({
        family,
        status: "passed",
        previewFrames: 60,
        seekDraws: 180,
        nativeExports: 2,
      }) + "\n",
    );
  }
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        version: "mechanism-annotation-styles-proof-1",
        status: "passed",
        environment,
        fixtures,
        scope:
          "Five recipes across three candidate families; all-frame actual font/anchor visibility, reverse/random preview, repeated finals and independent native closure replay.",
        limits:
          "Synthetic local PCM; no genuine narration, continuous-time or human readability/appearance acceptance, world/surface routes, label-only plate reuse or supported pilot admission.",
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stdout.write(
    JSON.stringify({
      directory,
      status: "passed",
      families: 3,
      recipesPerFamily: 5,
      previewFrames: 180,
      seekDraws: 540,
      nativeExports: 6,
      finalNativeFrames: 360,
    }) + "\n",
  );
} catch (error) {
  await writeFile(
    join(directory, "failed.json"),
    JSON.stringify(
      {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
        fixtures,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stderr.write(`Annotation style failure retained at ${directory}\n`);
  throw error;
} finally {
  await browser.close();
  await server.close();
}
