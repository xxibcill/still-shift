// P1 control (expected pass) — per-glyph Thai entrance in pinned Noto Sans
// Thai with animated wght/wdth, as in proof T2. The below-base vowel ุ (U+0E38)
// must stay attached to ล (U+0E25) while each glyph unit rises and swells from
// the thin wide instance (wght 100, wdth 100) to the black condensed one
// (wght 900, wdth 62.5).
import { comp, text } from "@still-shift/motion";
import { beats, copy, fonts, frame } from "./shared.ts";

export default comp(
  { ...frame, background: "#10140A", assets: [fonts.thai] },
  (c) => {
    c.textStyle("poster", {
      fontAsset: "thai",
      size: 230,
      leading: 1.1,
      axes: { wght: 900, wdth: 62.5 },
    });
    c.add(
      text(copy.thaiHeadline, {
        id: "poster",
        style: "poster",
        fontSize: 230,
        color: "#FFFFFF",
      })
        .at(60, 900)
        .with({
          inPoint: beats.enter,
          outPoint: beats.gone,
          anchor: "baseline",
          locale: "th",
          textRole: "heading",
        }),
    );
    c.textAnimator({
      node: "poster",
      unit: "glyph",
      start: beats.enter,
      end: beats.enter + 28,
      stagger: 3,
      selector: { start: 0, end: 1 },
      anchor: "glyph",
      from: { axes: { wght: -800, wdth: 37.5 }, opacity: 0, offset: [0, 70] },
      layer: "action",
    });
  },
);
