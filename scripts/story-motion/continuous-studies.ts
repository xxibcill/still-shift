import { designs } from "./scenes.ts";
import { palette as c } from "./art.ts";
import {
  art,
  cue,
  ground,
  group,
  path,
  strips,
  text,
  type MotionDesign,
} from "./design.ts";

function base(id: string): MotionDesign {
  const found = designs.find((design) => design.id === id);
  if (!found) throw new Error(`Unknown story motion study: ${id}`);
  const design = structuredClone(found);
  design.motionGrammar = "v2";
  design.nodes = design.nodes.map((node) => {
    if (node.id === "paper" && node.type === "image")
      return { ...node, states: [{ asset: "paper-cover" }] };
    if (node.id === "ground") return ground(node.y, true);
    return node;
  });
  return design;
}

const key = (frame: number, x: number, y: number, zoom: number) => ({
  frame,
  x,
  y,
  zoom,
});
const camera = (
  keys: ReturnType<typeof key>[],
  depth: Record<string, number> = {},
  cover: string[] = ["paper"],
): NonNullable<MotionDesign["camera"]> => ({
  keys,
  depth: { paper: 0, ...depth },
  cover,
});
const entrance = (
  node: string,
  verb:
    | "set-down"
    | "attach"
    | "rise"
    | "wipe"
    | "draw"
    | "stamp"
    | "assemble"
    | "fade",
  start: number,
  end: number,
  name: string,
  extras: Record<string, unknown> = {},
) => ({ node, verb, window: cue(start, end, name), ...extras });
const flow = (
  id: string,
  route: string,
  start: number,
  color: string,
  speed = 2,
  direction: 1 | -1 = 1,
) => ({
  id,
  path: route,
  direction,
  count: 2,
  shape: "dot" as const,
  size: 5,
  color,
  window: { start, end: 192, role: "current" as const },
  speed: [{ frame: start, pxPerFrame: speed }],
});

export function continuousAccessConstraint(): MotionDesign {
  const design = base("access-constraint");
  if (design.recipe.preset !== "access_constraint")
    throw new Error("Recipe mismatch");
  design.nodes = design.nodes.flatMap((node) =>
    node.id === "store" && node.type === "image"
      ? [{ ...node, states: [{ asset: "store-body" }] }]
      : node.id === "aperture-label"
        ? [{ ...node, y: 875 }]
        : node.id === "house-a"
          ? [{ ...node, origin: [0.5, 1] }]
          : [node],
  );
  design.nodes.push(
    path(
      "open-underline",
      [
        [1060, 1028],
        [1660, 1028],
      ],
      {
        stroke: c.field,
        lineWidth: 10,
        lineStyle: "brush",
      },
    ),
  );
  design.camera = camera(
    [
      key(0, 950, 540, 1),
      key(64, 966, 540, 1.004),
      key(124, 985, 536, 1.012),
      key(191, 1005, 540, 1.016),
    ],
    {
      title: 0,
      consequence: 0,
      "aperture-label": 0,
      "source-label": 0,
      "open-label": 0,
      ground: 0,
      store: 0.35,
      "house-a": 0.35,
      "house-b": 0.35,
      "route-a": 0.35,
      "route-b": 0.35,
      "side-a": 0.35,
      "side-b": 0.35,
    },
  );
  design.recipe.sidesEnter = cue(64, 78, "pressure-arrives");
  design.recipe.openWidth = 280;
  design.recipe.constrainedWidth = 48;
  design.recipe.pinch = {
    path: "route-a",
    window: cue(64, 114, "route-pinches", "in-out-quint"),
    amount: 0.65,
  };
  design.recipe.entrances = [
    entrance("title", "wipe", 0, 18, "available-grain"),
    entrance("consequence", "wipe", 8, 28, "access-narrows"),
    // The source and households are already present when access starts to close.
    entrance("side-a", "stamp", 64, 78, "pressure-arrives"),
    entrance("side-b", "stamp", 64, 78, "pressure-arrives"),
    entrance("source-label", "attach", 30, 50, "grain-available"),
    entrance("open-label", "attach", 50, 64, "both-routes-open"),
    entrance("aperture-label", "attach", 104, 128, "access-constrained", {
      from: "down",
    }),
    entrance("open-underline", "draw", 150, 174, "open-route-persists"),
  ];
  design.recipe.emphasis = [
    {
      node: "house-a",
      window: { ...cue(120, 150, "affected-household"), role: "response" },
      opacity: 0.8,
    },
  ];
  design.recipe.moves = [
    {
      node: "house-a",
      role: "response",
      keys: [
        { frame: 64, x: 1380, scaleY: 1 },
        { frame: 88, x: 1360, scaleY: 0.92, easing: "in-out-quint" },
        { frame: 114, x: 1375, scaleY: 0.985, easing: "out-back-soft" },
      ],
    },
  ];
  design.flows = [
    {
      ...flow("grain-a", "route-a", 40, c.grain, 5),
      count: 5,
      speed: [
        { frame: 40, pxPerFrame: 5 },
        { frame: 64, pxPerFrame: 5 },
        { frame: 114, pxPerFrame: 1.2, easing: "in-out-quint" },
      ],
      pinch: { at: 0.5, strength: 0.7, width: 0.16 },
    },
    { ...flow("grain-b", "route-b", 40, c.grain, 5), count: 5 },
  ];
  return design;
}

