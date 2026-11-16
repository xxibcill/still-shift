// a07 "black cami / ERA / LACE UNDERNEATH": cream italic serif with a soft
// shadow over a huge black condensed word outlined in cream, and a cranberry
// boxed sub-label; letters of ERA drop in one by one.
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
const b = beats(f.fps, f.frames, { start: 0.2, end: 1.8 }, 6.3);
const cream = "#FFF4E6";

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["ital", "caps"]),
    assets: [latin.dmSerifItalic, latin.anton, latin.archivo],
  },
  (c) => {
    c.textStyle("ital", { fontAsset: "dm-serif-italic", size: 112 });
    c.textStyle("caps", { fontAsset: "anton", size: 260, tracking: 20 });
    c.textStyle("label", {
      fontAsset: "archivo",
      size: 24,
      tracking: 140,
      axes: { wght: 800, wdth: 115 },
    });

    c.add(
      text("black cami", {
        id: "ital",
        style: "ital",
        fontSize: 112,
        color: cream,
      })
        .at(360, 660)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "heading",
          effects: [dropShadow("#000000", [0, 6], 14, 0.85)],
        }),
    );
    c.add(
      text("ERA", {
        id: "caps",
        style: "caps",
        fontSize: 260,
        color: "#111111",
      })
        .at(360, 690)
        .with({ align: "center", anchor: "cap", textRole: "heading" }),
    );
    c.add(
      text("LACE UNDERNEATH", {
        id: "label",
        style: "label",
        fontSize: 24,
        color: cream,
      })
        .at(360, 970)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "label",
          decorations: [
            {
              kind: "highlight",
              color: "#B3123A",
              thickness: 44,
              offset: -4,
              fadeWithText: true,
            },
          ],
        }),
    );
    c.add(footage(reelA));

    outline(c, "caps", cream, 12);
    enter(c, "ital", b.buildStart, {
      unit: "word",
      duration: 8,
      stagger: 8,
      from: { opacity: 0, offset: [0, 30] },
    });
    enter(c, "caps", b.buildStart + 18, {
      unit: "glyph",
      duration: 6,
      stagger: 5,
      from: { opacity: 0, offset: [0, -160] },
    });
    enter(c, "label", b.buildStart + 40, {
      unit: "line",
      duration: 6,
      from: { opacity: 0 },
    });
    for (const node of ["ital", "caps", "label"])
      leave(c, node, b.exitStart, b.exitStart + 10, {
        opacity: 0,
        offset: [0, 40],
      });
    markBeats(c, b);
  },
);
