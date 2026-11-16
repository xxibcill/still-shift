// b05 Thai "ขโมยลุคนี้ ไปเลย!" ("steal this look, go for it!"): hot-pink
// heavy Thai sans with a black outline, a tilted white Thai brush line with a
// pink halo, and a boxed English tag. Glyph drop build.
import { comp, text } from "@still-shift/motion";
import { footage, frameFor, reelB } from "../clips.ts";
import { latin, thai } from "../fonts.ts";
import {
  beats,
  enter,
  halo,
  leave,
  markBeats,
  outline,
  displayWaivers,
} from "../grammar.ts";

const f = frameFor(reelB);
const b = beats(f.fps, f.frames, { start: 0.1, end: 1.6 }, 6.3);
const pink = "#FF4F9A";

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["l1", "l2"]),
    assets: [thai.kanitBlack, thai.pattaya, latin.bebas],
  },
  (c) => {
    // r02: lockup moved down 30 px; tone marks touched the chin when the
    // subject bends (agent check of the hold frames).
    // Prompt Black is rejected by font-metadata (b03 r01), so Kanit Black.
    c.textStyle("heavy", { fontAsset: "kanit-black", size: 124 });
    c.textStyle("brush", { fontAsset: "pattaya", size: 120 });
    c.textStyle("tag", { fontAsset: "bebas", size: 44, tracking: 80 });

    c.add(
      text("ขโมยลุคนี้", {
        id: "l1",
        style: "heavy",
        fontSize: 124,
        color: pink,
      })
        .at(360, 480)
        .with({
          align: "center",
          anchor: "baseline",
          locale: "th",
          textRole: "heading",
        }),
    );
    c.add(
      text("ไปเลย!", {
        id: "l2",
        style: "brush",
        fontSize: 120,
        color: "#FFFFFF",
      })
        .at(400, 620)
        .rotate(-5)
        .with({
          align: "center",
          anchor: "baseline",
          locale: "th",
          textRole: "heading",
          effects: [halo(pink, 12, 1)],
        }),
    );
    c.add(
      text("STEAL THIS LOOK", {
        id: "tag",
        style: "tag",
        fontSize: 44,
        color: "#111111",
      })
        .at(360, 700)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "label",
          decorations: [
            { kind: "highlight", color: pink, offset: 0, fadeWithText: true },
          ],
        }),
    );
    c.add(footage(reelB));

    outline(c, "l1", "#111111", 14);
    enter(c, "l1", b.buildStart, {
      unit: "glyph",
      duration: 5,
      stagger: 2,
      from: { opacity: 0, offset: [0, -70] },
    });
    enter(c, "l2", b.buildStart + 20, {
      unit: "line",
      duration: 7,
      from: { opacity: 0, scale: 0.4, rotation: 10 },
    });
    enter(c, "tag", b.buildStart + 30, {
      unit: "word",
      duration: 4,
      stagger: 3,
      from: { opacity: 0 },
    });
    for (const node of ["l1", "l2", "tag"])
      leave(c, node, b.exitStart, b.exitStart + 10, {
        opacity: 0,
        offset: [0, 40],
      });
    markBeats(c, b);
  },
);
