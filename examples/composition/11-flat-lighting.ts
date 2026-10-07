import { comp, light, solid, par } from "@still-shift/motion";

/** Flat artwork receives scoped diffuse illumination; preview using WebGL2. */
export default comp({ width: 640, height: 360, fps: 24, frames: 48 }, (c) => {
  c.add(
    light("ambient", {
      lightType: "ambient",
      color: "#b6caef",
      intensity: 0.25,
    }),
  );
  const spot = c.add(
    light("spot", {
      lightType: "spot",
      color: "#ffe2b6",
      intensity: 1.8,
      range: 1000,
      falloffStart: 300,
      innerCone: 35,
      outerCone: 70,
    }).at(220, 160, -320),
  );
  const card = c.add(
    solid("card", {
      size: [300, 200],
      color: "#a9856a",
      threeD: true,
    })
      .at(320, 180, 0)
      .anchor("center")
      .receiveLight()
      .transform({ rotationY: 15 }),
  );
  c.add(solid("overlay", { size: [640, 6], color: "#dfcbb4" }).at(0, 330));
  c.timeline(
    par(
      spot.x.to(430, 47),
      spot.property<number>("intensity").to(0.7, 47),
      card.rotation.to(-8, 47),
    ),
  );
});
