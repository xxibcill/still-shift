// Treatment 2 — condensed Thai poster: Noto Sans Thai at its narrowest/black
// instance, white over a gradient scrim on the paving, with a mixed
// Thai/English tag. Positions are authored coordinates (no attach), and the
// Thai headline deliberately animates per glyph to probe mark handling.
import { comp, shape, text } from "@still-shift/motion";
import { copy } from "./copy.ts";
import { beats, clip, fonts, frame } from "./shared.ts";

export default comp({ ...frame, assets: [fonts.thai] }, (c) => {
  c.textStyle("poster", {
    fontAsset: "thai",
    size: 230,
    leading: 1.1,
    axes: { wght: 900, wdth: 62.5 },
  });
  c.textStyle("sub", {
    fontAsset: "thai",
    size: 64,
    axes: { wght: 400, wdth: 100 },
  });
  c.textStyle("tag", {
    fontAsset: "thai",
    size: 36,
    tracking: 80,
    axes: { wght: 600, wdth: 100 },
  });

  const visible = { inPoint: beats.enter, outPoint: beats.gone };
  c.add(
    text(copy.mixedLabel, {
      id: "tag",
      style: "tag",
      fontSize: 36,
      color: "#1D2410",
    })
      .at(72, 1190)
      .with({
        ...visible,
        anchor: "baseline",
        locale: "th",
        textRole: "label",
        decorations: [
          {
            kind: "highlight",
            color: "#C9D29A",
            thickness: 58,
            offset: -12,
            // Pass 2: the highlight ignores text-animator opacity, so pass 1 left a
            // bare bar on screen after the tag faded. Retract it explicitly.
            reveal: [
              { frame: beats.enter, value: 0 },
              { frame: beats.enter + 14, value: 1 },
              { frame: beats.exit - 6, value: 1 },
              { frame: beats.exit + 8, value: 0 },
            ],
          },
        ],
      }),
  );
  c.add(
    text(copy.thaiHeadline, {
      id: "poster",
      style: "poster",
      fontSize: 230,
      color: "#FFFFFF",
    })
      .at(60, 1420)
      .with({
        ...visible,
        anchor: "baseline",
        locale: "th",
        textRole: "heading",
      }),
  );
  c.add(
    text(copy.thaiSub, {
      id: "sub",
      style: "sub",
      fontSize: 64,
      color: "#F2EEDC",
    })
      .at(68, 1530)
      .with({
        ...visible,
        anchor: "baseline",
        locale: "th",
        textRole: "qualification",
      }),
  );
  const scrim = c.add(
    shape
      .native("scrim", {
        contents: [
          { id: "box", type: "rect", size: [1080, 900] },
          {
            id: "shade",
            type: "gradient-fill",
            gradient: "linear",
            start: [0, -450],
            end: [0, 250],
            stops: [
              { id: "clear", offset: 0, color: "#10140A00" },
              { id: "dark", offset: 1, color: "#10140AC0" },
            ],
          },
        ],
      })
      .at(540, 1470),
  );
  c.add(clip());
  c.timeline(
    scrim.alpha.keys([
      { frame: 0, value: 0 },
      { frame: beats.enter + 8, value: 1 },
      { frame: beats.exit + 8, value: 1 },
      { frame: beats.gone + 6, value: 0 },
    ]),
  );

  // Entrance: each Thai glyph unit swells from the thin, wide instance to the
  // black condensed instance while rising. Stresses mark/base cohesion.
  c.textAnimator({
    node: "poster",
    unit: "glyph",
    start: beats.enter + 2,
    end: beats.enter + 30,
    stagger: 3,
    selector: { start: 0, end: 1 },
    anchor: "glyph",
    from: { axes: { wght: -800, wdth: 37.5 }, opacity: 0, offset: [0, 70] },
    layer: "action",
  });
  c.textAnimator({
    node: "tag",
    unit: "line",
    start: beats.enter,
    end: beats.enter + 12,
    stagger: 0,
    selector: { start: 0, end: 1 },
    from: { opacity: 0 },
    layer: "action",
  });
  c.textAnimator({
    node: "sub",
    unit: "word",
    start: beats.enter + 20,
    end: beats.enter + 38,
    stagger: 3,
    selector: { start: 0, end: 1 },
    from: { opacity: 0, offset: [0, 24] },
    layer: "action",
  });
  // Hold: the poster rises a few pixels. (A wght -120 hold was rejected: axis
  // validation reported a -20 worst case, see the proof results.)
  c.textAnimator({
    node: "poster",
    unit: "line",
    start: beats.held,
    end: beats.exit,
    stagger: 0,
    selector: { start: 0, end: 1 },
    from: { offset: [0, 0] },
    to: { offset: [0, -14] },
    layer: "current",
  });
  // Exit: glyphs thin out and drop away last-to-first; labels fade first.
  c.textAnimator({
    node: "poster",
    unit: "glyph",
    start: beats.exit,
    end: beats.gone,
    stagger: 3,
    selector: { start: 0, end: 1, order: "reverse" },
    anchor: "glyph",
    from: { opacity: 1, offset: [0, 0] },
    to: { opacity: 0, offset: [0, 60], axes: { wght: -680 } },
    layer: "response",
  });
  for (const node of ["tag", "sub"])
    c.textAnimator({
      node,
      unit: "line",
      start: beats.exit - 6,
      end: beats.exit + 10,
      stagger: 0,
      selector: { start: 0, end: 1 },
      from: { opacity: 1 },
      to: { opacity: 0 },
      layer: "response",
    });
  c.marker("read", beats.held, {
    duration: beats.exit - beats.held,
    label: "Title held",
  });
});
