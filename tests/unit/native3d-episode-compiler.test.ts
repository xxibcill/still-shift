import { describe, expect, it } from "vitest";
import { MechanismEpisodeSchema } from "../../packages/scene-contract/src/mechanism/episode.ts";
import {
  createTapeHookScene,
  createTapeHookShots,
} from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import {
  compileNativeMechanismComposition,
  mechanismOverlayLayerId,
} from "../../packages/animation-engine/src/mechanism/overlays.ts";
import { mechanismHash } from "../../packages/animation-engine/src/mechanism/io.ts";
import { nativeCompositionSha256 } from "../../packages/animation-engine/src/native-observation.ts";
import { prepareCompositionNative3D } from "../../packages/renderer-core/src/native3d/prepare.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import { compositionNativePasses } from "../../packages/renderer-core/src/composition/render/graphs.ts";
import { transformPoint } from "../../packages/renderer-core/src/node-transform.ts";

function fixture() {
  const scene = createTapeHookScene(),
    rawSha = mechanismHash(JSON.stringify(scene));
  const episode = MechanismEpisodeSchema.parse({
    schemaVersion: "mechanism-episode-1",
    id: "nativeEpisode",
    revision: 0,
    scene: "scene",
    font: "font",
    output: { width: 1080, height: 1920, fps: 30, frameCount: 696 },
    dependencies: [
      { id: "scene", type: "scene", path: "scene.json", sha256: rawSha },
      {
        id: "font",
        type: "font",
        path: "font.ttf",
        sha256: "sha256:" + "a".repeat(64),
        weight: "600",
      },
    ],
    shots: createTapeHookShots(),
    captions: [],
  });
  const comp = compileNativeMechanismComposition({
    episode,
    scene,
    dependencyPaths: { scene: "/tmp/scene.json", font: "/tmp/font.ttf" },
  });
  return { scene, episode, comp, rawSha };
}
describe("native E01 episode compiler", () => {
  // All 27 full physical projections are CPU-heavy under concurrent unit workers;
  // this is a boundary/correctness test, not a renderer performance assertion.
  it("creates exactly nine half-open physical controllers and no plate assets", async () => {
    const { scene, episode, comp, rawSha } = fixture(),
      asset = comp.assets.find((asset) => asset.type === "native3d")!;
    const table = await prepareCompositionNative3D(comp, {
      version: "composition-prepared-native3d-1",
      assets: { [asset.id]: { sourceSha256: rawSha, source: scene } },
    });
    expect(
      comp.assets.some(
        (asset) =>
          asset.type === "sequence" ||
          asset.type === "video" ||
          asset.type === "image",
      ),
    ).toBe(false);
    expect(
      comp.layers.filter((layer) => layer.type === "native3d"),
    ).toHaveLength(9);
    for (const shot of episode.shots) {
      const samples = [
        shot.startFrame,
        shot.startFrame + 0.25,
        shot.endFrameExclusive - 1,
      ];
      for (const sample of samples) {
        const passes = [
          ...compositionNativePasses(comp, sample, {
            preparedNative3D: table,
            nativeObservationRequired: true,
          }),
        ];
        expect(passes).toHaveLength(1);
        expect(passes[0]!.frame.controller).toBe(
          mechanismOverlayLayerId("plate", shot.id),
        );
        expect(passes[0]!.frame.sourceFrame).toBeCloseTo(sample, 12);
      }
    }
  }, 15_000);
  it("keeps authored leader starts editable while current endpoints track the same live physical snapshot", async () => {
    const { scene, episode, comp, rawSha } = fixture(),
      asset = comp.assets.find((asset) => asset.type === "native3d")!;
    const table = await prepareCompositionNative3D(comp, {
      version: "composition-prepared-native3d-1",
      assets: { [asset.id]: { sourceSha256: rawSha, source: scene } },
    });
    const shot = episode.shots.find((shot) => shot.labels.length)!;
    const label = shot.labels[0]!;
    const frame = label.readingInterval.startFrame + 0.5;
    const tree = evaluateComp(comp, frame, { preparedNative3D: table });
    const leader = tree.layers.find(
      (layer) => layer.id === mechanismOverlayLayerId("leader", label.id),
    )!;
    const controller = tree.layers.find(
      (layer) => layer.id === mechanismOverlayLayerId("plate", shot.id),
    )!;
    expect(leader.nativeFrame).toBe(controller.nativeFrame);
    const line = leader.contents!.find((content) => content.id === "path")!;
    if (line.type !== "path") throw Error("Expected line");
    const anchor = controller.nativeFrame!.anchors[label.anchor]!;
    if (
      anchor.pixel &&
      (anchor.visibility === "visible" || anchor.visibility === "outside-frame")
    ) {
      const endpoint = transformPoint(
        leader.screenMatrix,
        line.path.vertices[1]!,
      );
      expect(
        Math.hypot(
          endpoint[0] - anchor.pixel[0],
          endpoint[1] - anchor.pixel[1],
        ),
      ).toBeLessThan(0.5);
    }
    const group = comp.layers.find(
      (layer) => layer.id === mechanismOverlayLayerId("annotation", label.id),
    )!;
    group.transform = { ...group.transform, position: [50, 25] };
    const moved = evaluateComp(comp, frame, {
      preparedNative3D: table,
    }).layers.find((layer) => layer.id === leader.id)!;
    const movedLine = moved.contents!.find((content) => content.id === "path")!;
    if (movedLine.type !== "path") throw Error("Expected line");
    expect(
      transformPoint(moved.screenMatrix, movedLine.path.vertices[0]!),
    ).toEqual(
      transformPoint(leader.screenMatrix, line.path.vertices[0]!).map(
        (value, index) => value + [50, 25][index]!,
      ),
    );
  });
  it("normalizes only known file locators while retaining current recipe edits", () => {
    const { comp } = fixture(),
      before = nativeCompositionSha256(comp),
      relocated = structuredClone(comp);
    relocated.assets.forEach((asset) => {
      asset.path = "relocated/" + asset.id;
    });
    expect(nativeCompositionSha256(relocated)).toBe(before);
    const controller = relocated.layers.find(
      (layer) => layer.type === "native3d",
    )!;
    if (controller.type !== "native3d") throw Error("Expected controller");
    controller.camera = {
      position: [1, 2, 8],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovDegrees: 35,
      near: 0.1,
      far: 100,
    };
    expect(nativeCompositionSha256(relocated)).not.toBe(before);
  });
});
