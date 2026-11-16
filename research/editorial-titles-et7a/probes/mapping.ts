// ET7a step 2: confirm the G1 engine mapping by rendering, over reel B.
// One layer per technique so each can be judged on its own frame:
//   outline   held stroke animator (from == to), no style field
//   mixed     spans with named styles (three fonts, three colours)
//   shadow    light.drop-shadow effect on text
//   glow      light.glow effect on text
//   box       a `box` decoration and a `highlight` decoration behind words
//   words     revealMode "words" and a per-word pop animator
//   sparkle   native star shape
import { comp, shape, text } from "@still-shift/motion";
import { footage, frameFor, reelB } from "../clips.ts";
import { latin } from "../fonts.ts";

const f = latin;
export default comp(
  {
    ...frameFor(reelB),
    fontCoverage: "strict",
    assets: [f.anton, f.pinyon, f.playfairItalic, f.archivo],
  },
  (c) => {
    c.textStyle("heavy", { fontAsset: "anton", size: 150, leading: 0.95 });
    c.textStyle("script", { fontAsset: "pinyon", size: 130 });
    c.textStyle("ital", {
      fontAsset: "playfair-italic",
      size: 90,
      axes: { wght: 700 },
    });
    c.textStyle("label", {
      fontAsset: "archivo",
      size: 30,
      tracking: 120,
      axes: { wght: 700, wdth: 125 },
    });

    // mixed + outline: "WEAR it TWICE" with three styles via spans.
    c.add(
      text("WEAR it TWICE", {
        id: "mixed",
        style: "heavy",
        fontSize: 150,
        color: "#F2C230",
      })
        .at(360, 420)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "heading",
          spans: [
            { id: "it", start: 5, end: 7, style: "script", color: "#FF8FB8" },
            { id: "twice", start: 8, end: 13, color: "#FFFFFF" },
          ],
        }),
    );
    c.textAnimator({
      node: "mixed",
      unit: "line",
      start: 0,
      end: 1,
      stagger: 0,
      selector: { start: 0, end: 1 },
      from: { stroke: "#1A1208", strokeWidth: 10 },
      to: { stroke: "#1A1208", strokeWidth: 10 },
    });

    // shadow: drop shadow on an italic serif line.
    c.add(
      text("autumn edit", {
        id: "shadow",
        style: "ital",
        fontSize: 90,
        color: "#FFF4E0",
      })
        .at(360, 560)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "heading",
          effects: [
            {
              id: "ds",
              effect: "light.drop-shadow",
              params: {
                offset: [4, 6],
                blur: 6,
                opacity: 0.85,
                color: "#2A1606",
              },
            },
          ],
        }),
    );

    // glow: white glow behind a coloured word.
    c.add(
      text("cozy", {
        id: "glow",
        style: "script",
        fontSize: 130,
        color: "#B3122E",
      })
        .at(360, 720)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "heading",
          effects: [
            {
              id: "gl",
              effect: "light.glow",
              params: { radius: 18, intensity: 1, threshold: 0 },
            },
          ],
        }),
    );

    // box: a box decoration and a highlight on a small sub-label.
    c.add(
      text("DAY 03 · TEAL KNIT", {
        id: "box",
        style: "label",
        fontSize: 30,
        color: "#FFFFFF",
      })
        .at(360, 860)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "label",
          decorations: [
            { kind: "highlight", color: "#14110F", thickness: 52, offset: -10 },
          ],
        }),
    );

    // words: word-by-word pop on a second heavy line.
    c.add(
      text("FIVE FITS ONE WEEK", {
        id: "words",
        style: "label",
        fontSize: 30,
        color: "#F2C230",
      })
        .at(360, 960)
        .with({ align: "center", anchor: "baseline", textRole: "label" }),
    );
    c.textAnimator({
      node: "words",
      unit: "word",
      start: 6,
      end: 30,
      stagger: 5,
      selector: { start: 0, end: 1 },
      anchor: "word",
      from: { opacity: 0, scale: 1.8 },
    });

    // sparkle: native four-point star.
    c.add(
      shape
        .native("sparkle", {
          contents: [
            {
              id: "star",
              type: "polystar",
              kind: "star",
              points: 4,
              outerRadius: 34,
              innerRadius: 8,
            },
            { id: "fill", type: "fill", color: "#FFF6C8" },
          ],
        })
        .at(600, 300),
    );
    c.add(footage(reelB));
  },
);
