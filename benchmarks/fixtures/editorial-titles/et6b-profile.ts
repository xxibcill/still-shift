// ET6b editorial-title lint profile fixtures
// (docs/editorial-typography-improvement-plan.md#et6b--editorial-title-lint-profile).
//
// Committed, licence-free inputs only: the synthetic clip and the pinned OFL
// fonts. `ET6B_CASE` picks one case:
//
// Reading motion (D-read). The first three copy the proof's hold drift
// (O7: research/editorial-typography-proof), which the default reading rule
// fails and the profile must pass; the last three must still fail.
//   hold-tracking     T1: a 250 px serif headline's tracking opens 0 → 25
//   hold-rise         T2: the line rises 14 px through the hold
//   hold-line-track   T3: a 62 px serif line's tracking opens 0 → 30
//   hold-fast         the line rises 600 px through the hold (~4 letter-heights/s)
//   hold-jitter       the line shakes 1 px up and down on alternate frames
//   hold-spin         the line turns a full circle through the hold
//   hold-line-scale   the 62 px line scales 1 → 1.5 about its centre through
//                     the hold: its outer glyphs move faster than 1
//                     letter-height/s (PR #76 re-review, finding 1)
//
// Treated display contrast. White display type in the clip's bright field
// (RGB 232), where untreated white reads about 1.2:1.
//   treat-none        no treatment (must fail)
//   treat-outline     black held outline, strokeWidth 14 (about 7 px visible)
//   treat-thin        black held outline, strokeWidth 2 (about 1 px visible)
//   treat-halo        dark zero-offset drop shadow (the pilot's halo)
//   treat-hollow      transparent fill, black outline only
import { comp, text } from "@still-shift/motion";
import { clip, fonts, frame } from "./shared.ts";

export const ET6B_CASES = [
  "hold-tracking",
  "hold-rise",
  "hold-line-track",
  "hold-fast",
  "hold-jitter",
  "hold-spin",
  "hold-line-scale",
  "treat-none",
  "treat-outline",
  "treat-thin",
  "treat-halo",
  "treat-hollow",
] as const;
export type Et6bCase = (typeof ET6B_CASES)[number];

/** Entrance, hold and exit (frames), as the proof treatments use them. */
export const et6bBeats = { enter: 4, held: 24, exit: 72, gone: 90 };

type Builder = Parameters<Parameters<typeof comp>[1]>[0];

function entrance(c: Builder, node: string) {
  c.textAnimator({
    node,
    unit: "glyph",
    start: et6bBeats.enter,
    end: et6bBeats.held,
    stagger: 2,
    selector: { start: 0, end: 1 },
    anchor: "glyph",
    from: { opacity: 0, offset: [0, 24] },
    layer: "action",
  });
}
function exit(c: Builder, node: string) {
  c.textAnimator({
    node,
    unit: "line",
    start: et6bBeats.exit,
    end: et6bBeats.gone,
    stagger: 0,
    selector: { start: 0, end: 1 },
    from: { opacity: 1 },
    to: { opacity: 0 },
    layer: "response",
  });
}
function hold(
  c: Builder,
  node: string,
  unit: "glyph" | "line",
  from: Record<string, unknown>,
  to: Record<string, unknown>,
) {
  c.textAnimator({
    node,
    unit,
    start: et6bBeats.held,
    end: et6bBeats.exit,
    stagger: 0,
    selector: { start: 0, end: 1 },
    from,
    to,
    layer: "current",
  } as never);
}

function readingCase(name: Et6bCase) {
  const headline = name === "hold-tracking";
  const line = name === "hold-line-track" || name === "hold-line-scale";
  return comp(
    {
      id: `et6b-${name}`,
      width: frame.width,
      height: frame.height,
      fps: frame.fps,
      frames: et6bBeats.gone + 6,
      fontCoverage: "strict",
      assets: [fonts.serif, fonts.sans],
    },
    (c) => {
      const title = text(
        headline ? "Olive" : line ? "three ways to wear olive" : "OLIVE EDIT",
        {
          id: "title",
          fontAsset: headline || line ? "serif" : "sans",
          fontSize: headline ? 250 : line ? 62 : 150,
          color: "#1A1A1A",
        },
      )
        .at(540, 560)
        .with({ align: "center", anchor: "baseline", textRole: "heading" });
      if (name === "hold-jitter")
        title.with({
          transform: {
            position: {
              keys: Array.from(
                { length: et6bBeats.exit - et6bBeats.held + 1 },
                (_, i) => ({
                  frame: et6bBeats.held + i,
                  value: [540, 560 + (i % 2 ? 1 : -1)],
                }),
              ),
            },
          },
        } as never);
      c.add(title);
      c.add(clip());
      entrance(c, "title");
      if (name === "hold-tracking" || name === "hold-line-track")
        hold(
          c,
          "title",
          "glyph",
          { tracking: 0 },
          { tracking: headline ? 25 : 30 },
        );
      if (name === "hold-rise")
        hold(c, "title", "line", { offset: [0, 0] }, { offset: [0, -14] });
      if (name === "hold-fast")
        hold(c, "title", "line", { offset: [0, 0] }, { offset: [0, -600] });
      if (name === "hold-spin")
        hold(c, "title", "line", { rotation: 0 }, { rotation: 360 });
      if (name === "hold-line-scale")
        hold(c, "title", "line", { scale: 1 }, { scale: 1.5 });
      exit(c, "title");
    },
  );
}

function treatmentCase(name: Et6bCase) {
  const halo = name === "treat-halo";
  return comp(
    {
      id: `et6b-${name}`,
      width: frame.width,
      height: frame.height,
      fps: frame.fps,
      // The clip's dark band (bottom edge 285·t − 10 px) reaches the tops of
      // the letters (y ≈ 340) at frame 29; stop before it, with one second
      // of reading time.
      frames: 24,
      fontCoverage: "strict",
      assets: [fonts.serif],
    },
    (c) => {
      c.add(
        text("Olive", {
          id: "title",
          fontAsset: "serif",
          fontSize: 260,
          color: name === "treat-hollow" ? "#FFFFFF00" : "#FFFFFF",
        })
          .at(540, 520)
          .with({
            align: "center",
            anchor: "baseline",
            textRole: "heading",
            ...(halo
              ? {
                  effects: [
                    {
                      id: "halo",
                      effect: "light.drop-shadow" as const,
                      params: {
                        offset: [0, 0],
                        blur: 16,
                        opacity: 0.9,
                        color: "#2A0A14",
                      },
                    },
                  ],
                }
              : {}),
          }),
      );
      c.add(clip());
      const width =
        name === "treat-thin"
          ? 2
          : name === "treat-outline" || name === "treat-hollow"
            ? 14
            : 0;
      if (width)
        c.textAnimator({
          node: "title",
          unit: "line",
          start: 0,
          end: 1,
          stagger: 0,
          selector: { start: 0, end: 1 },
          from: { stroke: "#111111", strokeWidth: width },
          to: { stroke: "#111111", strokeWidth: width },
        });
    },
  );
}

export function et6bFixture(name: Et6bCase) {
  return name.startsWith("hold-") ? readingCase(name) : treatmentCase(name);
}

const name = (process.env.ET6B_CASE ?? "hold-tracking") as Et6bCase;
if (!ET6B_CASES.includes(name))
  throw new Error(`ET6B_CASE must be one of ${ET6B_CASES.join(", ")}`);
export default et6bFixture(name);
