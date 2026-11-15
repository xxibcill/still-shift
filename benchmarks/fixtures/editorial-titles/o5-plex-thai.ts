// O5 — Thai copy in a pinned Latin font. Only IBM Plex Sans is loaded; it has
// no glyphs for ล (U+0E25), ุ (U+0E38) or ค (U+0E04). The top line is the proof
// tag; the bottom line is the Thai cluster alone, so any ink there was painted
// by a face outside the composition.
import { comp, text } from "@still-shift/motion";
import { copy, fonts } from "./shared.ts";

export default comp(
  {
    width: 720,
    height: 360,
    fps: 24,
    frames: 2,
    background: "#F4EFE2",
    assets: [fonts.sans],
  },
  (c) => {
    c.add(
      text(copy.mixedLabel, {
        id: "mixed",
        fontAsset: "sans",
        fontSize: 56,
        color: "#1D2410",
      })
        .at(40, 110)
        .with({ anchor: "baseline", locale: "th" }),
    );
    c.add(
      text(copy.thaiCluster, {
        id: "thai-only",
        fontAsset: "sans",
        fontSize: 96,
        color: "#1D2410",
      })
        .at(40, 280)
        .with({ anchor: "baseline", locale: "th" }),
    );
  },
);
