// O6 — dark text crossed by a dark moving band. A credit and a serif line sit
// in the clip's bright field (RGB 232); the clip's dark band (RGB 24) passes
// under them during the hold. Composition lint has no text-contrast rule, so
// nothing reports the frames where the text is unreadable.
import { comp, text } from "@still-shift/motion";
import { beats, clip, clipAsset, copy, fonts, frame } from "./shared.ts";

const ink = "#1E2716";

export default comp(
  { ...frame, assets: [fonts.serif, fonts.mono, clipAsset] },
  (c) => {
    c.textStyle("credit", { fontAsset: "mono", size: 40, tracking: 200 });
    c.textStyle("line", { fontAsset: "serif", size: 62, tracking: 10 });
    const visible = { inPoint: beats.enter, outPoint: beats.gone };
    c.add(
      text(copy.minimalCredit, {
        id: "credit",
        style: "credit",
        fontSize: 40,
        color: ink,
      })
        .at(80, 330)
        .with({ ...visible, anchor: "baseline", textRole: "label" }),
    );
    c.add(
      text(copy.minimal, {
        id: "line",
        style: "line",
        fontSize: 62,
        color: ink,
      })
        .at(80, 420)
        .with({ ...visible, anchor: "baseline", textRole: "heading" }),
    );
    c.add(clip());
    for (const node of ["credit", "line"])
      c.textAnimator({
        node,
        unit: "line",
        start: beats.enter,
        end: beats.enter + 10,
        stagger: 0,
        selector: { start: 0, end: 1 },
        from: { opacity: 0 },
        layer: "action",
      });
  },
);
