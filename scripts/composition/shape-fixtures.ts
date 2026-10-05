import type { Composition, ShapeContent } from "@still-shift/scene-contract";

export function shapeCases() {
  const cases: { id: string; contents: ShapeContent[] }[] = [];
  const rect: ShapeContent = {
    id: "rect",
    type: "rect",
    size: [50, 40],
    position: [60, 45],
    roundness: 6,
  };
  const fill: ShapeContent = { id: "fill", type: "fill", color: "#eec344" };
  const gradient: ShapeContent = {
    id: "gradient",
    type: "gradient-fill",
    gradient: "linear",
    start: [30, 20],
    end: [90, 70],
    stops: [
      { id: "a", offset: 0, color: "#df507780" },
      { id: "b", offset: 1, color: "#26e5cc" },
    ],
  };
  cases.push(
    { id: "rect", contents: [rect, fill] },
    {
      id: "ellipse",
      contents: [
        {
          id: "ellipse",
          type: "ellipse",
          size: [70, 50],
          position: [60, 45],
        },
        fill,
      ],
    },
    {
      id: "star",
      contents: [
        {
          id: "star",
          type: "polystar",
          kind: "star",
          points: 5,
          innerRadius: 15,
          outerRadius: 30,
          position: [60, 45],
        },
        fill,
      ],
    },
    { id: "gradient", contents: [rect, gradient] },
  );
  for (const style of ["plain", "ink", "brush"] as const)
    cases.push({
      id: `stroke-${style}`,
      contents: [
        {
          id: "path",
          type: "path",
          path: {
            closed: false,
            vertices: [
              [25, 30],
              [65, 30],
              [95, 60],
            ],
            outTangents: [
              [0, 20],
              [10, 0],
              [0, 0],
            ],
            inTangents: [
              [0, 0],
              [-10, 0],
              [0, -10],
            ],
          },
        },
        {
          id: "stroke",
          type: "stroke",
          style,
          width: 10,
          color: "#eec344",
          dashes: [15, 8],
          cap: "round",
          join: "round",
        },
      ],
    });
  const operators: ShapeContent[] = [
    { id: "operator", type: "trim-paths", end: 0.6, offset: 180 },
    {
      id: "operator",
      type: "repeater",
      copies: 2.5,
      transform: { position: [10, 7] },
      startOpacity: 1,
      endOpacity: 0.4,
    },
    { id: "operator", type: "offset-path", amount: 5, join: "round" },
    { id: "operator", type: "round-corners", radius: 8 },
    {
      id: "operator",
      type: "wiggle-paths",
      size: 5,
      detail: 3,
      frequency: 2,
      seed: 42,
    },
    { id: "operator", type: "zig-zag", size: 4, ridges: 2, points: "smooth" },
    { id: "operator", type: "pucker-bloat", amount: 0.5 },
    { id: "operator", type: "twist", angle: 120, center: [60, 45] },
  ];
  for (const operator of operators)
    cases.push({ id: operator.type, contents: [rect, fill, operator] });
  for (const mode of ["union", "subtract", "intersect", "exclude"] as const)
    cases.push({
      id: `merge-${mode}`,
      contents: [
        rect,
        { ...rect, id: "second", position: [80, 55] },
        fill,
        { id: "merge", type: "merge-paths", mode },
      ],
    });
  cases.push({
    id: "painted-repeat-gradient",
    contents: [
      rect,
      gradient,
      {
        id: "repeat",
        type: "repeater",
        copies: 3,
        transform: { position: [10, 3] },
        startOpacity: 0.9,
        endOpacity: 0.5,
      },
    ],
  });
  cases.push({
    id: "compound-repeat-gradient",
    contents: [
      rect,
      {
        id: "repeat",
        type: "repeater",
        copies: 3,
        transform: { position: [10, 3] },
        startOpacity: 1,
        endOpacity: 1,
      },
      gradient,
    ],
  });
  cases.push(
    {
      id: "polygon",
      contents: [
        {
          id: "polygon",
          type: "polystar",
          kind: "polygon",
          points: 6,
          outerRadius: 30,
          outerRoundness: 0.3,
          position: [60, 45],
        },
        fill,
      ],
    },
    {
      id: "radial-fill",
      contents: [rect, { ...gradient, gradient: "radial" }],
    },
    ...(["linear", "radial"] as const).map((kind) => ({
      id: `${kind}-stroke`,
      contents: [
        rect,
        {
          id: "paint",
          type: "gradient-stroke" as const,
          gradient: kind,
          width: 8,
          start: [35, 25] as [number, number],
          end: [90, 70] as [number, number],
          stops: [
            { id: "a", offset: 0, color: "#df5077" },
            { id: "b", offset: 1, color: "#26e5cc" },
          ],
          cap: "round" as const,
          join: "bevel" as const,
          dashes: [12, 5],
          dashOffset: {
            keys: [
              { frame: 0, value: 0 },
              { frame: 47, value: 20 },
            ],
          },
        },
      ],
    })),
    {
      id: "painted-group-trim",
      contents: [
        {
          id: "g",
          type: "group",
          transform: { position: [5, 0], rotation: 5, opacity: 0.7 },
          contents: [rect, fill],
        },
        { id: "trim", type: "trim-paths", end: 0.6, mode: "individual" },
      ],
    },
    {
      id: "painted-group-repeat",
      contents: [
        { id: "g", type: "group", contents: [rect, gradient] },
        {
          id: "repeat",
          type: "repeater",
          copies: 2.5,
          order: "above",
          transform: { position: [10, 5] },
          startOpacity: 1,
          endOpacity: 0.4,
        },
      ],
    },
    { id: "zero-size", contents: [{ ...rect, size: [0, 0] }, fill] },
    {
      id: "zero-gradient",
      contents: [rect, { ...gradient, end: gradient.start }],
    },
    {
      id: "signed-open-offset",
      contents: [
        {
          id: "line",
          type: "path",
          path: {
            closed: false,
            vertices: [
              [25, 60],
              [60, 30],
              [95, 60],
            ],
          },
        },
        {
          id: "paint",
          type: "stroke",
          color: "#eec344",
          width: 4,
          cap: "square",
          join: "bevel",
        },
        { id: "offset", type: "offset-path", amount: -8, join: "round" },
      ],
    },
    {
      id: "even-odd-hole",
      contents: [
        { id: "outer", type: "ellipse", size: [70, 60], position: [60, 45] },
        { id: "inner", type: "ellipse", size: [30, 20], position: [60, 45] },
        { ...fill, rule: "evenodd" },
      ],
    },
  );
  return cases;
}

