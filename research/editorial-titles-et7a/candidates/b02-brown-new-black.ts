// b02 "brown / IS THE NEW / BLACK": italic Didone word over two condensed
// cap lines, cream and chocolate, soft drop shadow, glyph cascade build.
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
const b = beats(f.fps, f.frames, { start: 0.15, end: 1.7 }, 6.3);
const cocoa = "#4A2716";

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["brown", "black"]),
    assets: [latin.bodoniItalic, latin.bebas],
  },
  (c) => {
    c.textStyle("ital", {
      fontAsset: "bodoni-italic",
      size: 170,
      axes: { wght: 700, opsz: 96 },
    });
    c.textStyle("caps", { fontAsset: "bebas", size: 92, tracking: 40 });

    c.add(
      text("brown", {
        id: "brown",
        style: "ital",
        fontSize: 170,
        color: "#F6E7CF",
      })
        .at(330, 470)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "heading",
          effects: [dropShadow("#1E0E06", [0, 8], 14, 0.75)],
        }),
    );
    c.add(
      text("IS THE NEW", {
        id: "mid",
        style: "caps",
        fontSize: 92,
        color: cocoa,
      })
        .at(400, 520)
        .with({
          align: "center",
          anchor: "cap",
          textRole: "heading",
          decorations: [
            // r02: highlights centre on half the x-height; Bebas has x = cap,
            // so no offset (r01's -30 put the box above the caps).
            {
              kind: "highlight",
              color: "#F6E7CF",
              thickness: 84,
              offset: 0,
              fadeWithText: true,
            },
          ],
        }),
    );
    c.add(
      text("BLACK", {
        id: "black",
        style: "caps",
        fontSize: 92,
        color: "#111111",
      })
        .at(400, 620)
        .with({ align: "center", anchor: "cap", textRole: "heading" }),
    );
    c.add(footage(reelB));

    outline(c, "black", "#F6E7CF", 10);
    enter(c, "brown", b.buildStart, {
      unit: "glyph",
      duration: 8,
      stagger: 2,
      from: { opacity: 0, offset: [0, 50], skew: -20 },
    });
    enter(c, "mid", b.buildStart + 16, {
      unit: "word",
      duration: 6,
      stagger: 4,
      from: { opacity: 0, offset: [-60, 0] },
    });
    enter(c, "black", b.buildStart + 28, {
      unit: "line",
      duration: 6,
      from: { opacity: 0, scale: 2.2 },
    });
    leave(
      c,
      "brown",
      b.exitStart,
      b.exitStart + 14,
      { opacity: 0, offset: [0, -40] },
      { unit: "glyph", stagger: 1 },
    );
    for (const node of ["mid", "black"])
      leave(c, node, b.exitStart, b.exitStart + 10, {
        opacity: 0,
        offset: [60, 0],
      });
    markBeats(c, b);
  },
);