export function continuousRelationshipBuild(): MotionDesign {
  const design = base("relationship-build");
  if (design.recipe.preset !== "relationship_build")
    throw new Error("Recipe mismatch");
  design.camera = camera(
    [
      key(0, 920, 548, 1.025),
      key(60, 945, 544, 1.018),
      key(128, 972, 540, 1.005),
      key(191, 995, 542, 1.014),
    ],
    {
      title: 0,
      "store-label": 0,
      ground: 0,
      store: 0.35,
      resources: 0.35,
      access: 0.35,
      claims: 0.35,
    },
  );
  design.recipe.entrances = [
    entrance("title", "wipe", 0, 18, "food-only-part"),
    entrance("resources", "set-down", 24, 58, "land-arrives"),
    entrance("access", "set-down", 64, 94, "access-arrives"),
    entrance("claims", "stamp", 107, 126, "claims-arrive"),
    entrance("resources-label", "attach", 34, 50, "land-named", {
      from: "left",
    }),
    entrance("access-label", "attach", 76, 92, "access-named"),
    entrance("claims-label", "attach", 118, 134, "claims-named"),
  ];
  design.recipe.moves = [];
  (design.recipe.moves ??= []).push({
    node: "store",
    role: "response",
    keys: [
      { frame: 95, x: 130 },
      { frame: 117, x: 158, easing: "in-quad" },
      { frame: 134, x: 133, easing: "out-back-soft" },
    ],
  });
  design.recipe.moves.push({
    node: "store",
    role: "response",
    keys: [
      { frame: 150, x: 133 },
      { frame: 162, x: 139, easing: "in-out-sine" },
      { frame: 174, x: 133, easing: "in-out-sine" },
    ],
  });
  design.flows = [
    {
      ...flow("land-return", "land-link", 44, c.field, 4, -1),
      window: { start: 44, end: 60, role: "response" },
      count: 1,
    },
    {
      ...flow("access-return", "access-link", 80, c.field, 4, -1),
      window: { start: 80, end: 96, role: "response" },
      count: 1,
    },
    flow("land-current", "land-link", 60, c.field, 1.5, -1),
    flow("access-current", "access-link", 96, c.field, 1.5, -1),
    { ...flow("claims-current", "claims-link", 128, c.red, 2), shape: "dash" },
  ];
  return design;
}

