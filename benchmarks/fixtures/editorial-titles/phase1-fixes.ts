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

/**
 * b06 r01–r03: a boxed label typed glyph by glyph. The highlight showed in
 * full behind the first typed glyph (it follows line opacity, not the
 * per-glyph build); the pilot keyed its `reveal` to the typing by hand.
 * `grow` sets the Phase 1 `growWithText`. Glyph `i` starts fading in at
 * frame `typing.start + i * typing.stagger`.
 */
export const typedHighlight = {
  ink: "#121212",
  box: "#FFE14D",
  copy: "No. 05",
  typing: { start: 4, stagger: 4, duration: 2 },
  frames: 36,
  build(grow: boolean, options: { animate?: boolean } = {}) {
    const { typing } = typedHighlight;
    return comp(
      base("phase1-typed-highlight", [latin.bebas], typedHighlight.frames),
      (c) => {
        c.textStyle("tag", { fontAsset: "bebas", size: 120, tracking: 40 });
        c.add(
          text(typedHighlight.copy, {
            id: "tag",
            style: "tag",
            fontSize: 120,
            color: typedHighlight.ink,
          })
            .at(360, 640)
            .with({
              align: "center",
              anchor: "baseline",
              textRole: "label",
              decorations: [
                {
                  kind: "highlight",
                  color: typedHighlight.box,
                  offset: 0,
                  fadeWithText: true,
                  ...(grow ? { growWithText: true } : {}),
                },
              ],
            }),
        );
        if (options.animate !== false)
          c.textAnimator({
            node: "tag",
            unit: "glyph",
            start: typing.start,
            // `end` bounds the whole build: each glyph's start is clamped
            // to end − 1, so it must leave room for every glyph's stagger.
            end: typing.start + 5 * typing.stagger + typing.duration,
            stagger: typing.stagger,
            selector: { start: 0, end: 1 },
            from: { opacity: 0 },
          });
      },
    ) as Composition;
  },
};

/**
 * Highlight horizontal padding (ET7a engine mapping: "no horizontal
 * padding"): a Bebas label on a box that ends flush with its first and last
 * glyph. `padding` is the Phase 1 field, in CSS order; `kind` switches to a
 * stroked `box` decoration.
 */
export const paddedBox = {
  ink: "#121212",
  box: "#2F6F6A",
  build(
    padding?: number | [number, number] | [number, number, number, number],
    kind: "highlight" | "box" = "highlight",
  ) {
    return comp(base("phase1-padded-box", [latin.bebas]), (c) => {
      c.textStyle("tag", { fontAsset: "bebas", size: 96, tracking: 40 });
      c.add(
        text("ONE PANT", {
          id: "tag",
          style: "tag",
          fontSize: 96,
          color: paddedBox.ink,
        })
          .at(360, 640)
          .with({
            align: "center",
            anchor: "baseline",
            textRole: "label",
            decorations: [
              {
                kind,
                color: paddedBox.box,
                offset: 0,
                ...(kind === "box" ? { thickness: 4 } : {}),
                ...(padding === undefined ? {} : { padding }),
              },
            ],
          }),
      );
    }) as Composition;
  },
};
