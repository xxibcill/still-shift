import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import {
  compileMechanismCueProject,
  renderMechanismCueProject,
  checkMechanismCueOutput,
  readMechanismCueAuthoring,
  saveMechanismCueAuthoring,
  loadComposition,
  patchMechanismCueAuthoring,
} from "@still-shift/animation-engine";
import { createCueProjectFixture } from "../helpers/mechanism-cue-project.ts";
import { parallelOutputProof } from "../helpers/composition-parallel-proof.ts";
import { createServer } from "vite";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import type * as LayoutProof from "../helpers/mechanism-cue-layout-browser.ts";
import { resolve } from "node:path";
const directory = await mkdtemp("/private/tmp/still-shift-ms2-cue-layout-");
type Output = {
  render: Awaited<ReturnType<typeof renderMechanismCueProject>>;
  check: Awaited<ReturnType<typeof checkMechanismCueOutput>>;
  proof: Awaited<ReturnType<typeof parallelOutputProof>>;
};
type Stage = {
  stage: string;
  compiled: Awaited<ReturnType<typeof compileMechanismCueProject>>;
  outputs: Output[];
  alteredOutputRejected: string;
};
const fixtures: unknown[] = [];
const root = resolve(import.meta.dirname, "../.."),
  server = await createServer({
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
  if (req.url !== "/layout-proof") return next();
  res.setHeader("Content-Type", "text/html");
  res.end("<!doctype html><html><body></body></html>");
});
await server.listen();
const browser = await launchRenderBrowser(),
  page = await browser.newPage();
