import { expect, it } from "vitest";
import { comp, camera, solid, seq } from "@still-shift/motion";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
it("preserves the scope-dependent native camera default instead of injecting the 2D origin", () => {
  const doc = comp({ width: 128, height: 96, fps: 24, frames: 32 }, (c) => {
    c.add(camera("camera"));
    c.add(
      solid("plane", { size: [48, 40], color: "#ffffff", threeD: true }).at(
        64,
        48,
        0,
      ),
    );
  });
  expect(doc.layers[0]!.transform!.position).toBeUndefined();
  expect(evaluateComp(doc, 0).camera).toMatchObject({
    position: [64, 48, -128],
    zoom: 128,
  });
});
it("authors xyz positions/scales and animates a z component through the native clock", () => {
  const doc = comp({ width: 128, height: 96, fps: 24, frames: 32 }, (c) => {
    c.add(camera("camera").at(64, 48, -128));
    const plane = c.add(
      solid("plane", { size: [48, 40], color: "#ffffff", threeD: true })
        .at(30, 40, 12)
        .scale(-1, 2, 3),
    );
    c.timeline(seq(plane.z.to(72, 30, "linear")));
  });
  expect(evaluateComp(doc, 7.5).layers[1]!.transform.position).toEqual([
    30, 40, 27,
  ]);
  expect(evaluateComp(doc, 7.5).layers[1]!.transform.scale).toEqual([-1, 2, 3]);
});
