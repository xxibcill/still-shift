import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Matrix4, Vector3, Quaternion, Euler } from "three";
import { createServer } from "vite";
import {
  MechanismNarratedCycleSchema,
  MechanismSceneV2Schema,
  type Composition,
  type CompositionPreparedNative3DVersions,
} from "@still-shift/scene-contract";
import {
  compileMechanismNarratedCycle,
  compileMechanismCueProject,
  renderMechanismCueProject,
  checkMechanismCueOutput,
  readMechanismCueAuthoring,
  saveMechanismCueAuthoring,
  patchMechanismCueAuthoring,
  loadComposition,
} from "@still-shift/animation-engine";
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
import { streamingCompositionOutputProof } from "../helpers/composition-streaming-proof.ts";
import { surfaceAnnotationFixture } from "../helpers/mechanism-surface-fixture.ts";
import type * as Proof from "../helpers/mechanism-world-annotations-browser.ts";
const route = process.argv[2] ?? "world-text";
assert.ok(route === "world-text" || route === "surface-marking");
const root = resolve(import.meta.dirname, "../.."),
  directory = await mkdtemp(
    route === "world-text"
      ? "/private/tmp/still-shift-ms2-world-annotations-"
      : "/private/tmp/still-shift-ms2-surface-markings-",
  );
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
  if (req.url !== "/world-annotation-proof") return next();
  res.setHeader("Content-Type", "text/html");
  res.end("<!doctype html><html><body></body></html>");
});
await server.listen();
const browser = await launchRenderBrowser(),
  page = await browser.newPage();
