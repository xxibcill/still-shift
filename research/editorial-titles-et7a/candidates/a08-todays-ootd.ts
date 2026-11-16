// a08 "today's / OOTD / LACE · CAMI · PLAID": cranberry script tucked over
// big cream Didone caps with a black outline, typed glyph by glyph, and a
// small boxed inventory label.
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
const b = beats(f.fps, f.frames, { start: 0.2, end: 1.7 }, 6.3);
const cranberry = "#B3123A";
const cream = "#FFF4E6";

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["script", "didone"]),
    assets: [latin.pinyon, latin.bodoni, latin.archivo],
  },
  (c) => {
    c.textStyle("script", { fontAsset: "pinyon", size: 130 });
    // r02: at 200 px the black Didone caps ran to ~25 px from both edges; 170.
    c.textStyle("didone", {
      fontAsset: "bodoni",
      size: 170,
      axes: { wght: 900, opsz: 96 },
    });
    c.textStyle("label", {
      fontAsset: "archivo",
      size: 24,
      tracking: 140,
      axes: { wght: 800, wdth: 115 },
    });

    c.add(
      text("today's", {
        id: "script",
        style: "script",
        fontSize: 130,
        color: cranberry,
      })
        .at(260, 700)
        .rotate(-8)
        .with({ align: "center", anchor: "baseline", textRole: "heading" }),
    );
    c.add(
      text("OOTD", {
        id: "didone",
        style: "didone",
        fontSize: 170,
        color: cream,
      })
        .at(360, 720)
        .with({ align: "center", anchor: "cap", textRole: "heading" }),
    );
    c.add(
      text("LACE · CAMI · PLAID", {
        id: "label",
        style: "label",
        fontSize: 24,
        color: "#111111",
      })
        .at(360, 960)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "label",
          decorations: [
            {
              kind: "highlight",
              color: cream,
              thickness: 44,
              offset: -4,
              fadeWithText: true,
            },
          ],
        }),
    );
    const star = c.add(sparkle("spark", 620, 700, 24, cream));
    c.add(footage(reelA));

    outline(c, "script", cream, 9);
    outline(c, "didone", "#111111", 12);
    enter(c, "didone", b.buildStart, {
      unit: "glyph",
      duration: 1,
      stagger: 5,
      from: { opacity: 0 },
    });
    enter(c, "script", b.buildStart + 22, {
      unit: "line",
      duration: 8,
      from: { opacity: 0, scale: 0.5, rotation: -15 },
    });
    enter(c, "label", b.buildStart + 34, {
      unit: "word",
      duration: 4,
      stagger: 3,
      from: { opacity: 0 },
    });
    for (const node of ["script", "didone", "label"])
      leave(c, node, b.exitStart, b.exitStart + 10, { opacity: 0 });
    c.timeline(
      star.alpha.keys([
        { frame: 0, value: 0 },
        { frame: b.buildStart + 28, value: 0 },
        { frame: b.buildStart + 32, value: 1 },
        { frame: b.exitStart, value: 1 },
        { frame: b.exitStart + 6, value: 0 },
      ]),
    );
    markBeats(c, b);
  },
);
