// b07 "chocolate / trousers": fat-face serif in chocolate with a cream
// outline over a tilted orange brush word, plus a boxed sub-label. Cascade.
import { comp, text } from "@still-shift/motion";
import { footage, frameFor, reelB } from "../clips.ts";
import { latin } from "../fonts.ts";
import {
  beats,
  enter,
  leave,
  markBeats,
  outline,
  displayWaivers,
} from "../grammar.ts";

const f = frameFor(reelB);
const b = beats(f.fps, f.frames, { start: 0.15, end: 1.7 }, 6.3);
const cocoa = "#5B2E1A";
const cream = "#FFF0D8";

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["fat", "brush"]),
    assets: [latin.abril, latin.caveatBrush, latin.archivo],
  },
  (c) => {
    c.textStyle("fat", { fontAsset: "abril", size: 120 });
    c.textStyle("brush", { fontAsset: "caveat-brush", size: 130 });
    c.textStyle("label", {
      fontAsset: "archivo",
      size: 24,
      tracking: 100,
      axes: { wght: 800, wdth: 110 },
    });

    c.add(
      text("chocolate", {
        id: "fat",
        style: "fat",
        fontSize: 120,
        color: cocoa,
      })
        .at(350, 450)
        .with({ align: "center", anchor: "baseline", textRole: "heading" }),
    );
    c.add(
      text("trousers", {
        id: "brush",
        style: "brush",
        fontSize: 130,
        color: "#FF8A3D",
      })
        .at(420, 560)
        .rotate(-5)
        .with({ align: "center", anchor: "baseline", textRole: "heading" }),
    );
    c.add(
      text("THE ONE PIECE I REWEAR", {
        id: "label",
        style: "label",
        fontSize: 24,
        color: cream,
      })
        .at(360, 640)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "label",
          decorations: [
            {
              kind: "highlight",
              color: cocoa,
              thickness: 44,
              offset: -4,
              fadeWithText: true,
            },
          ],
        }),
    );
    c.add(footage(reelB));

    outline(c, "fat", cream, 14);
    outline(c, "brush", "#2A1208", 10);
    enter(c, "fat", b.buildStart, {
      unit: "glyph",
      duration: 6,
      stagger: 2,
      from: { opacity: 0, offset: [0, 40], scale: 0.6 },
    });
    enter(c, "brush", b.buildStart + 20, {
      unit: "line",
      duration: 7,
      from: { opacity: 0, offset: [80, 0] },
    });
    enter(c, "label", b.buildStart + 30, {
      unit: "line",
      duration: 6,
      from: { opacity: 0 },
    });
    for (const node of ["fat", "brush", "label"])
      leave(c, node, b.exitStart, b.exitStart + 10, {
        opacity: 0,
        offset: [-60, 0],
      });
    markBeats(c, b);
  },
);