export function continuousEvidenceBoundary(): MotionDesign {
  const design = base("evidence-boundary");
  if (design.recipe.preset !== "evidence_boundary")
    throw new Error("Recipe mismatch");
  const original = design.nodes.find((node) => node.id === "composite-house")!;
  design.nodes = design.nodes.flatMap((node) =>
    node.id === "composite-house"
      ? strips(
          "composite-house",
          "house",
          original.x!,
          original.y!,
          original.width!,
          original.height!,
          3,
        ).map((part) => ({
          ...part,
          parent: part.id === "composite-house" ? "composite" : part.parent,
        }))
      : node.id === "intro"
        ? [{ ...node, revealMode: "words" }]
        : node.id === "unknown-state"
          ? [{ ...node, revealMode: "words" }]
          : node.id === "unknown-note-a" || node.id === "unknown-note-b"
            ? [{ ...node, opacity: 0.75 }]
            : [node],
  );
  design.nodes.push(
    path(
      "supported-underline",
      [
        [112, 852],
        [900, 852],
      ],
      {
        stroke: c.field,
        lineWidth: 12,
        lineStyle: "brush",
        parent: "supported-stage",
      },
    ),
    path(
      "unknown-rule",
      [
        [112, 880],
        [1050, 880],
      ],
      { opacity: 0.6, stroke: c.ink, lineWidth: 3, parent: "unknown" },
    ),
    group("evidence-summary", 0, 0, 1920, 1080),
    path(
      "summary-divider-a",
      [
        [660, 400],
        [660, 900],
      ],
      {
        parent: "evidence-summary",
        stroke: c.field,
        lineWidth: 3,
      },
    ),
    path(
      "summary-divider-b",
      [
        [1280, 400],
        [1280, 900],
      ],
      {
        parent: "evidence-summary",
        stroke: c.field,
        lineWidth: 3,
      },
    ),
    text("summary-supported", "Supported", 112, 410, 68, {
      parent: "evidence-summary",
      fontAsset: "display",
    }),
    text("summary-supported-note", "categories", 112, 495, 52, {
      parent: "evidence-summary",
    }),
    art("summary-resources", "category-a", 125, 565, 210, 150, {
      parent: "evidence-summary",
    }),
    art("summary-holdings", "land", 380, 590, 220, 90, {
      parent: "evidence-summary",
    }),
    text("summary-resources-label", "Resources", 125, 735, 46, {
      parent: "evidence-summary",
    }),
    text("summary-holdings-label", "Holdings", 380, 735, 46, {
      parent: "evidence-summary",
    }),
    text("summary-unknown-heading", "Exact details", 710, 410, 68, {
      parent: "evidence-summary",
      fontAsset: "display",
    }),
    text("summary-unknown", "Unknown", 710, 540, 96, {
      parent: "evidence-summary",
      fontAsset: "display",
    }),
    text("summary-unknown-note", "Items · Amounts", 710, 735, 52, {
      parent: "evidence-summary",
    }),
    path(
      "summary-unknown-rule",
      [
        [710, 845],
        [1200, 845],
      ],
      {
        parent: "evidence-summary",
        stroke: c.ink,
        lineWidth: 5,
      },
    ),
    text("summary-composite", "Composite", 1320, 410, 68, {
      parent: "evidence-summary",
      fontAsset: "display",
    }),
    art("summary-house", "house", 1420, 550, 300, 220, {
      parent: "evidence-summary",
    }),
    text("summary-composite-note", "Not a recovered", 1320, 795, 50, {
      parent: "evidence-summary",
    }),
    text("summary-composite-end", "pantry", 1320, 855, 50, {
      parent: "evidence-summary",
    }),
  );
  design.essentialText.push(
    "summary-supported",
    "summary-supported-note",
    "summary-resources-label",
    "summary-holdings-label",
    "summary-unknown-heading",
    "summary-unknown",
    "summary-unknown-note",
    "summary-composite",
    "summary-composite-note",
    "summary-composite-end",
  );
  design.camera = camera(
    [
      key(0, 944, 548, 1.01),
      key(56, 952, 548, 1.012),
      key(100, 971, 548, 1.014),
      key(146, 992, 548, 1.016),
      key(191, 960, 540, 1),
    ],
    {
      title: 0,
      intro: 0,
      qualifier: 0,
      "supported-stage": 0.35,
      unknown: 0.35,
      composite: 0.35,
      "evidence-summary": 0.35,
    },
  );
  design.recipe.supported = [
    { node: "supported-a", window: cue(12, 28, "resources") },
    { node: "supported-b", window: cue(28, 46, "holdings") },
  ];
  design.recipe.unknown = {
    node: "unknown",
    window: cue(52, 70, "evidence-limit"),
  };
  design.recipe.composite = {
    node: "composite",
    window: cue(92, 112, "composite-is-separate"),
  };
  design.recipe.exits = [
    { node: "supported-stage", window: cue(50, 58, "supported-recedes") },
    { node: "unknown", window: cue(92, 100, "limits-recede") },
  ];
  design.recipe.moves = [
    {
      node: "composite-house",
      role: "action",
      keys: [
        { frame: 92, scaleX: 0.82 },
        { frame: 120, scaleX: 1, easing: "out-quint" },
      ],
    },
    {
      node: "composite",
      role: "response",
      keys: [
        { frame: 146, opacity: 1 },
        { frame: 158, opacity: 0, easing: "linear" },
      ],
    },
  ];
  design.recipe.entrances = [
    entrance("title", "wipe", 0, 18, "evidence-has-edges"),
    entrance("intro", "wipe", 8, 28, "records-support-categories"),
    entrance("supported-heading", "wipe", 10, 26, "supported-categories"),
    entrance("supported-a", "set-down", 12, 28, "resources-solid"),
    entrance("supported-b", "set-down", 28, 46, "holdings-solid"),
    entrance("boundary", "draw", 20, 44, "evidence-divider"),
    entrance("supported-underline", "draw", 44, 60, "supported-mark"),
    entrance("unknown-heading", "wipe", 52, 70, "exact-details"),
    entrance("unknown-state", "wipe", 60, 78, "unknown"),
    entrance("unknown-note-a", "rise", 64, 82, "items-provisional"),
    entrance("unknown-note-b", "rise", 64, 82, "amounts-provisional"),
    entrance("unknown-mark", "draw", 72, 96, "unknown-boundary"),
    entrance(
      "composite-house",
      "assemble",
      92,
      120,
      "assembled-not-recovered",
      {
        parts: [
          {
            node: "composite-house-strip-0",
            from: "up",
            distance: 40,
            offset: 0,
          },
          {
            node: "composite-house-strip-1",
            from: "left",
            distance: 40,
            offset: 6,
          },
          {
            node: "composite-house-strip-2",
            from: "right",
            distance: 40,
            offset: 12,
          },
        ],
      },
    ),
    entrance("composite-title", "wipe", 98, 118, "composite-category"),
    entrance("composite-note", "wipe", 110, 130, "not-recovered"),
    entrance("composite-note-end", "wipe", 116, 136, "pantry"),
    entrance("qualifier", "wipe", 146, 170, "illustrative-only"),
    entrance("evidence-summary", "fade", 154, 178, "whole-evidence-boundary"),
  ];
  design.flows = [
    {
      ...flow("uncertain", "unknown-rule", 78, c.ink, 1.2),
      count: 4,
      shape: "dash",
      size: 6,
    },
    {
      ...flow("summary-uncertainty", "summary-unknown-rule", 168, c.ink, 2.5),
      count: 6,
      shape: "dash",
      size: 7,
    },
  ];
  return design;
}

