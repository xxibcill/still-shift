import { comp, solid, expr, at } from "@still-shift/motion";
export default comp({ width: 640, height: 360, fps: 24, frames: 72 }, (c) => {
  const n = c.add(
    solid("box", { size: [64, 64], color: "#D96A3B" }).at(240, 140),
  );
  c.expression(n.path("transform.rotation"), expr`wiggle(2, 6, 7)`);
  c.timeline(
    n.moveBy([80, 0], 24),
    at("cue:land", n.behaviour("inertial-bounce")),
  );
  c.marker("land", 24);
});
