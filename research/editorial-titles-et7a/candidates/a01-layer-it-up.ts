// a01 "layer / IT UP": cranberry formal script over cream condensed caps with
// a black outline, below the face; handwriting glyph build, then word pops.
import { comp, text } from "@still-shift/motion";
import { footage, frameFor, reelA } from "../clips.ts";
import { latin } from "../fonts.ts";
import {
  beats,
  enter,
  leave,
  markBeats,
  outline,
  sparkle,
  displayWaivers,
} from "../grammar.ts";

const f = frameFor(reelA);
const b = beats(f.fps, f.frames, { start: 0.2, end: 1.8 }, 6.3);
const cranberry = "#B3123A";
const cream = "#FFF4E6";

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["script", "caps"]),
    assets: [latin.pinyon, latin.anton],
  },
  (c) => {
    c.textStyle("script", { fontAsset: "pinyon", size: 190 });
    c.textStyle("caps", { fontAsset: "anton", size: 170, tracking: 10 });

    c.add(
      text("layer", {
        id: "script",
        style: "script",
        fontSize: 190,
        color: cranberry,
      })
        .at(320, 720)
        .with({ align: "center", anchor: "baseline", textRole: "heading" }),
    );
    c.add(
      text("IT UP", { id: "caps", style: "caps", fontSize: 170, color: cream })
        .at(400, 740)
        .with({ align: "center", anchor: "cap", textRole: "heading" }),
    );
    const stars = [
      c.add(sparkle("spark-1", 130, 610, 26, cream)),
      c.add(sparkle("spark-2", 610, 760, 20, cream)),
    ];
    c.add(footage(reelA));

    outline(c, "script", cream, 10);
    outline(c, "caps", "#111111", 14);
    enter(c, "script", b.buildStart, {
      unit: "glyph",
      duration: 5,
      stagger: 3,
      from: { opacity: 0, offset: [-10, 0] },
    });
    enter(c, "caps", b.buildStart + 22, {
      unit: "word",
      duration: 7,
      stagger: 7,
      from: { opacity: 0, scale: 1.9 },
    });
    leave(
      c,
      "script",
      b.exitStart,
      b.exitStart + 12,
      { opacity: 0 },
      { unit: "glyph", stagger: 1 },
    );
    leave(
      c,
      "caps",
      b.exitStart,
      b.exitStart + 10,
      { opacity: 0, offset: [0, 50] },
      { unit: "word", stagger: 3 },
    );
    for (const [i, star] of stars.entries())
      c.timeline(
        star.alpha.keys([
          { frame: 0, value: 0 },
          { frame: b.buildStart + 36 + i * 4, value: 0 },
          { frame: b.buildStart + 40 + i * 4, value: 1 },
          { frame: b.exitStart, value: 1 },
          { frame: b.exitStart + 6, value: 0 },
        ]),
      );
    markBeats(c, b);
  },
);