export function continuousDatedSystemBreak(): MotionDesign {
  const design = base("dated-system-break");
  if (design.recipe.preset !== "dated_system_break")
    throw new Error("Recipe mismatch");
  const paper = design.nodes.find((node) => node.id === "paper")!;
  design.nodes = [paper, ...design.nodes.filter((node) => node.id !== "paper")];
  design.nodes.push(
    path(
      "unknown-underline",
      [
        [112, 745],
        [690, 745],
      ],
      { stroke: c.red, lineWidth: 12, lineStyle: "brush", parent: "later" },
    ),
  );
  design.camera = camera(
    [
      key(0, 960, 540, 1),
      key(70, 980, 548, 1.012),
      key(76, 984, 548, 1.014),
      key(119, 980, 546, 1.012),
      key(120, 980, 546, 1.012),
      key(191, 960, 540, 1),
    ],
    { crisis: 0, later: 0.5 },
  );
  design.recipe.entrances = [
    entrance("crisis-date", "wipe", 0, 24, "dated-crisis"),
    entrance("crisis-context", "wipe", 10, 30, "comparison-context"),
    entrance("crisis-store", "set-down", 0, 26, "system-source"),
    entrance("break-a", "draw", 20, 44, "resource-connection"),
    entrance("break-b", "draw", 26, 50, "access-connection"),
    entrance("crisis-resources", "set-down", 36, 58, "resources-arrive"),
    entrance("crisis-access", "set-down", 44, 66, "access-arrives"),
    entrance("crisis-resources-label", "attach", 42, 60, "resources-named"),
    entrance("crisis-access-label", "attach", 52, 70, "access-named"),
    entrance("later-house", "set-down", 120, 150, "new-context-household"),
    entrance("unknown-underline", "draw", 128, 150, "unknown-local-conditions"),
    entrance("later-qualifier", "wipe", 140, 166, "different-place-time"),
  ];
  design.recipe.moves = [
    {
      node: "break-a",
      role: "response",
      window: cue(58, 72, "resource-line-tension", "in-quad"),
      to: { pulse: 0.8 },
    },
    {
      node: "break-b",
      role: "response",
      window: cue(58, 72, "access-line-tension", "in-quad"),
      to: { pulse: 0.8 },
    },
    {
      node: "crisis-resources",
      role: "response",
      keys: [
        { frame: 74, y: 304, rotation: 0 },
        { frame: 84, y: 318, rotation: 2, easing: "in-cubic" },
        { frame: 94, y: 313, rotation: 0.7, easing: "out-back-soft" },
        { frame: 119, y: 316, rotation: 0.7, easing: "linear" },
      ],
    },
    {
      node: "crisis-access",
      role: "response",
      keys: [
        { frame: 90, y: 705, rotation: 0 },
        { frame: 104, y: 710, rotation: -2.5, easing: "in-cubic" },
        { frame: 119, y: 713, rotation: -0.7, easing: "out-back-soft" },
      ],
    },
  ];
  design.flows = [
    {
      ...flow("resources-current", "break-a", 50, c.bone, 4),
      count: 4,
      window: { start: 50, end: 120, role: "current" },
      speed: [
        { frame: 50, pxPerFrame: 4 },
        { frame: 58, pxPerFrame: 4 },
        { frame: 72, pxPerFrame: 2, easing: "in-quad" },
      ],
    },
    {
      ...flow("access-current", "break-b", 50, c.bone, 4),
      count: 4,
      window: { start: 50, end: 120, role: "current" },
      speed: [
        { frame: 50, pxPerFrame: 4 },
        { frame: 58, pxPerFrame: 4 },
        { frame: 72, pxPerFrame: 2, easing: "in-quad" },
      ],
    },
    {
      ...flow("unknown-current", "unknown-underline", 150, c.red, 2.5),
      count: 6,
      shape: "dash",
      size: 7,
    },
  ];
  return design;
}