async function hiddenControlInputs(
  composition: Composition,
  prepared: CompositionPreparedNative3DVersions,
  hiddenPart: string,
  path: string,
) {
  const control = structuredClone(composition);
  const transport = structuredClone(prepared);
  const asset = control.assets.find((asset) => asset.type === "native3d")!;
  const entry = transport.assets[asset.id]!;
  if (entry.source.schemaVersion !== "mechanism-scene-2")
    throw Error("Visibility control requires the family source protocol");
  const source = entry.source;
  const parts = new Map(source.parts.map((part) => [part.id, part]));
  const hiddenShapes = source.teachingShapes.filter((shape) => {
    let part: string | undefined = shape.ownerPart;
    while (part) {
      if (part === hiddenPart) return true;
      part = parts.get(part)?.parent;
    }
    return false;
  });
  if (!hiddenShapes.length) return { composition, prepared };
  // A separate control source permits a truthful not-drawn receipt at frame0.
  // The exported family retains its original required-draw policy and hash.
  for (const shape of hiddenShapes)
    shape.drawEvidence = {
      version: "mechanism-shape-draw-evidence-1",
      requiredIntervals: [{ startFrame: 1, endFrameExclusive: 60 }],
      allowedOutsideProof: ["authored-hidden"],
    };
  MechanismSceneV2Schema.parse(source);
  const bytes = JSON.stringify(source, null, 2) + "\n";
  const sourceSha256 = parallelChecksum(Buffer.from(bytes));
  await writeFile(path, bytes, { flag: "wx" });
  asset.path = path;
  asset.sha256 = sourceSha256;
  entry.sourceSha256 = sourceSha256;
  return { composition: control, prepared: transport };
}
const fixtures: unknown[] = [];
try {
  await page.addInitScript("window.__name=(fn)=>fn;");
  await page.goto(server.resolvedUrls!.local[0] + "world-annotation-proof");
  const environment = await probeRenderEnvironment(page);
  assertPinnedRenderEnvironment(environment);
  for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
    const base = join(directory, family),
      fixture = await createCueProjectFixture(
        base,
        family,
        route === "surface-marking"
          ? { width: 1440, height: 816, fps: 30 }
          : undefined,
      ),
      original = await readMechanismCueAuthoring(
        fixture.instance,
        fixture.cuePath,
      );
    const surface: ReturnType<typeof surfaceAnnotationFixture> | undefined =
      route === "surface-marking"
        ? surfaceAnnotationFixture(fixture.instance.scene, family)
        : undefined;
    const part =
      surface?.part ??
      (family === "tape-hook"
        ? fixture.instance.scene.rigs.find((r) => r.type === "slider")!
            .movingPart
        : fixture.instance.scene.parts[0]!.id);
    const legacy = compileMechanismNarratedCycle(
        fixture.instance,
        fixture.document,
      ),
      prepared = await prepareNative3DSceneV2(
        fixture.instance.scene,
        fixture.document.source.sha256,
      );
    const first = evaluateComp(legacy.composition, 0, {
      preparedNative3D: { [fixture.document.source.id]: prepared },
    }).layers.find((l) => l.layer.type === "native3d")!.nativeFrame!;
    const camera = fixture.instance.scene.camera,
      eye = new Vector3(...camera.position),
      target = new Vector3(...camera.target),
      cameraWorld = new Matrix4()
        .lookAt(eye, target, new Vector3(...camera.up))
        .setPosition(eye);
    const depth = eye.distanceTo(target) * 0.4,
      focal =
        fixture.document.output.height /
        (2 * Math.tan((camera.fovDegrees * Math.PI) / 360));
    const position = eye
      .clone()
      .addScaledVector(
        new Vector3().setFromMatrixColumn(cameraWorld, 2),
        -depth,
      )
      .addScaledVector(
        new Vector3().setFromMatrixColumn(cameraWorld, 1),
        (depth * (fixture.document.output.height / 2 - 60)) / focal,
      );
    const planeWorld = cameraWorld.clone().setPosition(position),
      partWorld = new Matrix4().fromArray(first.frame.parts[part]!.worldMatrix),
      local = partWorld.invert().multiply(planeWorld);
    const localPosition = new Vector3(),
      localRotation = new Quaternion(),
      localScale = new Vector3();
    local.decompose(localPosition, localRotation, localScale);
    const rotation = new Euler().setFromQuaternion(localRotation, "XYZ");
    const world = {
      id: "mark",
      kind: "world-text" as const,
      text: "Pin",
      part,
      transform: {
        position: localPosition.toArray() as [number, number, number],
        rotation: [rotation.x, rotation.y, rotation.z] as [
          number,
          number,
          number,
        ],
        scale: localScale.toArray() as [number, number, number],
        pivot: [0, 0, 0] as [number, number, number],
      },
      pixelsPerUnit: (128 * focal) / (depth * 40),
      sizePixels: [128, 64] as [number, number],
      fontSizePixels: 48,
      ink: "#ff0000",
      side: "front" as const,
    };
    const authored = MechanismNarratedCycleSchema.parse({
      ...fixture.document,
      revision: 1,
      cues: fixture.document.cues.map((cue) => ({
        ...cue,
        worldAnnotations: [surface?.annotation ?? world],
      })),
    });
    await saveMechanismCueAuthoring(
      fixture.instance,
      authored,
      fixture.cuePath,
      { revision: original.document.revision, hash: original.projectHash },
    );
    type Stage = {
      stage: string;
      compiled: Awaited<ReturnType<typeof compileMechanismCueProject>>;
      previewPath: string;
      controls: unknown[];
      output: {
        render: Awaited<ReturnType<typeof renderMechanismCueProject>>;
        check: Awaited<ReturnType<typeof checkMechanismCueOutput>>;
        proof: Awaited<ReturnType<typeof parallelOutputProof>>;
      };
    };
    const stages: Stage[] = [];
    let patchReceipt: unknown;
    for (const stage of ["before", "edited"] as const) {
      if (stage === "edited") {
        const current = await readMechanismCueAuthoring(
          fixture.instance,
          fixture.cuePath,
        );
        patchReceipt = await patchMechanismCueAuthoring(
          fixture.instance,
          fixture.cuePath,
          {
            schemaVersion: "mechanism-cue-patch-1",
            baseRevision: current.document.revision,
            baseHash: current.projectHash,
            operations: authored.cues.map((cue) => {
              const { id, ...value } = cue.worldAnnotations![0]!;
              assert.equal(id, "mark");
              return {
                cue: cue.id,
                annotation: "mark",
                property: "world-annotation",
                value: { ...value, ink: "#00ff00" },
              };
            }),
          },
        );
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
              stages[0]!.output.render.outputPath,
            ),
          /current family\/cue revision/,
        );
      }
      const compiled = await compileMechanismCueProject(
          fixture.familyPath,
          fixture.cuePath,
          join(base, stage + "-compiled"),
        ),
        loaded = await loadComposition(compiled.compositionPath, "webgl2"),
        color = stage === "before" ? "red" : "green";
      const worldLayers = loaded.composition.layers.filter(
        (layer) => layer.metadata?.track === "world-annotation",
      );
      assert.equal(worldLayers.length, 4);
      for (const layer of worldLayers) {
        if (surface)
          assert.equal(
            (layer.metadata?.surface as { mesh: string }).mesh,
            surface.selected.mesh,
          );
        else assert.equal(layer.metadata?.surface, undefined);
      }
      const args = [
        loaded.composition,
        loaded.preparedNative3D!,
        loaded.nativeAppearanceCodeIdentity!,
        color,
      ];
      const measured = JSON.parse(
        await page.evaluate(async (input) => {
          const path = "/tests/helpers/mechanism-world-annotations-browser.ts";
          const helper = (await import(path)) as typeof Proof;
          return JSON.stringify(
            await helper.worldAnnotationsBrowserProof(
              ...(JSON.parse(input) as Parameters<
                typeof helper.worldAnnotationsBrowserProof
              >),
            ),
          );
        }, JSON.stringify(args)),
      ) as Awaited<ReturnType<typeof Proof.worldAnnotationsBrowserProof>>;
      assert.equal(measured.measuredFrames, 60);
      assert.equal(measured.seekDraws, 180);
      assert.equal(measured.forwardReverseRandomStable, true);
      if (family === "tape-hook")
        assert.notDeepEqual(
          measured.frames[0]!.partWorldMatrix,
          measured.frames[37]!.partWorldMatrix,
        );
      for (const sample of measured.pngs)
        await writeFile(
          join(base, `${stage}-frame-${sample.frame}.png`),
          Buffer.from(sample.png.split(",")[1]!, "base64"),
          { flag: "wx" },
        );
      const previewPath = join(base, stage + "-preview.json");
      await writeFile(
        previewPath,
        JSON.stringify(
          {
            frames: measured.frames,
            measuredFrames: measured.measuredFrames,
            seekDraws: measured.seekDraws,
            forwardReverseRandomStable: measured.forwardReverseRandomStable,
          },
          null,
          2,
        ) + "\n",
        { flag: "wx" },
      );
      const controls: unknown[] = [];
      for (const [index, hidden] of [
        null,
        part,
        fixture.instance.scene.parts[0]!.id,
      ].entries()) {
        const control = hidden
          ? await hiddenControlInputs(
              loaded.composition,
              loaded.preparedNative3D!,
              hidden,
              join(base, `${stage}-hidden-${index}-source.json`),
            )
          : {
              composition: loaded.composition,
              prepared: loaded.preparedNative3D!,
            };
        controls.push(
          JSON.parse(
            await page.evaluate(
              async (input) => {
                const path =
                  "/tests/helpers/mechanism-world-annotations-browser.ts";
                const helper = (await import(path)) as typeof Proof;
                return JSON.stringify(
                  await helper.worldAnnotationHiddenControl(
                    ...(JSON.parse(input) as Parameters<
                      typeof helper.worldAnnotationHiddenControl
                    >),
                  ),
                );
              },
              JSON.stringify([
                control.composition,
                control.prepared,
                loaded.nativeAppearanceCodeIdentity!,
                color,
                hidden ?? undefined,
              ]),
            ),
          ),
        );
      }
      if (family === "tape-hook" && stage === "before") {
        const overflowing = structuredClone(loaded.composition);
        for (const layer of overflowing.layers)
          if (
            layer.type === "text" &&
            layer.metadata?.track === "world-annotation"
          ) {
            layer.size = [2, 2];
            layer.textLayout = {
              width: 2,
              height: 2,
              lineHeight: 1.2,
              overflow: "error",
            };
          }
        await assert.rejects(
          () =>
            page.evaluate(
              async (input) => {
                const path =
                  "/tests/helpers/mechanism-world-annotations-browser.ts";
                const helper = (await import(path)) as typeof Proof;
                await helper.worldAnnotationsBrowserProof(
                  ...(JSON.parse(input) as Parameters<
                    typeof helper.worldAnnotationsBrowserProof
                  >),
                );
              },
              JSON.stringify([overflowing, ...args.slice(1)]),
            ),
          /Text exceeds its layout box|Text overflows/,
        );
      }
      const render = await renderMechanismCueProject(
          fixture.familyPath,
          fixture.cuePath,
          join(base, stage + "-compiled"),
          join(base, stage + "-render"),
        ),
        check = await checkMechanismCueOutput(
          fixture.familyPath,
          fixture.cuePath,
          join(base, stage + "-compiled"),
          render.outputPath,
        ),
        proof = await (route === "surface-marking"
          ? streamingCompositionOutputProof(render.outputPath, render.metrics)
          : parallelOutputProof(render.outputPath, render.metrics));
      assert.equal(check.nativeFrames, 60);
      assert.equal(check.nativePasses, 60);
      stages.push({
        stage,
        compiled,
        previewPath,
        controls,
        output: { render, check, proof },
      });
    }
    assert.notDeepEqual(
      stages[0]!.output.proof.decodedFrames,
      stages[1]!.output.proof.decodedFrames,
    );
    assert.equal(
      stages[0]!.output.proof.decodedAudio,
      stages[1]!.output.proof.decodedAudio,
    );
    assert.equal(
      parallelChecksum(await readFile(join(base, "narration.wav"))),
      authored.narration.sha256,
    );
    fixtures.push({
      family,
      part,
      route,
      ...(surface ? { surfaceSelection: surface.selected } : {}),
      stages,
      patchReceipt,
    });
    process.stdout.write(
      JSON.stringify({
        family,
        status: "passed",
        previewFrames: 120,
        seekDraws: 360,
        nativeExports: 2,
        hiddenControls: 6,
      }) + "\n",
    );
  }
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        version: "mechanism-world-annotation-proof-1",
        route,
        status: "passed",
        environment,
        fixtures,
        scope:
          "Explicit cue world text, actual font bounds, independent scalar projection/part matrices, visible ink, hidden/omitted controls, all-frame forward/reverse/random preview, revision-safe edits and before/after native final checks.",
        limits:
          route === "surface-marking"
            ? "Synthetic local PCM; explicit rigid-triangle marking only. No deforming surface, label-only plate reuse, genuine speech, continuous-time or human readability/appearance acceptance."
            : "Synthetic local PCM; no true surface marking, label-only plate reuse, genuine speech, continuous-time or human readability/appearance acceptance.",
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
      previewFrames: 360,
      seekDraws: 1080,
      nativeExports: 6,
      nativeFrames: 360,
      hiddenOrOmittedControlDraws: 18,
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
  process.stderr.write(`World annotation failure retained at ${directory}\n`);
  throw error;
} finally {
  await browser.close();
  await server.close();
}
