import type { Composition } from "@still-shift/scene-contract";

/** Analytic fixture clocks and opaque Canvas painting, independent of the evaluator. */
export function timeControlReference(doc: Composition, frame: number) {
  const adaptive = doc.id === "ce7-adaptive",
    count = adaptive ? (frame === 0 ? 16 : frame === 47 ? 1 : 3) : 8,
    sample = document.createElement("canvas");
  sample.width = doc.width;
  sample.height = doc.height;
  const ctx = sample.getContext("2d", { alpha: false })!,
    total = new Float32Array(doc.width * doc.height * 4);
  const marker = (x: number, y: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#dd8e67";
    ctx.fillRect(0, 0, 18, 18);
    ctx.restore();
  };
  for (let index = 0; index < count; index++) {
    const time = Math.max(
      0,
      Math.min(
        47,
        frame +
          ((index + 0.5) / count - 0.5) * (adaptive ? 0.5 : 1) +
          (adaptive ? 0.25 : 0),
      ),
    );
    ctx.fillStyle = "#17232e";
    ctx.fillRect(0, 0, doc.width, doc.height);
    if (adaptive) {
      marker(10 + 3 * time, 25);
      marker(10, 80);
      marker(10 + 2 * frame, 130);
    } else {
      marker(10 + 4 * time, 12);
      marker(10 + 12 * Math.floor(time / 3), 45);
      marker(60, 78);
      // Hard cycle boundaries stay in the base frame's cycle. Finite loops hold
      // the last source frame after two 12-frame periods.
      const start = 12 * Math.floor(frame / 12),
        raw = Math.max(start, Math.min(start + 12 - 1e-7, time)),
        cycle = frame >= 24 ? 11 : Math.min(11, raw - start),
        phase = time % 22,
        pingpong = phase <= 11 ? phase : 22 - phase;
      marker(25 + 5 * cycle, 112);
      marker(175 + 5 * pingpong, 112);
    }
    const pixels = ctx.getImageData(0, 0, doc.width, doc.height).data;
    for (let i = 0; i < pixels.length; i++) total[i] = total[i]! + pixels[i]!;
  }
  const pixels = new Uint8ClampedArray(total.length);
  for (let i = 0; i < total.length; i++)
    pixels[i] = Math.round(total[i]! / count);
  return { pixels, samples: count };
}
