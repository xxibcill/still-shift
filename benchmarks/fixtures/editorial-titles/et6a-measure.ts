// ET6a measurement fixtures
// (docs/editorial-typography-improvement-plan.md#et6a--text-measurement-command).
//
// Synthetic, committed inputs only: a plain paper frame and the pinned fonts
// in assets/editorial-titles/fonts. Each case reproduces one of the ET7a
// pilot's measurement failures (docs/editorial-typography-et7a-results.json)
// as a builder whose sizes, origins and offsets are parameters, so a test can
// build it twice: once as the pilot placed it without measurement (`guess`),
// once placed from `comp measure`. Every layer uses its own colour so a test
// can find each one's pixels.
import { comp, text } from "@still-shift/motion";
import type { Composition } from "@still-shift/scene-contract";
import { latin, thai } from "../../../research/editorial-titles-et7a/fonts.ts";

export const frame = { width: 720, height: 1280, fps: 24, frames: 1 };
export const paper = "#F4EFE2";
/** The skill's minimum distance from each frame edge. */
export const edgeMargin = 40;

type Point = { x: number; y: number };
const base = (id: string, assets: Composition["assets"]) => ({
  id,
  ...frame,
  background: paper,
  fontCoverage: "strict" as const,
  assets,
});
const outline = (
  c: {
    textAnimator(
      value: NonNullable<Composition["textAnimators"]>[number],
    ): void;
  },
  node: string,
  color: string,
  width: number,
) =>
  c.textAnimator({
    node,
    unit: "line",
    start: 0,
    end: 1,
    stagger: 0,
    selector: { start: 0, end: 1 },
    from: { stroke: color, strokeWidth: width },
    to: { stroke: color, strokeWidth: width },
  });

/**
 * a02 r02: "LEATHER" in Archivo wdth 125 wght 900. The skill's table (0.65–0.8
 * em per capital) predicted it fitted at 96 px; it left about 20 px margins.
 */
export const leather = {
  ink: "#1E1E1E",
  guess: { size: 96, at: { x: 360, y: 600 } },
  build(size: number, at: Point) {
    return comp(base("et6a-leather", [latin.archivo]), (c) => {
      c.textStyle("wide", {
        fontAsset: "archivo",
        size,
        tracking: 40,
        axes: { wght: 900, wdth: 125 },
      });
      c.add(
        text("LEATHER", {
          id: "word",
          style: "wide",
          fontSize: size,
          color: leather.ink,
        })
          .at(at.x, at.y)
          .with({ align: "center", anchor: "cap" }),
      );
    }) as Composition;
  },
};

/**
 * b08 r01: "main character" in Playfair italic wght 800. Estimated from
 * regular-weight advances at 96 px, it ran edge to edge.
 */
export const mainCharacter = {
  ink: "#6B2D5C",
  guess: { size: 96, at: { x: 360, y: 600 } },
  build(size: number, at: Point) {
    return comp(base("et6a-main-character", [latin.playfairItalic]), (c) => {
      c.textStyle("ital", {
        fontAsset: "playfair-italic",
        size,
        axes: { wght: 800 },
      });
      c.add(
        text("main character", {
          id: "word",
          style: "ital",
          fontSize: size,
          color: mainCharacter.ink,
        })
          .at(at.x, at.y)
          .with({ align: "center", anchor: "baseline" }),
      );
    }) as Composition;
  },
};

/**
 * b02 r01: a highlight box behind Bebas caps with a guessed offset of −30,
 * which drew the box above the caps (highlights centre on baseline − x-height
 * / 2). Beside it, a mixed-case Archivo label, whose box needs a non-zero
 * offset to centre on its ink.
 */
export const boxes = {
  caps: "#4A2716",
  capsBox: "#2F6F6A",
  label: "#F6E7CF",
  labelBox: "#B3261E",
  guess: { caps: -30, label: -4 },
  build(offsets: { caps: number; label: number }) {
    return comp(base("et6a-boxes", [latin.bebas, latin.archivo]), (c) => {
      c.textStyle("caps", { fontAsset: "bebas", size: 92, tracking: 40 });
      c.textStyle("label", {
        fontAsset: "archivo",
        size: 46,
        tracking: 60,
        axes: { wght: 800, wdth: 115 },
      });
      c.add(
        text("IS THE NEW", {
          id: "caps",
          style: "caps",
          fontSize: 92,
          color: boxes.caps,
        })
          .at(360, 500)
          .with({
            align: "center",
            anchor: "cap",
            decorations: [
              {
                kind: "highlight",
                color: boxes.capsBox,
                thickness: 84,
                offset: offsets.caps,
              },
            ],
          }),
      );
      c.add(
        text("Fit check No. 05", {
          id: "label",
          style: "label",
          fontSize: 46,
          color: boxes.label,
        })
          .at(360, 800)
          .with({
            align: "center",
            anchor: "baseline",
            decorations: [
              {
                kind: "highlight",
                color: boxes.labelBox,
                thickness: 64,
                offset: offsets.label,
              },
            ],
          }),
      );
    }) as Composition;
  },
};

