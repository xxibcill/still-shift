import { describe, expect, it } from "vitest";
import { CinematicSceneSchema } from "../../packages/scene-contract/src/cinematic.ts";
import {
  compileCinematicScene,
  projectCinematicNode,
  sampleCinematicBlur,
} from "../../packages/renderer-core/src/cinematic-scene.ts";

const source = () => ({
  schemaVersion: "illustrated-scene-2",
  title: "Focus handoff",
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
      x: -80,
      y: -45,
      width: 2080,
      height: 1170,
      fit: "stretch",
      states: [{ asset: "art" }],
    },
    {
      id: "subject",
      type: "image",
      x: 1100,
      y: 300,
      width: 400,
      height: 600,
      fit: "stretch",
      states: [{ asset: "art" }],
    },
    {
      id: "near",
      type: "image",
      x: -80,
      y: -45,
      width: 650,
      height: 1170,
      fit: "stretch",
      states: [{ asset: "art" }],
    },
  ],
  layers: [
    { node: "far", depth: 8, paintedBounds: [0, 0, 2080, 1170] },
    {
      node: "subject",
      depth: 4,
      protectedRegion: [
        [40, 40],
        [300, 40],
        [300, 540],
        [40, 540],
      ],
    },
    { node: "near", depth: 1, edgeAttachments: ["left", "top", "bottom"] },
  ],
  camera: { travel: [4, 0], focus: { maxBlurPx: 4, transition: [0.25, 0.65] } },
  recipe: {
    preset: "focus_handoff",
    foreground: "near",
    subject: "subject",
    background: "far",
    intensity: "dramatic",
  },
});

describe("focus handoff", () => {
  it("keeps the foreground blur halo clear of the destination", () => {
    const input = source();
    input.camera.travel = [0, 0];
    input.nodes[2]!.width = 1215;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(input)),
    ).toThrow(/occludes/);
  });
  it("hands sharpness from near to subject with bounded blur, held endpoints and deterministic seeking", () => {
    for (const fps of [24, 30])
      for (const intensity of ["dramatic", "standard", "restrained"]) {
        const input = source();
        input.fps = fps;
        input.recipe.intensity = intensity;
        const scene = compileCinematicScene(CinematicSceneSchema.parse(input));
        const last = scene.timeline.frameCount - 1,
          peak =
            intensity === "dramatic" ? 4 : intensity === "standard" ? 3 : 2;
        expect(sampleCinematicBlur(scene, "near", 0)).toBe(0);
        expect(sampleCinematicBlur(scene, "subject", 0)).toBe(peak);
        expect(sampleCinematicBlur(scene, "near", last)).toBe(peak);
        expect(sampleCinematicBlur(scene, "subject", last)).toBe(0);
        expect(sampleCinematicBlur(scene, "far", last)).toBeCloseTo(peak / 6);
        let near = 0,
          subject = peak;
        for (let frame = 0; frame <= last; frame++) {
          const a = sampleCinematicBlur(scene, "near", frame),
            b = sampleCinematicBlur(scene, "subject", frame);
          expect(a).toBeGreaterThanOrEqual(near);
          expect(b).toBeLessThanOrEqual(subject);
          expect(a + b).toBeCloseTo(peak);
          near = a;
          subject = b;
          for (const node of scene.nodes)
            expect(projectCinematicNode(scene, node, frame).scale).toBe(1);
        }
        expect(
          sampleCinematicBlur(scene, "near", Math.floor(last * 0.25)),
        ).toBe(0);
        expect(
          sampleCinematicBlur(scene, "subject", Math.ceil(last * 0.65)),
        ).toBe(0);
        expect(sampleCinematicBlur(scene, "subject", 0)).toBe(peak);
        expect(scene.cameraValidation.foregroundTravelPx).toBeLessThanOrEqual(
          19.2,
        );
        expect(scene.cameraValidation.subjectAnchorTravelPx).toBeLessThan(1e-8);
        expect(() => sampleCinematicBlur(scene, "near", -1)).toThrow(/Frame/);
      }
  });
  it("rejects absent focus, excessive blur, reversed or very short transitions, and mixed camera moves", () => {
    const input = source();
    for (const focus of [
      undefined,
      { maxBlurPx: 5, transition: [0.25, 0.65] },
      { maxBlurPx: 4, transition: [0.65, 0.25] },
      { maxBlurPx: 4, transition: [0.4, 0.41] },
    ])
      expect(
        CinematicSceneSchema.safeParse({
          ...input,
          camera: { travel: [4, 0], focus },
        }).success,
      ).toBe(false);
    for (const camera of [
      { ...input.camera, push: 0.1 },
      { ...input.camera, pullback: 0.1 },
      { ...input.camera, travel: [4, 1] },
    ])
      expect(CinematicSceneSchema.safeParse({ ...input, camera }).success).toBe(
        false,
      );
    input.recipe.preset = "layered_parallax";
    expect(CinematicSceneSchema.safeParse(input).success).toBe(false);
  });
  it("checks tiny travel, blur support beyond frame edges and a clear destination", () => {
    const excessive = source();
    excessive.camera.travel = [80, 0];
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(excessive)),
    ).toThrow(/focus handoff movement/);
    const border = source();
    border.nodes[0]!.y = -2;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(border)),
    ).toThrow(/blur coverage/);
    const cut = source();
    cut.nodes[2]!.x = -2;
    cut.camera.travel = [0, 0];
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(cut)),
    ).toThrow(/blur cut edge/);
    const obscured = source();
    obscured.nodes[2]!.width = 1600;
    expect(() =>
      compileCinematicScene(CinematicSceneSchema.parse(obscured)),
    ).toThrow(/occludes/);
  });
});
