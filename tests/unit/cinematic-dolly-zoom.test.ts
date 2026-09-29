import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CinematicSceneSchema } from "../../packages/scene-contract/src/cinematic.ts";
import {
  compileCinematicScene,
  projectCinematicNode,
} from "../../packages/renderer-core/src/cinematic-scene.ts";

const fixture = JSON.parse(
  readFileSync(
    resolve(
      "benchmarks/fixtures/cinematic-illustrated/ci-08-dolly-zoom-tension.json",
    ),
    "utf8",
  ),
);

describe("CI-08 dolly zoom", () => {
  it("holds the subject while the rear plane contracts at 24 and 30 fps", () => {
    for (const fps of [24, 30]) {
      for (const intensity of ["restrained", "standard", "dramatic"]) {
        const input = CinematicSceneSchema.parse({
          ...fixture,
          fps,
          recipe: { ...fixture.recipe, intensity },
        });
        const scene = compileCinematicScene(input);
        const last = scene.timeline.frameCount - 1;
        const subject = scene.nodes.find((node) => node.id === "subject")!;
        const background = scene.nodes.find(
          (node) => node.id === "background",
        )!;
        const foreground = scene.nodes.find(
          (node) => node.id === "foreground",
        )!;
        const initialNear = projectCinematicNode(scene, foreground, 0);
        for (let frame = 0; frame <= last; frame++) {
          const projectedSubject = projectCinematicNode(scene, subject, frame);
          const projectedNear = projectCinematicNode(scene, foreground, frame);
          expect(projectedSubject.scale).toBeCloseTo(1, 10);
          expect(projectedSubject.left).toBeCloseTo(subject.x, 10);
          expect(projectedSubject.top).toBeCloseTo(subject.y, 10);
          expect(
            Math.max(
              Math.abs(projectedNear.left - initialNear.left),
              Math.abs(
                projectedNear.left +
                  projectedNear.width -
                  (initialNear.left + initialNear.width),
              ),
            ),
          ).toBeLessThanOrEqual(scene.width * 0.03);
        }
        const distantScaleReduction =
          1 -
          projectCinematicNode(scene, background, last).scale /
            projectCinematicNode(scene, background, 0).scale;
        expect(distantScaleReduction).toBeGreaterThanOrEqual(0.03);
        expect(distantScaleReduction).toBeLessThanOrEqual(0.06);
        expect(scene.cameraValidation.backgroundScaleReduction).toBeCloseTo(
          distantScaleReduction,
        );
        expect(scene.cameraValidation.minimumCoverageMargin).toBeGreaterThan(0);
        expect(scene.cameraValidation.checkedFrames).toBe(fps * 7);
      }
    }
  });

  it("requires axial travel without sideways drift", () => {
    expect(
      CinematicSceneSchema.safeParse({
        ...fixture,
        camera: { travel: [0, 0], anchor: fixture.camera.anchor },
      }).success,
    ).toBe(false);
    expect(
      CinematicSceneSchema.safeParse({
        ...fixture,
        camera: { ...fixture.camera, travel: [10, 0] },
      }).success,
    ).toBe(false);
  });

  it("rejects an insufficient or excessive distant change and excessive near motion", () => {
    for (const push of [0.1, 0.5]) {
      const input = CinematicSceneSchema.parse({
        ...fixture,
        camera: { ...fixture.camera, push },
      });
      expect(() => compileCinematicScene(input)).toThrow(/distant scale/);
    }
    const input = CinematicSceneSchema.parse({
      ...fixture,
      layers: fixture.layers.map((layer: { node: string; depth: number }) => ({
        ...layer,
        depth: layer.node === "foreground" ? 1.7 : layer.depth,
      })),
    });
    expect(() => compileCinematicScene(input)).toThrow(/near displacement/);
  });
});
