// b01 "ONE PANT / five ways": condensed caps over a gold script, zig-zag
// stack on the torso, brown outline, boxed sub-label, word pop build.
import { comp, text } from "@still-shift/motion";
import { footage, frameFor, reelB } from "../clips.ts";
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

const f = frameFor(reelB);
const b = beats(f.fps, f.frames, { start: 0.2, end: 1.6 }, 6.2);
const brown = "#3B1F12";

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["caps", "script"]),
    assets: [latin.anton, latin.pinyon, latin.archivo],
  },
  (c) => {
    c.textStyle("caps", { fontAsset: "anton", size: 150, tracking: 10 });
    c.textStyle("script", { fontAsset: "pinyon", size: 130 });
    c.textStyle("label", {
      fontAsset: "archivo",
      size: 26,
      tracking: 110,
      axes: { wght: 800, wdth: 125 },
    });

    c.add(
      text("ONE PANT", {
        id: "caps",
        style: "caps",
        fontSize: 150,
        color: "#FFF3D6",
      })
        .at(340, 370)
        .with({ align: "center", anchor: "cap", textRole: "heading" }),
    );
    c.add(
      text("five ways", {
        id: "script",
        style: "script",
        fontSize: 130,
        color: "#F2B33D",
      })
        .at(420, 600)
        .with({ align: "center", anchor: "baseline", textRole: "heading" }),
    );
    c.add(
      text("TEE · KNIT · MOCK NECK", {
        id: "label",
        style: "label",
        fontSize: 26,
        color: "#FFF3D6",
      })
        .at(360, 680)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "label",
          decorations: [
            {
              kind: "highlight",
              color: brown,
              thickness: 46,
              offset: -9,
              fadeWithText: true,
            },
          ],
        }),
    );
    const stars = [
      c.add(sparkle("spark-1", 118, 352, 26, "#FFF3D6")),
      c.add(sparkle("spark-2", 626, 548, 18, "#F2B33D")),
    ];
    c.add(footage(reelB));

    outline(c, "caps", brown, 14);
    outline(c, "script", brown, 10);
    enter(c, "caps", b.buildStart, {
      unit: "word",
      duration: 7,
      stagger: 6,
      from: { opacity: 0, scale: 1.8 },
    });
    enter(c, "script", b.buildStart + 14, {
      unit: "word",
      duration: 9,
      stagger: 6,
      from: { opacity: 0, offset: [0, -40] },
    });
    enter(c, "label", b.buildStart + 26, {
      unit: "line",
      duration: 8,
      from: { opacity: 0, offset: [0, 18] },
    });
    for (const node of ["caps", "script", "label"])
      leave(c, node, b.exitStart, b.exitStart + 12, {
        opacity: 0,
        offset: [0, -30],
      });
    c.timeline(
      stars[0]!.alpha.keys([
        { frame: 0, value: 0 },
        { frame: b.buildStart + 10, value: 0 },
        { frame: b.buildStart + 16, value: 1 },
        { frame: b.exitStart, value: 1 },
        { frame: b.exitStart + 8, value: 0 },
      ]),
      stars[1]!.alpha.keys([
        { frame: 0, value: 0 },
        { frame: b.buildStart + 24, value: 0 },
        { frame: b.buildStart + 30, value: 1 },
        { frame: b.exitStart, value: 1 },
        { frame: b.exitStart + 8, value: 0 },
      ]),
    );
    markBeats(c, b);
  },
);
