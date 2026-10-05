import { comp, solid, precomp, instance } from "@still-shift/motion";
const tile = comp(
  { id: "tile", width: 120, height: 120, fps: 24, frames: 48 },
  (c) => {
    const n = c.add(
      solid("box", { size: [64, 64], color: "#47748D" }).at(24, 24),
    );
    c.timeline(n.rotation.to(30, 36));
  },
);
export default comp({ width: 640, height: 360, fps: 24, frames: 48 }, (c) => {
  c.add(precomp("left", tile).at(140, 120));
  c.add(precomp("right", tile).at(380, 120));
  c.driver({
    source: instance("left", "box").path("transform.rotation"),
    target: instance("right", "box").path("transform.rotation"),
    blend: "replace",
  });
});