/**
 * a01-style lockup: a formal script word stacked over outlined condensed caps.
 * The pilot read cap height from the font files and put the caps' cap line a
 * gap below the script's baseline; the script's descender and the outline
 * are outside that model.
 */
export const lockup = {
  script: "#7A1F2B",
  caps: "#111111",
  outline: "#E8C547",
  outlineWidth: 12,
  gap: 24,
  centre: 360,
  guess: { script: { x: 360, y: 520 }, caps: { x: 360, y: 544 } },
  build(at: { script: Point; caps: Point }) {
    return comp(base("et6a-lockup", [latin.pinyon, latin.anton]), (c) => {
      c.add(
        text("layer", {
          id: "script",
          fontAsset: "pinyon",
          fontSize: 170,
          color: lockup.script,
        })
          .at(at.script.x, at.script.y)
          .with({ align: "center", anchor: "baseline" }),
      );
      c.add(
        text("IT UP", {
          id: "caps",
          fontAsset: "anton",
          fontSize: 210,
          color: lockup.caps,
        })
          .at(at.caps.x, at.caps.y)
          .with({ align: "center", anchor: "cap" }),
      );
      outline(c, "caps", lockup.outline, lockup.outlineWidth);
    }) as Composition;
  },
};

/**
 * Thai, mixed Thai/English and mixed-font spans. One Thai layer in Kanit
 * Black; one layer of Thai with an English span in Anton; one Latin layer of
 * three fonts (Playfair italic, a Bodoni italic ampersand, Archivo caps).
 */
export const scripts = {
  thai: "#5B3A8C",
  mixedThai: "#1F6F43",
  mixedLatin: "#1F4E79",
  lace: "#7A1F2B",
  amp: "#C25A00",
  wide: "#1E1E1E",
  build(at: { thai: Point; mixed: Point; spans: Point }) {
    return comp(
      base("et6a-scripts", [
        thai.kanitBlack,
        latin.anton,
        latin.playfairItalic,
        latin.bodoniItalic,
        latin.archivo,
      ]),
      (c) => {
        c.textStyle("thai", { fontAsset: "kanit-black", size: 120 });
        c.textStyle("anton", { fontAsset: "anton", size: 120 });
        c.textStyle("ital", {
          fontAsset: "playfair-italic",
          size: 72,
          axes: { wght: 900 },
        });
        c.textStyle("amp", {
          fontAsset: "bodoni-italic",
          size: 92,
          axes: { wght: 900, opsz: 96 },
        });
        c.textStyle("wide", {
          fontAsset: "archivo",
          size: 50,
          tracking: 40,
          axes: { wght: 900, wdth: 125 },
        });
        c.add(
          text("แต่งตัวปัง", {
            id: "thai",
            style: "thai",
            fontSize: 120,
            color: scripts.thai,
          })
            .at(at.thai.x, at.thai.y)
            .with({ align: "center", anchor: "baseline", locale: "th" }),
        );
        // Graphemes: "ลุ", "ค", " ", "O", "O", "T", "D".
        c.add(
          text("ลุค OOTD", {
            id: "mixed",
            style: "thai",
            fontSize: 120,
            color: scripts.mixedThai,
          })
            .at(at.mixed.x, at.mixed.y)
            .with({
              align: "center",
              anchor: "baseline",
              locale: "th",
              spans: [
                {
                  id: "latin",
                  start: 3,
                  end: 7,
                  style: "anton",
                  color: scripts.mixedLatin,
                },
              ],
            }),
        );
        // Graphemes: "lace " 0–4, "&" 5, " " 6, "LEATHER" 7–13.
        c.add(
          text("lace & LEATHER", {
            id: "spans",
            style: "ital",
            fontSize: 72,
            color: scripts.lace,
          })
            .at(at.spans.x, at.spans.y)
            .with({
              align: "center",
              anchor: "baseline",
              spans: [
                {
                  id: "amp",
                  start: 5,
                  end: 6,
                  style: "amp",
                  color: scripts.amp,
                },
                {
                  id: "wide",
                  start: 7,
                  end: 14,
                  style: "wide",
                  color: scripts.wide,
                },
              ],
            }),
        );
      },
    ) as Composition;
  },
  /**
   * A layer whose text opens with a span in another font: the layer's base
   * metrics are still its own style's (Playfair italic at 72), not the
   * opening span's (Bodoni italic at 92).
   */
  openingSpan() {
    return comp(
      base("et6a-opening-span", [latin.playfairItalic, latin.bodoniItalic]),
      (c) => {
        c.textStyle("ital", {
          fontAsset: "playfair-italic",
          size: 72,
          axes: { wght: 900 },
        });
        c.textStyle("amp", {
          fontAsset: "bodoni-italic",
          size: 92,
          axes: { wght: 900, opsz: 96 },
        });
        c.add(
          text("& lace", {
            id: "opening",
            style: "ital",
            fontSize: 72,
            color: scripts.lace,
          })
            .at(360, 640)
            .with({
              align: "center",
              anchor: "baseline",
              spans: [{ id: "amp", start: 0, end: 1, style: "amp" }],
            }),
        );
      },
    ) as Composition;
  },
};

