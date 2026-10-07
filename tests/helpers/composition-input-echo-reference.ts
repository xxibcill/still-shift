import {
  createCompositionPreview,
  registerCompositionEffect,
} from "../../packages/renderer-core/src/index.ts";
import {
  defineCompositionEffect,
  type Composition,
} from "../../packages/scene-contract/src/index.ts";
import {
  inputEchoComposition,
  inputEchoEffects,
  type InputEchoSourceKind,
} from "./composition-input-echo-fixture.ts";

/** Independent coverage pixels for captured source echoes at local frames 4/6/8. */
export function checkCapturedSourceEchoPixels() {
  const release = registerCompositionEffect({
    id: "test.echo-input",
    definition: defineCompositionEffect({
      version: "1.0.0",
      properties: {},
      requiresLayers: ["map"],
    }),
    renderGpu: (context) => context.layers.get("map")!,
    renderCanvas: (context) => context.layers!.get("map")!,
  });
  const rows = [];
  try {
    const kinds: InputEchoSourceKind[] = [
      "solid",
      "group",
      "precomp",
      "collapsed",
    ];
    for (const kind of kinds)
      for (const nested of [false, true])
        for (const inPoint of [0, 5])
          for (const childEcho of kind === "group" ? [false, true] : [false]) {
            let comp = inputEchoComposition(kind);
            comp.background = "#000000";
            comp.layers[0]!.effects![0]!.effect = "test.echo-input";
            const source = comp.layers.find((layer) => layer.id === "source")!;
            source.inPoint = inPoint;
            if (childEcho) {
              source.effects = [];
              comp.layers.find((layer) => layer.id === "art")!.effects =
                inputEchoEffects();
            }
            if (nested) {
              const local: Composition = comp;
              comp = {
                ...local,
                id: "nested-input-echo",
                layers: [
                  {
                    id: "wrapper",
                    type: "precomp",
                    comp: "scope",
                    timeRemap: 8,
                    transform: { anchor: [0, 0] },
                  },
                ],
                precomps: [
                  {
                    id: "scope",
                    width: local.width,
                    height: local.height,
                    frameCount: local.frameCount,
                    layers: local.layers,
                  },
                  ...(local.precomps ?? []),
                ],
              };
            }
            const frame = nested ? 3 : 8,
              expected = [inPoint ? 0 : 64, 128, 255, 0].map((value) => [
                value,
                value,
                value,
                255,
              ]);
            for (const backend of ["canvas2d", "webgl2"] as const) {
              const preview = createCompositionPreview(
                document.createElement("canvas"),
                comp,
                { images: new Map(), fonts: new Map() },
                { backend },
              );
              try {
                preview.renderFrame(frame);
                const bytes = preview.readPixels(),
                  pixels = [16, 24, 32, 40].map((x) =>
                    Array.from(
                      bytes.slice((12 * 64 + x) * 4, (12 * 64 + x) * 4 + 4),
                    ),
                  );
                if (JSON.stringify(pixels) !== JSON.stringify(expected))
                  throw Error(
                    `Captured source echo ${kind}/${nested}/${inPoint}/${childEcho}/${backend}: ${JSON.stringify(pixels)}`,
                  );
                const stored = new Uint8ClampedArray(bytes);
                for (const seek of [11, 0, frame]) preview.renderFrame(seek);
                if (
                  !preview
                    .readPixels()
                    .every((byte, index) => byte === stored[index])
                )
                  throw Error("Captured source echo seek changes pixels");
                rows.push({
                  kind,
                  nested,
                  inPoint,
                  childEcho,
                  backend,
                  pixels,
                });
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
