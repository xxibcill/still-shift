import { palette } from "./art.ts";
import {
  art,
  cue,
  group,
  household,
  path,
  rect,
  text,
  typeScale,
  type MotionDesign,
} from "./design.ts";

/**
 * Direction "buffer press": one strain band presses two identical households
 * down in lockstep. Household A stands on a deep margin that compresses and
 * holds; household B's thin margin runs out, so the house itself takes the
 * remaining strain. The motion is the comparison; labels only name it.
 */
const houseWidth = 420;
const houseHeight = (houseWidth * 440) / 600;
const baseline = 700;
const floor = 870;
const houseY = baseline - houseHeight;
const columnWidth = 360;
const houses = { a: 170, b: 1330 };
// The house footprint spans svg x 42–373 of the scaled artwork.
const columnX = (x: number) => x + 208 - columnWidth / 2;
const deepMargin = floor - baseline;
const thinMargin = 28;
// The band rests on the roof ridge (svg y 49 scaled) before the press.
const bandWidth = 40;
const bandY = houseY + (49 * houseWidth) / 600 - bandWidth / 2;
const pressureBands = [
  { node: "pressure-a", x: 110, condition: "room" },
  { node: "pressure-b", x: 940, condition: "strained" },
] as const;
// A keeps about half its margin; B's runs out and its house takes the rest.
const press = { start: 50, end: 104, depth: 77 };
const pressureTarget = ({
  node,
  x,
  condition,
}: (typeof pressureBands)[number]) => ({
  node,
  to: [x, bandY + press.depth] as [number, number],
  condition,
});
const tilt = -4.5;
// Full-bleed with overscan so the camera never exposes the ground's edges.
const ground = { x: -200, width: 2320 };
// After the peak the strain persists: each pulse is absorbed by A's margin and
// taken by B's house. The qualifier lands between them.
const pulses = [
  { at: 128, depth: 10 },
  { at: 176, depth: 10 },
];
const pulseHalf = 12;

const inOutQuint = (t: number) =>
  t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;
const inOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
/** Shared downward travel of the band, and of anything it presses. */
function travel(frame: number) {
  const u = Math.min(
    1,
    Math.max(0, (frame - press.start) / (press.end - press.start)),
  );
  let depth = press.depth * inOutQuint(u);
  for (const pulse of pulses) {
    const v = (frame - pulse.at + pulseHalf) / (2 * pulseHalf);
    if (v > 0 && v < 1)
      depth += pulse.depth * inOutSine(v < 0.5 ? v * 2 : 2 - v * 2);
  }
  return depth;
}
const round = (v: number) => Math.round(v * 1000) / 1000;
/** Sample a pose function every two frames so lockstep motion stays exact. */
function sampled(
  node: string,
  from: number,
  to: number,
  pose: (depth: number) => Record<string, number>,
  role: "response" | "current" | "action" = "response",
) {
  const keys = [];
  for (let frame = from; frame <= to; frame += 2) {
    const values = Object.fromEntries(
      Object.entries(pose(travel(frame))).map(([k, v]) => [k, round(v)]),
    );
    keys.push({ frame, ...values, easing: "linear" as const });
  }
  return { node, role, keys };
}

const strata = (
  id: string,
  x: number,
  y: number,
  height: number,
  layers: number,
  color: string,
  opacity: number,
) => [
  group(id, x, y, columnWidth, height, { origin: [0.5, 1] }),
  ...Array.from({ length: layers }, (_, i) =>
    path(
      `${id}-layer-${i}`,
      [
        [0, 0],
        [columnWidth, 0],
      ],
      {
        parent: id,
        x: 0,
        y: ((i + 0.5) * height) / layers,
        lineWidth: Math.min(46, (height / layers) * 1.12),
        lineStyle: "brush",
        stroke: color,
        opacity,
      },
    ),
  ),
];

