import { comp, solid, precomp } from "@still-shift/motion";
const picture = comp(
  { id: "picture", width: 640, height: 360, fps: 24, frames: 48 },
  (c) => {
    const n = c.add(
      solid("subject", { size: [100, 100], color: "#47748D" }).at(100, 130),
    );
    c.timeline(n.x.to(400, 36));
  },
);
export default comp(
  {
    id: "native-beat",
    width: 640,
    height: 360,
    fps: 24,
    frames: 48,
    metadata: {
      passage: {
        cueMarkers: { arrival: "arrival" },
        eventMarkers: { movement: "movement" },
        subjectLayers: { subject: "picture/subject" },
      },
    },
  },
  (c) => {
    c.add(precomp("picture", picture));
    c.marker("arrival", 36);
    c.marker("movement", 0, { duration: 36 });
    c.add(
      solid("accent", {
        size: [80, 40],
        color: "#D96A3B",
        blendMode: "difference",
      }).at(420, 250),
    );
  },
);
