// a04 Thai "ลุคนี้ ปังมาก" ("this look slays"): lavender high-contrast Thai
// display serif outlined in deep purple over a white Thai handwriting line
// with a purple halo, lavender sparkles; pop then bounce-in.
import { comp, text } from "@still-shift/motion";
import { footage, frameFor, reelA } from "../clips.ts";
import { thai } from "../fonts.ts";
import {
  beats,
  enter,
  halo,
  leave,
  markBeats,
  outline,
  sparkle,
  displayWaivers,
} from "../grammar.ts";

const f = frameFor(reelA);
const b = beats(f.fps, f.frames, { start: 0.2, end: 1.6 }, 6.3);
const purple = "#2B1A4A";
const lavender = "#C9B6FF";

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["l1", "l2"]),
    assets: [thai.chonburi, thai.sriracha],
  },
  (c) => {
    c.textStyle("display", { fontAsset: "chonburi", size: 170 });
    c.textStyle("hand", { fontAsset: "sriracha", size: 140 });

    c.add(
      text("ลุคนี้", {
        id: "l1",
        style: "display",
        fontSize: 170,
        color: lavender,
      })
        .at(330, 760)
        .with({
          align: "center",
          anchor: "baseline",
          locale: "th",
          textRole: "heading",
        }),
    );
    c.add(
      text("ปังมาก", {
        id: "l2",
        style: "hand",
        fontSize: 140,
        color: "#FFFFFF",
      })
        .at(400, 900)
        .rotate(-4)
        .with({
          align: "center",
          anchor: "baseline",
          locale: "th",
          textRole: "heading",
          effects: [halo(purple, 12, 1)],
        }),
    );
    const stars = [
      c.add(sparkle("spark-1", 120, 640, 30, lavender)),
      c.add(sparkle("spark-2", 610, 700, 20, "#FFFFFF")),
      c.add(sparkle("spark-3", 600, 930, 16, lavender)),
    ];
    c.add(footage(reelA));

    outline(c, "l1", purple, 14);
    enter(c, "l1", b.buildStart, {
      unit: "line",
      duration: 7,
      from: { opacity: 0, scale: 2.2 },
    });
    enter(c, "l2", b.buildStart + 18, {
      unit: "line",
      duration: 8,
      from: { opacity: 0, offset: [0, 120] },
    });
    for (const node of ["l1", "l2"])
      leave(c, node, b.exitStart, b.exitStart + 10, { opacity: 0, scale: 0.5 });
    for (const [i, star] of stars.entries())
      c.timeline(
        star.alpha.keys([
          { frame: 0, value: 0 },
          { frame: b.buildStart + 28 + i * 4, value: 0 },
          { frame: b.buildStart + 32 + i * 4, value: 1 },
          { frame: b.exitStart, value: 1 },
          { frame: b.exitStart + 6, value: 0 },
        ]),
      );
    markBeats(c, b);
  },
);
