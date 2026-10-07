import type { Page } from "playwright";
import type { Composition } from "@still-shift/scene-contract";
import type * as Render from "../../packages/renderer-core/src/index.ts";

/** Compare cap coverage, culling and damaged frames to independently drawn strokes. */
export async function verifySquareCapCoverage(page: Page) {
  return page.evaluate(async () => {
    const url = "/packages/renderer-core/src/index.ts",
      m = (await import(url)) as typeof Render;
    const colors = ["#ff0000", "#00ff00", "#0000ff"],
      color = { keys: colors.map((value, frame) => ({ frame, value })) };
    const cases = [
      {
        id: "onscreen",
        width: 128,
        height: 128,
        stroke: 40,
        vertices: [
          [40, 40],
          [90, 90],
        ],
      },
      {
        id: "right-edge",
        width: 64,
        height: 128,
        stroke: 20,
        vertices: [
          [75, 25],
          [100, 50],
        ],
      },
      {
        id: "left-edge",
        width: 64,
        height: 128,
        stroke: 20,
        vertices: [
          [-11, 25],
          [-36, 50],
        ],
      },
      {
        id: "top-edge",
        width: 128,
        height: 64,
        stroke: 20,
        vertices: [
          [25, -11],
          [50, -36],
        ],
      },
      {
        id: "bottom-edge",
        width: 128,
        height: 64,
        stroke: 20,
        vertices: [
          [25, 75],
          [50, 100],
        ],
      },
    ];
    const reports: {
      id: string;
      paint: string;
      join: string;
      backend: string;
      frames: number;
    }[] = [];
    for (const test of cases)
      for (const type of ["stroke", "gradient-stroke"] as const)
        for (const join of ["round", "bevel", "miter"] as const) {
          const paint = {
            id: "stroke",
            type,
            width: test.stroke,
            cap: "square" as const,
            join,
            miterLimit: 4,
            ...(type === "stroke"
              ? { color }
              : {
                  gradient: "linear" as const,
                  start: [0, 0] as [number, number],
                  end: [128, 0] as [number, number],
                  stops: [
                    { id: "start", offset: 0, color },
                    { id: "end", offset: 1, color },
                  ],
                }),
          };
          const doc = {
            schemaVersion: "composition-1",
            id: "cap",
            width: test.width,
            height: test.height,
            fps: 24,
            frameCount: 3,
            assets: [],
            background: "#000000",
            layers: [
              {
                id: "shape",
                type: "shape",
                contents: [
                  {
                    id: "path",
                    type: "path",
                    path: { closed: false, vertices: test.vertices },
                  },
                  paint,
                ],
              },
            ],
          } as Composition;
          const oracle = document.createElement("canvas");
          oracle.width = test.width;
          oracle.height = test.height;
          const ctx = oracle.getContext("2d", { willReadFrequently: true })!;
          for (const backend of ["canvas2d", "webgl2"] as const) {
            const preview = m.createCompositionPreview(
              document.createElement("canvas"),
              doc,
              { images: new Map(), fonts: new Map() },
              { backend },
            );
            try {
              for (const frame of [0, 1, 2, 1, 0]) {
                ctx.fillStyle = "#000000";
                ctx.fillRect(0, 0, test.width, test.height);
                if (type === "gradient-stroke") {
                  const gradient = ctx.createLinearGradient(0, 0, 128, 0);
                  gradient.addColorStop(0, colors[frame]!);
                  gradient.addColorStop(1, colors[frame]!);
                  ctx.strokeStyle = gradient;
                } else ctx.strokeStyle = colors[frame]!;
                ctx.lineWidth = test.stroke;
                ctx.lineCap = "square";
                ctx.lineJoin = join;
                ctx.miterLimit = 4;
                ctx.beginPath();
                ctx.moveTo(test.vertices[0]![0]!, test.vertices[0]![1]!);
                ctx.lineTo(test.vertices[1]![0]!, test.vertices[1]![1]!);
                ctx.stroke();
                const expected = ctx.getImageData(
                  0,
                  0,
                  test.width,
                  test.height,
                ).data;
                if (!expected.some((byte, i) => i % 4 === frame && byte > 0))
                  throw Error(
                    `${test.id}/${type}/${join}/${backend}/${frame}: oracle must have visible cap coverage`,
                  );
                preview.renderFrame(frame);
                const actual = preview.readPixels();
                if (actual.some((byte, i) => byte !== expected[i]))
                  throw Error(
                    `${test.id}/${type}/${join}/${backend}/${frame}: square-cap pixels differ from direct Canvas`,
                  );
              }
            } finally {
              preview.dispose();
            }
            reports.push({
              id: test.id,
              paint: type,
              join,
              backend,
              frames: 5,
            });
          }
        }
    return reports;
  });
}
