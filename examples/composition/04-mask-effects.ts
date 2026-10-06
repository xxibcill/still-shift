import { comp, solid } from "@still-shift/motion";
export default comp({ width: 640, height: 360, fps: 24, frames: 48 }, (c) => {
  const n = c.add(
    solid("card", {
      size: [240, 160],
      color: "#D96A3B",
      masks: [
        {
          id: "cut",
          mode: "add",
          path: {
            closed: true,
            vertices: [
              [0, 0],
              [240, 0],
              [180, 160],
              [0, 160],
            ],
          },
        },
      ],
      effects: [{ id: "soft", effect: "blur.gaussian", params: {} }],
    }).at(200, 100),
  );
  c.timeline(
    n.property<number>("masks[cut].feather").to(8, 36),
    n.property<number>("effects[soft].radius").to(3, 36),
  );
});
