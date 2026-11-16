// ET7a pin check: every pinned font in one composition, so strict validation
// reads each font's identity, axes and cmap, and covers a Latin and (for Thai
// faces) a Thai sample.
import { comp, text } from "@still-shift/motion";
import { latin, thai } from "../fonts.ts";

const fonts = [...Object.values(latin), ...Object.values(thai)];
const thaiIds = new Set(Object.values(thai).map((font) => font.id));
export default comp(
  {
    width: 720,
    height: 1280,
    fps: 24,
    frames: 1,
    fontCoverage: "strict",
    assets: fonts,
  },
  (c) => {
    for (const [i, font] of fonts.entries())
      c.add(
        text(
          thaiIds.has(font.id) ? "Fit แต่งตัว ลุคนี้ 5" : "Wear it twice 05",
          {
            id: `sample-${font.id}`,
            fontAsset: font.id,
            fontSize: 32,
            color: "#111111",
          },
        )
          .at(20, 40 + i * 48)
          .with({
            anchor: "baseline",
            locale: thaiIds.has(font.id) ? "th" : "en",
          }),
      );
  },
);
