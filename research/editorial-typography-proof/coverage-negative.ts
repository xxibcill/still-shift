// Exact-copy coverage negative: the mixed Thai/English tag set in IBM Plex Sans,
// which has no glyphs for ล, ุ or ค (see cmap-probe.ts). Records whether
// validation or render report the gap and what the browser actually paints.
import { comp, text } from "@still-shift/motion";
import { copy } from "./copy.ts";
import { fonts } from "./shared.ts";

// PROOF_PLEX_ONLY=1 drops the Noto asset and layer, so no pinned Thai face is
// loaded in the page: any Thai ink then comes from outside the composition.
const plexOnly = process.env.PROOF_PLEX_ONLY === "1";

export default comp(
  {
    width: 720,
    height: 240,
    fps: 24,
    frames: 2,
    background: "#F4EFE2",
    assets: plexOnly ? [fonts.sans] : [fonts.sans, fonts.thai],
  },
  (c) => {
    c.add(
      text(copy.mixedLabel, {
        id: "plex",
        fontAsset: "sans",
        fontSize: 56,
        color: "#1D2410",
      })
        .at(40, 90)
        .with({ anchor: "baseline", locale: "th" }),
    );
    if (!plexOnly)
      c.add(
        text(copy.mixedLabel, {
          id: "noto",
          fontAsset: "thai",
          fontSize: 56,
          color: "#1D2410",
        })
          .at(40, 190)
          .with({ anchor: "baseline", locale: "th" }),
      );
  },
);
