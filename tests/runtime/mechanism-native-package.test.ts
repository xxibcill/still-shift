import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTapeHookProject } from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import {
  readMechanismEpisode,
  mechanismHash,
} from "../../packages/animation-engine/src/mechanism/io.ts";
import {
  prepareNativeMechanismEpisode,
  verifyNativePreparedEpisode,
} from "../../packages/animation-engine/src/mechanism/native-lifecycle.ts";
import { renderMechanismEpisode } from "../../packages/animation-engine/src/mechanism/lifecycle.ts";
import { selectMechanismRoute } from "../../packages/animation-engine/src/mechanism/route.ts";
import {
  packageMechanismEpisode,
  verifyMechanismPackageArtifacts,
} from "../../packages/animation-engine/src/mechanism/package.ts";
import { verifyNativeMechanismPackageArtifacts } from "../../packages/animation-engine/src/mechanism/native-package.ts";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function project() {
  const root = await mkdtemp(join(tmpdir(), "mechanism-native-package-"));
  roots.push(root);
  await createTapeHookProject({
    outputDirectory: join(root, "source"),
    fontPath: resolve("assets/story-motion/fonts/plex-sans-semibold.ttf"),
  });
  const episode = join(root, "source", "episode.json");
  // Package identity/relocation needs a real prepared source, with a short clock
  // so this test does not repeat the separate full E01 execution gate.
  const value = JSON.parse(await readFile(episode, "utf8"));
  value.output.frameCount = 2;
  value.shots = [
    {
      id: "package-shot",
      purpose: "Package relocation fixture",
      startFrame: 0,
      endFrameExclusive: 2,
      controls: {},
      labels: [],
    },
  ];
  value.captions = [];
  value.events = [];
  await writeFile(episode, `${JSON.stringify(value, null, 2)}\n`);
  return { root, episode, loaded: await readMechanismEpisode(episode) };
}
describe("portable native package without rendered-evidence invention", () => {
  it("packages native source selection while leaving absent authored routes and source bytes intact", async () => {
    const { root, episode } = await project();
    const original = await readFile(episode),
      outputDirectory = join(root, "source-only");
    const result = await packageMechanismEpisode(episode, {
      outputDirectory,
      route: "native3d",
    });
    expect(result.schemaVersion).toBe("mechanism-native-package-result-1");
    expect(result).not.toHaveProperty("new3dRenders");
    expect(result).not.toHaveProperty("cacheHits");
    expect(await readFile(join(outputDirectory, "episode.json"))).toEqual(
      original,
    );
    const verified = await verifyMechanismPackageArtifacts(outputDirectory);
    expect(verified.schemaVersion).toBe("mechanism-native-package-check-1");
    expect(verified.preparedChecked).toBe(false);
    const manifest = JSON.parse(
      await readFile(join(outputDirectory, "package.manifest.json"), "utf8"),
    );
    expect(manifest.routeSelection).toEqual({
      sourceRoute: null,
      effectiveRoute: "native3d",
      selectionOrigin: "cli-override",
    });
    expect(manifest).not.toHaveProperty("finalOutput");
  });
  it("rebases known native source locators while keeping recipe/source identities and preparation origin", async () => {
    const { root, episode, loaded } = await project();
    const selection = selectMechanismRoute(loaded.episode, "native3d");
    const prepared = await prepareNativeMechanismEpisode(
      loaded,
      { outputDirectory: join(root, "prepared") },
      selection,
    );
    const result = await packageMechanismEpisode(episode, {
      outputDirectory: join(root, "portable"),
      preparedDirectory: prepared.outputDirectory,
    });
    const receipt = JSON.parse(
      await readFile(
        join(root, "portable", "prepared", "prepared.receipt.json"),
        "utf8",
      ),
    );
    expect(receipt.routeSelection).toEqual(selection);
    expect(receipt.compositionSha256).toBe(prepared.compositionSha256);
    expect(receipt.preparedNativeSha256).toBe(prepared.preparedNativeSha256);
    expect(receipt.compositionSourceSha256).toBe(
      mechanismHash(
        await readFile(
          join(root, "portable", "prepared", receipt.compositionPath),
        ),
      ),
    );
    expect(result.preparedChecked).toBe(true);
    const checked = await verifyNativeMechanismPackageArtifacts(
      join(root, "portable"),
    );
    expect(checked.actualExecutionVerified).toBe(false);
    await expect(
      packageMechanismEpisode(episode, {
        outputDirectory: join(root, "mismatch"),
        preparedDirectory: prepared.outputDirectory,
        route: "bridge",
      }),
    ).rejects.toThrow(/assertion/);
    await expect(stat(join(root, "mismatch"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("fails closed on changed packaged source bytes and missing native provenance", async () => {
    const { root, episode } = await project();
    const outputDirectory = join(root, "portable");
    await packageMechanismEpisode(episode, {
      outputDirectory,
      route: "native3d",
    });
    const manifest = JSON.parse(
      await readFile(join(outputDirectory, "package.manifest.json"), "utf8"),
    );
    const source = manifest.files.find(
      (file: { role: string }) => file.role === "scene",
    );
    await writeFile(join(outputDirectory, source.path), "{}");
    await expect(
      verifyNativeMechanismPackageArtifacts(outputDirectory),
    ).rejects.toThrow(/bytes differ/);
  });
  it("rejects a portable captured descriptor that differs from its own hash", async () => {
    const { root, episode, loaded } = await project();
    const originalEpisode = await readFile(episode);
    const prepared = await prepareNativeMechanismEpisode(
      loaded,
      { outputDirectory: join(root, "prepared") },
      selectMechanismRoute(loaded.episode, "native3d"),
    );
    const outputDirectory = join(root, "portable");
    await packageMechanismEpisode(episode, {
      outputDirectory,
      preparedDirectory: prepared.outputDirectory,
    });
    await expect(
      verifyNativeMechanismPackageArtifacts(outputDirectory),
    ).resolves.toMatchObject({
      preparedChecked: true,
      actualExecutionVerified: false,
    });
    const receiptPath = join(
      outputDirectory,
      "prepared",
      "prepared.receipt.json",
    );
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    receipt.appearanceCodeIdentity.modules[0].sha256 = mechanismHash(
      Buffer.from("another captured module"),
    );
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
    await writeFile(receiptPath, receiptBytes);
    const manifestPath = join(outputDirectory, "package.manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.files.find(
      (file: { path: string }) =>
        file.path === "prepared/prepared.receipt.json",
    ).sha256 = mechanismHash(receiptBytes);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    // Every packaged file checksum now matches. Historical verification still
    // has to bind the captured descriptor to its own recorded appearance SHA.
    await expect(
      verifyNativeMechanismPackageArtifacts(outputDirectory),
    ).rejects.toThrow(
      /appearance descriptor differs from its recorded checksum/,
    );
    expect(await readFile(episode)).toEqual(originalEpisode);
  });
  it("requires a preparation refresh for saved camera edits and preserves the refreshed recipe", async () => {
    const { root, loaded } = await project();
    const options = { outputDirectory: join(root, "prepared") };
    const selection = selectMechanismRoute(loaded.episode, "native3d");
    const prepared = await prepareNativeMechanismEpisode(
      loaded,
      options,
      selection,
    );
    const originalReceipt = await readFile(prepared.receiptPath);
    const composition = JSON.parse(
      await readFile(prepared.compositionPath, "utf8"),
    );
    const controller = composition.layers.find(
      (layer: { type: string }) => layer.type === "native3d",
    );
    controller.camera = { ...loaded.scene.camera, fovDegrees: 40 };
    await writeFile(
      prepared.compositionPath,
      `${JSON.stringify(composition, null, 2)}\n`,
    );
    await expect(
      verifyNativePreparedEpisode(loaded, options.outputDirectory, {
        verifyCode: false,
      }),
    ).rejects.toThrow(/changed after preparation/);
    expect(await readFile(prepared.receiptPath)).toEqual(originalReceipt);
    const refreshed = await prepareNativeMechanismEpisode(
      loaded,
      options,
      selection,
    );
    expect(refreshed.compositionSourceSha256).not.toBe(
      prepared.compositionSourceSha256,
    );
    expect(refreshed.compositionSha256).not.toBe(prepared.compositionSha256);
    expect(refreshed.preparedNativeSha256).toBe(prepared.preparedNativeSha256);
    expect(refreshed.routeSelection).toEqual(selection);
    const verified = await verifyNativePreparedEpisode(
      loaded,
      options.outputDirectory,
      { verifyCode: false },
    );
    expect(
      verified.loadedComposition.composition.layers.find(
        (layer) => layer.type === "native3d",
      )?.camera,
    ).toMatchObject({ fovDegrees: 40 });
  });
  it("rejects changed pinned source bytes before creating a preparation directory", async () => {
    const { root, episode, loaded } = await project();
    const originalEpisode = await readFile(episode);
    const scenePath = loaded.dependencyPaths[loaded.episode.scene]!;
    const scene = await readFile(scenePath);
    await writeFile(scenePath, Buffer.concat([scene, Buffer.from("\n")]));
    const outputDirectory = join(root, "changed-source");
    await expect(
      prepareNativeMechanismEpisode(
        loaded,
        { outputDirectory },
        selectMechanismRoute(loaded.episode, "native3d"),
      ),
    ).rejects.toThrow(/source bytes changed/);
    await expect(stat(outputDirectory)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(episode)).toEqual(originalEpisode);
  });
  it("rejects an explicit Canvas native render before output or cache mutation", async () => {
    const { root, episode } = await project();
    const original = await readFile(episode);
    const outputDirectory = join(root, "canvas-output");
    const cacheDirectory = join(root, "canvas-cache");
    await expect(
      renderMechanismEpisode(episode, {
        outputDirectory,
        cacheDirectory,
        route: "native3d",
        backend: "canvas2d",
      }),
    ).rejects.toThrow(/requires WebGL2/);
    await expect(stat(outputDirectory)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(cacheDirectory)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(episode)).toEqual(original);
  });
});
