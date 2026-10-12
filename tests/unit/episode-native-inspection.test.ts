import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  AnimationEngineError,
  MechanismEpisodeSchema,
} from "@still-shift/scene-contract";
import {
  EPISODE_NATIVE_INSPECTION_VERSION,
  EpisodeNativeInspectionSelectionSchema,
  inspectEpisodeNativeMetadata,
  parseEpisodeNativeInspectionSelection,
} from "../../tools/still-shift-cli/src/episode-native-inspection.ts";
import { createTapeHookScene } from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import type { LoadedMechanismEpisode } from "../../packages/animation-engine/src/mechanism/io.ts";
import {
  createMechanismCommandReceipt,
  MechanismCommandReceiptSchema,
} from "../../packages/animation-engine/src/mechanism/protocol.ts";

const scene = createTapeHookScene();
const hash = "sha256:" + "a".repeat(64);
function fixture(): LoadedMechanismEpisode {
  return {
    scene,
    episode: MechanismEpisodeSchema.parse({
      schemaVersion: "mechanism-episode-1",
      id: "inspection",
      revision: 0,
      scene: "source",
      font: "font",
      output: { width: 256, height: 192, fps: 30, frameCount: 240 },
      dependencies: [
        { id: "source", type: "scene", path: "scene.json", sha256: hash },
        { id: "font", type: "font", path: "font.ttf", sha256: hash },
      ],
      shots: [
        {
          id: "override",
          purpose: "Override",
          startFrame: 0,
          endFrameExclusive: 200,
          camera: { ...scene.camera, fovDegrees: 70 },
          cameraKeys: [
            {
              frame: 0,
              position: scene.camera.position,
              target: scene.camera.target,
              easing: "linear",
            },
            {
              frame: 199,
              position: [8, 9, 10],
              target: [1, 2, 3],
              fovDegrees: 88,
              easing: "hold",
            },
          ],
          controls: { slider: { travel: 0.25, contactMode: "pull" } },
          hiddenParts: ["housing"],
        },
        {
          id: "defaults",
          purpose: "Defaults",
          startFrame: 200,
          endFrameExclusive: 240,
        },
      ],
    }),
    projectHash: hash,
    sourcePath: "/metadata/episode.json",
    dependencyPaths: {},
    fontDiagnostics: [],
  };
}
const selection = (native: string, rest = {}) =>
  EpisodeNativeInspectionSelectionSchema.parse({ native, ...rest });
