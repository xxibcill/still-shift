import { comp, shape, seq, stagger, ease } from "@still-shift/motion";
export default comp({ width: 640, height: 360, fps: 24, seconds: 4 }, (c) => {
  const bars = [0, 1, 2].map((i) =>
    c.add(
      shape
        .rect(`bar${i}`, { size: [48, 160], color: "#D96A3B" })
        .at(160 + i * 90, 280)
        .anchor("bottom"),
    ),
  );
  c.timeline(
    seq(
      stagger(
        bars.map((bar) =>
          bar.scaleY.from(0).to(1, { seconds: 0.75 }, ease.outBack),
        ),
        4,
      ),
      stagger(
        bars.map((bar) => bar.y.by(-24, 18, ease.outCubic)),
        3,
      ),
    ),
  );
});