await page.addInitScript("window.__name=(fn)=>fn;");
await page.goto(server.resolvedUrls!.local[0] + "layout-proof");
assertPinnedRenderEnvironment(await probeRenderEnvironment(page));
try {
  for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
    const base = join(directory, family),
      fixture = await createCueProjectFixture(base, family);
    const authored = structuredClone(fixture.document);
    authored.revision = 1;
    for (const cue of authored.cues) {
      const a = {
        ...cue.annotations[0]!,
        anchor:
          family === "tape-hook"
            ? "hook.outerFace"
            : family === "cable-tie"
              ? "strap.outerSurface"
              : "lower.seat",
      };
      cue.annotations = [
        {
          ...a,
          id: "a",
          layout: { locked: false, priority: 10, candidates: [[140, 18]] },
        },
        {
          ...a,
          id: "b",
          text: "Pin",
          layout: { locked: false, priority: 0, candidates: [[140, 18]] },
        },
      ];
      cue.layout = {
        safeInsetPixels: 8,
        gapPixels: 4,
        protectedAnchors: [
          {
            anchor:
              fixture.instance.scene.anchors.find(
                (anchor) => anchor.role === "contact",
              )?.id ?? fixture.instance.scene.anchors[0]!.id,
            radiusPixels: 4,
          },
        ],
      };
    }
    const initial = await readMechanismCueAuthoring(
      fixture.instance,
      fixture.cuePath,
    );
    await saveMechanismCueAuthoring(
      fixture.instance,
      authored,
      fixture.cuePath,
      { revision: initial.document.revision, hash: initial.projectHash },
    );
    const original = await readMechanismCueAuthoring(
      fixture.instance,
      fixture.cuePath,
    );
    const stages: Stage[] = [];
    for (const stage of ["before", "edited"] as const) {
      if (stage === "edited") {
        await patchMechanismCueAuthoring(fixture.instance, fixture.cuePath, {
          schemaVersion: "mechanism-cue-patch-1",
          baseRevision: original.document.revision,
          baseHash: original.projectHash,
          operations: [
            { cue: "contact", property: "caption", value: "Here" },
            {
              cue: "contact",
              property: "annotation",
              annotation: "a",
              value: {
                anchor: authored.cues[1]!.annotations[0]!.anchor,
                text: "Edge",
                position: [140, 18],
                layout: { locked: false, priority: 10, candidates: [[18, 18]] },
              },
            },
            {
              cue: "contact",
              property: "camera",
              value: {
                editing: "cut",
                camera: {
                  ...fixture.instance.scene.camera,
                  position: fixture.instance.scene.camera.position.map(
                    (v, i) => (i === 0 ? v + 0.4 : v),
                  ),
                  target: fixture.instance.scene.camera.target.map((v, i) =>
                    i === 0 ? v + 0.4 : v,
                  ),
                },
              },
            },
          ],
        });
        const forbidden = join(base, "stale-render");
        await assert.rejects(
          () =>
            renderMechanismCueProject(
              fixture.familyPath,
              fixture.cuePath,
              join(base, "before-compiled"),
              forbidden,
            ),
          /current family\/cue revision/,
        );
        await assert.rejects(() => access(forbidden));
        await assert.rejects(
          () =>
            checkMechanismCueOutput(
              fixture.familyPath,
              fixture.cuePath,
              join(base, "before-compiled"),
              stages[0]!.outputs[0]!.render.outputPath,
            ),
          /current family\/cue revision/,
        );
      }
      const preparedDirectory = join(base, stage + "-compiled");
      const compiled = await compileMechanismCueProject(
        fixture.familyPath,
        fixture.cuePath,
        preparedDirectory,
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
        ]),
      );
      const measured = JSON.parse(serialized) as Awaited<
        ReturnType<typeof LayoutProof.cueLayoutBrowserProof>
      >;
      await writeFile(
        join(base, stage + "-layout-proof.json"),
        JSON.stringify(measured, null, 2),
      );
      await writeFile(
        join(base, stage + "-frame.png"),
        Buffer.from(measured.png.split(",")[1]!, "base64"),
      );
      const outputs: Output[] = [];
      for (const suffix of ["first", "repeat"]) {
        const render = await renderMechanismCueProject(
          fixture.familyPath,
          fixture.cuePath,
          preparedDirectory,
          join(base, stage + "-" + suffix),
        );
        assert.equal(render.rerenderScope, "whole-cycle");
        const check = await checkMechanismCueOutput(
          fixture.familyPath,
          fixture.cuePath,
          preparedDirectory,
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
      const badPath = join(base, stage + "-altered.mp4");
      await writeFile(
        badPath,
        Buffer.concat([
          await readFile(outputs[0]!.render.outputPath),
          Buffer.from([1]),
        ]),
      );
      const result = JSON.parse(
        await readFile(outputs[0]!.render.outputPath + ".result.json", "utf8"),
      );
      result.outputPath = badPath;
      await writeFile(badPath + ".result.json", JSON.stringify(result));
      await assert.rejects(
        () =>
          checkMechanismCueOutput(
            fixture.familyPath,
            fixture.cuePath,
            preparedDirectory,
            badPath,
          ),
        /Output\/result/,
      );
      if (stage === "edited")
        await assert.rejects(
          () =>
            checkMechanismCueOutput(
              fixture.familyPath,
              fixture.cuePath,
              preparedDirectory,
              stages[0]!.outputs[0]!.render.outputPath,
            ),
          /Output\/result/,
        );
      stages.push({ stage, compiled, outputs, alteredOutputRejected: badPath });
    }
    assert.notDeepEqual(
      stages[0]!.outputs[0]!.proof.decodedFrames,
      stages[1]!.outputs[0]!.proof.decodedFrames,
    );
    assert.equal(
      stages[0]!.outputs[0]!.proof.decodedAudio,
      stages[1]!.outputs[0]!.proof.decodedAudio,
    );
    fixtures.push({ family, ...fixture, stages });
  }
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        status: "passed",
        fixtures,
        supportedPacks: 0,
        pilotAcceptedEpisodes: 0,
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(
    JSON.stringify({
      directory,
      status: "passed",
      families: 3,
      exports: 12,
      observedOutputFrames: 720,
      syntheticAudio: true,
      rerenderScope: "whole-cycle",
      allFrameMeasuredGlyphBoundsAndSeekPixels: true,
    }) + "\n",
  );
} catch (error) {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify(
      {
        status: "failed",
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        fixtures,
      },
      null,
      2,
    ),
  );
  process.stderr.write(JSON.stringify({ directory, status: "failed" }) + "\n");
  throw error;
} finally {
  await browser.close();
  await server.close();
}
