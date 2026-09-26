import { designs } from "./scenes.ts";
import { palette } from "./art.ts";
import { cue, ground, household, path, type MotionDesign } from "./design.ts";

/** P2 is intentionally one study; the legacy catalog remains the default until owner review. */
export function unequalMarginsV2(): MotionDesign {
  const design = structuredClone(
    designs.find((d) => d.id === "unequal-margins")!,
  );
  if (design.recipe.preset !== "unequal_margins")
    throw new Error("Wrong comparison recipe");
  design.motionGrammar = "v2";
  design.nodes = design.nodes.flatMap((node) => {
    if (node.id === "ground") return [ground(720, true)];
    if (node.id === "house-a" || node.id === "house-b")
      return household(node.id, node.x!, node.y!, node.width!, {
        shadow: true,
      });
    if (node.id === "question") return [{ ...node, revealMode: "words" }];
    return [node];
  });
  const houseIndex = design.nodes.findIndex((n) => n.id === "house-a");
  design.nodes.splice(
    houseIndex,
    0,
    ...[220, 1110].map((x, i) =>
      path(
        `margin-${i ? "b" : "a"}`,
        [
          [0, 0],
          [570, 0],
        ],
        {
          x,
          y: 830,
          width: 570,
          height: 1,
          origin: [0.5, 0.5],
          lineWidth: 34,
          lineStyle: "brush",
          stroke: palette.field,
          opacity: 0.55,
        },
      ),
    ),
  );
  design.nodes.push(
    path(
      "strain-path",
      [
        [-100, 360],
        [2020, 360],
      ],
      { opacity: 0, stroke: palette.crisis, lineWidth: 1 },
    ),
  );
  design.camera = {
    keys: [
      { frame: 0, x: 960, y: 540, zoom: 1 },
      { frame: 110, x: 976, y: 542, zoom: 1.02 },
      { frame: 191, x: 998, y: 546, zoom: 1.04 },
    ],
    depth: { paper: 0, reference: 0, question: 0, qualifier: 0, ground: 0.7 },
    cover: ["paper"],
  };
  design.recipe.entrances = [
    { node: "reference", verb: "wipe", window: cue(0, 18, "the-same-season") },
    { node: "question", verb: "wipe", window: cue(8, 30, "different-room") },
    { node: "house-a", verb: "set-down", window: cue(4, 42, "household-a") },
    { node: "house-b", verb: "set-down", window: cue(28, 76, "household-b") },
    ...["margin-a", "margin-b"].map((node) => ({
      node,
      verb: "draw" as const,
      window: cue(22, 46, "same-visible-margin"),
    })),
    ...["pressure-a", "pressure-b"].map((node) => ({
      node,
      verb: "draw" as const,
      window: cue(30, 52, "shared-pressure"),
    })),
    {
      node: "qualifier",
      verb: "wipe",
      window: cue(140, 164, "qualitative-comparison"),
    },
  ];
  design.recipe.moves = [
    {
      node: "margin-a",
      window: cue(48, 92, "more-room-retained", "in-out-quint"),
      to: { scaleX: 0.82 },
    },
    {
      node: "margin-b",
      window: cue(48, 104, "less-room-remains", "in-out-quint"),
      to: { scaleX: 0.36 },
    },
    {
      node: "house-b",
      role: "response",
      keys: [
        { frame: 77, scaleY: 1, rotation: 0 },
        { frame: 85, scaleY: 0.92, rotation: -2.5, easing: "in-quad" },
        { frame: 116, scaleY: 0.985, rotation: -0.8, easing: "out-back-soft" },
      ],
    },
    {
      node: "pressure-b",
      role: "current",
      keys: [
        { frame: 150, x: 1630 },
        { frame: 162, x: 1628, easing: "in-out-sine" },
        { frame: 174, x: 1630, easing: "in-out-sine" },
        { frame: 186, x: 1628, easing: "in-out-sine" },
        { frame: 191, x: 1628.5, easing: "linear" },
      ],
    },
  ];
  design.recipe.emphasis = [
    {
      node: "house-a-art",
      window: { ...cue(80, 88, "focus-less-room"), role: "response" },
      opacity: 0.7,
    },
  ];
  design.flows = [
    {
      id: "strain",
      path: "strain-path",
      direction: 1,
      count: 6,
      shape: "dash",
      size: 7,
      color: palette.crisis,
      window: { start: 40, end: 192, role: "current" },
      speed: [
        { frame: 40, pxPerFrame: 5 },
        { frame: 110, pxPerFrame: 5 },
        { frame: 124, pxPerFrame: 2, easing: "in-out-sine" },
      ],
    },
  ];
  return design;
}
