// O1 — attach follows the line box widened by animation excursions.
//
// The kicker and folio are attached to the headline with authored offsets of
// 18 px (kicker baseline above the headline's top-left) and 30 px (folio cap
// below the headline's bottom-left), as in proof T1 pass 1. Entrance, hold and
// exit text animators are present. o1-attach-static.ts is the same layout with
// every animator removed. Plain background: the measurement is ink rows, and
// video is not involved in this finding.
import { comp, text } from "@still-shift/motion";
import { beats, copy, fonts, frame, paper } from "./shared.ts";

const visible = { inPoint: beats.enter, outPoint: beats.gone };

const built = comp(
  {
    ...frame,
    background: paper,
    assets: [fonts.serif, fonts.mono, fonts.sans],
  },
  (c) => {
    c.textStyle("headline", {
      fontAsset: "serif",
      size: 250,
      tracking: -35,
      features: { kern: 1, liga: 1 },
    });
    c.textStyle("kicker", { fontAsset: "mono", size: 30, tracking: 320 });
    c.textStyle("folio", { fontAsset: "sans", size: 32, tracking: 40 });
    c.add(
      text(copy.kicker, {
        id: "kicker",
        style: "kicker",
        fontSize: 30,
        color: "#2F3520",
      }).with({ ...visible, anchor: "baseline", textRole: "label" }),
    );
    c.add(
      text(copy.headline, {
        id: "headline",
        style: "headline",
        fontSize: 250,
        color: "#4A5A23",
      })
        .at(56, 1010)
        .with({ ...visible, anchor: "baseline", textRole: "heading" }),
    );
    c.add(
      text(copy.issue, {
        id: "folio",
        style: "folio",
        fontSize: 32,
        color: "#2F3520",
      }).with({ ...visible, anchor: "cap", textRole: "label" }),
    );
    // Entrance (proof T1 pass 1, retimed to the 96-frame fixture).
    c.textAnimator({
      node: "headline",
      unit: "glyph",
      start: beats.enter,
      end: beats.enter + 18,
      stagger: 2,
      selector: { start: 0, end: 1 },
      from: { opacity: 0, offset: [0, 210] },
      anchor: "glyph",
      mask: "line",
      feather: 0.2,
      layer: "action",
    });
    c.textAnimator({
      node: "kicker",
      unit: "glyph",
      start: beats.enter + 6,
      end: beats.enter + 20,
      stagger: 0,
      selector: { start: 0, end: 1 },
      from: { opacity: 0, tracking: 900 },
      layer: "action",
    });
    c.textAnimator({
      node: "folio",
      unit: "word",
      start: beats.enter + 12,
      end: beats.held,
      stagger: 2,
      selector: { start: 0, end: 1 },
      from: { opacity: 0, offset: [0, 24] },
      layer: "action",
    });
    // Hold: tracking opens slowly.
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
    // Exit: reverse-order lift and blur; labels fade.
    c.textAnimator({
      node: "headline",
      unit: "glyph",
      start: beats.exit,
      end: beats.gone,
      stagger: 2,
      selector: { start: 0, end: 1, order: "reverse" },
      from: { opacity: 1, offset: [0, 0], blur: 0 },
      to: { opacity: 0, offset: [0, -90], blur: 14 },
      anchor: "glyph",
      layer: "response",
    });
    for (const node of ["kicker", "folio"])
      c.textAnimator({
        node,
        unit: "line",
        start: beats.exit - 4,
        end: beats.exit + 8,
        stagger: 0,
        selector: { start: 0, end: 1 },
        from: { opacity: 1 },
        to: { opacity: 0 },
        layer: "response",
      });
  },
);

export default {
  ...built,
  constraints: [
    {
      type: "attach" as const,
      target: "kicker",
      anchor: "headline",
      point: [0, 0] as [number, number],
      offset: [8, -18] as [number, number],
    },
    {
      type: "attach" as const,
      target: "folio",
      anchor: "headline",
      point: [0, 1] as [number, number],
      offset: [8, 30] as [number, number],
    },
  ],
};