export function continuousCategorySwap(): MotionDesign {
  const design = base("category-swap");
  if (design.recipe.preset !== "category_swap")
    throw new Error("Recipe mismatch");
  design.nodes.push(
    ...[
      [
        "bracket-tl",
        [
          [150, 300],
          [235, 300],
          [235, 340],
        ],
      ],
      [
        "bracket-tr",
        [
          [915, 300],
          [1000, 300],
          [1000, 340],
        ],
      ],
      [
        "bracket-bl",
        [
          [150, 845],
          [235, 845],
          [235, 805],
        ],
      ],
      [
        "bracket-br",
        [
          [915, 845],
          [1000, 845],
          [1000, 805],
        ],
      ],
    ].map(([id, points]) =>
      path(id as string, points as number[][], {
        stroke: c.ink,
        lineWidth: 8,
        lineStyle: "brush",
      }),
    ),
    path(
      "caption-underline",
      [
        [260, 948],
        [890, 948],
      ],
      { stroke: c.field, lineWidth: 11, lineStyle: "brush" },
    ),
    path(
      "connection-underline",
      [
        [1240, 960],
        [1740, 960],
      ],
      {
        stroke: c.field,
        lineWidth: 8,
        lineStyle: "brush",
      },
    ),
  );
  design.camera = camera(
    [key(0, 950, 550, 1), key(71, 928, 556, 1.012), key(191, 968, 556, 1.018)],
    {
      title: 0,
      comparison: 0,
      "category-label": 0,
      "relation-label": 0,
      qualifier: 0,
      ground: 0,
    },
  );
  design.recipe.entrances = [
    entrance("title", "wipe", 0, 18, "category-changes"),
    entrance("comparison", "wipe", 8, 28, "comparison-source"),
    // The basket is established at frame zero so the exact category swap is the peak.
    entrance("household", "set-down", 10, 32, "connected-household"),
    entrance("relation", "draw", 20, 44, "supply-connection"),
    ...["bracket-tl", "bracket-tr", "bracket-bl", "bracket-br"].map((id, i) =>
      entrance(id, "draw", 48 + i * 3, 62 + i * 3, "category-registration"),
    ),
    entrance("caption-underline", "draw", 74, 92, "new-category-named"),
    entrance("relation-label", "stamp", 96, 112, "still-connected"),
    entrance("qualifier", "wipe", 110, 134, "symbolic-qualification"),
    entrance("connection-underline", "draw", 150, 170, "connection-continues"),
  ];
  design.recipe.moves = [
    {
      node: "category",
      role: "response",
      keys: [
        { frame: 60, scaleY: 1 },
        { frame: 71, scaleY: 0.97, easing: "in-quad" },
        { frame: 72, scaleY: 0.97, easing: "linear" },
        { frame: 84, scaleY: 1, easing: "out-back-soft" },
      ],
    },
    ...["bracket-tl", "bracket-tr", "bracket-bl", "bracket-br"].map((node) => ({
      node,
      role: "response" as const,
      keys: [
        { frame: 72, scaleX: 1.04, scaleY: 1.04 },
        { frame: 84, scaleX: 1, scaleY: 1, easing: "out-back-soft" as const },
      ],
    })),
  ];
  design.flows = [
    {
      ...flow("supply", "relation", 40, c.grain, 5),
      count: 4,
      colorStates: [{ frame: 72, color: c.field }],
      speed: [
        { frame: 40, pxPerFrame: 5 },
        { frame: 56, pxPerFrame: 5 },
        { frame: 71, pxPerFrame: 2, easing: "in-out-sine" },
        { frame: 84, pxPerFrame: 4, easing: "out-cubic" },
      ],
    },
  ];
  return design;
}