function diagnostic(run: () => unknown) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AnimationEngineError);
    return (error as AnimationEngineError).context;
  }
  throw new Error("Expected located selection failure");
}
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("explicit source-only native episode inspection", () => {
  it("keeps its selection version strict and requires explicit compatible ID filters", () => {
    expect(selection("all").version).toBe(EPISODE_NATIVE_INSPECTION_VERSION);
    expect(
      EpisodeNativeInspectionSelectionSchema.safeParse({
        native: "all",
        version: "mechanism-native-inspection-99",
      }).success,
    ).toBe(false);
    expect(
      EpisodeNativeInspectionSelectionSchema.safeParse({
        native: "all",
        preparedDirectory: "/saved",
      }).success,
    ).toBe(false);
    expect(
      parseEpisodeNativeInspectionSelection(new Map([["shot", "override"]])),
    ).toBeUndefined();
    expect(
      diagnostic(() =>
        parseEpisodeNativeInspectionSelection(new Map([["part", "hook"]])),
      ),
    ).toMatchObject({
      path: "--part",
      diagnosticCode: "mechanism-inspect-selection",
    });
    expect(
      diagnostic(() =>
        parseEpisodeNativeInspectionSelection(
          new Map([
            ["native", "materials"],
            ["part", "hook"],
          ]),
        ),
      ),
    ).toMatchObject({ path: "--part" });
    expect(
      diagnostic(() =>
        parseEpisodeNativeInspectionSelection(new Map([["native", "preview"]])),
      ),
    ).toMatchObject({ path: "--native" });
    expect(
      diagnostic(() =>
        parseEpisodeNativeInspectionSelection(
          new Map([
            ["native", "parts"],
            ["shot", "override"],
          ]),
        ),
      ),
    ).toMatchObject({ path: "--shot" });
  });
  it("reports declared physical IDs, hashes and units without geometry or texture bytes", () => {
    const loaded = fixture(),
      before = JSON.stringify(loaded);
    const result = inspectEpisodeNativeMetadata(
      loaded,
      selection("all", {
        part: "hook",
        anchor: "hook.innerFace",
        material: scene.geometry.materials[0]!.id,
        rig: "slider",
        shot: "override",
      }),
    );
    expect(result.summary).toMatchObject({
      nativeInspectionVersion: EPISODE_NATIVE_INSPECTION_VERSION,
      nativeSourceSha256: hash,
      nativeUnits: "illustrative",
      nativeScaleToMeters: 1,
      nativeSourceScope: "original-scene",
      savedRecipeScope: "unassessed",
      nativeExecution: "unassessed",
    });
    expect(
      result.items.find((item) => item.kind === "native-source"),
    ).toMatchObject({
      schemaVersion: "mechanism-scene-1",
      geometrySha256: scene.geometrySha256,
      sourceSha256: hash,
      coordinateSystem: "right-handed-y-up",
    });
    expect(
      result.items.filter((item) => item.kind === "native-part"),
    ).toHaveLength(1);
    expect(
      result.items.find((item) => item.kind === "native-part"),
    ).toMatchObject({
      id: "hook",
      parent: "model",
      rotationUnit: "radians-euler-xyz",
      scaleX: 1,
    });
    expect(
      result.items.find((item) => item.kind === "native-anchor"),
    ).toMatchObject({
      id: "hook.innerFace",
      part: "hook",
      localX: 0,
      role: "physical-inner-face",
    });
    expect(
      result.items.find((item) => item.kind === "native-material"),
    ).toMatchObject({
      id: scene.geometry.materials[0]!.id,
      roughness: scene.geometry.materials[0]!.roughness,
    });
    for (const key of [
      "positions",
      "indices",
      "normals",
      "uvs",
      "textureBytes",
      "localMatrix",
      "worldMatrix",
    ])
      expect(JSON.stringify(result)).not.toContain(`"${key}"`);
    for (const item of result.items) {
      expect(Object.keys(item).length).toBeLessThanOrEqual(32);
      for (const value of Object.values(item))
        expect(
          value === null ||
            ["number", "boolean", "string"].includes(typeof value),
        ).toBe(true);
    }
    expect(JSON.stringify(loaded)).toBe(before);
  });
  it("reports exact authored camera keys with effective source and shot FOV fallback", () => {
    const loaded = fixture();
    const result = inspectEpisodeNativeMetadata(loaded, selection("cameras"));
    expect(
      result.items.find(
        (item) =>
          item.kind === "native-shot-camera" && item.shot === "override",
      ),
    ).toMatchObject({
      origin: "episode-shot-camera",
      fovDegrees: 70,
      keyCount: 2,
    });
    expect(
      result.items.find(
        (item) =>
          item.kind === "native-shot-camera" && item.shot === "defaults",
      ),
    ).toMatchObject({
      origin: "original-scene-camera",
      fovDegrees: scene.camera.fovDegrees,
      keyCount: 0,
    });
    expect(
      result.items.find(
        (item) => item.kind === "native-camera-key" && item.index === 0,
      ),
    ).toMatchObject({
      frame: 0,
      fovDegrees: 70,
      fovOrigin: "effective-base-camera",
      easing: "linear",
    });
    expect(
      result.items.find(
        (item) => item.kind === "native-camera-key" && item.index === 1,
      ),
    ).toMatchObject({
      frame: 199,
      positionX: 8,
      targetY: 2,
      fovDegrees: 88,
      fovOrigin: "episode-camera-key",
      easing: "hold",
    });
    expect(
      result.items
        .filter((item) => item.kind === "native-shot")
        .every((item) => item.frameDomain === "absolute-source-frame"),
    ).toBe(true);
    expect(
      result.items.filter((item) => item.kind === "native-shot-hidden-part"),
    ).toEqual([
      {
        kind: "native-shot-hidden-part",
        scope: "episode-shot-with-source-defaults",
        shot: "override",
        part: "housing",
      },
    ]);
  });
  it("distinguishes static travel, episode keys and original rig defaults without claiming sampled motion", () => {
    const loaded = fixture();
    loaded.episode.shots[1]!.controls.slider = {
      travelKeys: [
        { frame: 200, value: 0.1, easing: "linear" },
        { frame: 239, value: 0.9, easing: "hold" },
      ],
    };
    const keyed = inspectEpisodeNativeMetadata(
      loaded,
      selection("controls", { rig: "slider" }),
    );
    expect(
      keyed.items.find(
        (item) =>
          item.kind === "native-rig-control" && item.shot === "override",
      ),
    ).toMatchObject({
      travel: 0.25,
      travelOrigin: "episode-control-value",
      keyCount: 0,
      contactMode: "pull",
      contactModeOrigin: "episode-control",
    });
    expect(
      keyed.items.filter(
        (item) =>
          item.kind === "native-control-key" && item.shot === "override",
      ),
    ).toEqual([]);
    expect(
      keyed.items.find(
        (item) =>
          item.kind === "native-rig-control" && item.shot === "defaults",
      ),
    ).toMatchObject({
      travel: null,
      travelOrigin: "episode-control-keys",
      keyCount: 2,
      contactMode: scene.rigs[0]!.contactMode,
      contactModeOrigin: "original-rig",
    });
    expect(
      keyed.items
        .filter((item) => item.kind === "native-control-key")
        .map((item) => [item.frame, item.value]),
    ).toEqual([
      [200, 0.1],
      [239, 0.9],
    ]);
    delete loaded.episode.shots[1]!.controls.slider;
    const defaults = inspectEpisodeNativeMetadata(
      loaded,
      selection("controls", { shot: "defaults" }),
    );
    expect(
      defaults.items.find((item) => item.kind === "native-rig-control"),
    ).toMatchObject({
      travelOrigin: "original-rig-keys",
      keyCount: scene.rigs[0]!.travelKeys.length,
    });
    expect(
      defaults.items
        .filter((item) => item.kind === "native-control-key")
        .map((item) => ({
          frame: item.frame,
          value: item.value,
          easing: item.easing,
        })),
    ).toEqual(scene.rigs[0]!.travelKeys);
  });
  it("locates unknown declared IDs and shots in the exact selected option", () => {
    for (const [field, native] of [
      ["part", "parts"],
      ["anchor", "anchors"],
      ["material", "materials"],
      ["rig", "controls"],
      ["shot", "cameras"],
    ]) {
      expect(
        diagnostic(() =>
          inspectEpisodeNativeMetadata(
            fixture(),
            selection(native!, { [field!]: "missing" }),
          ),
        ),
      ).toMatchObject({
        path: `--${field}`,
        diagnosticCode:
          field === "shot"
            ? "mechanism-shot-reference"
            : "mechanism-inspect-reference",
      });
    }
  });
  it("paginates long camera sequences through the existing strict byte/item budget and retains complete rows", async () => {
    const loaded = fixture();
    loaded.episode.shots[0]!.cameraKeys = Array.from(
      { length: 200 },
      (_, frame) => ({
        frame,
        position: [frame / 100, 0, 10],
        target: [0, 0, 0],
        easing: "linear",
      }),
    );
    const result = inspectEpisodeNativeMetadata(
      loaded,
      selection("cameras", { shot: "override" }),
    );
    const directory = await mkdtemp(join(tmpdir(), "native-inspection-"));
    directories.push(directory);
    const path = join(directory, "report.json");
    const receipt = await createMechanismCommandReceipt(
      { command: "inspect", ...result, fullResult: result },
      { limit: 5, reportPath: path },
    );
    expect(MechanismCommandReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(receipt.schemaVersion).toBe("mechanism-command-result-1");
    expect(receipt.pagination).toMatchObject({
      total: 203,
      returned: 5,
      nextOffset: 5,
    });
    expect(receipt.items.length + receipt.artifacts.length).toBeLessThanOrEqual(
      100,
    );
    expect(Buffer.byteLength(JSON.stringify(receipt))).toBeLessThanOrEqual(
      32768,
    );
    const full = JSON.parse(await readFile(path, "utf8")) as typeof result;
    expect(
      full.items.filter((item) => item.kind === "native-camera-key"),
    ).toHaveLength(200);
    expect(full.items.at(-1)).toMatchObject({
      frame: 199,
      index: 199,
      fovDegrees: 70,
    });
    const next = await createMechanismCommandReceipt(
      { command: "inspect", ...result, fullResult: result },
      { offset: 5, limit: 5, reportPath: join(directory, "next.json") },
    );
    expect(next.items).toEqual(result.items.slice(5, 10));
  });
});
