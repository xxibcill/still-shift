import { comp, solid } from "@still-shift/motion";
export default comp({ width: 640, height: 360, fps: 24, frames: 48 }, (c) => {
  c.add(solid("matte", { size: [140, 140], color: "#FFFFFF" }).at(240, 100));
  const card = c.add(
    solid("card", {
      size: [360, 200],
      color: "#47748D",
      trackMatte: { layer: "matte", mode: "alpha" },
    }).at(140, 80),
  );
  c.add(
    solid("overlay", {
      size: [200, 100],
      color: "#D96A3B",
      blendMode: "difference",
    }).at(200, 140),
  );
  c.timeline(card.x.to(210, 36));
});