const common = {
  schemaVersion: "composition-1" as const,
  fps: 24 as const,
  frameCount: 48,
  assets: [],
  background: "#25313b",
};
export function shapeReference(): Composition {
  return {
    ...common,
    id: "shape-reference",
    width: 768,
    height: 576,
    layers: shapeCases().map((entry, index) => ({
      id: entry.id,
      type: "shape",
      transform: { position: [(index % 6) * 128, Math.floor(index / 6) * 96] },
      contents: entry.contents,
    })),
    metadata: {
      cells: shapeCases().map((entry, index) => ({
        id: entry.id,
        column: index % 6,
        row: Math.floor(index / 6),
      })),
    },
  };
}
export function shapeAnimation(): Composition {
  return {
    ...common,
    id: "shape-animation",
    width: 320,
    height: 180,
    frameCount: 96,
    layers: [
      {
        id: "morph",
        type: "shape",
        transform: { position: [80, 80] },
        contents: [
          {
            id: "path",
            type: "path",
            path: {
              keys: [
                {
                  frame: 0,
                  value: {
                    closed: true,
                    vertices: [
                      [-40, -40],
                      [40, -40],
                      [40, 40],
                      [-40, 40],
                    ],
                  },
                },
                {
                  frame: 95,
                  value: {
                    closed: true,
                    firstVertex: 1,
                    vertices: [
                      [0, -50],
                      [50, 0],
                      [0, 50],
                      [-50, 0],
                    ],
                    outTangents: [
                      [20, 0],
                      [0, 20],
                      [-20, 0],
                      [0, -20],
                    ],
                    inTangents: [
                      [-20, 0],
                      [0, -20],
                      [20, 0],
                      [0, 20],
                    ],
                  },
                },
              ],
            },
          },
          {
            id: "paint",
            type: "stroke",
            color: "#26e5cc",
            width: 6,
            cap: "round",
          },
          {
            id: "trim",
            type: "trim-paths",
            end: {
              keys: [
                { frame: 0, value: 0 },
                { frame: 95, value: 1 },
              ],
            },
            offset: {
              keys: [
                { frame: 0, value: 0 },
                { frame: 95, value: 360 },
              ],
            },
          },
        ],
      },
      {
        id: "wiggle",
        type: "shape",
        transform: { position: [220, 80] },
        contents: [
          {
            id: "star",
            type: "polystar",
            kind: "star",
            points: 5,
            innerRadius: 18,
            outerRadius: 40,
          },
          { id: "paint", type: "fill", color: "#eec344" },
          {
            id: "wiggle",
            type: "wiggle-paths",
            size: 7,
            frequency: 2,
            detail: 2,
            seed: 42,
          },
        ],
      },
    ],
  };
}
