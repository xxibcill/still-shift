// b03 Thai "กางเกงตัวเดียว 5 ลุค" ("one pair of trousers, 5 looks"): heavy
// Thai sans, Thai script and a teal numeral line, zig-zag over the torso,
// outlined; English sub-label on a box. Glyph typewriter on the script line.
import { comp, text } from "@still-shift/motion";
import { footage, frameFor, reelB } from "../clips.ts";
import { thai } from "../fonts.ts";
import {
  beats,
  enter,
  leave,
  markBeats,
  outline,
  displayWaivers,
} from "../grammar.ts";

const f = frameFor(reelB);
const b = beats(f.fps, f.frames, { start: 0.15, end: 1.8 }, 6.2);
const cocoa = "#3A1E10";
const cream = "#FFF1DC";

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["l1", "l2", "l3"]),
    assets: [thai.kanitBlack, thai.charm, thai.mitr, thai.plexThai],
  },
  (c) => {
    c.textStyle("heavy", { fontAsset: "kanit-black", size: 150 });
    c.textStyle("script", { fontAsset: "charm", size: 130 });
    // r02: Prompt Black fails font-metadata (its name ID 13 licence string is
    // 8,716 bytes, over the 2,048-byte name budget); Mitr Bold instead.
    c.textStyle("num", { fontAsset: "mitr", size: 150 });
    c.textStyle("label", { fontAsset: "plex-thai", size: 26, tracking: 120 });

    const thaiText = {
      anchor: "baseline" as const,
      align: "center" as const,
      locale: "th",
    };
    c.add(
      text("กางเกง", { id: "l1", style: "heavy", fontSize: 150, color: cream })
        .at(360, 470)
        .with({ ...thaiText, textRole: "heading" }),
    );
    c.add(
      text("ตัวเดียว", {
        id: "l2",
        style: "script",
        fontSize: 130,
        color: "#F5B83D",
      })
        .at(420, 600)
        .with({ ...thaiText, textRole: "heading" }),
    );
    c.add(
      text("5 ลุค", { id: "l3", style: "num", fontSize: 150, color: "#19A3A3" })
        .at(330, 760)
        .with({ ...thaiText, textRole: "heading" }),
    );
    c.add(
      text("ONE PANT · FIVE LOOKS", {
        id: "label",
        style: "label",
        fontSize: 26,
        color: cream,
      })
        .at(360, 840)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "label",
          decorations: [
            {
              kind: "highlight",
              color: cocoa,
              thickness: 46,
              offset: -4,
              fadeWithText: true,
            },
          ],
        }),
    );
    c.add(footage(reelB));

    outline(c, "l1", cocoa, 14);
    outline(c, "l2", cocoa, 10);
    outline(c, "l3", cream, 12);
    enter(c, "l1", b.buildStart, {
      unit: "line",
      duration: 7,
      from: { opacity: 0, scale: 1.6 },
    });
    enter(c, "l2", b.buildStart + 9, {
      unit: "glyph",
      duration: 3,
      stagger: 2,
      from: { opacity: 0 },
    });
    enter(c, "l3", b.buildStart + 24, {
      unit: "word",
      duration: 7,
      stagger: 4,
      from: { opacity: 0, scale: 2.4, rotation: -12 },
    });
    enter(c, "label", b.buildStart + 34, {
      unit: "line",
      duration: 6,
      from: { opacity: 0, offset: [0, 16] },
    });
    for (const node of ["l1", "l2", "l3", "label"])
      leave(c, node, b.exitStart, b.exitStart + 10, { opacity: 0, scale: 0.6 });
    markBeats(c, b);
  },
);
