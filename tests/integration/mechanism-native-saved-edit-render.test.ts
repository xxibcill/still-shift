import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  createNativeObservationRequest,
  createTapeHookProject,
  nativeMechanismExecution,
  prepareMechanismEpisode,
  readMechanismEpisode,
  renderMechanismEpisode,
  verifyNativePreparedEpisode,
  writeMechanismJson,
} from "@still-shift/animation-engine";
import { verifyNativeObservationClosure } from "@still-shift/execution-runtime/export";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "native-saved-edit-render-"));
  roots.push(root);
  await createTapeHookProject({
    outputDirectory: join(root, "source"),
    fontPath: resolve("assets/story-motion/fonts/plex-sans-semibold.ttf"),
  });
  const episodePath = join(root, "source", "episode.json");
  const episode = JSON.parse(await readFile(episodePath, "utf8"));
  episode.output.width = 64;
  episode.output.height = 64;
  episode.output.frameCount = 2;
  episode.shots = [
    {
      id: "saved-edit-shot",
      purpose: "Saved camera export fixture",
      startFrame: 0,
      endFrameExclusive: 2,
      controls: {},
      labels: [],
    },
  ];
  episode.captions = [];
  episode.events = [];
  await writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`);
  return { root, episodePath, loaded: await readMechanismEpisode(episodePath) };
}

it("renders the refreshed saved camera at the same prepared subdirectory without replacing a previous final", async () => {
  const { root, episodePath, loaded } = await fixture();
  const sourceBytes = await readFile(episodePath);
  const outputDirectory = join(root, "render");
  const preparedDirectory = join(outputDirectory, "prepared");
  const prepared = await prepareMechanismEpisode(episodePath, {
    outputDirectory: preparedDirectory,
    route: "native3d",
  });
  if (prepared.schemaVersion !== "mechanism-prepared-native-episode-1")
    throw Error("Expected native preparation");
  const composition = JSON.parse(
    await readFile(prepared.compositionPath, "utf8"),
  );
  const controller = composition.layers.find(
    (layer: { type: string }) => layer.type === "native3d",
  );
  controller.camera = { ...loaded.scene.camera, fovDegrees: 40 };
  await writeMechanismJson(prepared.compositionPath, composition, {
    replace: true,
  });
  const refreshed = await prepareMechanismEpisode(episodePath, {
    outputDirectory: preparedDirectory,
    route: "native3d",
  });
  if (refreshed.schemaVersion !== "mechanism-prepared-native-episode-1")
    throw Error("Expected refreshed native preparation");
  expect(refreshed.compositionSha256).not.toBe(prepared.compositionSha256);
  const result = await renderMechanismEpisode(episodePath, {
    outputDirectory,
    route: "native3d",
  });
  if (result.schemaVersion !== "mechanism-native-render-result-1")
    throw Error("Expected native render result");
  expect(result.valid).toBe(true);
  expect(result.check.actualExecutionVerified).toBe(true);
  expect(result.prepared.compositionPath).toBe(refreshed.compositionPath);
  expect(result.prepared.compositionSha256).toBe(refreshed.compositionSha256);
  expect(result.prepared.routeSelection).toEqual(refreshed.routeSelection);
  const verified = await verifyNativePreparedEpisode(loaded, preparedDirectory);
  const request = await createNativeObservationRequest(
    verified.loadedComposition,
    nativeMechanismExecution(loaded, result.routeSelection),
  );
  if (!request || !result.render.metrics.nativeObservations)
    throw Error("Expected actual native closure");
  const fovs: number[] = [];
  await verifyNativeObservationClosure({
    closure: {
      ...result.render.metrics.nativeObservations,
      manifestPath: resolve(
        dirname(result.outputPath),
        result.render.metrics.nativeObservations.manifestPath,
      ),
    },
    execution: request.execution,
    expectedPasses: request.expectedPasses,
    output: {
      sha256: result.render.checksums.output,
      frameCount: 2,
      width: 64,
      height: 64,
      transport: result.render.metrics.frameTransport,
    },
    onFrame: (packet) => {
      expect(packet.passes).toHaveLength(1);
      fovs.push(packet.passes[0]!.observed.camera.fovDegrees);
    },
  });
  expect(fovs).toEqual([40, 40]);
  expect(
    JSON.parse(
      await readFile(join(outputDirectory, "episode.result.json"), "utf8"),
    ),
  ).toMatchObject({
    schemaVersion: "mechanism-native-render-result-1",
    valid: true,
  });
  expect(
    JSON.parse(
      await readFile(join(outputDirectory, "project.summary.json"), "utf8"),
    ),
  ).toMatchObject({
    status: "passed",
    summary: { actualExecutionVerified: true },
  });
  const finalBytes = await readFile(result.outputPath);
  const receiptBytes = await readFile(result.prepared.receiptPath);
  const entries = await readdir(outputDirectory);
  await expect(
    renderMechanismEpisode(episodePath, {
      outputDirectory,
      route: "native3d",
    }),
  ).rejects.toThrow(/only its associated preparation/);
  expect(await readFile(result.outputPath)).toEqual(finalBytes);
  expect(await readFile(result.prepared.receiptPath)).toEqual(receiptBytes);
  expect(await readdir(outputDirectory)).toEqual(entries);
  expect(await readFile(episodePath)).toEqual(sourceBytes);
}, 60_000);

it("rejects unrelated entries and symbolic or file output roots before refreshing any preparation", async () => {
  const { root, episodePath } = await fixture();
  const outputDirectory = join(root, "unrelated");
  const prepared = await prepareMechanismEpisode(episodePath, {
    outputDirectory: join(outputDirectory, "prepared"),
    route: "native3d",
  });
  const receiptBytes = await readFile(prepared.receiptPath);
  const sentinelPath = join(outputDirectory, "owner.txt");
  await writeFile(sentinelPath, "owner bytes");
  const fileRoot = join(root, "file-root");
  await writeFile(fileRoot, "owner file");
  const directoryTarget = join(root, "directory-target");
  await mkdir(directoryTarget);
  const symbolicRoot = join(root, "symbolic-root");
  await symlink(directoryTarget, symbolicRoot);
  const symbolicPreparedRoot = join(root, "symbolic-prepared-root");
  await mkdir(symbolicPreparedRoot);
  await symlink(
    join(outputDirectory, "prepared"),
    join(symbolicPreparedRoot, "prepared"),
  );
  for (const path of [
    outputDirectory,
    fileRoot,
    symbolicRoot,
    symbolicPreparedRoot,
  ])
    await expect(
      renderMechanismEpisode(episodePath, {
        outputDirectory: path,
        route: "native3d",
      }),
    ).rejects.toThrow(/only its associated preparation/);
  expect(await readFile(prepared.receiptPath)).toEqual(receiptBytes);
  expect(await readFile(sentinelPath, "utf8")).toBe("owner bytes");
  expect(await readFile(fileRoot, "utf8")).toBe("owner file");
  expect(await readdir(directoryTarget)).toEqual([]);
  await expect(
    stat(join(symbolicPreparedRoot, "episode.mp4")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});
