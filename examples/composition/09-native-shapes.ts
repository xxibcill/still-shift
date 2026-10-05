import { comp, shape, presets, par } from "@still-shift/motion";

export default comp(
  { id: "native-shapes", width: 640, height: 360, fps: 24, frames: 96 },
  (c) => {
    const connector = c.add(
      shape
        .native("connector", {
          contents: [
            {
              id: "diagram",
              type: "group",
              contents: [
                {
                  id: "line",
                  type: "path",
                  path: {
                    closed: false,
                    vertices: [
                      [0, 0],
                      [160, -30],
                      [320, 0],
                    ],
                    outTangents: [
                      [45, 0],
                      [45, 0],
                      [0, 0],
                    ],
                    inTangents: [
                      [0, 0],
                      [-45, 0],
                      [-45, 0],
                    ],
                  },
                },
                {
                  id: "stroke",
                  type: "stroke",
                  style: "brush",
                  width: 10,
                  color: "#eec344",
                },
              ],
            },
          ],
        })
        .at(160, 200)
        .anchor(0, 0),
    );
    const badge = c.add(
      shape
        .native("badge", {
          contents: [
            {
              id: "star",
              type: "polystar",
              kind: "star",
              points: 5,
              innerRadius: 18,
              outerRadius: 40,
            },
            {
              id: "paint",
              type: "gradient-fill",
              gradient: "radial",
              start: [0, 0],
              end: [40, 0],
              stops: [
                { id: "center", offset: 0, color: "#eec344" },
                { id: "edge", offset: 1, color: "#df5077" },
              ],
            },
          ],
        })
        .at(480, 200),
    );
    c.timeline(
      par(
        presets.drawOn(connector, 72),
        badge.property<number>("contents[star].rotation").to(90, 72),
      ),
    );
  },
);
