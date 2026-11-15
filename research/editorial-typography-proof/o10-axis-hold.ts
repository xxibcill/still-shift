// O10 re-baseline probe (ET0): treatment 2 pass 2 plus the hold-phase axis
// change that pass 1 drafted and dropped (poster wght 0 -> -120 across the
// hold). The proof reported comp-text-font-axis with a -20 worst case although
// the timeline never goes below wght 100. `comp validate` on this file shows
// whether the conservative axis rule still applies.
import t2 from "./t2-thai-condensed-poster.ts";
import { beats } from "./shared.ts";

export default {
  ...t2,
  textAnimators: [
    ...(t2.textAnimators ?? []),
    {
      node: "poster",
      unit: "line" as const,
      start: beats.held,
      end: beats.exit,
      stagger: 0,
      selector: { start: 0, end: 1 },
      from: { axes: { wght: 0 } },
      to: { axes: { wght: -120 } },
      layer: "current" as const,
    },
  ],
};
