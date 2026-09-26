import { describe, expect, it } from "vitest";
import { CinematicSceneSchema } from "../../packages/scene-contract/src/cinematic.ts";
import {
  compileCinematicScene,
  projectCinematicNode,
} from "../../packages/renderer-core/src/cinematic-scene.ts";

const source = () => ({
  schemaVersion: "illustrated-scene-2",
  title: "Threshold",
  durationMs: 7000,
  fps: 24,
  assets: [
    {
      id: "room",
      path: "room.png",
      width: 3840,
      height: 2160,
      sha256: `sha256:${"a".repeat(64)}`,
    },
    {
      id: "post",
      path: "post.png",
      width: 1600,
      height: 2400,
      sha256: `sha256:${"b".repeat(64)}`,
    },
  ],
  nodes: [
    {
      id: "far",
      type: "image",
      x: -120,
      y: -100,
      width: 2160,
      height: 1280,
      fit: "stretch",
      states: [{ asset: "room" }],
    },
    {
      id: "room",
      type: "image",
      x: -120,
      y: -100,
      width: 2160,
      height: 1280,
      fit: "stretch",
      states: [{ asset: "room" }],
    },
    {
      id: "left",
      type: "image",
      x: -150,
      y: -100,
      width: 550,
      height: 1280,
      fit: "stretch",
      states: [{ asset: "post" }],
    },
    {
      id: "right",
      type: "image",
      x: 1520,
      y: -100,
      width: 550,
      height: 1280,
      fit: "stretch",
      states: [{ asset: "post" }],
    },
  ],
  layers: [
    { node: "far", depth: 12, paintedBounds: [0, 0, 2160, 1280] },
    {
      node: "room",
      depth: 4,
      protectedRegion: [
        [1100, 450],
        [1400, 450],
        [1400, 850],
        [1100, 850],
      ],
    },
    { node: "left", depth: 1.6, edgeAttachments: ["left", "top", "bottom"] },
    { node: "right", depth: 1.6, edgeAttachments: ["right", "top", "bottom"] },
  ],
  camera: { travel: [0, 0], push: 0.4, anchor: [0.6, 0.58] },
  recipe: {
    preset: "threshold_push",
    foreground: "left",
    foregroundRight: "right",
    subject: "room",
    background: "far",
    intensity: "dramatic",
  },
});

describe("threshold push", () => {
  it("moves one camera forward with distinct plane scales and a stable subject anchor at 24/30 fps", () => {
    for (const fps of [24, 30]) {
      const input = CinematicSceneSchema.parse({ ...source(), fps });
      const scene = compileCinematicScene(input);
      const last = scene.timeline.frameCount - 1;
      const projected = (id: string, frame = last) =>
        projectCinematicNode(
          scene,
          scene.nodes.find((node) => node.id === id)!,
          frame,
        );
      expect(projected("left").scale).toBeCloseTo(4 / 3);
      expect(projected("right").scale).toBeCloseTo(4 / 3);
      expect(projected("room").scale).toBeCloseTo(10 / 9);
      expect(projected("far").scale).toBeCloseTo(30 / 29);
      const room = scene.nodes.find((node) => node.id === "room")!;
      for (let frame = 0; frame <= last; frame++) {
        const p = projected("room", frame);
        expect(p.left + p.width * input.camera.anchor[0]).toBeCloseTo(
          room.x + room.width * input.camera.anchor[0],
        );
        expect(p.top + p.height * input.camera.anchor[1]).toBeCloseTo(
          room.y + room.height * input.camera.anchor[1],
        );
      }
      expect(
        scene.cameraFrames.every(
          (key) => key.focal === 1 && key.x === 0 && key.y === 0,
        ),
      ).toBe(true);
      expect(scene.cameraValidation.subjectAnchorTravelPx).toBeLessThan(1e-8);
      expect(scene.cameraValidation.foregroundScaleChange).toBeCloseTo(1 / 3);
      expect(scene.cameraValidation.backgroundScaleChange).toBeCloseTo(1 / 29);
      const initial = projected("left", 0);
      projected("left", last);
      expect(projected("left", 0)).toEqual(initial);
    }
  });
  it("validates resolution after magnification and reports the layer and frame", () => {
    const input = source();
    input.assets[1]!.height = 1100;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(input)),
    ).toThrow(/Source resolution.*left.*frame/);
  });
  it("requires two distinct near sides, explicit forward travel and no lateral path", () => {
    const input = source();
    delete (input.recipe as Record<string, unknown>).foregroundRight;
    expect(CinematicSceneSchema.safeParse(input).success).toBe(false);
    const wrongDepth = source();
    wrongDepth.layers[3]!.depth = 5;
    expect(CinematicSceneSchema.safeParse(wrongDepth).success).toBe(false);
    const lateral = source();
    lateral.camera.travel = [10, 0];
    expect(CinematicSceneSchema.safeParse(lateral).success).toBe(false);
    const absent = source();
    delete (absent.camera as Record<string, unknown>).push;
    expect(CinematicSceneSchema.safeParse(absent).success).toBe(false);
  });
  it("rejects a near-plane crossing and a flat zoom-like arrangement", () => {
    const crossing = source();
    crossing.camera.push = 1.55;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(crossing)),
    ).toThrow(/crosses a depth plane/);
    const flat = source();
    flat.layers[2]!.depth = 3.9;
    flat.layers[3]!.depth = 3.9;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(flat)),
    ).toThrow(/scale separation/);
  });
});
