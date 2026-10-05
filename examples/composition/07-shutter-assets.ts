import { comp, image } from "@still-shift/motion";
import { imageAsset } from "@still-shift/motion/node";
const art = await imageAsset(
  "house",
  "../../assets/story-motion/art/house-body.svg",
  { relativeTo: import.meta.url },
);
export default comp(
  {
    width: 640,
    height: 360,
    fps: 24,
    frames: 48,
    assets: [art],
    motionBlur: {
      enabled: true,
      samples: 4,
      shutterAngle: 180,
      shutterPhase: -90,
    },
  },
  (c) => {
    const house = c.add(image("house", art, { size: [180, 132] }).at(120, 120));
    c.timeline(house.x.to(340, 36));
  },
);