export function continuousMotifResolve(): MotionDesign {
  const design = base("motif-resolve");
  if (design.recipe.preset !== "motif_resolve")
    throw new Error("Recipe mismatch");
  design.recipe.resolve = cue(116, 130, "land-to-claims", "in-out-quint");
  design.nodes = design.nodes.map((node) =>
    node.id === "subtitle"
      ? { ...node, revealMode: "words" }
      : node.id === "outgoing" && node.type === "path"
        ? { ...node, lineWidth: 48 }
        : node,
  );
  design.camera = camera(
    [
      key(0, 940, 548, 1.02),
      key(100, 968, 542, 1.005),
      key(191, 1000, 550, 1.018),
    ],
    {
      title: 0,
      subtitle: 0,
      qualifier: 0,
      ground: 0,
      household: 0.35,
      resources: 0.35,
      access: 0.35,
      land: 0.35,
      claims: 0.35,
    },
  );
  design.recipe.entrances = [
    entrance("title", "wipe", 0, 18, "a-household"),
    entrance("subtitle", "wipe", 16, 36, "and-connections"),
    entrance("resources", "set-down", 18, 58, "resources-arrive"),
    entrance("access", "set-down", 30, 70, "access-arrives"),
    entrance("land", "set-down", 44, 88, "land-arrives"),
    entrance("claims", "set-down", 54, 64, "claims-arrive"),
    entrance("resource-link", "draw", 30, 60, "resources-link"),
    entrance("access-link", "draw", 46, 76, "access-link"),
    entrance("claims-label", "attach", 124, 142, "rent-service-named"),
    entrance("qualifier", "wipe", 140, 162, "conceptual-relationships"),
  ];
  design.recipe.moves = [
    {
      node: "household",
      role: "action",
      window: cue(18, 54, "household-regroups", "linear"),
      to: { x: 115 },
    },
    {
      node: "resources",
      role: "action",
      window: cue(28, 64, "resources-regroup", "linear"),
      to: { x: 705 },
    },
    {
      node: "access",
      role: "action",
      window: cue(40, 76, "access-regroups", "linear"),
      to: { x: 879 },
    },
    {
      node: "land",
      role: "action",
      window: cue(54, 90, "land-regroups", "linear"),
      to: { x: 1195 },
    },
    {
      node: "claims",
      role: "action",
      window: cue(64, 100, "claims-regroup", "linear"),
      to: { x: 1345 },
    },
  ];
  design.flows = [
    flow("resources-current", "resource-link", 60, c.field, 1.5, -1),
    flow("access-current", "access-link", 60, c.field, 1.5, -1),
    {
      ...flow("obligation-current", "outgoing", 136, c.red, 2.5),
      count: 3,
      shape: "dash",
    },
  ];
  return design;
}

export const continuousStudies = [
  continuousAccessConstraint,
  continuousRelationshipBuild,
  continuousEvidenceBoundary,
  continuousDatedSystemBreak,
  continuousCategorySwap,
  continuousMotifResolve,
];
