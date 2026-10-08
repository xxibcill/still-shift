import type { Page } from "playwright";
import type { Composition } from "@still-shift/scene-contract";
import type * as Render from "../../packages/renderer-core/src/index.ts";

/** Every supported decoded resource retains its displayed orientation and alpha. */
export async function depthBitmapAcceptance(page: Page) {
  return page.evaluate(async () => {
    const url = "/packages/renderer-core/src/index.ts",
      renderer: typeof Render = await import(url),
      reports = [];
    const asset = async (id: string, translucent = false) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 32;
      const context = canvas.getContext("2d")!,
        pixels = context.createImageData(32, 32);
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          const offset = (y * 32 + x) * 4;
          if (id === "depth") {
            const value = Math.round(((y * 2 + x) / 93) * 255);
            pixels.data.set([value, value, value, 255], offset);
          } else {
            const color =
              y < 16
                ? x < 16
                  ? [255, 0, 0]
                  : [0, 255, 0]
                : x < 16
                  ? [0, 0, 255]
                  : [255, 255, 0];
            const alpha = translucent
              ? x < 8
                ? 0
                : x < 16
                  ? 64
                  : y < 16
                    ? 128
                    : 224
              : 255;
            pixels.data.set([...color, alpha], offset);
          }
        }
      context.putImageData(pixels, 0, 0);
      const path = canvas.toDataURL("image/png"),
        bytes = await (await fetch(path)).arrayBuffer(),
        sha256 =
          "sha256:" +
          Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            (value) => value.toString(16).padStart(2, "0"),
          ).join("");
      canvas.width = canvas.height = 0;
      return {
        id,
        type: "image" as const,
        path,
        sha256,
        width: 32,
        height: 32,
      };
    };
    const keys = (first: number, last: number) => ({
      keys: [
        { frame: 0, value: first },
        { frame: 1, value: last },
      ],
    });
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const foreignWindow = iframe.contentWindow!,
      factories = [
        { realm: "current", create: createImageBitmap.bind(globalThis) },
        {
          realm: "iframe",
          create: foreignWindow.createImageBitmap.bind(foreignWindow),
        },
      ];
    try {
      for (const translucent of [false, true]) {
        const assets = [
            await asset("source", translucent),
            await asset("depth"),
          ],
          loaded = await renderer.loadCompositionResources(
            {
              schemaVersion: "composition-1",
              id: "bitmap-resources",
              width: 96,
              height: 64,
              fps: 30,
              frameCount: 2,
              assets,
              layers: [],
            },
            (id) => assets.find((item) => item.id === id)!.path,
          );
        for (const kind of ["image", "depth-image"] as const) {
          const transform = {
              anchor: [0, 0] as [number, number],
              position: [0, 0] as [number, number],
            },
            layer: Composition["layers"][number] =
              kind === "image"
                ? {
                    id: "photo",
                    type: kind,
                    size: [96, 64],
                    transform,
                    sources: [{ asset: "source" }],
                    fit: "stretch",
                    sampling: "linear-srgb",
                    plane: {
                      motion: {
                        scale: keys(0.97, 1.03),
                        offset: [0.015, -0.02],
                      },
                    },
                  }
                : {
                    id: "photo",
                    type: kind,
                    size: [96, 64],
                    transform,
                    sourceAsset: "source",
                    depth: {
                      asset: "depth",
                      encoding: "r8-unorm",
                      width: 32,
                      height: 32,
                    },
                    overscan: 0.1,
                    motion: {
                      strength: keys(0, 0.035),
                      offset: [0.025, -0.01],
                      roll: 0.12,
                    },
                  },
            doc: Composition = {
              schemaVersion: "composition-1",
              id: "bitmap-resources",
              width: 96,
              height: 64,
              fps: 30,
              frameCount: 2,
              background: "#10243b",
              assets,
              layers: [layer],
            },
            reference = renderer.createCompositionPreview(
              document.createElement("canvas"),
              doc,
              loaded,
              { backend: "webgl2" },
            ),
            expected: Uint8ClampedArray[] = [];
          try {
            for (const frame of [0, 1]) {
              reference.renderFrame(frame);
              expected.push(reference.readPixels());
            }
          } finally {
            reference.dispose();
          }
          for (const { realm, create } of factories) {
            for (const premultiplyAlpha of [
              "default",
              "none",
              "premultiply",
            ] as const) {
              const images = new Map(
                  await Promise.all(
                    Array.from(loaded.images, async ([id, image]) => {
                      const bitmap = await create(image as HTMLImageElement, {
                        premultiplyAlpha,
                      });
                      if (
                        bitmap instanceof ImageBitmap !==
                        (realm === "current")
                      ) {
                        bitmap.close();
                        throw Error(
                          `Bitmap fixture did not use the ${realm} realm`,
                        );
                      }
                      return [id, bitmap] as const;
                    }),
                  ),
                ),
                preview = renderer.createCompositionPreview(
                  document.createElement("canvas"),
                  doc,
                  { ...loaded, images },
                  { backend: "webgl2" },
                );
              let maxChannelDelta = 0;
              try {
                for (const frame of [0, 1, 0]) {
                  preview.renderFrame(frame);
                  const actual = preview.readPixels();
                  for (let index = 0; index < actual.length; index++)
                    maxChannelDelta = Math.max(
                      maxChannelDelta,
                      Math.abs(actual[index]! - expected[frame]![index]!),
                    );
                  if (maxChannelDelta !== 0)
                    throw Error(
                      `Bitmap ${kind}/${translucent ? "alpha" : "opaque"}/${realm}/${premultiplyAlpha} changed rendered pixels by ${maxChannelDelta}`,
                    );
                }
                reports.push({
                  kind,
                  translucent,
                  realm,
                  premultiplyAlpha,
                  frames: [0, 1, 0],
                  maxChannelDelta,
                });
              } finally {
                preview.dispose();
                for (const image of images.values()) image.close();
              }
            }
          }
        }
      }
      return reports;
    } finally {
      iframe.remove();
    }
  });
}
