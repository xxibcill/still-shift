// a03 mixed Thai/English "แต่งตัว with me" ("get dressed with me"): heavy
// cranberry Thai sans outlined in cream, a cream English script with a
// cranberry halo, and a boxed Thai sub-label "ลุคไปคาเฟ่" ("café look").
import { comp, text } from "@still-shift/motion";
import { footage, frameFor, reelA } from "../clips.ts";
import { latin, thai } from "../fonts.ts";
import {
  beats,
  enter,
  halo,
  leave,
  markBeats,
  outline,
  sparkle,
  displayWaivers,
} from "../grammar.ts";

const f = frameFor(reelA);
const b = beats(f.fps, f.frames, { start: 0.2, end: 1.8 }, 6.3);
const cranberry = "#B3123A";
const cream = "#FFF4E6";

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["thai", "script"]),
    assets: [thai.kanitBlack, latin.greatVibes, thai.plexThai],
  },
  (c) => {
    c.textStyle("heavy", { fontAsset: "kanit-black", size: 170 });
    c.textStyle("script", { fontAsset: "great-vibes", size: 140 });
    c.textStyle("label", { fontAsset: "plex-thai", size: 30, tracking: 40 });

    c.add(
      text("แต่งตัว", {
        id: "thai",
        style: "heavy",
        fontSize: 170,
        color: cranberry,
      })
        .at(360, 760)
        .with({
          align: "center",
          anchor: "baseline",
          locale: "th",
          textRole: "heading",
        }),
    );
    c.add(
      text("with me", {
        id: "script",
        style: "script",
        fontSize: 140,
        color: cream,
      })
        .at(420, 860)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "heading",
          effects: [halo(cranberry, 10, 1)],
        }),
    );
    c.add(
      text("ลุคไปคาเฟ่", {
        id: "label",
        style: "label",
        fontSize: 30,
        color: cream,
      })
        .at(360, 940)
        .with({
          align: "center",
          anchor: "baseline",
          locale: "th",
          textRole: "label",
          decorations: [
            {
              kind: "highlight",
              color: "#111111",
              thickness: 50,
              offset: -4,
              fadeWithText: true,
            },
          ],
        }),
    );
    const star = c.add(sparkle("spark", 600, 640, 24, cream));
    c.add(footage(reelA));

    outline(c, "thai", cream, 14);
    enter(c, "thai", b.buildStart, {
      unit: "line",
      duration: 8,
      from: { opacity: 0, scale: 0.4 },
    });
    enter(c, "script", b.buildStart + 14, {
      unit: "glyph",
      duration: 4,
      stagger: 2,
      from: { opacity: 0 },
    });
    enter(c, "label", b.buildStart + 36, {
      unit: "line",
      duration: 6,
      from: { opacity: 0, offset: [0, 14] },
    });
    for (const node of ["thai", "script", "label"])
      leave(c, node, b.exitStart, b.exitStart + 10, { opacity: 0, scale: 1.3 });
    c.timeline(
      star.alpha.keys([
        { frame: 0, value: 0 },
        { frame: b.buildStart + 10, value: 0 },
        { frame: b.buildStart + 14, value: 1 },
        { frame: b.exitStart, value: 1 },
        { frame: b.exitStart + 6, value: 0 },
      ]),
    );
    markBeats(c, b);
  },
);
