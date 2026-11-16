// b08 "main character / ENERGY": typewritten bold italic serif over huge
// sky-blue condensed caps with a navy outline; letters pop centre-out.
import { comp, text } from "@still-shift/motion";
import { footage, frameFor, reelB } from "../clips.ts";
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

const f = frameFor(reelB);
const b = beats(f.fps, f.frames, { start: 0.1, end: 1.9 }, 6.3);
const navy = "#14213D";

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["ital", "caps"]),
    assets: [latin.playfairItalic, latin.anton],
  },
  (c) => {
    // r02: at 96 px the bold italic ran edge to edge (wght 800 is wider than
    // the regular-weight estimate); 80 px.
    c.textStyle("ital", {
      fontAsset: "playfair-italic",
      size: 80,
      axes: { wght: 800 },
    });
    c.textStyle("caps", { fontAsset: "anton", size: 200, tracking: 20 });

    c.add(
      text("main character", {
        id: "ital",
        style: "ital",
        fontSize: 80,
        color: "#FFFFFF",
      })
        .at(360, 428)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "heading",
          effects: [dropShadow(navy, [0, 5], 10, 0.9)],
        }),
    );
    c.add(
      text("ENERGY", {
        id: "caps",
        style: "caps",
        fontSize: 200,
        color: "#8EC9FF",
      })
        .at(360, 445)
        .with({ align: "center", anchor: "cap", textRole: "heading" }),
    );
    c.add(footage(reelB));

    outline(c, "caps", navy, 16);
    enter(c, "ital", b.buildStart, {
      unit: "glyph",
      duration: 1,
      stagger: 2,
      from: { opacity: 0 },
    });
    enter(c, "caps", b.buildStart + 28, {
      unit: "glyph",
      duration: 6,
      stagger: 2,
      order: "center-out",
      from: { opacity: 0, scale: 0.3, offset: [0, 30] },
    });
    leave(c, "ital", b.exitStart, b.exitStart + 10, { opacity: 0 });
    leave(
      c,
      "caps",
      b.exitStart,
      b.exitStart + 12,
      { opacity: 0, offset: [0, 80] },
      { unit: "glyph", stagger: 1 },
    );
    markBeats(c, b);
  },
);
