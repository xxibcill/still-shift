import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  MechanismGeometrySchema,
  MechanismSceneSchema,
  MechanismSidecarSchema,
  type MechanismScene,
} from "@still-shift/scene-contract";
import {
  evaluateMechanismFrame,
  prepareMechanismScene,
} from "@still-shift/renderer-core";
import {
  captureMechanismPlates,
  canonicalMechanismHash,
  MECHANISM_PROOF_PROTECTION,
  type MechanismCaptureResult,
} from "../../packages/animation-engine/src/mechanism/capture.ts";
import {
  createTapeHookGeometry,
  TAPE_HOOK_RIVET_MESH_IDS,
} from "../../packages/animation-engine/src/mechanism/geometry.ts";
import { inspectCompositionPng } from "../../packages/animation-engine/src/composition-media-color.ts";

const fontPath = fileURLToPath(
  new URL(
    "../../assets/story-motion/fonts/plex-sans-semibold.ttf",
    import.meta.url,
  ),
);
let root: string;
let scene: MechanismScene;
let initial: MechanismCaptureResult;
let options: Parameters<typeof captureMechanismPlates>[0];

function fixtureScene(): MechanismScene {
  const geometry = MechanismGeometrySchema.parse(createTapeHookGeometry());
  return MechanismSceneSchema.parse({
    schemaVersion: "mechanism-scene-1",
    id: "capture-tape",
    geometrySha256: canonicalMechanismHash(geometry),
    coordinateSystem: "right-handed-y-up",
    units: { kind: "illustrative", scaleToMeters: 0.01 },
    geometry,
    parts: [
      { id: "model" },
      { id: "hook", parent: "model" },
      { id: "blade", parent: "model" },
      {
        id: "housing",
        parent: "model",
        transform: { position: [10.5, 2.55, 0] },
      },
      { id: "board" },
      { id: "wall", visible: false },
      { id: "floor" },
      { id: "datum", visible: false },
      { id: "thickness", parent: "hook", visible: false },
      { id: "travel", parent: "model", visible: false },
    ],
    rigs: [
      {
        id: "slider",
        type: "tape-hook-slider",
        rootPart: "model",
        hookPart: "hook",
        bladePart: "blade",
        rivetMeshIds: [...TAPE_HOOK_RIVET_MESH_IDS],
        thickness: 0.18,
        contactMode: "pull",
      },
    ],
    anchors: [
      {
        id: "hook.innerFace",
        part: "hook",
        position: [0, 1.25, 0],
        role: "physical-inner-face",
      },
      {
        id: "hook.outerFace",
        part: "hook",
        position: [-0.18, 1.25, 0],
        role: "physical-outer-face",
      },
      {
        id: "hook.label",
        part: "hook",
        position: [-0.18, 1.25, 0.4],
        role: "proof-target",
      },
    ],
    camera: {
      position: [-4.2, 5.6, 6.8],
      target: [0.8, 1.25, 0],
      fovDegrees: 36,
      near: 0.03,
      far: 100,
    },
    profile: {
      toneMapping: "aces-filmic",
      exposure: 1.14,
      output: "srgb-rgba8-straight",
    },
    lights: [
      {
        id: "key",
        type: "directional",
        position: [-4, 11, 6],
        target: [0, 0, 0],
        color: "#fff4dd",
        intensity: 3.1,
        castShadow: true,
        shadowMapSize: 256,
      },
    ],
  });
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "still-shift-mechanism-capture-"));
  scene = fixtureScene();
  const prepared = prepareMechanismScene(scene);
  const fontHash = `sha256:${createHash("sha256")
    .update(await readFile(fontPath))
    .digest("hex")}`;
  options = {
    scene,
    width: 160,
    height: 284,
    fps: 30,
    shotId: "V8-02",
    frames: [
      evaluateMechanismFrame(prepared, { frame: 0, width: 160, height: 284 }),
    ],
    font: {
      path: fontPath,
      sha256: fontHash,
      weight: "600",
      family: "IBM Plex Sans",
    },
    outputDirectory: join(root, "original"),
    cacheDirectory: join(root, "cache"),
  };
  const started = performance.now();
  initial = await captureMechanismPlates(options);
  process.stdout.write(
    `CAPTURE_RUNTIME_EVIDENCE ${JSON.stringify({ root, png: join(initial.outputDirectory, initial.frames[0]!.path), wallSeconds: (performance.now() - started) / 1000, rssBytes: process.memoryUsage().rss, environment: initial.environment })}\n`,
  );
}, 120_000);

