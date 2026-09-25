import { describe, expect, it } from "vitest";
import { CinematicSceneSchema } from "../../packages/scene-contract/src/cinematic.ts";
import {
  compileCinematicScene,
  projectCinematicNode,
} from "../../packages/renderer-core/src/cinematic-scene.ts";

const source = () => ({
  schemaVersion: "illustrated-scene-2",
  title: "Track",
  durationMs: 7000,
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
      x: -150,
      y: -100,
      width: 2320,
      height: 1280,
      fit: "stretch",
      states: [{ asset: "art" }],
    },
    {
      id: "room",
      type: "image",
      x: -60,
      y: -100,
      width: 2230,
      height: 1280,
      fit: "stretch",
      states: [{ asset: "art" }],
    },
    {
      id: "near",
      type: "image",
      x: -50,
      y: -100,
      width: 700,
      height: 1280,
      fit: "stretch",
      states: [{ asset: "art" }],
    },
  ],
  layers: [
    { node: "far", depth: 10, paintedBounds: [0, 0, 2320, 1280] },
    {
      node: "room",
      depth: 3.5,
      edgeAttachments: ["left", "right", "top", "bottom"],
      protectedRegion: [
        [1050, 400],
        [1450, 400],
        [1450, 950],
        [1050, 950],
      ],
    },
    { node: "near", depth: 1.3, edgeAttachments: ["left", "top", "bottom"] },
  ],
  camera: { travel: [128, 0] },
  recipe: {
    preset: "lateral_track",
    foreground: "near",
    subject: "room",
    background: "far",
    intensity: "dramatic",
  },
});

describe("lateral track", () => {
  it("trucks all planes in one direction, lets the subject drift and sustains a constant middle speed at 24/30 fps", () => {
    for (const fps of [24, 30]) {
      const scene = compileCinematicScene(
        CinematicSceneSchema.parse({ ...source(), fps }),
      );
      const last = scene.timeline.frameCount - 1;
      for (const layer of scene.layers) {
        const node = scene.nodes.find((node) => node.id === layer.node)!;
        const start = projectCinematicNode(scene, node, 0);
        const end = projectCinematicNode(scene, node, last);
        expect(end.left - start.left).toBeCloseTo(-640 / layer.depth);
        expect(end.top).toBe(start.top);
        expect(end.scale).toBe(1);
        const step = (second: number) =>
          projectCinematicNode(scene, node, second * fps + 1).left -
          projectCinematicNode(scene, node, second * fps).left;
        expect(step(2)).toBeCloseTo(step(3), 8);
        expect(step(3)).toBeCloseTo(step(5), 8);
        let previous = start.left;
        for (let frame = 1; frame <= last; frame++) {
          const current = projectCinematicNode(scene, node, frame).left;
          expect(current).toBeLessThanOrEqual(previous + 1e-8);
          previous = current;
        }
        expect(projectCinematicNode(scene, node, 0)).toEqual(start);
      }
      expect(scene.cameraValidation.subjectAnchorTravelPx).toBeCloseTo(
        640 / 3.5,
      );
      expect(
        scene.cameraFrames.every(
          (key) => key.y === 0 && key.z === 0 && key.focal === 1,
        ),
      ).toBe(true);
    }
  });
  it("supports both directions and three useful strengths", () => {
    for (const direction of [-1, 1]) {
      const distances = [];
      for (const intensity of ["restrained", "standard", "dramatic"]) {
        const input = source();
        input.camera.travel = [128 * direction, 0];
        if (direction < 0) {
          input.nodes[1]!.x = -250;
          input.nodes[2]!.x = -550;
        }
        input.recipe.intensity = intensity;
        const scene = compileCinematicScene(CinematicSceneSchema.parse(input));
        distances.push(scene.cameraValidation.foregroundTravelPx);
      }
      expect(distances[0]).toBeLessThan(distances[1]!);
      expect(distances[1]).toBeLessThan(distances[2]!);
    }
  });
  it("rejects vertical/empty paths and unsafe middle-room cut edges", () => {
    for (const travel of [
      [0, 0],
      [120, 5],
    ]) {
      const input = source();
      input.camera.travel = travel;
      expect(CinematicSceneSchema.safeParse(input).success).toBe(false);
    }
    const seam = source();
    seam.nodes[1]!.width = 2000;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(seam)),
    ).toThrow(/cut edge room:right/);
  });
  it("rejects a weak track, a flattened depth stage and excessive subject drift", () => {
    const weak = source();
    weak.camera.travel = [1, 0];
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(weak)),
    ).toThrow(/Insufficient lateral track/);
    const flat = source();
    flat.layers[0]!.depth = 3.6;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(flat)),
    ).toThrow(/Insufficient lateral track/);
    const excessive = source();
    excessive.layers[1]!.depth = 2.7;
    excessive.nodes[1]!.width = 2500;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(excessive)),
    ).toThrow(/lateral track movement envelope/);
  });
});
