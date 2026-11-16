// a02 "lace & / LEATHER": bold italic serif with a script ampersand in one
// layer (span with its own style), over extended black caps outlined in
// cream; slide-in cascade.
import { comp, text } from "@still-shift/motion";
import { footage, frameFor, reelA } from "../clips.ts";
import { latin } from "../fonts.ts";
import {
  beats,
  dropShadow,
  enter,
  leave,
  markBeats,
  outline,
  displayWaivers,
} from "../grammar.ts";

const f = frameFor(reelA);
const b = beats(f.fps, f.frames, { start: 0.2, end: 1.7 }, 6.3);
const cream = "#FFF4E6";

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["ital", "wide"]),
    assets: [latin.playfairItalic, latin.bodoniItalic, latin.archivo],
  },
  (c) => {
    c.textStyle("ital", {
      fontAsset: "playfair-italic",
      size: 160,
      axes: { wght: 900 },
    });
    // r02: a span style inherits the base style's axes, and Pinyon has no
    // wght axis (fixed with axes: {}). r03: Pinyon's ampersand read as a
    // small squiggle at phone size; a heavy Bodoni italic one replaces it.
    c.textStyle("amp", {
      fontAsset: "bodoni-italic",
      size: 190,
      axes: { wght: 900, opsz: 96 },
    });
    c.textStyle("wide", {
      fontAsset: "archivo",
      // r03: 96 px left 20 px margins; 84 px keeps the lockup off the edges.
      size: 84,
      tracking: 40,
      axes: { wght: 900, wdth: 125 },
    });

    c.add(
      text("lace &", { id: "ital", style: "ital", fontSize: 160, color: cream })
        .at(340, 740)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "heading",
          spans: [
            { id: "amp", start: 5, end: 6, style: "amp", color: "#B3123A" },
          ],
          effects: [dropShadow("#1A0A0A", [0, 6], 12, 0.8)],
        }),
    );
    c.add(
      text("LEATHER", {
        id: "wide",
        style: "wide",
        fontSize: 84,
        color: "#111111",
      })
        .at(360, 780)
        .with({ align: "center", anchor: "cap", textRole: "heading" }),
    );
    c.add(footage(reelA));

    outline(c, "wide", cream, 12);
    enter(c, "ital", b.buildStart, {
      unit: "word",
      duration: 8,
      stagger: 8,
      from: { opacity: 0, offset: [-90, 0] },
    });
    enter(c, "wide", b.buildStart + 22, {
      unit: "glyph",
      duration: 5,
      stagger: 2,
      from: { opacity: 0, offset: [60, 0] },
    });
    leave(c, "ital", b.exitStart, b.exitStart + 10, {
      opacity: 0,
      offset: [-90, 0],
    });
    leave(c, "wide", b.exitStart, b.exitStart + 10, {
      opacity: 0,
      offset: [90, 0],
    });
    markBeats(c, b);
  },
);
