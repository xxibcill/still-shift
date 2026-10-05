import { describe, expect, it } from "vitest";
import {
  alphaAt,
  directVisibility,
  projectVertex,
  shadeLinear,
  validateExperiment,
  type Experiment,
} from "../../scripts/composition/cast-shadow-prototype/model.ts";
import {
  experiment,
  plane,
} from "../../scripts/composition/cast-shadow-prototype/fixtures.ts";

import {
  pose,
  referencePixels,
} from "../../scripts/composition/cast-shadow-prototype/reference.ts";

describe("isolated cast-shadow candidate", () => {
  it("is independent of pose seek order and input caster traversal", () => {
    const scene = experiment();
    scene.casters.push({ ...plane("other", 12), order: -1, opacity: 0.3 });
    const pixels = Array.from({ length: 8 }, (_, frame) =>
      referencePixels(pose(scene, frame), 8),
    );
    for (const frame of [7, 0, 6, 1, 5, 2, 4, 3]) {
      const selected = pose(scene, frame);
      selected.casters.reverse();
      expect(referencePixels(selected, 8)).toEqual(pixels[frame]);
    }
  });
  it("has a hand-computed 2x point-light projection and half-open ray segment", () => {
    const receiver = plane("receiver", 20);
    expect(projectVertex([2, 3, 10], [0, 0, 0], receiver)).toEqual([4, 6, 20]);
    const scene = experiment();
    expect(directVisibility(scene, [0, 0, 20])).toBe(0);
    expect(directVisibility(scene, [30, 0, 20])).toBe(1);
    for (const z of [-10, 0, 20, 30]) {
      scene.casters[0]!.origin[2] = z;
      expect(directVisibility(scene, [0, 0, 20])).toBe(1);
    }
  });

  it("multiplies alpha transmittance per emitter sample, then averages", () => {
    const scene = experiment();
    scene.casters[0]!.alpha.pixels = [128];
    scene.casters.push({ ...scene.casters[0]!, id: "second", order: 1 });
    expect(directVisibility(scene, [0, 0, 20])).toBeCloseTo(
      (127 / 255) ** 2,
      14,
    );
    scene.light.radius = 12;
    scene.light.samples = 4;
    scene.casters[0]!.alpha.pixels = [255];
    scene.casters.splice(1);
    // Only the -x emitter is blocked, at alpha .75 on the one-texel border.
    expect(directVisibility(scene, [8, 0, 20])).toBe(0.8125);
  });

  it("samples alpha only, with transparent border and pixel-center bilinear edges", () => {
    const alpha = { width: 2, height: 1, pixels: [255, 0] };
    expect(alphaAt(alpha, 0.25, 0.5)).toBe(1);
    expect(alphaAt(alpha, 0.5, 0.5)).toBe(0.5);
    expect(alphaAt(alpha, 0, 0.5)).toBe(0.5);
    expect(alphaAt(alpha, -0.1, 0.5)).toBe(0);
  });

  it("handles nonuniform/mirrored bases, grazing rays and offscreen casters", () => {
    const scene = experiment();
    scene.casters[0]!.u = [-16, 0, 0];
    scene.casters[0]!.origin = [8, -4, 10];
    expect(directVisibility(scene, [0, 0, 20])).toBe(0);
    scene.casters[0]!.v = [0, 0, 8];
    expect(directVisibility(scene, [0, 0, 20])).toBe(1);
    expect(projectVertex([1, 0, 0], [0, 0, 0], plane("r", 20))).toBeNull();
    scene.light.position = [100, 0, 0];
    scene.casters[0] = { ...plane("outside-camera", 10), origin: [46, -4, 10] };
    expect(directVisibility(scene, [0, 0, 20])).toBe(0);
  });

  it("isolates instance scopes and rejects self, flags and disabled shadow changes", () => {
    const scene = experiment();
    scene.casters[0]!.scope = "root/nested";
    expect(directVisibility(scene, [0, 0, 20])).toBe(1);
    scene.casters[0]!.scope = "root";
    scene.casters[0]!.castsShadow = false;
    expect(directVisibility(scene, [0, 0, 20])).toBe(1);
    scene.casters[0]!.castsShadow = true;
    scene.receiver.receivesShadow = false;
    expect(directVisibility(scene, [0, 0, 20])).toBe(1);
    scene.receiver.receivesShadow = true;
    scene.light.enabled = false;
    expect(directVisibility(scene, [0, 0, 20])).toBe(1);
    scene.light.enabled = true;
    scene.casters[0]!.id = scene.receiver.id;
    expect(directVisibility(scene, [0, 0, 20])).toBe(1);
  });

  it("preserves receiver alpha and ambient with premultiplied linear RGB", () => {
    expect(shadeLinear([0.2, 0.1, 0.05, 0.5], 0.25, 0.75, 0)).toEqual([
      0.05, 0.025, 0.0125, 0.5,
    ]);
    expect(shadeLinear([0, 0, 0, 0], 0.25, 0.75, 0)).toEqual([0, 0, 0, 0]);
    const original: [number, number, number, number] = [0.1, 0.2, 0.3, 0.5];
    expect(shadeLinear(original, 0.25, 0.75, 1)).toBe(original);
  });

  it("rejects malformed or over-budget candidate inputs before rendering", () => {
    for (const mutate of [
      (s: Experiment) => {
        s.light.samples = 3 as 4;
      },
      (s: Experiment) => {
        s.casters[0]!.u = [0, 0, 0];
      },
      (s: Experiment) => {
        s.light.position[0] = Infinity;
      },
      (s: Experiment) => {
        s.casters[0]!.alpha.pixels = [256];
      },
      (s: Experiment) => {
        s.casters[0]!.opacity = -1;
      },
      (s: Experiment) => {
        s.casters = Array.from({ length: 9 }, (_, i) => ({
          ...s.casters[0]!,
          id: `caster_${i}`,
        }));
      },
    ]) {
      const scene = experiment();
      mutate(scene);
      expect(() => validateExperiment(scene)).toThrow();
    }
  });

  it("enforces contact bias, zero-distance behavior and bounded scope identities", () => {
    const scene = experiment();
    scene.light.position = [0, 0, 20];
    expect(directVisibility(scene, [0, 0, 20])).toBe(1);
    scene.light.position = [0, 0, 0];
    scene.casters[0]!.origin[2] = 19.9995;
    expect(directVisibility(scene, [0, 0, 20])).toBe(1);
    scene.casters[0]!.origin[2] = 19.998;
    expect(directVisibility(scene, [0, 0, 20])).toBe(0);
    scene.casters[0]!.id = "bad/id";
    expect(() => validateExperiment(scene)).toThrow("identity");
    scene.casters[0]!.id = "valid";
    scene.casters[0]!.scope = "root//invalid";
    expect(() => validateExperiment(scene)).toThrow("identity");
  });
});
