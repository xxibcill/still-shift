// Treatment 3 — minimal centred line: small lowercase serif, tracked mono
// credit and a drawn hairline rule, dark ink in the narrow sky band above the
// rooftops. Deliberately placed where the background changes under parallax,
// to test what the checks report about contrast over moving video.
//
// Pass 2. Pass 1 placed both centred lines at x = 70 expecting them to centre
// in the 940 px textLayout box; centred text instead centres on the layer
// origin, so half the title rendered off-frame while validation and render
// passed (pass1/t3-minimal-centered.composition.json). Pass 2 puts the origin
// on the frame centre and enlarges the credit for phone viewing.
import { at, comp, presets, shape, text } from "@still-shift/motion";
import { copy } from "./copy.ts";
import { beats, clip, fonts, frame } from "./shared.ts";

const ink = "#1E2716";
const box = {
  width: 940,
  height: 110,
  lineHeight: 1.2,
  overflow: "error" as const,
};

export default comp({ ...frame, assets: [fonts.serif, fonts.mono] }, (c) => {
  c.textStyle("line", { fontAsset: "serif", size: 62, tracking: 10 });
  c.textStyle("credit", { fontAsset: "mono", size: 32, tracking: 360 });

  const visible = { inPoint: beats.enter, outPoint: beats.gone };
  c.add(
    text(copy.minimalCredit, {
      id: "credit",
      style: "credit",
      fontSize: 32,
      color: ink,
    })
      .at(540, 180)
      .with({
        ...visible,
        align: "center",
        textLayout: box,
        anchor: "baseline",
        textRole: "label",
      }),
  );
  c.add(
    text(copy.minimal, { id: "line", style: "line", fontSize: 62, color: ink })
      .at(540, 258)
      .with({
        ...visible,
        align: "center",
        textLayout: box,
        anchor: "baseline",
        textRole: "heading",
      }),
  );
  const rule = c.add(
    shape
      .native("rule", {
        contents: [
          {
            id: "hairline",
            type: "path",
            path: {
              closed: false,
              vertices: [
                [-120, 0],
                [120, 0],
              ],
              inTangents: [
                [0, 0],
                [0, 0],
              ],
              outTangents: [
                [0, 0],
                [0, 0],
              ],
            },
          },
          { id: "stroke", type: "stroke", width: 2, color: ink },
        ],
      })
      .at(540, 296)
      .with({ ...visible }),
  );
  c.add(clip());
  c.timeline(at(beats.enter + 14, presets.drawOn(rule, 22)));

  // Entrance: words resolve from blur in a seeded order; credit opens up.
  c.textAnimator({
    node: "line",
    unit: "word",
    start: beats.enter,
    end: beats.enter + 30,
    stagger: 4,
    selector: { start: 0, end: 1, order: "seeded", seed: 7 },
    from: { opacity: 0, blur: 12, offset: [0, 10] },
    layer: "action",
  });
  c.textAnimator({
    node: "credit",
    unit: "glyph",
    start: beats.enter + 10,
    end: beats.enter + 34,
    stagger: 0,
    selector: { start: 0, end: 1 },
    from: { opacity: 0, tracking: -300 },
    layer: "action",
  });
  // Hold: the line's tracking widens imperceptibly.
  c.textAnimator({
    node: "line",
    unit: "glyph",
    start: beats.held,
    end: beats.exit,
    stagger: 0,
    selector: { start: 0, end: 1 },
    from: { tracking: 0 },
    to: { tracking: 30 },
    layer: "current",
  });
  // Exit: everything opens up and dissolves; the rule fades with it.
  c.textAnimator({
    node: "line",
    unit: "glyph",
    start: beats.exit,
    end: beats.gone,
    stagger: 0,
    selector: { start: 0, end: 1 },
    from: { opacity: 1, tracking: 0, blur: 0 },
    to: { opacity: 0, tracking: 160, blur: 8 },
    layer: "response",
  });
  c.textAnimator({
    node: "credit",
    unit: "line",
    start: beats.exit - 6,
    end: beats.exit + 12,
    stagger: 0,
    selector: { start: 0, end: 1 },
    from: { opacity: 1 },
    to: { opacity: 0 },
    layer: "response",
  });
  c.timeline(
    rule.alpha.keys([
      { frame: beats.exit, value: 1 },
      { frame: beats.gone - 6, value: 0 },
    ]),
  );
  c.marker("read", beats.held, {
    duration: beats.exit - beats.held,
    label: "Title held",
  });
});
