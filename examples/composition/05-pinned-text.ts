import { comp, text, presets, seq, at } from "@still-shift/motion";
import { fontAsset } from "@still-shift/motion/node";
const font = await fontAsset(
  "heading",
  "../../assets/story-motion/fonts/plex-sans-semibold.ttf",
  { relativeTo: import.meta.url, weight: "600" },
);
export default comp(
  { width: 640, height: 360, fps: 24, frames: 72, assets: [font] },
  (c) => {
    const title = c.add(
      text("Motion follows meaning.", {
        fontAsset: font.id,
        fontSize: 42,
        color: "#233D4D",
      }).at(40, 150),
    );
    c.timeline(
      seq(
        presets.text.reveal(title, 20),
        presets.text.emphasize(title, 10),
        at(48, presets.text.release(title, 10)),
      ),
    );
    c.marker("read", 30, { duration: 42, label: "Read the complete line" });
  },
);
