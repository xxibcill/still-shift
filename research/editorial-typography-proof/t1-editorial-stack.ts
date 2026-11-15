// Treatment 1 — editorial stack: oversized serif word, tracked mono kicker and
// sans folio, dark olive ink on the bright plaster wall left of the figure.
// Pass 2. Pass 1 attached the kicker and folio to the headline's measured
// bounds; those bounds are the font line box widened by animation excursions,
// so the labels landed 153/213 px away instead of 18/30 px (see
// pass1/t1-editorial-stack.composition.json and the proof results). Pass 2
// places them by hand from the measured static ink (cap top 827, baseline
// 1013), loosens tracking so "v" and "e" no longer touch, and enlarges labels
// for phone viewing.
import { comp, text } from "@still-shift/motion";
import { copy } from "./copy.ts";
import { beats, clip, fonts, frame } from "./shared.ts";

const ink = "#2F3520";
const olive = "#4A5A23";

export default comp(
  {
    ...frame,
    assets: [fonts.serif, fonts.mono, fonts.sans],
  },
  (c) => {
    c.textStyle("headline", {
      fontAsset: "serif",
      size: 250,
      tracking: -18,
      features: { kern: 1, liga: 1 },
    });
    c.textStyle("kicker", { fontAsset: "mono", size: 38, tracking: 300 });
    c.textStyle("folio", { fontAsset: "sans", size: 40, tracking: 30 });

    const visible = { inPoint: beats.enter, outPoint: beats.gone };
    c.add(
      text(copy.kicker, {
        id: "kicker",
        style: "kicker",
        fontSize: 38,
        color: ink,
      })
        .at(64, 800)
        .with({ ...visible, anchor: "baseline", textRole: "label" }),
    );
    c.add(
      text(copy.headline, {
        id: "headline",
        style: "headline",
        fontSize: 250,
        color: olive,
      })
        .at(56, 1010)
        .with({ ...visible, anchor: "baseline", textRole: "heading" }),
    );
    c.add(
      text(copy.issue, {
        id: "folio",
        style: "folio",
        fontSize: 40,
        color: ink,
      })
        .at(64, 1050)
        .with({ ...visible, anchor: "cap", textRole: "label" }),
    );
    c.add(clip());

    // Kicker baseline 27 px above the measured cap top; folio cap 37 px below
    // the baseline. Hand coordinates: they do not follow different copy.

    // Entrance: glyphs rise through a line mask; kicker closes its tracking.
    c.textAnimator({
      node: "headline",
      unit: "glyph",
      start: beats.enter,
      end: beats.enter + 26,
      stagger: 3,
      selector: { start: 0, end: 1 },
      mask: "line",
      feather: 0.2,
      anchor: "glyph",
      from: { offset: [0, 210], opacity: 0 },
      layer: "action",
    });
    c.textAnimator({
      node: "kicker",
      unit: "glyph",
      start: beats.enter + 8,
      end: beats.enter + 30,
      stagger: 0,
      selector: { start: 0, end: 1 },
      from: { opacity: 0, tracking: 900 },
      layer: "action",
    });
    c.textAnimator({
      node: "folio",
      unit: "word",
      start: beats.enter + 18,
      end: beats.enter + 34,
      stagger: 3,
      selector: { start: 0, end: 1 },
      from: { opacity: 0, offset: [0, 24] },
      layer: "action",
    });
    // Hold: the headline's tracking opens very slowly so the hold is alive.
    c.textAnimator({
      node: "headline",
      unit: "glyph",
      start: beats.held,
      end: beats.exit,
      stagger: 0,
      selector: { start: 0, end: 1 },
      from: { tracking: 0 },
      to: { tracking: 25 },
      layer: "current",
    });
    // Exit: glyphs lift and blur away right-to-left; labels fade first.
    c.textAnimator({
      node: "headline",
      unit: "glyph",
      start: beats.exit,
      end: beats.gone,
      stagger: 3,
      selector: { start: 0, end: 1, order: "reverse" },
      anchor: "glyph",
      from: { opacity: 1, offset: [0, 0], blur: 0 },
      to: { opacity: 0, offset: [0, -90], blur: 14 },
      layer: "response",
    });
    for (const node of ["kicker", "folio"])
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
  },
);