describe("first-party mechanism plate capture", () => {
  it("captures a real tagged sRGB plate with pinned renderer and independent scene-raycast sidecar", async () => {
    expect(initial.new3dRenders).toBe(1);
    expect(initial.cacheHits).toBe(0);
    expect(initial.environment.profile).toBe("chromium-software-2");
    expect(initial.environment.webglRenderer).toContain("SwiftShader");
    const runtimeReceipt = JSON.parse(
      await readFile(initial.receiptPath, "utf8"),
    );
    expect(runtimeReceipt.identity.threeRuntime.version).toBe("0.186.0");
    const runtimeFiles = runtimeReceipt.identity.threeRuntime.sources as {
      name: string;
      sha256: string;
    }[];
    expect(runtimeFiles.map((item) => item.name)).toEqual([
      "three.module.js",
      "three.core.js",
      "RoomEnvironment.js",
      "package.json",
    ]);
    const modulePath = join(
      dirname(createRequire(import.meta.url).resolve("three")),
      "three.module.js",
    );
    expect(runtimeFiles[0]!.sha256).toBe(
      `sha256:${createHash("sha256")
        .update(await readFile(modulePath))
        .digest("hex")}`,
    );
    const png = await readFile(join(initial.outputDirectory, "000000.png"));
    expect(inspectCompositionPng(png)).toMatchObject({
      width: 160,
      height: 284,
      bitDepth: 8,
      colorType: 6,
      colorAuthority: "sRGB",
    });
    const sidecar = MechanismSidecarSchema.parse(
      JSON.parse(await readFile(initial.sidecarPath, "utf8")),
    );
    expect(sidecar.frames[0]).toMatchObject({
      frame: 0,
      sourceFrame: 0,
      shotId: "V8-02",
    });
    expect(
      sidecar.frames[0]!.anchors.every(
        (anchor) =>
          anchor.visibilityMethod === "scene-raycast" &&
          anchor.projectionErrorPixels <= 0.5,
      ),
    ).toBe(true);
    expect(
      sidecar.frames[0]!.assertions.every((assertion) => assertion.passed),
    ).toBe(true);
    const row = sidecar.frames[0]!;
    const visible = row.anchors.filter(
      (anchor) => anchor.visibility === "visible",
    );
    expect(visible.length).toBeGreaterThan(0);
    expect(row.protectedRegions.map((region) => region.id)).toEqual(
      visible.map((anchor) => anchor.anchor),
    );
    expect(initial.proofProtection).toEqual(MECHANISM_PROOF_PROTECTION);
    for (const region of row.protectedRegions) {
      const anchor = visible.find(
        (candidate) => candidate.anchor === region.id,
      )!;
      const [x, y, width, height] = region.bounds;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(options.width);
      expect(y + height).toBeLessThanOrEqual(options.height);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      expect(width).toBeLessThanOrEqual(48);
      expect(height).toBeLessThanOrEqual(48);
      expect(anchor.pixel![0]).toBeGreaterThanOrEqual(x);
      expect(anchor.pixel![0]).toBeLessThanOrEqual(x + width);
      expect(anchor.pixel![1]).toBeGreaterThanOrEqual(y);
      expect(anchor.pixel![1]).toBeLessThanOrEqual(y + height);
    }
    const receipt = JSON.parse(await readFile(initial.receiptPath, "utf8"));
    expect(receipt.identity.proofProtection).toEqual(
      MECHANISM_PROOF_PROTECTION,
    );
  });

  it("rehashes exact cached plates and publishes a new immutable output with zero 3D renders", async () => {
    const cached = await captureMechanismPlates({
      ...options,
      outputDirectory: join(root, "cached"),
    });
    expect(cached.requestHash).toBe(initial.requestHash);
    expect(cached.new3dRenders).toBe(0);
    expect(cached.cacheHits).toBe(1);
    expect(cached.frames[0]!.sha256).toBe(initial.frames[0]!.sha256);
    expect(await readFile(join(cached.outputDirectory, "000000.png"))).toEqual(
      await readFile(join(initial.outputDirectory, "000000.png")),
    );
    const repeated = await captureMechanismPlates({
      ...options,
      outputDirectory: cached.outputDirectory,
    });
    expect(repeated.new3dRenders).toBe(0);
    expect(repeated.cacheHits).toBe(1);
  }, 120_000);

  it("rejects corrupt cache bytes, rerenders into a new entry and preserves the prior output", async () => {
    const before = await readFile(join(initial.outputDirectory, "000000.png"));
    await writeFile(
      join(initial.cacheEntryDirectory!, "000000.png"),
      "corrupt cache plate",
    );
    const repaired = await captureMechanismPlates({
      ...options,
      outputDirectory: join(root, "repaired"),
    });
    expect(repaired.new3dRenders).toBe(1);
    expect(repaired.cacheHits).toBe(0);
    expect(repaired.cacheEntryDirectory).not.toBe(initial.cacheEntryDirectory);
    expect(await readFile(join(initial.outputDirectory, "000000.png"))).toEqual(
      before,
    );
    expect(
      await readFile(join(initial.cacheEntryDirectory!, "000000.png"), "utf8"),
    ).toBe("corrupt cache plate");
  }, 120_000);

  it("preserves existing and corrupt outputs and retains located failure receipts", async () => {
    const occupied = join(root, "occupied");
    await mkdir(occupied);
    await writeFile(join(occupied, "000000.png"), "previous delivery");
    let error: unknown;
    try {
      await captureMechanismPlates({ ...options, outputDirectory: occupied });
    } catch (cause) {
      error = cause;
    }
    expect(error).toMatchObject({
      name: "AnimationEngineError",
      context: { stage: "mechanism-capture-output", path: occupied },
    });
    const retained = (error as { context: { attemptDirectory: string } })
      .context.attemptDirectory;
    expect(
      JSON.parse(await readFile(join(retained, "failure.json"), "utf8")),
    ).toMatchObject({
      status: "failed",
      error: {
        diagnostic: { stage: "mechanism-capture-output", path: occupied },
      },
    });
    expect(await readFile(join(occupied, "000000.png"), "utf8")).toBe(
      "previous delivery",
    );
    const corruptOutput = join(root, "cached");
    await writeFile(
      join(corruptOutput, "000000.png"),
      "corrupt existing delivery",
    );
    await expect(
      captureMechanismPlates({ ...options, outputDirectory: corruptOutput }),
    ).rejects.toMatchObject({ name: "AnimationEngineError" });
    expect(await readFile(join(corruptOutput, "000000.png"), "utf8")).toBe(
      "corrupt existing delivery",
    );
  }, 120_000);

  it("retains cancelled attempt evidence without publishing completed artifacts", async () => {
    const controller = new AbortController();
    controller.abort(new Error("test cancellation"));
    const output = join(root, "cancelled");
    let error: unknown;
    try {
      await captureMechanismPlates({
        ...options,
        outputDirectory: output,
        signal: controller.signal,
      });
    } catch (cause) {
      error = cause;
    }
    expect(error).toMatchObject({
      name: "AnimationEngineError",
      context: { diagnostic: "mechanism-capture-cancelled" },
    });
    const retained = (error as { context: { attemptDirectory: string } })
      .context.attemptDirectory;
    expect(
      JSON.parse(await readFile(join(retained, "failure.json"), "utf8")),
    ).toMatchObject({ status: "cancelled" });
    expect(await readdir(root)).not.toContain("cancelled");
  });

  it("keeps requested frame order separate from source seek indices and source fps", async () => {
    const prepared = prepareMechanismScene(scene);
    const ordered = await captureMechanismPlates({
      ...options,
      fps: 24,
      shotId: "V8-ordered",
      frames: [17, 3].map((frame) =>
        evaluateMechanismFrame(prepared, {
          frame,
          width: options.width,
          height: options.height,
        }),
      ),
      outputDirectory: join(root, "ordered"),
    });
    expect(ordered.new3dRenders).toBe(2);
    expect(
      ordered.frames.map(({ frame, sourceFrame, path }) => ({
        frame,
        sourceFrame,
        path,
      })),
    ).toEqual([
      { frame: 0, sourceFrame: 17, path: "000000.png" },
      { frame: 1, sourceFrame: 3, path: "000001.png" },
    ]);
    const sidecar = MechanismSidecarSchema.parse(
      JSON.parse(await readFile(ordered.sidecarPath, "utf8")),
    );
    expect(sidecar.fps).toBe(24);
    expect(
      sidecar.frames.map((frame) => [
        frame.frame,
        frame.sourceFrame,
        frame.shotId,
      ]),
    ).toEqual([
      [0, 17, "V8-ordered"],
      [1, 3, "V8-ordered"],
    ]);
    expect(
      sidecar.frames.every((frame) =>
        frame.assertions.every(
          (assertion) => assertion.frame === frame.sourceFrame,
        ),
      ),
    ).toBe(true);
    const receipt = JSON.parse(await readFile(ordered.receiptPath, "utf8"));
    expect(receipt.identity).toMatchObject({ fps: 24, shotId: "V8-ordered" });
  }, 120_000);

  it("cancels an active browser capture, retains rendered attempt plates and publishes no receipt", async () => {
    const controller = new AbortController();
    const output = join(root, "active-cancelled");
    let settled = false;
    const pending = captureMechanismPlates({
      ...options,
      frames: Array.from({ length: 16 }, () => options.frames[0]!),
      outputDirectory: output,
      signal: controller.signal,
    }).then(
      (result) => {
        settled = true;
        return result;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
    let retained: string | undefined;
    const deadline = performance.now() + 20_000;
    while (!settled && performance.now() < deadline) {
      const attempts = (await readdir(root)).filter((name) =>
        name.startsWith(".active-cancelled.capture-"),
      );
      for (const attempt of attempts) {
        const directory = join(root, attempt);
        if ((await readdir(directory)).includes("000000.png")) {
          retained = directory;
          controller.abort(new Error("active cancellation test"));
          break;
        }
      }
      if (retained) break;
      await delay(2);
    }
    if (!retained)
      controller.abort(new Error("active cancellation progress deadline"));
    const error = await pending;
    expect(retained).toBeDefined();
    expect(error).toMatchObject({
      name: "AnimationEngineError",
      context: { diagnostic: "mechanism-capture-cancelled" },
    });
    expect(
      JSON.parse(await readFile(join(retained!, "failure.json"), "utf8")),
    ).toMatchObject({ status: "cancelled" });
    expect(await readdir(output)).toEqual([]);
    expect((await readdir(retained!)).includes("000000.png")).toBe(true);
  }, 120_000);

  it("rejects stale geometry identities and source-font hashes before browser capture", async () => {
    await expect(
      captureMechanismPlates({
        ...options,
        scene: { ...scene, geometrySha256: `sha256:${"0".repeat(64)}` },
        outputDirectory: join(root, "bad-geometry"),
      }),
    ).rejects.toMatchObject({
      code: "SCENE_INVALID",
      context: { path: "scene.geometrySha256" },
    });
    await expect(
      captureMechanismPlates({
        ...options,
        font: { ...options.font, sha256: "0".repeat(64) },
        outputDirectory: join(root, "bad-font"),
      }),
    ).rejects.toMatchObject({
      name: "AnimationEngineError",
      context: { path: fontPath },
    });
  });
});
