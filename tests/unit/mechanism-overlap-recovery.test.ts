import { describe, expect, it } from "vitest";
import {
  MechanismEpisodeSchema,
  type MechanismSidecar,
} from "@still-shift/scene-contract";
import { createTapeHookScene } from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import { mechanismContentHash } from "../../packages/animation-engine/src/mechanism/io.ts";
import { mechanismOverlayLayerId } from "../../packages/animation-engine/src/mechanism/overlays.ts";
import { planOverlayOverlapRecovery } from "../../tools/still-shift-cli/src/overlay-overlap-policy.ts";
function fixture() {
  const scene = createTapeHookScene(),
    hash = "sha256:" + "a".repeat(64);
  const episode = MechanismEpisodeSchema.parse({
    schemaVersion: "mechanism-episode-1",
    id: "bounded-recovery",
    revision: 0,
    scene: "scene",
    font: "font",
    output: { width: 1080, height: 1920, fps: 30, frameCount: 60 },
    dependencies: [
      { id: "scene", type: "scene", path: "scene.json", sha256: hash },
      { id: "font", type: "font", path: "font.ttf", sha256: hash },
    ],
    shots: [0, 30].map((start, index) => ({
      id: `shot${index}`,
      purpose: "Read the contact",
      startFrame: start,
      endFrameExclusive: start + 30,
      labels: [
        {
          id: `label${index}`,
          role: "PULL",
          text: "PULL",
          anchor: scene.anchors[0]!.id,
          position: [index === 0 ? 5 : 540, 120],
          readingInterval: { startFrame: start, endFrameExclusive: start + 30 },
        },
      ],
    })),
    captions: [],
  });
  const captures = episode.shots.map((shot) => ({
    shotId: shot.id,
    sidecar: {
      schemaVersion: "mechanism-sidecar-1",
      sceneId: scene.id,
      sceneSha256: mechanismContentHash(scene),
      geometrySha256: scene.geometrySha256,
      rendererProfile: "test",
      rendererVersion: "test",
      evaluatorVersion: "mechanism-evaluator-1",
      width: 1080,
      height: 1920,
      fps: 30,
      frameCount: 30,
      frames: Array.from({ length: 30 }, (_, frame) => ({
        frame,
        sourceFrame: shot.startFrame + frame,
        shotId: shot.id,
        plateSha256: hash,
        camera: scene.camera,
        parts: [],
        rigs: [],
        assertions: { frame: shot.startFrame + frame },
        anchors: [
          {
            anchor: scene.anchors[0]!.id,
            part: scene.anchors[0]!.part,
            world: [0, 0, 0],
            pixel: [500, 600],
            depth: 1,
            projectionVisibility: "in-frame",
            visibility: "visible",
            visibilityMethod: "scene-raycast",
            projectionErrorPixels: 0,
          },
        ],
        protectedRegions: [],
      })),
    } as unknown as MechanismSidecar,
  }));
  const textBounds = Object.fromEntries(
    episode.shots.map((shot) => [
      mechanismOverlayLayerId("label", shot.labels[0]!.id),
      Array(60).fill({ left: -80, right: 80, top: 0, bottom: 40 }),
    ]),
  );
  return { episode, captures, textBounds };
}
describe("bounded measured overlap recovery", () => {
  it("selects one generic candidate without mutating source or neighbors and restores the full hold", () => {
    const f = fixture(),
      source = structuredClone(f.episode),
      captures = structuredClone(f.captures);
    const plan = planOverlayOverlapRecovery(f.episode, f.captures, {
      textBounds: f.textBounds,
    });
    expect(plan.target).toEqual({ shot: "shot0", label: "label0" });
    expect(plan.trials.length).toBeLessThanOrEqual(12);
    expect(plan.trials.at(-1)).toMatchObject({
      accepted: true,
      neighborUnchanged: true,
      hold: { longestReadableFrames: 30, requiredFrames: 30 },
    });
    expect(f.episode).toEqual(source);
    expect(f.captures).toEqual(captures);
  });
  it("refuses two targets before offering a patch", () => {
    const f = fixture();
    f.episode.shots[1]!.labels[0]!.position = [5, 120];
    expect(() =>
      planOverlayOverlapRecovery(f.episode, f.captures, {
        textBounds: f.textBounds,
      }),
    ).toThrow(/exactly one/);
  });
  it("refuses estimated target and qualification glyphs even when neighbors have measurements", () => {
    const f = fixture();
    delete f.textBounds[mechanismOverlayLayerId("label", "label0")];
    expect(() =>
      planOverlayOverlapRecovery(f.episode, f.captures, {
        textBounds: f.textBounds,
      }),
    ).toThrow(/measured target/);
    const g = fixture();
    g.episode.shots[0]!.labels[0]!.qualification = "Illustrative";
    expect(() =>
      planOverlayOverlapRecovery(g.episode, g.captures, {
        textBounds: g.textBounds,
      }),
    ).toThrow(/qualification glyph/);
  });
  it("refuses the repair when every candidate covers a protected region", () => {
    const f = fixture(),
      source = structuredClone(f.episode);
    for (const frame of f.captures[0]!.sidecar.frames)
      frame.protectedRegions = [
        { id: "whole-proof", bounds: [0, 0, 1080, 1920] },
      ];
    expect(() =>
      planOverlayOverlapRecovery(f.episode, f.captures, {
        textBounds: f.textBounds,
      }),
    ).toThrow(/no admissible position/);
    expect(f.episode).toEqual(source);
  });
});
