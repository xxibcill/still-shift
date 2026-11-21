/**
 * CG6 audit: chroma-node `evaluateQualifierMask` (read-only checkout at
 * CHROMA_NODE, default ~/Documents/guthib/chroma-node) against analytic masks
 * on the CG0 hue and saturation sweep design values (exact floats).
 *
 *   node --import tsx research/color-grading-cg6/chroma-node-audit.ts
 */
import { homedir } from "node:os";
import { join } from "node:path";
import {
  hslQualifier,
  NEUTRAL_KEY_QUALIFIER,
} from "../../packages/color-science/src/index.ts";

const root =
  process.env.CHROMA_NODE ?? join(homedir(), "Documents/guthib/chroma-node");
const cn = (await import(join(root, "src/shared/colorEngine.ts"))) as {
  evaluateQualifierMask(
    p: { r: number; g: number; b: number; a: number },
    q: object,
  ): number;
};
function hsv(h: number, s: number, v: number): [number, number, number] {
  const c = v * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [r + m, g + m, b + m];
}
const cases = [
  { name: "red 30±20 soft 20", hueCenter: 30, hueWidth: 40, hueSoftness: 20 },
  {
    name: "wrap 350±15 soft 15",
    hueCenter: 350,
    hueWidth: 30,
    hueSoftness: 15,
  },
  { name: "red 0±20 hard", hueCenter: 0, hueWidth: 40, hueSoftness: 0 },
  {
    name: "sat 0.3–0.6 soft 0.1",
    saturationMin: 0.3,
    saturationMax: 0.6,
    saturationSoftness: 0.1,
  },
  {
    name: "luma 0.5–0.8 soft 0.05",
    luminanceMin: 0.5,
    luminanceMax: 0.8,
    luminanceSoftness: 0.05,
  },
];
const samples: { h: number; s: number; v: number }[] = [];
for (let x = 0; x < 360; x++)
  samples.push({ h: x, s: 1, v: 1 }, { h: x, s: 0.5, v: 0.8 });
for (const h of [0, 60, 120, 180, 240, 300])
  for (let x = 0; x < 256; x++) samples.push({ h, s: x / 255, v: 0.8 });
const report = cases.map(({ name, ...over }) => {
  const q = { ...NEUTRAL_KEY_QUALIFIER, ...over };
  let max = 0,
    chromatic = 0,
    worst = null as null | object,
    neutral = 0;
  for (const { h, s, v } of samples) {
    const [r, g, b] = hsv(h, s, v);
    const port = hslQualifier([r, g, b], q);
    const theirs = cn.evaluateQualifierMask(
      { r, g, b, a: 1 },
      { enabled: true, invert: false, ...q },
    );
    const d = Math.abs(port - theirs);
    if (s === 0 && d > 0) neutral++;
    if (s > 0) chromatic = Math.max(chromatic, d);
    if (d > max) {
      max = d;
      worst = { h, s, v, port, chromaNode: theirs };
    }
  }
  return {
    case: name,
    samples: samples.length,
    maxDifferenceFromAnalytic: max,
    maxDifferenceOnChromaticPixels: chromatic,
    neutralPixelsDiffering: neutral,
    worst,
  };
});
console.log(JSON.stringify({ chromaNode: root, report }, null, 2));
