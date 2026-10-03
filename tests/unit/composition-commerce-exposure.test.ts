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
import { sourceExposureTimeline } from "../../packages/renderer-core/src/commerce-exposure.ts";
import { exposureFrames } from "../../packages/renderer-core/src/commerce-effect-motion.ts";
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
  it("preserves state-ramp completion exposure and primitive blur on backward seeks", () => {
    const input = CommerceSceneSchema.parse(
      JSON.parse(
        readFileSync(
          resolve(
            "benchmarks/fixtures/reusable-components/commerce-state.json",
          ),
          "utf8",
        ),
      ),
    );
    const source = commerceExposureVariants(
      "component/commerce-state",
      input,
    )[0]!.scene;
    const scene = compileCommerceScene(CommerceSceneSchema.parse(source));
    const comp = commerceToComposition(source);
    const { blur, cuts } = sourceExposureTimeline(scene);
    expect(comp.motionBlur!.cuts).toEqual([0, 72]);
    for (const frame of [71, 72, 74, 75, 76, 75, 72, 71]) {
      const lower = Math.max(...cuts.filter((cut) => cut <= frame));
      const upper = Math.min(...cuts.filter((cut) => cut > frame));
      const times = exposureFrames(
        frame,
        scene.frameCount,
        blur!.shutterAngle,
        blur!.samples,
      ).map((time) => Math.max(lower, Math.min(upper - 1e-7, time)));
      expect(compositionExposureFrames(comp, frame)).toEqual(times);
      [...evaluateCompositionExposure(comp, frame)].forEach((tree, index) => {
        for (const id of ["behavior__caption", "behavior__inset"]) {
          const node = scene.nodes.find((node) => node.id === id)!;
          const pose = evaluatePreparedNodeAtTime(scene, node, times[index]!);
          const actual = tree.layers.find((layer) => layer.id === id)!;
          expect(actual.state).toBe(pose.state);
          expect(actual.stateMix).toBeCloseTo(pose.stateMix ?? 1, 10);
          if ((pose.stateMix ?? 1) < 1)
            expect(actual.stateFrom).toBe(pose.stateFrom);
          const drawingBlur = actual.effects.find(
            (effect) => effect.effect === "blur.primitive",
          );
          expect(drawingBlur?.params.radius ?? 0).toBeCloseTo(
            pose.blur ?? 0,
            10,
          );
        }
      });
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
