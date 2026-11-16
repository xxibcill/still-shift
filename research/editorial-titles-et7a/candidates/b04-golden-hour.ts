// b04 "golden hour / FITS": formal script with a warm halo over an extended
// heavy grotesque, sparkles; handwriting-like glyph build then a slam.
import { comp, text } from "@still-shift/motion";
import { footage, frameFor, reelB } from "../clips.ts";
import { latin } from "../fonts.ts";
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

const f = frameFor(reelB);
const b = beats(f.fps, f.frames, { start: 0.1, end: 1.8 }, 6.3);
const ink = "#5A2A0C";

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["script", "wide"]),
    assets: [latin.greatVibes, latin.archivo],
  },
  (c) => {
    c.textStyle("script", { fontAsset: "great-vibes", size: 150 });
    c.textStyle("wide", {
      fontAsset: "archivo",
      size: 150,
      tracking: 30,
      axes: { wght: 900, wdth: 125 },
    });

    c.add(
      text("golden hour", {
        id: "script",
        style: "script",
        fontSize: 150,
        color: "#FFD27A",
      })
        .at(360, 480)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "heading",
          effects: [halo("#7A3A06", 14, 0.85)],
        }),
    );
    c.add(
      text("FITS", {
        id: "wide",
        style: "wide",
        fontSize: 150,
        color: "#FFFFFF",
      })
        .at(360, 520)
        .with({ align: "center", anchor: "cap", textRole: "heading" }),
    );
    const stars = [
      c.add(sparkle("spark-1", 120, 360, 30, "#FFE7A8")),
      c.add(sparkle("spark-2", 610, 520, 22, "#FFFFFF")),
      c.add(sparkle("spark-3", 590, 360, 14, "#FFE7A8")),
    ];
    c.add(footage(reelB));

    outline(c, "wide", ink, 16);
    // r02: the gold script with only a halo read weakly on the sunlit door.
    outline(c, "script", ink, 7);
    enter(c, "script", b.buildStart, {
      unit: "glyph",
      duration: 4,
      stagger: 2,
      from: { opacity: 0, offset: [-12, 0] },
    });
    enter(c, "wide", b.buildStart + 26, {
      unit: "line",
      duration: 6,
      from: { opacity: 0, scale: 2.6 },
    });
    leave(
      c,
      "script",
      b.exitStart,
      b.exitStart + 12,
      { opacity: 0 },
      { unit: "glyph", stagger: 1 },
    );
    leave(c, "wide", b.exitStart, b.exitStart + 8, { opacity: 0, scale: 1.4 });
    for (const [i, star] of stars.entries())
      c.timeline(
        star.alpha.keys([
          { frame: 0, value: 0 },
          { frame: b.buildStart + 30 + i * 3, value: 0 },
          { frame: b.buildStart + 34 + i * 3, value: 1 },
          { frame: b.exitStart, value: 1 },
          { frame: b.exitStart + 6, value: 0 },
        ]),
        star.scaleX.keys([
          { frame: b.buildStart + 30 + i * 3, value: 0.2 },
          { frame: b.buildStart + 36 + i * 3, value: 1 },
        ]),
        star.scaleY.keys([
          { frame: b.buildStart + 30 + i * 3, value: 0.2 },
          { frame: b.buildStart + 36 + i * 3, value: 1 },
        ]),
      );
    markBeats(c, b);
  },
);
