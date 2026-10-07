import type {
  Composition,
  CompositionTransform,
} from "@still-shift/scene-contract";
import type { Page } from "playwright";
import type * as Render from "../../packages/renderer-core/src/index.ts";

/** A coplanar coordinate guide must paint the same sweep as the owner's own coordinates. */
export async function cameraEffectSpaceAcceptance(page: Page) {
  return page.evaluate(async () => {
    const url = "/packages/renderer-core/src/index.ts";
    const m = (await import(url)) as typeof Render;
    const reports = [];
    for (const name of [
      "affine",
      "compound",
      "perspective",
      "inherited",
      "nested",
    ])
      for (const backend of name === "affine" || name === "nested"
        ? (["canvas2d", "webgl2"] as const)
        : (["webgl2"] as const)) {
        const results: Uint8ClampedArray[][] = [];
        for (const guided of [false, true]) {
          const inherited = name === "inherited";
          const transform: CompositionTransform = {
            anchor: [0, 0, 0],
            position:
              name === "affine" || name === "nested"
                ? [40, 40, 100]
                : [40, 40, 0],
            ...(name === "perspective" ? { rotationY: 25 } : {}),
            ...(name === "compound"
              ? { rotationX: 25, rotationY: 30, rotation: 20 }
              : {}),
          };
          if (inherited) {
            transform.anchor = [0, 0];
            transform.position = [0, 0];
          }
          const doc: Composition = {
            schemaVersion: "composition-1",
            id: "effect-space",
            width: 100,
            height: 100,
            fps: 24,
            frameCount: 24,
            assets: [],
            layers: [
              { id: "camera", type: "camera" },
              {
                id: "owner",
                type: "solid",
                threeD: true,
                size: [20, 20],
                color: "#203040",
                transform,
                ...(inherited ? { parent: "pivot" } : {}),
                effects: [
                  {
                    id: "sweep",
                    effect: "light.sweep",
                    ...(guided ? { space: "source" } : {}),
                    params: {
                      width: 20,
                      height: 20,
                      strength: 0.8,
                      progress: {
                        keys: [
                          { frame: 0, value: 0.1 },
                          { frame: 23, value: 0.9, interpolation: "linear" },
                        ],
                      },
                    },
                  },
                ],
              },
              name === "compound"
                ? {
                    id: "source",
                    type: "solid",
                    threeD: true,
                    size: [20, 20],
                    color: "#ffffff",
                    transform,
                    enabled: false,
                  }
                : {
                    id: "source",
                    type: "null",
                    threeD: !inherited,
                    transform,
                    enabled: false,
                    guide: true,
                    ...(inherited ? { parent: "pivot" } : {}),
                  },
            ],
          };
          if (inherited)
            doc.layers.push({
              id: "pivot",
              type: "null",
              threeD: true,
              transform: { position: [50, 50, 50], rotationY: 25 },
            });
          if (name === "nested") {
            doc.layers[0]!.transform = { position: [50, 50, -200] };
            doc.precomps = [
              {
                id: "inner",
                width: 100,
                height: 100,
                frameCount: 24,
                layers: doc.layers,
              },
            ];
            doc.layers = [
              {
                id: "camera",
                type: "camera",
                zoom: 200,
                transform: { position: [50, 50, -50] },
              },
              {
                id: "instance",
                type: "precomp",
                comp: "inner",
                transform: { anchor: [0, 0], position: [0, 0] },
              },
            ];
          }
          const preview = m.createCompositionPreview(
            document.createElement("canvas"),
            doc,
            { images: new Map(), fonts: new Map() },
            { backend },
          );
          const pixels = [];
          try {
            for (const frame of [0, 5, 23, 0]) {
              preview.renderFrame(frame);
              pixels.push(preview.readPixels().slice());
            }
          } finally {
            preview.dispose();
          }
          results.push(pixels);
        }
        if (
          !results[0]!.some((pixels) =>
            pixels.some((value, index) => index % 4 === 0 && value > 32),
          )
        )
          throw Error(`${name}/${backend}: sweep control did not paint`);
        for (const [index, frame] of [0, 5, 23, 0].entries()) {
          const control = results[0]![index]!,
            actual = results[1]![index]!;
          const metrics = m.compareFrames(control, actual, 100, 100);
          if (metrics.maxChannelDelta > 1)
            throw Error(
              `${name}/${backend}/${frame}: guide changed sweep ${JSON.stringify(metrics)}`,
            );
          reports.push({ name, backend, frame, metrics });
        }
        if (
          m.compareFrames(results[1]![0]!, results[1]![3]!, 100, 100)
            .maxChannelDelta
        )
          throw Error(`${name}/${backend}: reverse seek changed pixels`);
      }
    return reports;
  });
}
