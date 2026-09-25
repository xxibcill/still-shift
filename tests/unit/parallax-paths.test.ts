import { describe, it, expect } from "vitest";
import { CinematicSceneSchema } from "../../packages/scene-contract/src/cinematic.ts";
import {
  compileCinematicScene,
  projectCinematicNode,
} from "../../packages/renderer-core/src/cinematic-scene.ts";
const source = (preset: string) => ({
  schemaVersion: "illustrated-scene-2",
  title: "Camera paths",
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
  nodes: ["far", "middle", "near"].map((id) => ({
    id,
    type: "image",
    x: -240,
    y: -200,
    width: 2400,
    height: 1500,
    fit: "stretch",
    states: [{ asset: "art" }],
  })),
  layers: [
    { node: "far", depth: 12, paintedBounds: [0, 0, 2400, 1500] },
    {
      node: "middle",
      depth: 4,
      protectedRegion: [
        [900, 500],
        [1200, 500],
        [1200, 950],
        [900, 950],
      ],
    },
    { node: "near", depth: 1 },
  ],
  camera:
    preset === "rising_vista"
      ? { travel: [0, -40] }
      : { travel: [30, 0], push: 0.18, curve: [100, -40, 0.08] },
  recipe: {
    preset,
    foreground: "near",
    subject: "middle",
    background: "far",
    intensity: "dramatic",
  },
});
describe("parallax camera paths", () => {
  it("rises vertically with inverse-depth travel and a level, fixed-scale view", () => {
    for (const fps of [24, 30])
      for (const intensity of ["dramatic", "standard", "restrained"]) {
        const input = source("rising_vista");
        input.fps = fps;
        input.recipe.intensity = intensity;
        const scene = compileCinematicScene(CinematicSceneSchema.parse(input));
        const expected =
          intensity === "dramatic" ? 200 : intensity === "standard" ? 150 : 100;
        for (const layer of scene.layers) {
          const node = scene.nodes.find((n) => n.id === layer.node)!;
          const end = projectCinematicNode(
            scene,
            node,
            scene.timeline.frameCount - 1,
          );
          expect(end.top - node.y).toBeCloseTo(expected / layer.depth);
          expect(end.left).toBe(node.x);
          expect(end.scale).toBe(1);
        }
        expect(scene.cameraValidation.foregroundVerticalTravelPx).toBeCloseTo(
          expected,
        );
      }
  });
  it("follows a bowed approach, keeps the target anchored, and holds deterministically", () => {
    for (const fps of [24, 30]) {
      const input = source("curved_approach");
      input.fps = fps;
      const scene = compileCinematicScene(CinematicSceneSchema.parse(input));
      const near = scene.nodes.find((n) => n.id === "near")!;
      const start = projectCinematicNode(scene, near, 0),
        end = projectCinematicNode(scene, near, scene.timeline.frameCount - 1);
      const middle = projectCinematicNode(
        scene,
        near,
        Math.floor(scene.timeline.frameCount * 0.35),
      );
      const cross =
        (middle.left - start.left) * (end.top - start.top) -
        (middle.top - start.top) * (end.left - start.left);
      expect(Math.abs(cross)).toBeGreaterThan(100);
      expect(end.scale).toBeCloseTo(1 / (1 - 0.18));
      expect(scene.cameraValidation.subjectAnchorTravelPx).toBeLessThan(1e-8);
      expect(
        projectCinematicNode(scene, near, scene.cameraFrames[2]!.frame),
      ).toEqual(end);
      expect(projectCinematicNode(scene, near, 0)).toEqual(start);
    }
  });
  it("rejects descending/mixed rises, missing or straight curves, and curve fields on old recipes", () => {
    const rise = source("rising_vista");
    rise.camera.travel = [10, -40];
    expect(CinematicSceneSchema.safeParse(rise).success).toBe(false);
    rise.camera.travel = [0, 40];
    expect(CinematicSceneSchema.safeParse(rise).success).toBe(false);
    const curve = source("curved_approach");
    delete curve.camera.curve;
    expect(CinematicSceneSchema.safeParse(curve).success).toBe(false);
    curve.camera.curve = [15, 0, 0.09];
    expect(CinematicSceneSchema.safeParse(curve).success).toBe(false);
    curve.recipe.preset = "layered_parallax";
    expect(CinematicSceneSchema.safeParse(curve).success).toBe(false);
  });
  it("checks the curve interior against coverage and rejects a crossed depth plane", () => {
    const curve = source("curved_approach");
    curve.nodes[0]!.x = -1;
    curve.camera.curve = [-160, 0, 0.08];
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(curve)),
    ).toThrow(/coverage/);
    const crossing = source("curved_approach");
    crossing.camera.push = 1;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(crossing)),
    ).toThrow(/crosses/);
  });
});
