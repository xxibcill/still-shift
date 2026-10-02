import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CommerceSceneSchema } from "@still-shift/scene-contract";
import { commerceToComposition } from "../../packages/renderer-core/src/composition/adapters/commerce.ts";
import { compileCommerceScene } from "../../packages/renderer-core/src/commerce-scene.ts";
import { evaluatePreparedNodeAtTime } from "../../packages/renderer-core/src/prepared-scene.ts";
import {
  compositionExposureFrames,
  evaluateCompositionExposure,
} from "../../packages/renderer-core/src/composition/evaluate/exposure.ts";
import {
  nodeMatrix,
  multiplyMatrix,
  type Matrix,
} from "../../packages/renderer-core/src/node-transform.ts";
import { commerceExposureVariants } from "../helpers/composition-commerce-exposure.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

const fixture = () =>
  CommerceSceneSchema.parse(
    JSON.parse(
      readFileSync(
        resolve("benchmarks/fixtures/ecommerce-motion/atoms/motion-blur.json"),
        "utf8",
      ),
    ),
  );

describe("commerce shutter compilation", () => {
  it("preserves source poses at every exposure sample including backward seeks", () => {
    for (const source of [
      fixture(),
      ...commerceExposureVariants("commerce/atom-motion-blur", fixture()).map(
        (item) => item.scene,
      ),
    ]) {
      const scene = compileCommerceScene(CommerceSceneSchema.parse(source));
      const comp = commerceToComposition(source);
      for (const frame of [0, 12, 15, 20, 32, 33, 40, 100, 239, 20, 0]) {
        const times = compositionExposureFrames(comp, frame);
        const states = [...evaluateCompositionExposure(comp, frame)];
        states.forEach((tree, index) => {
          const actual = new Map(tree.layers.map((layer) => [layer.id, layer]));
          const matrices = new Map<string, Matrix>();
          const visit = (id: string): Matrix => {
            const cached = matrices.get(id);
            if (cached) return cached;
            const node = scene.nodes.find((node) => node.id === id)!;
            const pose = evaluatePreparedNodeAtTime(scene, node, times[index]!);
            const matrix = multiplyMatrix(
              node.parent ? visit(node.parent) : [1, 0, 0, 1, 0, 0],
              nodeMatrix(node, pose),
            );
            matrix.forEach((value, axis) =>
              expect(actual.get(id)!.screenMatrix[axis]).toBeCloseTo(value, 8),
            );
            matrices.set(id, matrix);
            return matrix;
          };
          scene.nodes.forEach((node) => visit(node.id));
        });
      }
    }
  });
  it("keeps the source and native resource bounds intact", () => {
    const source = fixture();
    source.motionModel = "curves-1";
    expect(() => commerceToComposition(source)).toThrow();
    try {
      commerceToComposition(source);
    } catch (error) {
      expect(passageDiagnostics(error)).toContainEqual(
        expect.objectContaining({
          code: "comp-adapter-limit",
          path: "effects",
        }),
      );
    }
    source.effects = [{ type: "motion-blur", shutterAngle: 0, samples: 16 }];
    expect(commerceToComposition(source).motionBlur).toBeUndefined();
  });
});
