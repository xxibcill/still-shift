// O3 — a highlight decoration ignores text-animator opacity. The mixed tag
// fades to opacity 0 through a line animator (frames 62–70) while its highlight
// has no reveal keys, so a bare bar stays on screen until the out point (84),
// as in proof T2 pass 1. Plain background so text and bar pixels are separable.
import { comp, text } from "@still-shift/motion";
import { beats, copy, fonts, frame, paper } from "./shared.ts";

export default comp(
  { ...frame, background: paper, assets: [fonts.thai] },
  (c) => {
    c.textStyle("tag", {
      fontAsset: "thai",
      size: 56,
      tracking: 80,
      axes: { wght: 600, wdth: 100 },
    });
    c.add(
      text(copy.mixedLabel, {
        id: "tag",
        style: "tag",
        fontSize: 56,
        color: "#1D2410",
      })
        .at(72, 960)
        .with({
          inPoint: beats.enter,
          outPoint: beats.gone,
          anchor: "baseline",
          locale: "th",
          textRole: "label",
          decorations: [
            {
              kind: "highlight",
              color: "#C9D29A",
              thickness: 84,
              offset: -18,
            },
          ],
        }),
    );
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
      node: "tag",
      unit: "line",
      start: beats.exit - 4,
      end: beats.exit + 4,
      stagger: 0,
      selector: { start: 0, end: 1 },
      from: { opacity: 1 },
      to: { opacity: 0 },
      layer: "response",
    });
  },
);
