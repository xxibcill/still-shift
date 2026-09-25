import { describe, expect, it } from "vitest";
import { CinematicSceneSchema } from "../../packages/scene-contract/src/cinematic.ts";
import {
  compileCinematicScene,
  projectCinematicNode,
} from "../../packages/renderer-core/src/cinematic-scene.ts";

const source = () => ({
  schemaVersion: "illustrated-scene-2",
  title: "Detail to World",
  durationMs: 4000,
  fps: 24,
  assets: [
    {
      id: "art",
      path: "art.png",
      width: 3840,
      height: 2160,
      sha256: `sha256:${"a".repeat(64)}`,
    },
  ],
  nodes: [
    {
      id: "far",
      type: "image",
      x: -100,
      y: -100,
      width: 2200,
      height: 1300,
      fit: "stretch",
      states: [{ asset: "art" }],
    },
    {
      id: "room",
      type: "image",
      x: -100,
      y: -100,
      width: 2200,
      height: 1300,
      fit: "stretch",
      states: [{ asset: "art" }],
    },
    {
      id: "near",
      type: "image",
      x: -300,
      y: -100,
      width: 600,
      height: 1300,
      fit: "stretch",
      states: [{ asset: "art" }],
    },
  ],
  layers: [
    { node: "far", depth: 12, paintedBounds: [0, 0, 2200, 1300] },
    {
      node: "room",
      depth: 3,
      protectedRegion: [
        [1000, 450],
        [1300, 450],
        [1300, 850],
        [1000, 850],
      ],
    },
    { node: "near", depth: 1.6, edgeAttachments: ["left", "top", "bottom"] },
  ],
  camera: { travel: [0, 0], pullback: 0.65, anchor: [0.55, 0.55] },
  recipe: {
    preset: "detail_to_world",
    foreground: "near",
    subject: "room",
    background: "far",
    intensity: "dramatic",
  },
});

describe("detail to world", () => {
  it("retreats from the detail with constant focal length and depth-dependent shrinkage", () => {
    for (const fps of [24, 30])
      for (const intensity of ["dramatic", "standard", "restrained"]) {
        const input = source();
        input.fps = fps;
        input.recipe.intensity = intensity;
        const scene = compileCinematicScene(CinematicSceneSchema.parse(input));
        const retreat =
          0.65 *
          (intensity === "dramatic"
            ? 1
            : intensity === "standard"
              ? 0.75
              : 0.5);
        for (const layer of scene.layers) {
          const node = scene.nodes.find((node) => node.id === layer.node)!;
          const start = projectCinematicNode(scene, node, 0);
          expect(start.scale).toBeCloseTo(
            layer.depth / (layer.depth - retreat),
          );
          let previous = start.scale;
          for (let frame = 0; frame < scene.timeline.frameCount; frame++) {
            const p = projectCinematicNode(scene, node, frame);
            expect(p.scale).toBeLessThanOrEqual(previous + 1e-12);
            previous = p.scale;
          }
          expect(
            projectCinematicNode(scene, node, scene.timeline.frameCount - 1),
          ).toMatchObject({ left: node.x, top: node.y, scale: 1 });
          expect(projectCinematicNode(scene, node, 0)).toEqual(start);
        }
        expect(
          scene.cameraFrames.every(
            (key) => key.focal === 1 && key.x === 0 && key.y === 0,
          ),
        ).toBe(true);
        expect(scene.cameraValidation.subjectScaleReduction).toBeCloseTo(
          retreat / 3,
        );
        expect(scene.cameraValidation.foregroundScaleReduction).toBeCloseTo(
          retreat / 1.6,
        );
        expect(scene.cameraValidation.backgroundScaleReduction).toBeCloseTo(
          retreat / 12,
        );
        expect(scene.cameraValidation.subjectAnchorTravelPx).toBeLessThan(1e-8);
        expect(scene.cameraValidation.foregroundTravelPx).toBeGreaterThan(0);
      }
  });
  it("requires explicit pullback, no mixed camera motion, and keeps the field exclusive", () => {
    for (const camera of [
      { travel: [0, 0] },
      { travel: [0, 0], pullback: 0 },
      { travel: [0, 0], pullback: -0.4 },
      { travel: [10, 0], pullback: 0.4 },
      { travel: [0, 0], pullback: 0.4, push: 0.1 },
    ])
      expect(
        CinematicSceneSchema.safeParse({ ...source(), camera }).success,
      ).toBe(false);
    const legacy = source();
    legacy.recipe.preset = "layered_parallax";
    expect(CinematicSceneSchema.safeParse(legacy).success).toBe(false);
  });
  it("checks closest-frame resolution, final wide coverage and depth crossing", () => {
    const lowRes = source();
    lowRes.assets[0]!.height = 1000;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(lowRes)),
    ).toThrow(/Source resolution.*frame 0/);
    const uncovered = source();
    uncovered.nodes[0]!.width = 1900;
    uncovered.layers[0]!.paintedBounds = [0, 0, 1900, 1300];
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(uncovered)),
    ).toThrow(/coverage/);
    const crossing = source();
    crossing.camera.pullback = 1.55;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(crossing)),
    ).toThrow(/crosses/);
  });
  it("rejects inward foreground concealment and a nearly flat scale change", () => {
    const occluded = source();
    occluded.nodes[2]!.width = 1500;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(occluded)),
    ).toThrow(/occludes/);
    const flat = source();
    flat.layers[2]!.depth = 2.9;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(flat)),
    ).toThrow(/scale separation/);
  });
});
