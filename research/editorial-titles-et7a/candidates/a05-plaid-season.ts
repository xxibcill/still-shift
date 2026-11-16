// a05 "plaid / season / OUTFIT 01": white fat-face serif with a black outline,
// a tilted cranberry brush word outlined in cream, and a boxed tag; drop-in
// build with a slight overshoot feel from scale.
import { comp, text } from "@still-shift/motion";
import { footage, frameFor, reelA } from "../clips.ts";
import { latin } from "../fonts.ts";
import {
  beats,
  enter,
  leave,
  markBeats,
  outline,
  displayWaivers,
} from "../grammar.ts";

const f = frameFor(reelA);
const b = beats(f.fps, f.frames, { start: 0.2, end: 1.6 }, 6.3);
const cranberry = "#B3123A";
const cream = "#FFF4E6";

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["fat", "brush"]),
    assets: [latin.abril, latin.caveatBrush, latin.bebas],
  },
  (c) => {
    c.textStyle("fat", { fontAsset: "abril", size: 180 });
    c.textStyle("brush", { fontAsset: "caveat-brush", size: 140 });
    c.textStyle("tag", { fontAsset: "bebas", size: 46, tracking: 120 });

    c.add(
      text("plaid", {
        id: "fat",
        style: "fat",
        fontSize: 180,
        color: "#FFFFFF",
      })
        .at(330, 760)
        .with({ align: "center", anchor: "baseline", textRole: "heading" }),
    );
    c.add(
      text("season", {
        id: "brush",
        style: "brush",
        fontSize: 140,
        color: cranberry,
      })
        .at(420, 870)
        .rotate(-6)
        .with({ align: "center", anchor: "baseline", textRole: "heading" }),
    );
    c.add(
      text("OUTFIT 01", {
        id: "tag",
        style: "tag",
        fontSize: 46,
        color: "#111111",
      })
        .at(360, 950)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "label",
          decorations: [
            { kind: "highlight", color: cream, offset: 0, fadeWithText: true },
          ],
        }),
    );
    c.add(footage(reelA));

    outline(c, "fat", "#111111", 14);
    outline(c, "brush", cream, 10);
    enter(c, "fat", b.buildStart, {
      unit: "glyph",
      duration: 6,
      stagger: 3,
      from: { opacity: 0, offset: [0, -80], scale: 1.3 },
    });
    enter(c, "brush", b.buildStart + 20, {
      unit: "line",
      duration: 7,
      from: { opacity: 0, scale: 0.3, rotation: -20 },
    });
    enter(c, "tag", b.buildStart + 32, {
      unit: "line",
      duration: 6,
      from: { opacity: 0, offset: [0, 20] },
    });
    for (const node of ["fat", "brush", "tag"])
      leave(c, node, b.exitStart, b.exitStart + 10, {
        opacity: 0,
        offset: [0, 60],
      });
    markBeats(c, b);
  },
);
