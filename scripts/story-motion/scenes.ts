import { palette as c } from "./art.ts";
import {
  typeScale,
  art,
  bind,
  cue,
  ground,
  group,
  household,
  paper,
  path,
  rect,
  relation,
  subject,
  text,
  type MotionDesign,
} from "./design.ts";

export const designs: MotionDesign[] = [
  {
    id: "unequal-margins",
    title: "Unequal Margins",
    description:
      "The same season reaches two households. Their room to absorb strain differs.",
    essentialText: ["room", "strained", "qualifier"],
    nodes: [
      paper(),
      ground(720),
      text("reference", "The same season.", 112, 96, 112),
      text(
        "question",
        "Different room to absorb strain.",
        116,
        246,
        typeScale.subheading,
      ),
      path(
        "common-ground",
        [
          [140, 830],
          [1780, 830],
        ],
        { stroke: c.field, lineWidth: 3 },
      ),
      household("house-a", 220, 402, 570),
      household("house-b", 1110, 402, 570),
      path(
        "pressure-a",
        [
          [0, 0],
          [0, 280],
          [58, 280],
        ],
        { x: 118, y: 490, stroke: c.grain, lineWidth: 24, lineStyle: "brush" },
      ),
      path(
        "pressure-b",
        [
          [58, 0],
          [58, 280],
          [0, 280],
        ],
        { x: 1744, y: 490, stroke: c.red, lineWidth: 24, lineStyle: "brush" },
      ),
      text("room", "More room", 505, 854, typeScale.label, { align: "center" }),
      text("strained", "Less room", 1395, 854, typeScale.label, {
        align: "center",
        color: c.red,
      }),
      text(
        "qualifier",
        "A qualitative comparison",
        112,
        968,
        typeScale.qualifier,
      ),
    ],
    recipe: {
      preset: "unequal_margins",
      households: ["house-a", "house-b"],
      reference: "reference",
      pressures: [
        { node: "pressure-a", to: [155, 490], condition: "room" },
        { node: "pressure-b", to: [1630, 490], condition: "strained" },
      ],
      labels: ["room", "strained"],
      strain: cue(48, 104, "shared-strain", "in-out-quint"),
      labelWindows: [cue(86, 106, "more-room"), cue(98, 120, "less-room")],
    },
  },
  {
    id: "access-constraint",
    title: "Access Constraint",
    description:
      "Available grain stays in view while one open connection becomes more constrained.",
    essentialText: ["aperture-label", "source-label", "open-label"],
    nodes: [
      paper(),
      ground(795),
      text("title", "Grain can be available.", 112, 92, 94),
      text(
        "consequence",
        "Access can still narrow.",
        116,
        219,
        typeScale.subheading,
        { color: c.red },
      ),
      art("store", "store", 90, 350, 640, 555),
      path(
        "route-a",
        [
          [666, 580],
          [1428, 478],
        ],
        { lineWidth: 22, lineStyle: "brush" },
      ),
      path(
        "route-b",
        [
          [648, 821],
          [1428, 821],
        ],
        { lineWidth: 22, lineStyle: "brush" },
      ),
      group("side-a", 0, 0, 300, 90, { clip: true }),
      art("side-a-art", "pressure", 0, 0, 300, 90, {
        parent: "side-a",
        fit: "stretch",
      }),
      group("side-b", 0, 0, 300, 90, { clip: true }),
      art("side-b-art", "pressure", 0, 0, 300, 90, {
        parent: "side-b",
        rotation: 180,
        fit: "stretch",
      }),
      household("house-a", 1380, 278, 390),
      household("house-b", 1380, 621, 390),
      text("aperture-label", "Access narrows", 1020, 704, typeScale.label, {
        align: "center",
        color: c.red,
        fontAsset: "label-strong",
      }),
      text("source-label", "Grain available", 410, 948, typeScale.label, {
        align: "center",
      }),
      text("open-label", "Route stays open", 1080, 948, typeScale.label),
    ],
    recipe: {
      preset: "access_constraint",
      source: "store",
      connections: ["route-a", "route-b"],
      route: "route-a",
      sides: ["side-a", "side-b"],
      position: 0.5,
      openWidth: 190,
      constrainedWidth: 56,
      clearance: 12,
      reveal: cue(12, 40, "available-connections"),
      narrow: cue(64, 114, "unequal-access", "in-out-quint"),
    },
  },
  {
    id: "relationship-build",
    title: "Relationship Build",
    description:
      "Land, access and claims develop around a stable store, one relationship at a time.",
    essentialText: [
      "store-label",
      "resources-label",
      "access-label",
      "claims-label",
    ],
    nodes: [
      paper(),
      ground(790),
      text("title", "Food was only part of it.", 112, 88, 94),
      relation("land-link"),
      relation("access-link"),
      relation("claims-link", { stroke: c.red }),
      art("store", "store", 130, 342, 620, 537),
      text("store-label", "Grain", 450, 905, typeScale.label, {
        align: "center",
      }),
      ...subject("resources", "land", "Land", 1070, 307, 520, 211),
      ...subject("access", "access", "Access", 1190, 622, 380, 175),
      group("claims", 1450, 881, 360, 140),
      path(
        "claims-mark",
        [
          [0, 0],
          [0, 75],
          [38, 75],
        ],
        { parent: "claims", stroke: c.red, lineWidth: 7 },
      ),
      text("claims-label", "Claims", 52, 5, typeScale.label, {
        parent: "claims",
        color: c.red,
      }),
    ],
    connectors: [
      bind("land-link", "store", [550, 170], "resources", [40, 160], -36),
      bind("access-link", "store", [552, 330], "access", [12, 88], 28),
      bind("claims-link", "store", [320, 500], "claims", [0, 40], 25),
    ],
    recipe: {
      preset: "relationship_build",
      anchor: "store",
      branches: [
        {
          path: "land-link",
          destination: "resources",
          window: cue(12, 34, "land"),
          arrival: cue(24, 42, "land-arrives", "out-quint"),
        },
        {
          path: "access-link",
          destination: "access",
          window: cue(50, 76, "access"),
          arrival: cue(64, 84, "access-arrives", "out-quint"),
        },
        {
          path: "claims-link",
          destination: "claims",
          window: cue(95, 117, "claims"),
          arrival: cue(107, 126, "claims-arrive", "out-quint"),
        },
      ],
      moves: [
        {
          node: "resources",
          window: cue(24, 42, "land-settles", "out-quint"),
          to: { x: 1070, y: 285 },
        },
        {
          node: "access",
          window: cue(64, 84, "access-settles", "out-quint"),
          to: { x: 1190, y: 600 },
        },
        {
          node: "claims",
          window: cue(107, 126, "claims-settle", "out-quint"),
          to: { x: 1450, y: 863 },
        },
      ],
      emphasis: [
        {
          node: "resources-art",
          window: cue(65, 97, "access-focus"),
          opacity: 0.65,
        },
        {
          node: "resources-art",
          window: cue(116, 138, "whole-system"),
          opacity: 1,
        },
      ],
    },
  },
  {
    id: "evidence-boundary",
    title: "Evidence Boundary",
    description:
      "Supported categories, unknown details and a composite household occupy distinct explanatory spaces.",
    essentialText: [
      "supported-a-label",
      "supported-b-label",
      "unknown-note-a",
      "unknown-note-b",
      "composite-note",
      "composite-note-end",
      "qualifier",
    ],
    nodes: [
      paper(),
      text("title", "Evidence has edges.", 112, 96, 112),
      text(
        "intro",
        "A record can support a category, not every detail.",
        116,
        245,
        typeScale.subheading,
      ),
      path(
        "boundary",
        [
          [855, 375],
          [855, 885],
        ],
        { stroke: c.ink, lineWidth: 2 },
      ),
      path(
        "inference-divider",
        [
          [1320, 375],
          [1320, 885],
        ],
        { stroke: c.ink, lineWidth: 2 },
      ),
      text("supported-heading", "Supported", 112, 369, typeScale.section, {
        fontAsset: "display",
      }),
      ...subject("supported-a", "category-a", "Resources", 114, 534, 330, 231),
      ...subject("supported-b", "land", "Holdings", 472, 631, 330, 134),
      group("unknown", 910, 383, 370, 510),
      text("unknown-heading", "Exact details", 0, 0, typeScale.label, {
        parent: "unknown",
      }),
      text("unknown-state", "Unknown", 0, 121, typeScale.section, {
        parent: "unknown",
        fontAsset: "display",
      }),
      path(
        "unknown-mark",
        [
          [0, 225],
          [260, 225],
        ],
        { parent: "unknown", stroke: c.ink, lineWidth: 3 },
      ),
      text("unknown-note-a", "Items", 0, 289, typeScale.label, {
        parent: "unknown",
      }),
      text("unknown-note-b", "Amounts", 0, 369, typeScale.label, {
        parent: "unknown",
      }),
      group("composite", 1370, 387, 438, 580),
      text("composite-title", "Composite", 0, 0, typeScale.section, {
        parent: "composite",
        fontAsset: "display",
      }),
      household("composite-house", 20, 130, 370, { parent: "composite" }),
      text("composite-note", "Not a recovered", 0, 420, typeScale.label, {
        parent: "composite",
      }),
      text("composite-note-end", "pantry", 0, 484, typeScale.label, {
        parent: "composite",
      }),
      text(
        "qualifier",
        "Illustrative categories; not an itemized inventory.",
        112,
        966,
        typeScale.qualifier,
      ),
    ],
    recipe: {
      preset: "evidence_boundary",
      supported: [
        { node: "supported-a", window: cue(12, 28, "resources") },
        { node: "supported-b", window: cue(28, 46, "holdings") },
      ],
      unknown: { node: "unknown", window: cue(52, 70, "evidence-limit") },
      composite: {
        node: "composite",
        window: cue(78, 108, "composite-is-separate"),
      },
      boundary: "boundary",
      qualifier: "qualifier",
      moves: [
        {
          node: "supported-a",
          window: cue(12, 28, "resources-settle", "out-quint"),
          to: { x: 114, y: 516 },
        },
        {
          node: "supported-b",
          window: cue(28, 46, "holdings-settle", "out-quint"),
          to: { x: 472, y: 613 },
        },
        {
          node: "unknown",
          window: cue(52, 70, "limit-settles", "out-quint"),
          to: { x: 910, y: 369 },
        },
        {
          node: "composite",
          window: cue(78, 108, "composite-settles", "out-quint"),
          to: { x: 1370, y: 369 },
        },
      ],
      emphasis: [],
    },
  },
  {
    id: "dated-system-break",
    title: "Dated System Break",
    description:
      "A dated crisis fractures, then cuts to a separate local context whose conditions remain unknown.",
    essentialText: ["crisis-context", "later-note", "later-qualifier"],
    nodes: [
      group("crisis", 0, 0, 1920, 1080),
      rect("crisis-field", 0, 0, 1920, 1080, c.crisis, { parent: "crisis" }),
      text("crisis-date", "1315–17", 112, 82, 132, {
        parent: "crisis",
        color: c.bone,
      }),
      text(
        "crisis-context",
        "Great Famine · comparison",
        116,
        246,
        typeScale.subheading,
        { parent: "crisis", color: c.bone },
      ),
      art("crisis-store", "store", 120, 372, 650, 563, { parent: "crisis" }),
      path(
        "break-a",
        [
          [712, 578],
          [1260, 454],
        ],
        {
          parent: "crisis",
          stroke: c.bone,
          lineWidth: 28,
          lineStyle: "brush",
          gapSize: 0.18,
        },
      ),
      path(
        "break-b",
        [
          [720, 774],
          [1220, 815],
        ],
        {
          parent: "crisis",
          stroke: c.bone,
          lineWidth: 28,
          lineStyle: "brush",
          gapSize: 0.18,
        },
      ),
      art("crisis-resources", "category-a", 1240, 304, 450, 315, {
        parent: "crisis",
      }),
      text("crisis-resources-label", "Resources", 1465, 630, typeScale.label, {
        parent: "crisis",
        color: c.bone,
        align: "center",
      }),
      art("crisis-access", "access-crisis", 1220, 705, 470, 217, {
        parent: "crisis",
      }),
      text("crisis-access-label", "Access", 1455, 942, typeScale.label, {
        parent: "crisis",
        color: c.bone,
        align: "center",
      }),
      group("later", 0, 0, 1920, 1080),
      rect("later-field", 0, 0, 1920, 1080, c.bone, { parent: "later" }),
      art("later-ground", "ground", 0, 780, 1920, 300, { parent: "later" }),
      text("later-date", "Walsham · 1327–29", 112, 90, 104, {
        parent: "later",
      }),
      text(
        "later-context",
        "A different place in time.",
        116,
        238,
        typeScale.subheading,
        { parent: "later" },
      ),
      household("later-house", 1050, 382, 720, { parent: "later" }),
      text("later-note", "Local conditions", 112, 497, typeScale.label, {
        parent: "later",
      }),
      text("later-unknown", "Unknown.", 112, 606, 112, { parent: "later" }),
      text(
        "later-qualifier",
        "Earlier crisis ≠ known local conditions.",
        112,
        968,
        typeScale.qualifier,
        { parent: "later" },
      ),
      paper(),
    ],
    recipe: {
      preset: "dated_system_break",
      contextId: "famine-comparison",
      system: "crisis",
      context: "crisis-date",
      contextReadyFrame: 72,
      breaks: [
        { path: "break-a", window: cue(72, 84, "resource-stress", "in-cubic") },
        { path: "break-b", window: cue(90, 104, "access-stress", "in-cubic") },
      ],
      reset: {
        atFrame: 120,
        group: "later",
        context: "later-date",
        contextId: "walsham-later",
      },
    },
  },
  {
    id: "category-swap",
    title: "Category Swap",
    description:
      "Two registered grain-category illustrations exchange on one frame; their relationship and qualifier remain fixed.",
    essentialText: ["category-label", "relation-label", "qualifier"],
    nodes: [
      paper(),
      ground(770),
      text("title", "The category changes.", 112, 94, 94),
      text("comparison", "Hinderclay · comparison", 116, 227, typeScale.label),
      art("category", "category-a", 150, 300, 850, 595, {
        states: [{ asset: "category-a" }, { asset: "category-b" }],
      }),
      text("category-label", "One grain category", 575, 870, typeScale.label, {
        align: "center",
        states: ["One grain category", "Another grain category"],
      }),
      relation("relation"),
      household("household", 1270, 470, 510),
      text("relation-label", "Still connected", 1260, 882, typeScale.label),
      text(
        "qualifier",
        "Symbolic: no species or amount implied",
        112,
        968,
        typeScale.qualifier,
      ),
    ],
    connectors: [
      bind("relation", "category", [693, 362], "household", [50, 192], -44),
    ],
    recipe: {
      preset: "category_swap",
      subject: "category",
      fromState: 0,
      toState: 1,
      swapFrame: 72,
      qualifier: "qualifier",
      stableAnchors: ["relation", "household", "comparison"],
      stateLabels: ["category-label"],
    },
  },
  {
    id: "motif-resolve",
    title: "Motif Resolve",
    description:
      "Familiar motifs settle around the household; land leads into rent and service, with quiet space for the ending.",
    essentialText: [
      "resources-label",
      "access-label",
      "land-label",
      "claims-label",
      "qualifier",
    ],
    nodes: [
      paper(),
      ground(770),
      text("title", "A household,", 112, 83, 112),
      text("subtitle", "and its connections.", 116, 224, typeScale.subheading),
      relation("resource-link"),
      relation("access-link"),
      path(
        "outgoing",
        [
          [0, 0],
          [1, 1],
        ],
        { stroke: c.red, lineWidth: 28, lineStyle: "brush", endArrow: true },
      ),
      household("household", 100, 390, 560),
      ...subject("resources", "store", "Resources", 690, 320, 300, 260),
      ...subject("access", "access", "Access", 890, 695, 360, 166),
      ...subject("land", "land", "Land", 1180, 380, 500, 203),
      group("claims", 1330, 920, 470, 80),
      text("claims-label", "Rent / service", 0, 0, typeScale.label, {
        parent: "claims",
        color: c.red,
      }),
      text(
        "qualifier",
        "Conceptual relationships",
        112,
        968,
        typeScale.qualifier,
      ),
    ],
    connectors: [
      bind(
        "resource-link",
        "household",
        [513, 210],
        "resources",
        [44, 200],
        -24,
      ),
      bind("access-link", "household", [488, 338], "access", [8, 83], 32),
      bind("outgoing", "land", [250, 280], "claims", [220, 0], -24),
    ],
    recipe: {
      preset: "motif_resolve",
      motifs: ["household", "resources", "access", "land", "claims"],
      qualifier: "qualifier",
      outgoing: "outgoing",
      moves: [
        {
          node: "household",
          window: cue(18, 54, "household-settles", "out-quint"),
          to: { x: 150, y: 440 },
        },
        {
          node: "resources",
          window: cue(28, 64, "resources-settle", "out-quint"),
          to: { x: 765, y: 330 },
        },
        {
          node: "access",
          window: cue(40, 76, "access-settles", "out-quint"),
          to: { x: 795, y: 690 },
        },
        {
          node: "land",
          window: cue(54, 90, "land-settles", "out-quint"),
          to: { x: 1290, y: 480 },
        },
        {
          node: "claims",
          window: cue(64, 100, "claims-settle", "out-quint"),
          to: { x: 1320, y: 904 },
        },
      ],
      emphasis: [
        {
          node: "resources-art",
          window: cue(108, 128, "land-focus"),
          opacity: 0.65,
        },
        {
          node: "access-art",
          window: cue(108, 128, "land-focus"),
          opacity: 0.65,
        },
        {
          node: "resource-link",
          window: cue(108, 128, "land-focus"),
          opacity: 0.5,
        },
        {
          node: "access-link",
          window: cue(108, 128, "land-focus"),
          opacity: 0.5,
        },
      ],
      resolve: cue(112, 136, "land-to-claims"),
    },
  },
];
