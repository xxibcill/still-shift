// a06 "soft girl / SUNDAY": blush formal script with a dark halo over hollow
// condensed caps (transparent fill, cream outline); caps track in.
import { comp, text } from "@still-shift/motion";
import { footage, frameFor, reelA } from "../clips.ts";
import { latin } from "../fonts.ts";
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
const blush = "#F7B8C8";

export default comp(
  {
    ...f,
    fontCoverage: "strict",
    metadata: displayWaivers(["script", "caps"]),
    assets: [latin.greatVibes, latin.bebas],
  },
  (c) => {
    c.textStyle("script", { fontAsset: "great-vibes", size: 160 });
    c.textStyle("caps", { fontAsset: "bebas", size: 210, tracking: 30 });

    c.add(
      text("soft girl", {
        id: "script",
        style: "script",
        fontSize: 160,
        color: blush,
      })
        .at(360, 720)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "heading",
          effects: [halo("#3A0F1E", 12, 1)],
        }),
    );
    c.add(
      text("SUNDAY", {
        id: "caps",
        style: "caps",
        fontSize: 210,
        color: "#FFFFFF00",
      })
        .at(360, 750)
        .with({ align: "center", anchor: "cap", textRole: "heading" }),
    );
    const star = c.add(sparkle("spark", 600, 620, 26, blush));
    c.add(footage(reelA));

    outline(c, "caps", "#FFF4E6", 8);
    // r02: the halo alone left the blush script faint over the cream lace in
    // close-ups; a thin plum outline separates it.
    outline(c, "script", "#3A0F1E", 6);
    enter(c, "script", b.buildStart, {
      unit: "glyph",
      duration: 4,
      stagger: 2,
      from: { opacity: 0 },
    });
    c.textAnimator({
      node: "caps",
      unit: "line",
      start: b.buildStart + 22,
      end: b.buildStart + 40,
      stagger: 0,
      selector: { start: 0, end: 1 },
      anchor: "line",
      from: { opacity: 0, tracking: 600 },
      layer: "action",
    });
    leave(c, "script", b.exitStart, b.exitStart + 10, { opacity: 0 });
    leave(c, "caps", b.exitStart, b.exitStart + 12, {
      opacity: 0,
      tracking: 500,
    });
    c.timeline(
      star.alpha.keys([
        { frame: 0, value: 0 },
        { frame: b.buildStart + 36, value: 0 },
        { frame: b.buildStart + 40, value: 1 },
        { frame: b.exitStart, value: 1 },
        { frame: b.exitStart + 6, value: 0 },
      ]),
    );
    markBeats(c, b);
  },
);
