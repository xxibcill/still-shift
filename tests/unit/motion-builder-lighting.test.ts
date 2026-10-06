import { expect, it } from "vitest";
import { comp, light, solid, par } from "@still-shift/motion";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { compositionTracks } from "../../apps/lab/src/composition-keys.ts";
import { ownCurve } from "../../packages/renderer-core/src/composition/evaluate/expression-keys.ts";
it("authors native light controls and receiver flags without forcing XYZ defaults", () => {
  const d = comp({ width: 128, height: 96, fps: 24, frames: 32 }, (c) => {
    const l = c.add(
      light("spot", {
        lightType: "spot",
        intensity: 0.5,
        range: 200,
        falloffStart: 20,
        innerCone: 20,
        outerCone: 60,
      }).at(64, 48, -100),
    );
    c.add(
      solid("plane", {
        size: [128, 96],
        color: "#ffffff",
        threeD: true,
      }).receiveLight(),
    );
    c.timeline(
      par(l.property<number>("intensity").to(1.5, 31), l.z.to(-50, 31)),
    );
  });
  expect(d.layers[0]!.transform).not.toHaveProperty("scale");
  expect(d.layers[1]!.receivesLight).toBe(true);
  expect(evaluateComp(d, 15.5).lights![0]).toMatchObject({
    intensity: 1,
    position: [64, 48, -75],
  });
  const tracks = compositionTracks(d);
  expect(tracks.map((x) => x.property)).toEqual(
    expect.arrayContaining(["intensity", "transform.position.z"]),
  );
});
it("samples implicit XYZ light keys, colour/intensity own curves and path Z auto orientation", () => {
  const d = comp({ width: 128, height: 96, fps: 24, frames: 32 }, (c) => {
    c.add(
      light("light", {
        lightType: "spot",
        intensity: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 31, value: 2, interpolation: "linear" },
          ],
        },
      }).transform({
        autoOrient: "path",
        position: {
          keys: [
            { frame: 0, value: [0, 0, 0] },
            { frame: 31, value: [0, 0, 100], interpolation: "linear" },
          ],
        },
      }),
    );
    c.add(
      solid("plane", {
        size: [100, 100],
        color: "#ffffff",
        threeD: true,
      }).receiveLight(),
    );
  });
  const layer = d.layers[0]!;
  expect(
    ownCurve(layer, [{ name: "transform" }, { name: "position" }], 24)!.sample(
      15.5,
    ),
  ).toEqual([0, 0, 50]);
  expect(ownCurve(layer, [{ name: "intensity" }], 24)!.sample(15.5)).toBe(1);
  expect(evaluateComp(d, 15.5).layers[0]!.transform.rotationY).not.toBe(0);
});
