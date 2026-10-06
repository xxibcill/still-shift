import { expect, it } from "vitest";
import type { Composition } from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";

it("keeps reference writers and untouched anchor axes in root and nested 2D/3D scopes", () => {
  for (const nested of [false, true])
    for (const spatial of [false, true])
      for (const writer of [
        "none",
        "driver",
        "expression",
        "periodic",
      ] as const) {
        const anchor = spatial ? [3, 4, 5] : [3, 4];
        const comp: Composition = {
          schemaVersion: "composition-1",
          id: "reference-writers",
          width: 100,
          height: 100,
          fps: 24,
          frameCount: 24,
          assets: [],
          layers: [
            {
              id: "control",
              type: "null",
              threeD: spatial,
              transform: {
                anchor: anchor as [number, number] | [number, number, number],
              },
            },
          ],
        };
        if (nested) {
          comp.precomps = [
            {
              id: "nested",
              width: 100,
              height: 100,
              frameCount: 24,
              layers: comp.layers,
            },
          ];
          comp.layers = [{ id: "host", type: "precomp", comp: "nested" }];
        }
        const target = `${nested ? "host/" : ""}control.constraintReference.x`;
        if (writer === "driver") {
          comp.signals = [
            {
              id: "reference",
              keys: [
                { frame: 0, value: 7 },
                { frame: 23, value: 7 },
              ],
            },
          ];
          comp.drivers = [{ target, signal: "reference" }];
        } else if (writer === "expression")
          comp.expressions = { [target]: { source: "7" } };
        else if (writer === "periodic")
          comp.periodic = [
            {
              target,
              start: 3,
              end: 10,
              oscillate: { period: 20, amplitude: 3 },
            },
          ];
        const reference = (frame: number) => {
          const tree = evaluateComp(comp, frame);
          return (
            nested ? tree.layers[0]!.precomp!.layers[0]! : tree.layers[0]!
          ).constraintReference;
        };
        const expected = [...anchor];
        expected[0] = writer === "none" ? 3 : writer === "periodic" ? 6 : 7;
        expect(reference(8)).toEqual(expected);
        if (writer === "periodic") expect(reference(12)).toEqual(anchor);
      }
});