export function unequalMarginsV3(): MotionDesign {
  const lastFrame = 191;
  const beats = [
    [press.start, press.end],
    ...pulses.map(({ at }) => [at - pulseHalf, at + pulseHalf]),
  ] as const;
  const bOut = (depth: number) => Math.max(0, depth - thinMargin);
  // B's thin margin runs out partway through the press: its own beat.
  let bottomOut = press.start;
  while (travel(bottomOut) < thinMargin) bottomOut += 2;
  // The ground surface opens only where a margin is cut into it.
  const [a0, b0] = [columnX(houses.a), columnX(houses.b)];
  const surface = [
    [ground.x, a0],
    [a0 + columnWidth, b0],
    [b0 + columnWidth, ground.x + ground.width],
  ] as const;
  return {
    id: "unequal-margins",
    title: "Unequal Margins",
    description:
      "One season presses two households equally. One margin absorbs it; the other runs out.",
    essentialText: ["room", "strained", "qualifier"],
    motionGrammar: "v2",
    nodes: [
      art("paper", "paper-cover", 0, 0, 1920, 1080),
      // One shared ground: the only difference is the margin cut into it.
      rect(
        "common-ground",
        ground.x,
        baseline,
        ground.width,
        deepMargin,
        palette.field,
        { opacity: 0.13 },
      ),
      ...surface.map(([from, to], i) =>
        path(
          `surface-${i}`,
          [
            [0, 0],
            [to - from, 0],
          ],
          { x: from, y: baseline, stroke: palette.field, lineWidth: 4 },
        ),
      ),
      ...strata(
        "margin-a",
        columnX(houses.a),
        baseline,
        deepMargin,
        4,
        palette.field,
        0.55,
      ),
      ...strata(
        "margin-b",
        columnX(houses.b),
        baseline,
        thinMargin,
        1,
        palette.field,
        0.55,
      ),
      ...household("house-a", houses.a, houseY, houseWidth, { shadow: true }),
      ...household("house-b", houses.b, houseY, houseWidth, { shadow: true }),
      ...pressureBands.map(({ node, x }) =>
        path(
          node,
          [
            [0, 0],
            [870, 0],
          ],
          {
            x,
            y: bandY,
            lineWidth: bandWidth,
            lineStyle: "brush",
            stroke: palette.crisis,
          },
        ),
      ),
      text("reference", "The same season.", 112, 96, 112),
      text(
        "question",
        "Different room to absorb strain.",
        116,
        246,
        typeScale.subheading,
        {
          revealMode: "words",
        },
      ),
      text(
        "room",
        "More room",
        columnX(houses.a) + columnWidth + 32,
        760,
        typeScale.label,
      ),
      text(
        "strained",
        "Less room",
        columnX(houses.b) - 32,
        760,
        typeScale.label,
        {
          align: "right",
          color: palette.red,
        },
      ),
      text(
        "qualifier",
        "A qualitative comparison",
        112,
        968,
        typeScale.qualifier,
        {
          revealMode: "words",
        },
      ),
    ],
    recipe: {
      preset: "unequal_margins",
      households: ["house-a", "house-b"],
      reference: "reference",
      pressures: [
        pressureTarget(pressureBands[0]),
        pressureTarget(pressureBands[1]),
      ],
      labels: ["room", "strained"],
      strain: cue(press.start, press.end, "shared-strain", "in-out-quint"),
      labelWindows: [cue(90, 108, "more-room"), cue(98, 116, "less-room")],
      entrances: [
        {
          node: "reference",
          verb: "wipe",
          window: cue(0, 18, "the-same-season"),
        },
        {
          node: "question",
          verb: "wipe",
          window: cue(8, 32, "different-room"),
        },
        ...[0, 1, 2, 3].map((i) => ({
          node: `margin-a-layer-${3 - i}`,
          verb: "draw" as const,
          window: cue(4 + i * 4, 18 + i * 4, "margin-a-builds"),
        })),
        {
          node: "common-ground",
          verb: "wipe",
          window: cue(0, 16, "shared-ground"),
        },
        ...surface.map((_, i) => ({
          node: `surface-${i}`,
          verb: "draw" as const,
          window: cue(i * 3, 14 + i * 3, "shared-ground"),
        })),
        {
          node: "margin-b-layer-0",
          verb: "draw",
          window: cue(16, 30, "margin-b-thin"),
        },
        {
          node: "house-a",
          verb: "set-down",
          window: cue(14, 38, "households"),
        },
        {
          node: "house-b",
          verb: "set-down",
          window: cue(14, 38, "households"),
        },
        {
          node: "pressure-a",
          verb: "draw",
          window: cue(28, 38, "one-season-sweeps", "in-cubic"),
        },
        {
          node: "pressure-b",
          verb: "draw",
          window: cue(38, 48, "one-season-sweeps", "out-cubic"),
        },
        {
          node: "qualifier",
          verb: "wipe",
          window: cue(140, 164, "qualitative-comparison"),
        },
      ],
      moves: [
        sampled("margin-b", press.start, bottomOut, (d) => ({
          scaleY: Math.max(
            0.08,
            (thinMargin - Math.min(d, thinMargin)) / thinMargin,
          ),
        })),
        // Each beat is its own event: the press, then every pulse.
        ...beats.flatMap(([from, to]) => [
          sampled("house-a", from, to, (d) => ({ y: houseY + d })),
          sampled("margin-a", from, to, (d) => ({
            scaleY: (deepMargin - d) / deepMargin,
          })),
          sampled("house-b", from, to, (d) => ({
            y: houseY + Math.min(d, thinMargin),
            scaleY: (houseHeight - bOut(d)) / houseHeight,
            rotation: tilt * Math.min(1, bOut(d) / (press.depth - thinMargin)),
          })),
        ]),
        ...beats
          .slice(1)
          .flatMap(([from, to]) =>
            pressureBands.map(({ node, x }) =>
              sampled(node, from, to, (d) => ({ y: bandY + d, x }), "current"),
            ),
          ),
      ],
      emphasis: [],
    },
    camera: {
      keys: [
        { frame: 0, x: 960, y: 540, zoom: 1 },
        // Lean in and down with the weight, keeping both households framed.
        { frame: press.start, x: 964, y: 546, zoom: 1.01 },
        { frame: press.end, x: 976, y: 564, zoom: 1.032 },
        { frame: lastFrame, x: 986, y: 570, zoom: 1.045 },
      ],
      depth: { paper: 0, reference: 0, question: 0, qualifier: 0 },
      cover: ["paper"],
    },
  };
}
