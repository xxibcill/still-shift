import { describe, expect, it } from "vitest";
import { CinematicSceneSchema } from "../../packages/scene-contract/src/cinematic.ts";
import {
  compileCinematicScene,
  projectCinematicNode,
} from "../../packages/renderer-core/src/cinematic-scene.ts";

const image = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
) => ({
  id,
  type: "image",
  x,
  y,
  width,
  height,
  fit: "stretch",
  states: [{ asset: "art" }],
});
const input = () => ({
  schemaVersion: "illustrated-scene-2",
  title: "Courtyard parallax",
  durationMs: 7000,
  fps: 24,
  assets: [
    {
      id: "art",
      path: "art.png",
      sha256: `sha256:${"a".repeat(64)}`,
      width: 2400,
      height: 1350,
    },
  ],
  nodes: [
    image("far", -120, -100, 2160, 1280),
    image("person", 1140, 320, 240, 550),
    image("near", -80, -20, 480, 1120),
  ],
  layers: [
    { node: "far", depth: 8, paintedBounds: [0, 0, 2160, 1280] },
    {
      node: "person",
      depth: 4,
      protectedRegion: [
        [0, 0],
        [240, 0],
        [240, 550],
        [0, 550],
      ],
    },
    { node: "near", depth: 1 },
  ],
  camera: { travel: [80, 8] },
  recipe: {
    preset: "layered_parallax",
    foreground: "near",
    subject: "person",
    background: "far",
    intensity: "standard",
  },
});

