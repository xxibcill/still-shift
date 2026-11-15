// O4 — `comp lint --pixels true` on a composition with a native video layer.
// One label over the synthetic clip; o4-video-pixel-lint.no-video.ts is the
// same composition with only the video layer and asset removed.
import { comp, text } from "@still-shift/motion";
import { beats, clip, clipAsset, copy, fonts, frame } from "./shared.ts";

export default comp({ ...frame, assets: [fonts.mono, clipAsset] }, (c) => {
  c.textStyle("credit", { fontAsset: "mono", size: 40, tracking: 200 });
  c.add(
    text(copy.minimalCredit, {
      id: "credit",
      style: "credit",
      fontSize: 40,
      color: "#1E2716",
    })
      .at(80, 330)
      .with({
        inPoint: beats.enter,
        outPoint: beats.gone,
        anchor: "baseline",
        textRole: "label",
      }),
  );
  c.add(clip());
});
