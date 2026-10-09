import type * as FileSystem from "node:fs/promises";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnimationEngineError,
  MechanismEpisodeSchema,
  MechanismSidecarSchema,
} from "@still-shift/scene-contract";
import {
  evaluateMechanismFrame,
  prepareMechanismScene,
} from "@still-shift/renderer-core";
import { createTapeHookProject } from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import {
  mechanismContentHash,
  mechanismHash,
  readMechanismEpisode,
  writeMechanismJson,
} from "../../packages/animation-engine/src/mechanism/io.ts";
import { compileMechanismComposition } from "../../packages/animation-engine/src/mechanism/overlays.ts";
import {
  packageMechanismEpisode,
  verifyMechanismPackageArtifacts,
} from "../../packages/animation-engine/src/mechanism/package.ts";
import { checkMechanismEpisode } from "../../packages/animation-engine/src/mechanism/lifecycle.ts";
import { createMechanismCommandReceipt } from "../../packages/animation-engine/src/mechanism/protocol.ts";
import {
  mediaRgbaPng,
  mediaPngChunk,
} from "../helpers/composition-media-png.ts";
const directories: string[] = [];
const injection = vi.hoisted(() => ({
  afterCopy: undefined as ((destination: string) => void) | undefined,
  afterLink: undefined as ((destination: string) => void) | undefined,
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return {
    ...actual,
    copyFile: async (source: string, destination: string, flags?: number) => {
      await actual.copyFile(source, destination, flags);
      injection.afterCopy?.(destination);
    },
    link: async (source: string, destination: string) => {
      await actual.link(source, destination);
      injection.afterLink?.(destination);
    },
  };
});
afterEach(async () => {
  injection.afterCopy = undefined;
  injection.afterLink = undefined;
  vi.restoreAllMocks();
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "mechanism-package-test-"));
  directories.push(root);
  const project = join(root, "source"),
    preparedDirectory = join(root, "original-prepared"),
    captureDirectory = join(preparedDirectory, "plates", "fixture");
  await createTapeHookProject({
    outputDirectory: project,
    fontPath: resolve("assets/story-motion/fonts/plex-sans-semibold.ttf"),
    fontLicensePath: resolve("assets/story-motion/fonts/plex-LICENSE.txt"),
  });
  const episodePath = join(project, "episode.json"),
    initial = await readMechanismEpisode(episodePath);
  const episode = MechanismEpisodeSchema.parse({
    ...initial.episode,
    output: { width: 64, height: 64, fps: 30, frameCount: 3 },
    shots: [
      {
        ...initial.episode.shots[0]!,
        id: "fixture",
        startFrame: 0,
        endFrameExclusive: 3,
        labels: [],
        controls: { slider: { travel: 0 } },
      },
    ],
    events: [],
    captions: [],
  });
  await writeMechanismJson(episodePath, episode, { replace: true });
  const loaded = await readMechanismEpisode(episodePath),
    prepared = prepareMechanismScene(loaded.scene),
    shot = episode.shots[0]!;
  await mkdir(captureDirectory, { recursive: true });
  const png = mediaRgbaPng(64, 64, new Uint8Array(64 * 64 * 4).fill(255), [
      mediaPngChunk("sRGB", Buffer.from([0])),
    ]),
    pngHash = mechanismHash(png);
  const frames = Array.from({ length: 3 }, (_, frame) => ({
    frame,
    sourceFrame: frame,
    path: `${String(frame).padStart(6, "0")}.png`,
    sha256: pngHash,
    bytes: png.length,
  }));
  for (const frame of frames)
    await writeFile(join(captureDirectory, frame.path), png);
  // Synthetic evaluated metadata tests transport integrity; this fixture makes no renderer/occlusion claim.
  const sidecar = MechanismSidecarSchema.parse({
    schemaVersion: "mechanism-sidecar-1",
    sceneId: loaded.scene.id,
    sceneSha256: mechanismContentHash(loaded.scene),
    geometrySha256: loaded.scene.geometrySha256,
    rendererProfile: "synthetic-relocation-fixture",
    rendererVersion: "fixture",
    evaluatorVersion: "mechanism-evaluator-1",
    width: 64,
    height: 64,
    fps: 30,
    frameCount: 3,
    frames: frames.map((plate) => {
      const state = evaluateMechanismFrame(prepared, {
        frame: plate.sourceFrame,
        width: 64,
        height: 64,
        camera: shot.camera!,
        cameraKeys: shot.cameraKeys!,
        controls: shot.controls,
        hiddenParts: shot.hiddenParts,
      });
      return {
        frame: plate.frame,
        sourceFrame: plate.sourceFrame,
        shotId: shot.id,
        seed: state.seed,
        plateSha256: pngHash,
        camera: state.camera,
        parts: state.parts,
        rigs: state.rigs,
        assertions: state.assertions,
        anchors: Object.values(state.anchors).map((anchor) => ({
          ...anchor,
          visibility:
            anchor.projectionVisibility === "in-frame"
              ? "visible"
              : anchor.projectionVisibility,
          visibilityMethod: "scene-raycast",
          projectionErrorPixels: 0,
        })),
        protectedRegions: [],
      };
    }),
  });
  const sidecarPath = join(captureDirectory, "anchors.sidecar.json"),
    sequenceManifestPath = join(captureDirectory, "sequence.manifest.json"),
    captureReceiptPath = join(captureDirectory, "capture.receipt.json");
  await writeMechanismJson(sidecarPath, sidecar);
  await writeMechanismJson(sequenceManifestPath, {
    schemaVersion: "composition-sequence-1",
    frames: frames.map((frame) => frame.sha256),
  });
  const sidecarSha256 = mechanismHash(await readFile(sidecarPath)),
    sequenceManifestSha256 = mechanismHash(
      await readFile(sequenceManifestPath),
    );
  await writeMechanismJson(captureReceiptPath, {
    schemaVersion: "mechanism-plate-capture-1",
    status: "complete",
    plates: frames,
    sidecar: { path: "anchors.sidecar.json", sha256: sidecarSha256 },
    manifest: {
      path: "sequence.manifest.json",
      sha256: sequenceManifestSha256,
    },
  });
  const composition = compileMechanismComposition(loaded, [
    {
      shotId: shot.id,
      outputDirectory: captureDirectory,
      sequenceManifestPath,
      sidecarPath,
      frames: frames.map((frame) => frame.sha256),
      sidecar,
      sequenceSha256: sequenceManifestSha256,
      pattern: join(captureDirectory, "%06d.png"),
    },
  ]);
  const compositionPath = join(preparedDirectory, "composition.json");
  await writeMechanismJson(compositionPath, composition);
  await writeMechanismJson(join(preparedDirectory, "prepared.receipt.json"), {
    schemaVersion: "mechanism-prepared-episode-1",
    projectHash: loaded.projectHash,
    sourcePath: episodePath,
    outputDirectory: preparedDirectory,
    compositionPath,
    receiptPath: join(preparedDirectory, "prepared.receipt.json"),
    cacheHits: 0,
    new3dRenders: 3,
    wallSeconds: 0,
    captures: [
      {
        schemaVersion: "mechanism-plate-capture-1",
        shotId: shot.id,
        requestHash: "sha256:" + "a".repeat(64),
        outputDirectory: captureDirectory,
        patternPath: join(captureDirectory, "%06d.png"),
        firstFrame: 0,
        sequenceManifestPath,
        sequenceManifestSha256,
        sidecarPath,
        sidecarSha256,
        receiptPath: captureReceiptPath,
        attemptDirectory: join(preparedDirectory, "attempt-private"),
        cacheEntryDirectory: join(root, "cache-private"),
        cacheHits: 0,
        new3dRenders: 3,
        environment: {},
        proofProtection: {},
        frames,
      },
    ],
  });
  await mkdir(join(preparedDirectory, "attempt-private"));
  await writeFile(
    join(preparedDirectory, "attempt-private", "private.txt"),
    "not a declared artifact",
  );
  return { root, project, preparedDirectory, episodePath, loaded, pngHash };
}
async function filePaths(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...(await filePaths(root, path)));
    else result.push(path);
  }
  return result;
}
async function finalFixture(source: Awaited<ReturnType<typeof fixture>>) {
  const renderRoot = join(source.root, "original-render"),
    externalRoot = join(source.root, "external-reports");
  await mkdir(renderRoot);
  await mkdir(externalRoot);
  const finalOutput = join(renderRoot, "selected-final.mp4"),
    compositionPath = join(source.preparedDirectory, "composition.json"),
    sceneManifestPath = `${finalOutput}.scene.json`,
    resultPath = join(renderRoot, "episode.result.json"),
    sourceSha256 = mechanismHash(await readFile(compositionPath));
  // Real lifecycle shapes with synthetic media keep this a transport/identity test.
  await writeFile(finalOutput, "package-final-byte-fixture");
  await writeMechanismJson(sceneManifestPath, {
    schemaVersion: "composition-render-1",
    sourcePath: compositionPath,
    sourceChecksum: sourceSha256,
    scene: { fixture: true },
    assetPaths: { font: source.loaded.dependencyPaths["plex"] },
  });
  const render = {
    schemaVersion: "composition-result-1",
    status: "rendered",
    outputPath: finalOutput,
    sceneManifestPath,
    checksums: {
      source: sourceSha256,
      scene: mechanismHash(await readFile(sceneManifestPath)),
      output: mechanismHash(await readFile(finalOutput)),
    },
  };
  await writeMechanismJson(`${finalOutput}.result.json`, render);
  const result = {
    schemaVersion: "mechanism-render-result-1",
    status: "rendered",
    valid: true,
    projectHash: source.loaded.projectHash,
    outputPath: finalOutput,
    prepared: JSON.parse(
      await readFile(
        join(source.preparedDirectory, "prepared.receipt.json"),
        "utf8",
      ),
    ),
    render,
    check: {
      projectHash: source.loaded.projectHash,
      valid: true,
      findings: [],
    },
  };
  await writeMechanismJson(resultPath, result);
  const nested = await createMechanismCommandReceipt({
    command: "summary",
    summary: { projectHash: source.loaded.projectHash },
    artifacts: [
      {
        kind: "complete-result",
        path: resultPath,
        sha256: mechanismHash(await readFile(resultPath)),
      },
    ],
  });
  const externalReport = join(externalRoot, "complete.json");
  await writeMechanismJson(externalReport, { ...result, handoff: nested });
  const summary = await createMechanismCommandReceipt({
    command: "summary",
    summary: { projectHash: source.loaded.projectHash, resultPath },
    artifacts: [
      {
        kind: "full-report",
        path: externalReport,
        sha256: mechanismHash(await readFile(externalReport)),
      },
    ],
  });
  await writeMechanismJson(join(renderRoot, "project.summary.json"), summary);
  return {
    finalOutput,
    renderRoot,
    externalRoot,
    resultPath,
    sceneManifestPath,
    externalReport,
  };
}
describe("atomic portable mechanism package", () => {
  it("resolves native dependencies before canonicalizing a prepared directory alias", async () => {
    const source = await fixture(),
      aliasParent = join(await realpath(source.root), "aliases"),
      preparedAlias = join(aliasParent, "prepared"),
      compositionPath = join(source.preparedDirectory, "composition.json"),
      receiptPath = join(source.preparedDirectory, "prepared.receipt.json"),
      composition = JSON.parse(await readFile(compositionPath, "utf8")),
      receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    await mkdir(aliasParent);
    await symlink(source.preparedDirectory, preparedAlias, "dir");
    const font = composition.assets.find(
      (asset: { type: string }) => asset.type === "font",
    );
    font.path = relative(
      dirname(join(preparedAlias, "composition.json")),
      await realpath(source.loaded.dependencyPaths["plex"]!),
    );
    receipt.compositionPath = "composition.json";
    await writeMechanismJson(compositionPath, composition, { replace: true });
    await writeMechanismJson(receiptPath, receipt, { replace: true });
    const destination = join(source.root, "aliased-portable");
    await packageMechanismEpisode(source.episodePath, {
      outputDirectory: destination,
      preparedDirectory: preparedAlias,
    });
    expect((await verifyMechanismPackageArtifacts(destination)).valid).toBe(
      true,
    );
  });
  it.each(["pre-aborted", "during-copy", "before-publication"])(
    "retains %s cancellation without publication, releases the lock and supports a fresh retry",
    async (stage) => {
      const source = await fixture(),
        destination = join(source.root, stage),
        controller = new AbortController();
      const abort = () =>
        controller.abort(new Error("Synthetic package cancellation"));
      if (stage === "pre-aborted") abort();
      if (stage === "during-copy") injection.afterCopy = abort;
      if (stage === "before-publication")
        injection.afterLink = (path) => {
          if (path.endsWith("package.manifest.json")) abort();
        };
      let error: unknown;
      try {
        await packageMechanismEpisode(source.episodePath, {
          outputDirectory: destination,
          signal: controller.signal,
        });
      } catch (cause) {
        error = cause;
      }
      expect(error).toBeInstanceOf(AnimationEngineError);
      const failure = error as AnimationEngineError;
      expect(failure.context?.diagnosticCode).toBe(
        "mechanism-package-cancelled",
      );
      await expect(
        readFile(join(destination, "package.manifest.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expect(
        readFile(`${destination}.package.lock`),
      ).rejects.toMatchObject({ code: "ENOENT" });
      if (stage !== "pre-aborted") {
        const retained = String(failure.context!.attemptDirectory),
          report = JSON.parse(
            await readFile(join(retained, "failure.json"), "utf8"),
          );
        expect(report.status).toBe("cancelled");
        expect(await readFile(join(retained, "episode.json"))).toEqual(
          await readFile(source.episodePath),
        );
      }
      injection.afterCopy = undefined;
      injection.afterLink = undefined;
      expect(
        (
          await packageMechanismEpisode(source.episodePath, {
            outputDirectory: destination,
          })
        ).projectHash,
      ).toBe(source.loaded.projectHash);
    },
  );
  it("closes live render and nested handoff evidence with portable verified hashes", async () => {
    const source = await fixture(),
      final = await finalFixture(source),
      destination = join(source.root, "live-portable");
    const duplicate = join(final.externalRoot, "duplicate.json");
    await writeFile(duplicate, await readFile(final.externalReport));
    const summaryPath = join(final.renderRoot, "project.summary.json"),
      originalSummary = JSON.parse(await readFile(summaryPath, "utf8"));
    originalSummary.artifacts.push({
      ...originalSummary.artifacts[0],
      path: duplicate,
    });
    await writeMechanismJson(summaryPath, originalSummary, { replace: true });
    await packageMechanismEpisode(source.episodePath, {
      outputDirectory: destination,
      preparedDirectory: source.preparedDirectory,
      finalOutput: final.finalOutput,
    });
    const read = async (path: string) =>
      JSON.parse(await readFile(join(destination, path), "utf8"));
    const summary = await read("project.summary.json"),
      external = summary.artifacts[0];
    expect(summary.artifacts[1]).toEqual(external);
    expect(external.path).not.toBe(final.externalReport);
    expect(
      mechanismHash(await readFile(join(destination, external.path))),
    ).toBe(external.sha256);
    const full = await read(external.path),
      complete = full.handoff.artifacts[0];
    expect(complete.path).toBe("episode.result.json");
    expect(
      mechanismHash(await readFile(join(destination, complete.path))),
    ).toBe(complete.sha256);
    const result = await read("episode.result.json"),
      render = await read("episode.mp4.result.json"),
      scene = await read(render.sceneManifestPath);
    expect(result.outputPath).toBe("episode.mp4");
    expect(render.outputPath).toBe("episode.mp4");
    expect(render.sceneManifestPath).toBe("episode.mp4.scene.json");
    expect(scene.sourcePath).toBe("prepared/composition.json");
    expect(scene.sourceChecksum).toBe(
      mechanismHash(await readFile(join(destination, scene.sourcePath))),
    );
    expect(render.checksums.scene).toBe(
      mechanismHash(
        await readFile(join(destination, render.sceneManifestPath)),
      ),
    );
    expect(render.checksums.source).toBe(scene.sourceChecksum);
    expect(render.checksums.output).toBe(
      mechanismHash(await readFile(join(destination, render.outputPath))),
    );
    expect(result.render).toEqual(render);
    await Promise.all(
      [
        source.project,
        source.preparedDirectory,
        final.renderRoot,
        final.externalRoot,
      ].map((path) => rm(path, { recursive: true, force: true })),
    );
    expect((await verifyMechanismPackageArtifacts(destination)).valid).toBe(
      true,
    );
  });
  it.each([
    "old-revision",
    "wrong-output",
    "corrupt-report",
    "symlink-report",
    "symlink-report-directory",
    "unhashed-external-report",
    "escaping-report",
    "unknown-artifact",
  ])("rejects %s evidence without publishing", async (fault) => {
    const source = await fixture(),
      final = await finalFixture(source),
      destination = join(source.root, fault);
    if (fault === "old-revision") {
      const result = JSON.parse(await readFile(final.resultPath, "utf8"));
      result.projectHash = "sha256:" + "b".repeat(64);
      await writeMechanismJson(final.resultPath, result, { replace: true });
    } else if (fault === "wrong-output")
      await writeFile(final.finalOutput, "different final bytes");
    else if (fault === "corrupt-report")
      await writeFile(final.externalReport, "changed after declared hash");
    else if (fault === "symlink-report") {
      const actual = join(final.externalRoot, "actual.json");
      await writeFile(actual, await readFile(final.externalReport));
      await rm(final.externalReport);
      await symlink(actual, final.externalReport);
    } else if (fault === "symlink-report-directory") {
      const link = join(final.renderRoot, "linked-reports");
      await symlink(final.externalRoot, link, "dir");
      const path = join(final.renderRoot, "project.summary.json"),
        summary = JSON.parse(await readFile(path, "utf8"));
      summary.artifacts[0].path = join(link, "complete.json");
      await writeMechanismJson(path, summary, { replace: true });
    } else {
      const path = join(final.renderRoot, "project.summary.json"),
        summary = JSON.parse(await readFile(path, "utf8"));
      if (fault === "unhashed-external-report")
        delete summary.artifacts[0].sha256;
      else if (fault === "escaping-report")
        summary.artifacts[0].path = "../external-reports/complete.json";
      else summary.artifacts[0].kind = "unknown-secret";
      await writeMechanismJson(path, summary, { replace: true });
    }
    await expect(
      packageMechanismEpisode(source.episodePath, {
        outputDirectory: destination,
        preparedDirectory: source.preparedDirectory,
        finalOutput: final.finalOutput,
      }),
    ).rejects.toThrow("retained attempt");
    await expect(
      readFile(join(destination, "package.manifest.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("checks source/prepared outputs after original roots disappear, retaining every declared byte and font license", async () => {
    const source = await fixture(),
      destination = join(source.root, "portable");
    const { renderRoot, finalOutput } = await finalFixture(source);
    const result = await packageMechanismEpisode(source.episodePath, {
      outputDirectory: destination,
      preparedDirectory: source.preparedDirectory,
      finalOutput,
    });
    const copiedReport = JSON.parse(
      await readFile(join(destination, "episode.result.json"), "utf8"),
    );
    expect(copiedReport.outputPath).toBe("episode.mp4");
    expect(copiedReport.prepared.sourcePath).toBe("episode.json");
    expect(copiedReport.prepared.compositionPath).toBe(
      join("prepared", "composition.json"),
    );
    expect(result.preparedChecked).toBe(true);
    await rm(source.project, { recursive: true, force: true });
    await rm(source.preparedDirectory, { recursive: true, force: true });
    await rm(renderRoot, { recursive: true, force: true });
    expect((await verifyMechanismPackageArtifacts(destination)).valid).toBe(
      true,
    );
    const loaded = await readMechanismEpisode(
      join(destination, "episode.json"),
    );
    expect(loaded.projectHash).toBe(source.loaded.projectHash);
    expect(
      (await checkMechanismEpisode(join(destination, "episode.json")))
        .mechanicalValid,
    ).toBe(true);
    const manifest = JSON.parse(
      await readFile(join(destination, "package.manifest.json"), "utf8"),
    );
    const actual = (await filePaths(destination))
      .filter((path) => path !== "package.manifest.json")
      .sort();
    expect(
      manifest.files.map((file: { path: string }) => file.path).sort(),
    ).toEqual(actual);
    expect(
      manifest.files.some((file: { role: string }) => file.role === "license"),
    ).toBe(true);
    expect(
      actual.some(
        (path) =>
          path.includes("attempt-private") || path.includes("cache-private"),
      ),
    ).toBe(false);
    const receipt = JSON.parse(
      await readFile(
        join(destination, "prepared", "prepared.receipt.json"),
        "utf8",
      ),
    );
    expect(receipt.sourcePath).toBe("../episode.json");
    expect(receipt.outputDirectory).toBe(".");
    const composition = JSON.parse(
      await readFile(
        join(destination, "prepared", receipt.compositionPath),
        "utf8",
      ),
    );
    const font = composition.assets.find(
      (asset: { type: string }) => asset.type === "font",
    );
    expect(font.path).toBe("../assets/plex-sans-semibold.ttf");
    const plate = manifest.files.find(
      (file: { role: string }) => file.role === "clean-plate",
    );
    expect(plate.sha256).toBe(source.pngHash);
  });
  it("preserves an existing destination and retains a failed attempt with its original cause", async () => {
    const source = await fixture(),
      destination = join(source.root, "existing");
    await mkdir(destination);
    await writeFile(join(destination, "keep.txt"), "existing output");
    let error: unknown;
    try {
      await packageMechanismEpisode(source.episodePath, {
        outputDirectory: destination,
      });
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(AnimationEngineError);
    expect(await readFile(join(destination, "keep.txt"), "utf8")).toBe(
      "existing output",
    );
    const failure = error as AnimationEngineError;
    expect(failure.cause).toBeInstanceOf(AnimationEngineError);
    const attempt = String(failure.context!.attemptDirectory);
    const report = JSON.parse(
      await readFile(join(attempt, "failure.json"), "utf8"),
    );
    expect(report.failure.error.context.diagnosticCode).toBe(
      "mechanism-output-exists",
    );
  });
  it("refuses corrupt declared plates without publishing a partial directory", async () => {
    const source = await fixture(),
      destination = join(source.root, "corrupt-package");
    await writeFile(
      join(source.preparedDirectory, "plates", "fixture", "000000.png"),
      "corrupt",
    );
    await expect(
      packageMechanismEpisode(source.episodePath, {
        outputDirectory: destination,
        preparedDirectory: source.preparedDirectory,
      }),
    ).rejects.toThrow("retained attempt");
    await expect(
      readFile(join(destination, "package.manifest.json")),
    ).rejects.toThrow();
  });
  it("uses unique temporary identities for concurrent same-process exclusive JSON writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "mechanism-temporary-test-"));
    directories.push(root);
    const path = join(root, "result.json");
    vi.spyOn(Date, "now").mockReturnValue(0);
    const results = await Promise.allSettled(
      Array.from({ length: 32 }, (_, value) =>
        writeMechanismJson(path, { value }),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((await readdir(root)).sort()).toEqual(["result.json"]);
  });
});