describe("cinematic plane camera", () => {
  it("anchors the subject and projects near/far layers from one camera at 24 and 30 fps", () => {
    for (const fps of [24, 30]) {
      const scene = compileCinematicScene(
        CinematicSceneSchema.parse({ ...input(), fps }),
      );
      expect(scene.timeline.frameCount).toBe(fps * 7);
      const last = scene.timeline.frameCount - 1;
      const near = scene.nodes.find((n) => n.id === "near")!;
      const subject = scene.nodes.find((n) => n.id === "person")!;
      const far = scene.nodes.find((n) => n.id === "far")!;
      expect(projectCinematicNode(scene, near, last).left - near.x).toBeCloseTo(
        -60,
      );
      expect(projectCinematicNode(scene, far, last).left - far.x).toBeCloseTo(
        10,
      );
      expect(projectCinematicNode(scene, subject, last).left).toBeCloseTo(
        subject.x,
      );
      expect(projectCinematicNode(scene, subject, last).scale).toBe(1);
      const initial = projectCinematicNode(scene, near, 0);
      projectCinematicNode(scene, near, last);
      expect(projectCinematicNode(scene, near, 0)).toEqual(initial);
      expect(scene.cameraValidation.checkedFrames).toBe(fps * 7);
      expect(() => projectCinematicNode(scene, near, last + 1)).toThrow(
        /Frame/,
      );
    }
  });
  it("sorts planes back to front independently of node array order", () => {
    const source = input();
    source.nodes.reverse();
    const scene = compileCinematicScene(CinematicSceneSchema.parse(source));
    expect(scene.nodes.map((n) => n.id)).toEqual(["far", "person", "near"]);
  });
  it("rejects missing plates, collapsed depth bands and ambiguous layer bindings", () => {
    const noPlate = input();
    delete (noPlate.layers[0] as Record<string, unknown>).paintedBounds;
    expect(CinematicSceneSchema.safeParse(noPlate).success).toBe(false);
    const flat = input();
    flat.layers[0]!.depth = 4;
    expect(CinematicSceneSchema.safeParse(flat).success).toBe(false);
    const duplicate = input();
    duplicate.layers[1]!.node = "far";
    expect(CinematicSceneSchema.safeParse(duplicate).success).toBe(false);
  });
  it("fails when moving the camera would expose unpainted pixels", () => {
    const unsafe = input();
    unsafe.nodes[0]!.x = 0;
    unsafe.nodes[0]!.width = 1920;
    unsafe.layers[0]!.paintedBounds = [0, 0, 1920, 1280];
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(unsafe)),
    ).toThrow(/coverage/);
  });
  it("rejects a subject outside the protected framing and motion too weak to prove parallax", () => {
    const cropped = input();
    cropped.nodes[1]!.x = 1650;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(cropped)),
    ).toThrow(/protected/);
    const weak = input();
    weak.camera.travel = [1, 0];
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(weak)),
    ).toThrow(/separation/);
  });
  it("rejects excessive vertical travel and a zero-area protected region", () => {
    const vertical = input();
    vertical.camera.travel = [80, 40];
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(vertical)),
    ).toThrow(/vertical/);
    const empty = input();
    empty.layers[1]!.protectedRegion = [
      [0, 0],
      [1, 1],
      [2, 2],
    ];
    expect(CinematicSceneSchema.safeParse(empty).success).toBe(false);
  });
  it("makes dramatic motion substantially larger and faster without losing the subject or plate", () => {
    for (const fps of [24, 30]) {
      const source = input();
      source.fps = fps;
      const standard = compileCinematicScene(
        CinematicSceneSchema.parse(source),
      );
      source.recipe.intensity = "dramatic";
      const dramatic = compileCinematicScene(
        CinematicSceneSchema.parse(source),
      );
      const near = dramatic.nodes.find((node) => node.id === "near")!;
      const last = dramatic.timeline.frameCount - 1;
      const positions = Array.from(
        { length: last + 1 },
        (_, frame) => projectCinematicNode(dramatic, near, frame).left,
      );
      const peakSpeed = (scene: typeof dramatic) =>
        Math.max(
          ...Array.from(
            { length: last },
            (_, frame) =>
              Math.abs(
                projectCinematicNode(scene, near, frame + 1).left -
                  projectCinematicNode(scene, near, frame).left,
              ) * fps,
          ),
        );
      expect(dramatic.cameraValidation.foregroundTravelPx).toBeCloseTo(300);
      expect(dramatic.cameraValidation.backgroundTravelPx).toBeCloseTo(50);
      expect(peakSpeed(dramatic)).toBeGreaterThan(peakSpeed(standard) * 4);
      expect(positions[Math.round(fps * 0.5)]).toBeLessThan(positions[0]! - 5);
      expect(dramatic.cameraFrames.at(-2)!.frame / fps).toBeGreaterThan(6);
      expect(
        positions.every((x, i) => i === 0 || x <= positions[i - 1]! + 1e-9),
      ).toBe(true);
      expect(dramatic.cameraValidation.minimumCoverageMargin).toBeGreaterThan(
        0,
      );
      expect(dramatic.cameraValidation.subjectTravelPx).toBeLessThan(1e-9);
      expect(dramatic.cameraValidation.subjectScaleChange).toBe(0);
      const initial = projectCinematicNode(dramatic, near, 0);
      projectCinematicNode(dramatic, near, last);
      expect(projectCinematicNode(dramatic, near, 0)).toEqual(initial);
    }
  });
  it("checks dramatic coverage and rejects excessive travel even with the wider envelope", () => {
    const source = input();
    source.recipe.intensity = "dramatic";
    source.nodes[0]!.x = -30;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(source)),
    ).toThrow(/coverage/);
    source.nodes[0]!.x = -120;
    source.camera.travel = [160, 0];
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(source)),
    ).toThrow(/movement envelope/);
  });
  it("keeps authored foreground cut edges outside the frame during a reverse sweep", () => {
    const source = input();
    source.recipe.intensity = "dramatic";
    source.camera.travel = [-80, 0];
    Object.assign(source.layers[2]!, { edgeAttachments: ["left"] });
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(source)),
    ).toThrow(/Authored cut edge/);
    source.nodes[2]!.x = -320;
    const scene = compileCinematicScene(CinematicSceneSchema.parse(source));
    expect(
      projectCinematicNode(
        scene,
        scene.nodes.find((node) => node.id === "near")!,
        167,
      ).left,
    ).toBeLessThan(0);
  });
});
