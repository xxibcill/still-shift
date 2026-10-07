import { camera, comp, solid, par } from "@still-shift/motion";

/** Native CE8: preview with WebGL2 for camera aiming and true perspective. */
export default comp({ width: 640, height: 360, fps: 24, frames: 48 }, (c) => {
  const lens = c.add(
    camera("camera", {
      model: "two-node",
      pointOfInterest: [320, 180, 0],
      depthOfField: true,
      focusDistance: 640,
      aperture: 8,
    }),
  );
  const near = c.add(
    solid("near", { size: [120, 160], color: "#dd8e67", threeD: true })
      .at(250, 100, -80)
      .anchor("center")
      .transform({ rotationY: 20 }),
  );
  c.add(
    solid("far", { size: [140, 180], color: "#628da9", threeD: true })
      .at(420, 180, 220)
      .anchor("center"),
  );
  c.add(solid("caption-bar", { size: [640, 6], color: "#e8dac6" }).at(0, 330));
  c.add(
    solid("background", {
      size: [1600, 1200],
      color: "#17232e",
      threeD: true,
      coverage: "required",
    })
      .at(320, 180, 300)
      .anchor("center"),
  );
  c.timeline(
    par(
      lens.property<number>("zoom").from(640).to(720, 47),
      near.z.to(50, 47),
      lens.property<number>("focusDistance").from(640).to(800, 47),
    ),
  );
});
