// Editorial titles Phase 1 fixtures
// (docs/editorial-typography-improvement-plan.md#remaining-phases-2026-11-20).
//
// Synthetic, committed inputs only: a plain frame and the pinned fonts in
// assets/editorial-titles/fonts. Each case is one of the small gaps the ET7a
// pilot found (docs/editorial-typography-et7a-results.json, gap rank 3),
// built as the pilot hit it, with the Phase 1 fix as a parameter.
import { comp, text } from "@still-shift/motion";
import type { Composition } from "@still-shift/scene-contract";
import { latin } from "../../../research/editorial-titles-et7a/fonts.ts";

export const frame = { width: 720, height: 1280, fps: 24, frames: 1 };
export const paper = "#F4EFE2";

const base = (
  id: string,
  assets: Composition["assets"],
  frames = frame.frames,
  background = paper,
) => ({
  id,
  ...frame,
  frames,
  background,
  fontCoverage: "strict" as const,
  assets,
});

/**
 * a02 r01: "lace &" in Playfair italic at wght 900 with the ampersand as a
 * span in Pinyon Script, which has no wght axis. The span style inherited
 * the base wght and failed validation (`comp-text-font-axis`); the pilot
 * worked around it with `axes: {}` on the span style. `workaround` builds
 * that version, which the fix must render identically.
 */
export const spanAxes = {
  lace: "#2B1B17",
  amp: "#B3123A",
  build(workaround = false) {
    return comp(
      base("phase1-span-axes", [latin.playfairItalic, latin.pinyon]),
      (c) => {
        c.textStyle("ital", {
          fontAsset: "playfair-italic",
          size: 120,
          axes: { wght: 900 },
        });
        c.textStyle("amp", {
          fontAsset: "pinyon",
          size: 150,
          ...(workaround ? { axes: {} } : {}),
        });
        c.add(
          text("lace &", {
            id: "ital",
            style: "ital",
            fontSize: 120,
            color: spanAxes.lace,
          })
            .at(360, 640)
            .with({
              align: "center",
              anchor: "baseline",
              spans: [
                {
                  id: "amp",
                  start: 5,
                  end: 6,
                  style: "amp",
                  color: spanAxes.amp,
                },
              ],
            }),
        );
      },
    ) as Composition;
  },
};
