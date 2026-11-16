// b06 "fit check / No. 05": tilted marker brush with a hard offset shadow
// (sticker extrusion) and a yellow boxed tag; word pop with a twist.
import { comp, text } from "@still-shift/motion";
import { footage, frameFor, reelB } from "../clips.ts";
import { latin } from "../fonts.ts";
import {
  beats,
  dropShadow,
  enter,
  leave,
  markBeats,
  sparkle,
  displayWaivers,
} from "../grammar.ts";

const f = frameFor(reelB);
const b = beats(f.fps, f.frames, { start: 0.1, end: 1.4 }, 6.3);

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["marker"]),
    assets: [latin.marker, latin.bebas],
  },
  (c) => {
    // r02: at 150 px the wide marker face ran off both edges (no measurement
    // before render); 124 px fits.
    c.textStyle("marker", { fontAsset: "marker", size: 124 });
    c.textStyle("tag", { fontAsset: "bebas", size: 56, tracking: 60 });

    c.add(
      text("fit check", {
        id: "marker",
        style: "marker",
        fontSize: 124,
        color: "#FFFFFF",
      })
        .at(360, 500)
        .rotate(-6)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "heading",
          effects: [dropShadow("#121212", [7, 9], 0, 1)],
        }),
    );
    c.add(
      text("No. 05", {
        id: "tag",
        style: "tag",
        fontSize: 56,
        color: "#121212",
      })
        .at(470, 600)
        .rotate(-6)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "label",
          // r02: the box does not follow a glyph-by-glyph build, so it showed
          // in full behind a single "N"; its reveal is keyed to the typing.
          decorations: [
            {
              kind: "highlight",
              color: "#FFE14D",
              offset: 0,
              fadeWithText: true,
              reveal: [
                // r04: lint measured 2.03:1 on frames 23–29, where typed
                // glyphs appeared before the box reached them; the box now
                // leads the typing.
                { frame: b.buildStart + 16, value: 0 },
                { frame: b.buildStart + 26, value: 1 },
              ],
            },
          ],
        }),
    );
    const star = c.add(sparkle("spark", 110, 380, 28, "#FFE14D"));
    c.add(footage(reelB));

    enter(c, "marker", b.buildStart, {
      unit: "word",
      duration: 7,
      stagger: 7,
      from: { opacity: 0, scale: 2, rotation: -14 },
    });
    enter(c, "tag", b.buildStart + 20, {
      unit: "glyph",
      duration: 2,
      stagger: 2,
      from: { opacity: 0 },
    });
    for (const node of ["marker", "tag"])
      leave(c, node, b.exitStart, b.exitStart + 8, { opacity: 0, scale: 0.5 });
    c.timeline(
      star.alpha.keys([
        { frame: 0, value: 0 },
        { frame: b.buildStart + 14, value: 0 },
        { frame: b.buildStart + 18, value: 1 },
        { frame: b.exitStart, value: 1 },
        { frame: b.exitStart + 6, value: 0 },
      ]),
      star.rotation.keys([
        { frame: 0, value: 0 },
        { frame: f.frames - 1, value: 90 },
      ]),
    );
    markBeats(c, b);
  },
);
