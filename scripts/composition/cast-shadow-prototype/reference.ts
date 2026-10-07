import {
  addScaled,
  directVisibility,
  validateExperiment,
  type Experiment,
} from "./model.ts";
import { fixtures, solidFixtures } from "./fixtures.ts";

export const SIDE = 64;
export const FRAMES = 8;

/** Explicit animated poses only; this is not a replacement CE7 evaluator. */
export function pose(scene: Experiment, frame: number): Experiment {
  const value = structuredClone(scene);
  const selectedCasterFrame = frame < 4 ? frame : 7 - frame;
  value.casters.forEach((caster) => {
    caster.origin[0] += selectedCasterFrame * 0.5;
  });
  return value;
}

export function referencePixels(scene: Experiment, side = SIDE): number[] {
  validateExperiment(scene);
  const pixels: number[] = [];
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const point = addScaled(
        addScaled(scene.receiver.origin, scene.receiver.u, (x + 0.5) / side),
        scene.receiver.v,
        (y + 0.5) / side,
      );
      const byte = Math.round(directVisibility(scene, point) * 255);
      pixels.push(byte, byte, byte, 255);
    }
  return pixels;
}

export function referenceCases(solid = false) {
  return (solid ? solidFixtures() : fixtures()).flatMap(({ id, scene }) =>
    Array.from({ length: FRAMES }, (_, frame) => ({
      id: `${id}/${frame}`,
      scene: pose(scene, frame),
    })),
  );
}