/**
 * Drop shadows and glows. Glyphs are filled in the background colour so the
 * frame shows only what each effect paints: a soft offset shadow, the
 * pilot's halo (a zero-offset drop shadow, here around a held outline), a
 * hard shadow, a soft shadow cast by a caption `container` filled in the
 * background colour, and `light.glow` on bright text over a dark frame.
 */
export const effects = {
  shadow: "#B3261E",
  halo: "#2F6F6A",
  hard: "#4A2716",
  bubble: "#3D4A9E",
  night: "#101418",
  glowText: "#FFD54A",
  params: {
    shadow: { offset: [10, 14] as [number, number], blur: 6, opacity: 0.8 },
    halo: { offset: [0, 0] as [number, number], blur: 12, opacity: 0.9 },
    hard: { offset: [8, 8] as [number, number], blur: 0, opacity: 1 },
    bubble: { offset: [6, 10] as [number, number], blur: 8, opacity: 0.8 },
    outline: 12,
    glow: { radius: 10, intensity: 0.8, threshold: 0 },
  },
  shadows() {
    const p = effects.params;
    return comp(base("et6a-shadows", [latin.anton, latin.bebas]), (c) => {
      const shadow = (
        id: string,
        color: string,
        s: { offset: [number, number]; blur: number; opacity: number },
      ) => ({
        id,
        effect: "light.drop-shadow" as const,
        params: { ...s, color },
      });
      c.add(
        text("IT", {
          id: "shadow",
          fontAsset: "anton",
          fontSize: 200,
          color: paper,
        })
          .at(360, 120)
          .with({
            align: "center",
            anchor: "cap",
            effects: [shadow("s", effects.shadow, p.shadow)],
          }),
      );
      c.add(
        text("UP", {
          id: "halo",
          fontAsset: "anton",
          fontSize: 200,
          color: paper,
        })
          .at(360, 520)
          .with({
            align: "center",
            anchor: "cap",
            effects: [shadow("h", effects.halo, p.halo)],
          }),
      );
      outline(c, "halo", paper, p.outline);
      c.add(
        text("BOX", {
          id: "hard",
          fontAsset: "bebas",
          fontSize: 160,
          color: paper,
        })
          .at(360, 920)
          .with({
            align: "center",
            anchor: "cap",
            effects: [shadow("k", effects.hard, p.hard)],
          }),
      );
    }) as Composition;
  },
  containerShadow() {
    return comp(base("et6a-bubble", [latin.anton]), (c) => {
      c.add(
        text("SAY", {
          id: "bubble",
          fontAsset: "anton",
          fontSize: 160,
          color: paper,
        })
          .at(360, 560)
          .with({
            align: "center",
            anchor: "cap",
            container: {
              kind: "caption",
              fill: paper,
              stroke: paper,
              strokeWidth: 0,
              padding: 48,
              radius: 18,
            },
            effects: [
              {
                id: "b",
                effect: "light.drop-shadow",
                params: { ...effects.params.bubble, color: effects.bubble },
              },
            ],
          }),
      );
    }) as Composition;
  },
  glow() {
    return comp(
      { ...base("et6a-glow", [latin.anton]), background: effects.night },
      (c) => {
        c.add(
          text("GLOW", {
            id: "glow",
            fontAsset: "anton",
            fontSize: 200,
            color: effects.glowText,
          })
            .at(360, 400)
            .with({
              align: "center",
              anchor: "cap",
              effects: [
                { id: "g", effect: "light.glow", params: effects.params.glow },
              ],
            }),
        );
      },
    ) as Composition;
  },
};
