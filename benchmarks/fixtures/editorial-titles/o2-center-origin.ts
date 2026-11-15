// O2 — `align: "center"` centres each line on the layer origin, not inside
// `textLayout.width`. As in proof T3 pass 1, the origin is x = 70 with a 940 px
// text box, expecting the line to centre in the box; about half of the line
// renders off the left edge while validation and render report success.
// o2-center-control.ts sets the same line left-aligned at the same origin, so
// its ink width is the full width the off-frame fraction is measured against.
import { comp, text } from "@still-shift/motion";
import { beats, copy, fonts, frame, paper } from "./shared.ts";

export const align: "center" | "left" = "center";

export function centredLine(alignment: "center" | "left") {
  return comp({ ...frame, background: paper, assets: [fonts.serif] }, (c) => {
    c.textStyle("line", { fontAsset: "serif", size: 62, tracking: 10 });
    c.add(
      text(copy.minimal, {
        id: "line",
        style: "line",
        fontSize: 62,
        color: "#1E2716",
      })
        .at(70, 258)
        .with({
          inPoint: beats.enter,
          outPoint: beats.gone,
          align: alignment,
          textLayout: {
            width: 940,
            height: 110,
            lineHeight: 1.2,
            overflow: "error",
          },
          anchor: "baseline",
          textRole: "heading",
        }),
    );
  });
}

export default centredLine(align);
