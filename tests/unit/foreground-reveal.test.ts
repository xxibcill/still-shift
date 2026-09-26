import { describe, expect, it } from "vitest";
import { CinematicSceneSchema } from "../../packages/scene-contract/src/cinematic.ts";
import {
  compileCinematicScene,
  projectCinematicNode,
} from "../../packages/renderer-core/src/cinematic-scene.ts";
import {
  inspectForegroundReveal,
  type AlphaImage,
} from "../../packages/renderer-core/src/reveal-validation.ts";

const region = [
  [1220, 450],
  [1620, 450],
  [1620, 950],
  [1220, 950],
];
const source = () => ({
  schemaVersion: "illustrated-scene-2",
  title: "Reveal",
  durationMs: 7000,
  fps: 24,
  assets: [
    {
      id: "roomArt",
      path: "room.png",
      width: 2400,
      height: 1400,
      sha256: `sha256:${"a".repeat(64)}`,
    },
    {
      id: "wallArt",
      path: "wall.png",
      width: 800,
      height: 1200,
      sha256: `sha256:${"b".repeat(64)}`,
    },
  ],
  nodes: [
    {
      id: "far",
      type: "image",
      x: -200,
      y: -100,
      width: 2400,
      height: 1400,
      fit: "stretch",
      states: [{ asset: "roomArt" }],
    },
    {
      id: "room",
      type: "image",
      x: -120,
      y: -100,
      width: 2160,
      height: 1280,
      fit: "stretch",
      states: [{ asset: "roomArt" }],
    },
    {
      id: "wall",
      type: "image",
      x: 1180,
      y: -60,
      width: 800,
      height: 1200,
      fit: "stretch",
      states: [{ asset: "wallArt" }],
    },
  ],
  layers: [
    { node: "far", depth: 12, paintedBounds: [0, 0, 2400, 1400] },
    {
      node: "room",
      depth: 4,
      protectedRegion: region,
      edgeAttachments: ["left", "right", "top", "bottom"],
    },
    { node: "wall", depth: 1.1, edgeAttachments: ["right", "top", "bottom"] },
  ],
  camera: { travel: [-100, 0] },
  recipe: {
    preset: "foreground_reveal",
    foreground: "wall",
    subject: "room",
    background: "far",
    intensity: "dramatic",
    revealRegion: region,
  },
});
const alpha = (
  width: number,
  height: number,
  left = 0,
  opacity = 255,
): AlphaImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = left; x < width; x++) data[(y * width + x) * 4 + 3] = opacity;
  return { width, height, data };
};
const images = () =>
  new Map([
    ["roomArt", alpha(2400, 1400)],
    ["wallArt", alpha(800, 1200, 200)],
  ]);

describe("foreground reveal", () => {
  it("clears actual alpha at every strength, holds the camera early and remains deterministic at 24/30 fps", () => {
    for (const fps of [24, 30])
      for (const intensity of ["dramatic", "standard", "restrained"]) {
        const input = source();
        input.fps = fps;
        input.recipe.intensity = intensity;
        const scene = compileCinematicScene(CinematicSceneSchema.parse(input));
        const result = inspectForegroundReveal(scene, images());
        expect(result.initialOcclusion).toBeCloseTo(0.3, 2);
        expect(result.finalOcclusion).toBe(0);
        expect(result.clearFrame).toBeLessThanOrEqual(result.settleFrame);
        expect(result.settleFrame).toBeLessThan(
          scene.timeline.frameCount * 0.6,
        );
        expect(result.checkedFrames).toBe(scene.timeline.frameCount);
        for (const node of scene.nodes) {
          const settled = projectCinematicNode(scene, node, result.settleFrame);
          expect(settled.scale).toBe(1);
          for (
            let frame = result.settleFrame;
            frame < scene.timeline.frameCount;
            frame++
          )
            expect(projectCinematicNode(scene, node, frame)).toEqual(settled);
          const first = projectCinematicNode(scene, node, 0);
          projectCinematicNode(scene, node, scene.timeline.frameCount - 1);
          expect(projectCinematicNode(scene, node, 0)).toEqual(first);
        }
        expect(scene.cameraValidation.subjectAnchorTravelPx).toBeLessThan(1e-8);
      }
  });
  it("requires a nonzero horizontal path and a valid semantic target", () => {
    const absent = source();
    delete (absent.recipe as Record<string, unknown>).revealRegion;
    expect(CinematicSceneSchema.safeParse(absent).success).toBe(false);
    for (const travel of [
      [0, 0],
      [-100, 1],
    ]) {
      const input = source();
      input.camera.travel = travel;
      expect(CinematicSceneSchema.safeParse(input).success).toBe(false);
    }
    const empty = source();
    empty.recipe.revealRegion = [
      [1, 1],
      [2, 2],
      [3, 3],
    ];
    expect(CinematicSceneSchema.safeParse(empty).success).toBe(false);
    const outside = source();
    outside.recipe.revealRegion = [
      [0, 0],
      [9999, 0],
      [0, 20],
    ];
    expect(CinematicSceneSchema.safeParse(outside).success).toBe(false);
  });
  it("rejects transparent or misplaced foregrounds instead of reporting an empty reveal", () => {
    const scene = compileCinematicScene(CinematicSceneSchema.parse(source()));
    const transparent = images();
    transparent.set("wallArt", alpha(800, 1200, 800));
    expect(() => inspectForegroundReveal(scene, transparent)).toThrow(
      /initial occlusion/,
    );
    const misplaced = source();
    misplaced.nodes[2]!.x = 1600;
    expect(() =>
      inspectForegroundReveal(
        compileCinematicScene(CinematicSceneSchema.parse(misplaced)),
        images(),
      ),
    ).toThrow(/initial occlusion/);
  });
  it("rejects a motion that covers the subject further and a foreground that never clears", () => {
    const backwards = source();
    backwards.camera.travel = [100, 0];
    backwards.nodes[2]!.width = 1100;
    const scene = compileCinematicScene(CinematicSceneSchema.parse(backwards));
    expect(() => inspectForegroundReveal(scene, images())).toThrow(
      /reocclusion|initial occlusion|clear/,
    );
    const weak = source();
    weak.camera.travel = [-40, 0];
    weak.recipe.intensity = "restrained";
    expect(() =>
      inspectForegroundReveal(
        compileCinematicScene(CinematicSceneSchema.parse(weak)),
        images(),
      ),
    ).toThrow(/clear/);
  });
  it("includes additional nearer occluders and rejects an empty target mask", () => {
    const input = source();
    input.nodes.push({
      ...input.nodes[2]!,
      id: "blocker",
      x: 1050,
      width: 1100,
    });
    input.layers.push({
      node: "blocker",
      depth: 3,
      edgeAttachments: ["top", "bottom"],
    });
    const scene = compileCinematicScene(CinematicSceneSchema.parse(input));
    expect(() => inspectForegroundReveal(scene, images())).toThrow(
      /initial occlusion|clear/,
    );
    const noSubject = images();
    noSubject.set("roomArt", alpha(2400, 1400, 2400));
    expect(() =>
      inspectForegroundReveal(
        compileCinematicScene(CinematicSceneSchema.parse(source())),
        noSubject,
      ),
    ).toThrow(/target/);
  });
});
