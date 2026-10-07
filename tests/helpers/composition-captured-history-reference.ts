import {
  createCompositionPreview,
  registerCompositionEffect,
} from "../../packages/renderer-core/src/index.ts";
import {
  defineCompositionEffect,
  type Composition,
  type CompositionLayer,
} from "../../packages/scene-contract/src/index.ts";
export function checkCapturedHistoryPixels() {
  const release = registerCompositionEffect({
    id: "test.history-input",
    definition: defineCompositionEffect({
      version: "1.0.0",
      properties: {},
      requiresLayers: ["map"],
    }),
    renderGpu: (ctx) => ctx.layers.get("map")!,
    renderCanvas: (ctx) => ctx.layers!.get("map")!,
  });
  const rows = [];
  try {
    for (const source of ["group", "precomp", "collapsed"] as const)
      for (const binding of ["input", "matte"] as const)
        for (const enabled of [false, true]) {
          const children: CompositionLayer[] = [
            {
              id: "adjust",
              type: "adjustment",
              effects: [
                {
                  id: "trail",
                  effect: "time.echo",
                  params: { count: 2, spacing: 2, decay: 0.5 },
                },
              ],
            },
            {
              id: "art",
              type: "solid",
              size: [4, 8],
              color: "#ffffff",
              transform: {
                anchor: [0, 0],
                position: {
                  x: {
                    keys: [
                      { frame: 0, value: 0, interpolation: "linear" },
                      { frame: 11, value: 44, interpolation: "linear" },
                    ],
                  },
                  y: 8,
                },
              },
            },
          ];
          const owner: CompositionLayer = {
            id: "owner",
            type: "solid",
            size: [64, 32],
            color: binding === "matte" ? "#00ff00" : "#ffffff",
            inPoint: 8,
            transform: { anchor: [0, 0] },
          };
          if (binding === "input")
            owner.effects = [
              {
                id: "source",
                effect: "test.history-input",
                inputs: { map: "source" },
              },
            ];
          else owner.trackMatte = { layer: "source", mode: "alpha" };
          const comp: Composition = {
            schemaVersion: "composition-1",
            id: "capture-history",
            width: 64,
            height: 32,
            fps: 24,
            frameCount: 12,
            background: "#000000",
            assets: [],
            layers: [owner],
          };
          if (source === "group")
            comp.layers.push(
              ...children.map((layer) => ({ ...layer, parent: "source" })),
              {
                id: "source",
                type: "group",
                enabled,
                size: [64, 32],
                transform: { anchor: [0, 0] },
              },
            );
          else {
            comp.layers.push({
              id: "source",
              type: "precomp",
              comp: "child",
              timeRemap: 8,
              collapseTransforms: source === "collapsed",
              enabled,
              transform: { anchor: [0, 0] },
            });
            comp.precomps = [
              {
                id: "child",
                width: 64,
                height: 32,
                frameCount: 12,
                layers: children,
              },
            ];
          }
          for (const backend of ["canvas2d", "webgl2"] as const) {
            const preview = createCompositionPreview(
              document.createElement("canvas"),
              comp,
              { images: new Map(), fonts: new Map() },
              { backend },
            );
            try {
              preview.renderFrame(8);
              const bytes = preview.readPixels();
              const pixels = [16, 24, 32, 40].map((x) =>
                Array.from(
                  bytes.slice((12 * 64 + x) * 4, (12 * 64 + x) * 4 + 4),
                ),
              );
              const expected = (
                enabled && binding === "input" && source === "precomp"
                  ? [112, 192, 255, 0]
                  : [64, 128, 255, 0]
              ).map((value) =>
                binding === "input"
                  ? [value, value, value, 255]
                  : [0, value, 0, 255],
              );
              if (JSON.stringify(pixels) !== JSON.stringify(expected))
                throw Error(
                  `Captured echo ${source}/${binding}/${backend}: ${JSON.stringify(pixels)}`,
                );
              const stored = new Uint8ClampedArray(bytes);
              for (const frame of [11, 0, 8]) preview.renderFrame(frame);
              if (!preview.readPixels().every((byte, i) => byte === stored[i]))
                throw Error("Captured echo seek differs");
              rows.push({ source, binding, enabled, backend, pixels });
            } finally {
              preview.dispose();
            }
          }
        }
  } finally {
    release();
  }
  return rows;
}
