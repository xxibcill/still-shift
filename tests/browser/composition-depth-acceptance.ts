import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createServer } from "vite";
import {
  type Composition,
  type CompositionAsset,
} from "@still-shift/scene-contract";
import { depthToComposition } from "@still-shift/renderer-core";
import {
  loadComposition,
  renderComposition,
} from "@still-shift/animation-engine";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import { ffmpegArguments } from "@still-shift/execution-runtime/export";
import {
  depthReferenceFixtures,
  extendedDepthReferenceFixtures,
} from "../helpers/composition-depth-fixtures.ts";
import { cameraPreview } from "./camera-preview.ts";
import {
  cameraHardwarePreview,
  type CameraFixture,
} from "./camera-hardware.ts";
import { depthGraphAcceptance } from "./depth-graph.ts";
import { depthInspectorAcceptance } from "./depth-inspector.ts";
import {
  depthFailureAcceptance,
  depthAlphaAcceptance,
} from "./depth-failures.ts";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { depthRenderCosts } from "./depth-cost.ts";

const root = resolve(import.meta.dirname, "../.."),
  directory = await mkdtemp(join(tmpdir(), "ce4d-depth-acceptance-")),
  server = await createServer({
    root,
    configFile: false,
    cacheDir: join(directory, "vite-cache"),
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  }),
  fixtureDirectory = join(root, "benchmarks/fixtures/composition/ce4d"),
  digest = (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
await server.listen();
const browser = await launchRenderBrowser();
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name=(fn)=>fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const environment = await probeRenderEnvironment(page);
  assertPinnedRenderEnvironment(environment);
  const sourceHash = digest(
      await readFile(join(fixtureDirectory, "source.svg")),
    ),
    fixtures = [
      ...depthReferenceFixtures(),
      ...extendedDepthReferenceFixtures(`sha256:${sourceHash}`),
    ],
    hardwareFixtures: CameraFixture[] = [],
    reports: unknown[] = [];
  assert.equal(fixtures.length, 23);
  async function exports(doc: Composition, pngs: string[]) {
    const input = join(directory, `${doc.id}.json`),
      relocatedDirectory = join(directory, `${doc.id}-portable`);
    await mkdir(relocatedDirectory);
    await writeFile(input, JSON.stringify(doc));
    const portable = join(relocatedDirectory, "composition.json");
    let errors = "";
    assert.equal(
      await runCli(
        ["comp", "export-json", "--input", input, "--output", portable],
        {
          stdout: () => {},
          stderr: (text) => {
            errors += text;
          },
        },
      ),
      0,
      errors,
    );
    const loaded = await loadComposition(portable, "webgl2"),
      expectedPath = join(directory, `${doc.id}-independent.mp4`);
    await new Promise<void>((accept, reject) => {
      const encoder = spawn(
        "ffmpeg",
        ffmpegArguments(loaded.scene, expectedPath, "libx264", "png_pipe"),
        { stdio: ["pipe", "ignore", "pipe"] },
      );
      let errors = "";
      let writeFailure: unknown;
      const failWriting = (error: unknown) => {
        writeFailure ??= error;
        encoder.stdin.destroy();
        encoder.kill();
      };
      encoder.stderr.on("data", (chunk) => {
        errors += String(chunk);
      });
      encoder.on("error", reject);
      encoder.stdin.on("error", failWriting);
      encoder.on("close", (code) =>
        writeFailure !== undefined
          ? reject(writeFailure)
          : code === 0
            ? accept()
            : reject(Error(`ffmpeg ${code}: ${errors}`)),
      );
      void (async () => {
        for (const png of pngs)
          if (!encoder.stdin.write(Buffer.from(png, "base64")))
            await once(encoder.stdin, "drain");
        encoder.stdin.end();
      })().catch(failWriting);
    });
    const expectedHash = `sha256:${digest(await readFile(expectedPath))}`;
    for (const [label, transport] of [
      ["production", "png_pipe"],
      ["repeat", "png_pipe"],
      ["raw", "raw_rgba"],
    ] as const) {
      console.log(`Depth ${doc.id}: ${label}/${transport} export starts`);
      const result = await renderComposition({
        compositionPath: portable,
        backend: "webgl2",
        transport,
        outputPath: join(directory, `${doc.id}-${label}.mp4`),
      });
      assert.equal(result.frameCount, doc.frameCount);
      assert.equal(
        result.checksums.output,
        expectedHash,
        `${doc.id}/${label} independent encode`,
      );
      assert.deepEqual(result.systemFontLayers, []);
    }
    return {
      independentPreviewMp4: "byte-identical",
      repeatedMp4: "byte-identical",
      rawPngTransport: "byte-identical",
      cliJsonRelocation: "pass",
    };
  }
  const preparedFixtures = await Promise.all(
    fixtures.map(async (fixture) => {
      const assets: CompositionAsset[] = [
        {
          id: "source",
          type: "image",
          path: join(fixtureDirectory, fixture.source),
          sha256: `sha256:${digest(await readFile(join(fixtureDirectory, fixture.source)))}`,
          width: 1600,
          height: 900,
        },
      ];
      if (fixture.scene.motion.mode === "depth")
        assets.push({
          id: "depth",
          type: "image",
          path: join(fixtureDirectory, fixture.depth!),
          sha256: `sha256:${digest(await readFile(join(fixtureDirectory, fixture.depth!)))}`,
          width: fixture.depthWidth ?? 1600,
          height: fixture.depthHeight ?? 900,
        });
      return { fixture, assets };
    }),
  );
  const costs = [];
  for (const { fixture, assets } of preparedFixtures) {
    const doc = depthToComposition(fixture.scene, {
      id: `${fixture.id}-cost`,
      requestedPreset: fixture.requestedPreset,
      source: assets[0] as Extract<CompositionAsset, { type: "image" }>,
      ...(assets[1]
        ? { depth: assets[1] as Extract<CompositionAsset, { type: "image" }> }
        : {}),
    });
    const urls = Object.fromEntries(
      doc.assets.map((asset) => [asset.id, `/@fs${asset.path}`]),
    );
    costs.push({
      id: fixture.id,
      ...(await depthRenderCosts(page, doc, fixture.scene, urls)),
    });
    console.log(`Depth ${fixture.id}: serial render/readback costs recorded`);
  }
  console.log(
    "All 23 serial depth cost brackets completed; correctness/export phase starts",
  );
  const proof = join(
    root,
    "benchmarks/results/composition-ce4d-depth-verification",
  );
  await mkdir(proof, { recursive: true });
  await writeFile(
    join(proof, "serial-costs.json"),
    JSON.stringify(
      { phase: "serial-costs", acceptanceComplete: false, environment, costs },
      null,
      2,
    ) + "\n",
  );
  let localBase: Composition | undefined;
  let localScene: (typeof fixtures)[number]["scene"] | undefined;
  for (const { fixture, assets } of preparedFixtures) {
    const doc = depthToComposition(
        {
          ...fixture.scene,
          canvas: { width: fixture.width, height: fixture.height },
        },
        {
          id: fixture.id,
          requestedPreset: fixture.requestedPreset,
          source: assets[0] as Extract<CompositionAsset, { type: "image" }>,
          ...(assets[1]
            ? {
                depth: assets[1] as Extract<
                  CompositionAsset,
                  { type: "image" }
                >,
              }
            : {}),
        },
      ),
      assetUrls = Object.fromEntries(
        doc.assets.map((asset) => [asset.id, `/@fs${asset.path}`]),
      ),
      forward = Array.from({ length: doc.frameCount }, (_, frame) => frame),
      preview = await cameraPreview(page, doc, assetUrls, "webgl2", [
        ...forward,
        ...forward.toReversed(),
        0,
        45,
        2,
        89,
        0,
      ]);
    reports.push({
      id: doc.id,
      forward: doc.frameCount,
      reverse: doc.frameCount,
      seeks: 5,
      ...(await exports(
        doc,
        forward.map((frame) => preview.pngs[frame]!),
      )),
    });
    hardwareFixtures.push({
      name: doc.id,
      doc,
      assetUrls,
      backends: ["webgl2"],
      frames: [0, 45, 89],
    });
    if (fixture.id === "transparent-source-opaque-compatibility")
      reports.push({
        id: "depth-alpha-policy",
        checks: await depthAlphaAcceptance(page, doc, assetUrls),
      });
    if (fixture.id === "landscape-slow_push") {
      localScene = { ...fixture.scene, canvas: { width: 160, height: 90 } };
      localBase = depthToComposition(localScene, {
        id: "depth-local",
        source: assets[0] as Extract<CompositionAsset, { type: "image" }>,
        depth: assets[1] as Extract<CompositionAsset, { type: "image" }>,
      });
    }
    console.log(
      `Depth ${doc.id}: full seeks, CLI relocation, independent/repeat/raw exports pass`,
    );
  }
  assert(localBase && localScene);
  const fontSource = join(
      root,
      "benchmarks/fixtures/story-motion-continuous/access-constraint.json",
    ),
    font = JSON.parse(await readFile(fontSource, "utf8")).fonts[0] as Extract<
      CompositionAsset,
      { type: "font" }
    >;
  localBase.assets.push({
    ...font,
    type: "font",
    path: resolve(dirname(fontSource), font.path),
  });
  const assetUrls = Object.fromEntries(
      localBase.assets.map((asset) => [asset.id, `/@fs${asset.path}`]),
    ),
    mixed = await depthGraphAcceptance(page, localBase, localScene, assetUrls);
  reports.push({
    id: "depth-resource-failures",
    checks: await depthFailureAcceptance(page, localBase, assetUrls),
  });
  for (const { doc, pngs, hashes, frames, maxChannelDelta } of mixed) {
    reports.push({
      id: doc.id,
      forward: frames,
      reverse: frames,
      maxChannelDelta,
      hashes,
      ...(await exports(doc, pngs)),
    });
    hardwareFixtures.push({
      name: doc.id,
      doc,
      assetUrls,
      backends: ["webgl2"],
      frames: [0, 12, 23],
    });
    console.log(
      `Depth ${doc.id}: independent old-local-raster integration, seeks and exports pass`,
    );
  }
  const inspector = await depthInspectorAcceptance(
      browser,
      directory,
      localBase,
    ),
    hardware = await cameraHardwarePreview(
      server.resolvedUrls!.local[0]!,
      hardwareFixtures,
    );
  await writeFile(
    join(proof, "native-acceptance.json"),
    JSON.stringify(
      { environment, reports, inspector, hardware, costs },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
