import assert from "node:assert/strict";
import type { Page } from "playwright";

export async function verifyTimingPixels(page: Page, root: string) {
  await page.evaluate("globalThis.__name = value => value");
  const result = await page.evaluate(async (root) => {
    const base = "/@fs/" + root + "/packages/";
    const { buildReusableDemo } = await import(
      base + "renderer-core/src/reusable-component-demo.ts"
    );
    const { ReusableDemoSchema } = await import(
      base + "scene-contract/src/reusable-component-demo.ts"
    );
    const { CommerceSceneSchema } = await import(
      base + "scene-contract/src/commerce.ts"
    );
    const { StorySceneSchema } = await import(
      base + "scene-contract/src/story.ts"
    );
    const { ComponentDataV3Schema } = await import(
      base + "scene-contract/src/component-data.ts"
    );
    const { compilePreparedScene } = await import(
      base + "renderer-core/src/prepared-scene.ts"
    );
    const { createIllustratedPreview, loadIllustratedImages } = await import(
      base + "renderer-core/src/illustrated-renderer.ts"
    );
    const { measureTextLayout } = await import(
      base + "renderer-core/src/text-layout.ts"
    );
    let samples = 0,
      maximumDifference = 0,
      fitChecks = 0;
    let worst: unknown;
    let flowChecks = 0,
      imageCutChecks = 0;
    const assetUrl = (id: string) =>
      "/commerce/assets/" +
      (
        {
          "product-image": "beauty-floating-product-v1.png",
          "commerce-font": "noto-sans-thai.ttf",
          house: "house.svg",
        } as Record<string, string>
      )[id];
    for (const mode of ["commerce", "story"]) {
      const source = buildReusableDemo(
        ReusableDemoSchema.parse({
          schemaVersion: "reusable-demo-3",
          example: "visibility",
          mode,
        }),
      );
      source.nodes = source.nodes.filter(
        (n: { id: string }) => !n.id.startsWith("timing__"),
      );
      source.componentData = ComponentDataV3Schema.parse({
        schemaVersion: "scene-components-3",
      });
      if (mode === "story") delete source.camera;
      const images = await loadIllustratedImages(
        compilePreparedScene(source),
        assetUrl,
      );
      for (const fps of [24, 30])
        for (const invert of [false, true])
          for (const alpha of [0.5, 1]) {
            const input = structuredClone(source);
            input.fps = fps;
            if (mode === "story")
              input.camera = {
                keys: [
                  { frame: 0, x: 950, y: 540, zoom: 1 },
                  { frame: input.frameCount - 1, x: 950, y: 540, zoom: 1 },
                ],
                depth: { "test-target": 0, "test-mask": 1 },
              };
            input.nodes.push(
              {
                id: "test-target",
                type: "group",
                x: 100,
                y: 740,
                width: 100,
                height: 100,
                origin: [0, 0],
              },
              {
                id: "test-fill",
                parent: "test-target",
                type: "rect",
                width: 100,
                height: 100,
                fill: "#F02040",
              },
              {
                id: "test-mask",
                type: "rect",
                x: 150,
                y: 740,
                width: 50,
                height: 100,
                opacity: alpha,
                fill: "#00BB99",
              },
            );
            input.componentData = ComponentDataV3Schema.parse({
              schemaVersion: "scene-components-3",
              visibility: [
                {
                  id: "target-show",
                  target: "test-target",
                  window: { start: 12, end: 60 },
                },
                {
                  id: "mask-show",
                  target: "test-mask",
                  window: { start: 24, end: 48 },
                },
              ],
              masks: [{ target: "test-target", mask: "test-mask", invert }],
            });
            if (mode === "commerce")
              input.effects = [
                { type: "motion-blur", shutterAngle: 180, samples: 4 },
              ];
            const parsed = (
              mode === "commerce" ? CommerceSceneSchema : StorySceneSchema
            ).parse(input);
            const canvas = document.createElement("canvas");
            const renderer = createIllustratedPreview(
              canvas,
              compilePreparedScene(parsed),
              images,
            );
            const reference = document.createElement("canvas");
            reference.width = reference.height = 120;
            const ctx = reference.getContext("2d")!;
            for (const frame of [60, 11, 12, 23, 24, 47, 48, 59, 24]) {
              renderer.renderFrame(frame);
              ctx.globalAlpha = 1;
              ctx.fillStyle = source.background;
              ctx.fillRect(0, 0, 120, 120);
              const targetOn = frame >= 12 && frame < 60,
                maskOn = frame >= 24 && frame < 48;
              if (targetOn) {
                ctx.fillStyle = "#F02040";
                ctx.globalAlpha = invert ? 1 : 0;
                const edge = mode === "story" ? 70 : 60;
                ctx.fillRect(10, 10, edge - 10, 100);
                ctx.globalAlpha = invert
                  ? 1 - (maskOn ? alpha : 0)
                  : maskOn
                    ? alpha
                    : 0;
                ctx.fillRect(edge, 10, 110 - edge, 100);
              }
              const expected = ctx.getImageData(0, 0, 120, 120).data;
              const actual = canvas
                .getContext("2d")!
                .getImageData(90, 730, 120, 120).data;
              for (let i = 0; i < expected.length; i++) {
                const difference = Math.abs(expected[i]! - actual[i]!);
                if (difference > maximumDifference) {
                  maximumDifference = difference;
                  worst = {
                    mode,
                    fps,
                    invert,
                    alpha,
                    frame,
                    x: Math.floor(i / 4) % 120,
                    y: Math.floor(i / 480),
                    expected: expected[i],
                    actual: actual[i],
                  };
                }
              }
              samples++;
            }
            renderer.dispose();
          }
      for (const invert of [false, true]) {
        const input = structuredClone(source);
        for (const [id, opaque] of [
          ["mask-clear", false],
          ["mask-solid", true],
        ] as const) {
          const pixels = document.createElement("canvas");
          pixels.width = pixels.height = 4;
          if (opaque) {
            pixels.getContext("2d")!.fillStyle = "#AA33EE";
            pixels.getContext("2d")!.fillRect(0, 0, 4, 4);
          }
          const image = new Image();
          image.src = pixels.toDataURL();
          await image.decode();
          images.set(id, image);
          input.assets.push({
            id,
            path: id + ".png",
            width: 4,
            height: 4,
            sha256: "sha256:" + "0".repeat(64),
          });
        }
        input.nodes.push(
          {
            id: "cut-target",
            type: "rect",
            x: 100,
            y: 740,
            width: 100,
            height: 100,
            fill: "#F02040",
          },
          {
            id: "cut-mask",
            type: "image",
            x: 100,
            y: 740,
            width: 100,
            height: 100,
            fit: "stretch",
            states: [{ asset: "mask-clear" }, { asset: "mask-solid" }],
          },
        );
        input.componentData = ComponentDataV3Schema.parse({
          schemaVersion: "scene-components-3",
          masks: [{ target: "cut-target", mask: "cut-mask", invert }],
          states: [
            {
              id: "alpha-change",
              target: "cut-mask",
              initial: 0,
              cuts: [{ id: "alpha-cut", frame: 24, state: 1 }],
            },
          ],
        });
        if (mode === "commerce")
          input.effects = [
            { type: "motion-blur", shutterAngle: 180, samples: 4 },
          ];
        const canvas = document.createElement("canvas");
        const renderer = createIllustratedPreview(
          canvas,
          compilePreparedScene(
            (mode === "commerce"
              ? CommerceSceneSchema
              : StorySceneSchema
            ).parse(input),
          ),
          images,
        );
        const reference = document.createElement("canvas").getContext("2d")!;
        for (const frame of [23, 24, 25, 0, 24]) {
          renderer.renderFrame(frame);
          reference.fillStyle =
            frame >= 24 !== invert ? "#F02040" : source.background;
          reference.fillRect(0, 0, 1, 1);
          const expected = reference.getImageData(0, 0, 1, 1).data,
            actual = canvas.getContext("2d")!.getImageData(150, 790, 1, 1).data;
          for (let i = 0; i < 4; i++)
            if (Math.abs(expected[i]! - actual[i]!) > 1)
              throw new Error(
                "Mask state leaked across cut: " +
                  JSON.stringify({
                    mode,
                    frame,
                    invert,
                    expected: [...expected],
                    actual: [...actual],
                  }),
              );
          imageCutChecks++;
        }
        renderer.dispose();
      }
      if (mode === "story") {
        const input = structuredClone(source);
        input.nodes.push(
          {
            id: "flow-path",
            type: "path",
            x: 100,
            y: 740,
            points: [
              [0, 0],
              [100, 0],
            ],
            opacity: 0,
            stroke: "#000000",
            lineWidth: 1,
          },
          {
            id: "flow-mask",
            type: "rect",
            x: 150,
            y: 720,
            width: 50,
            height: 40,
            fill: "#00FF00",
          },
        );
        input.flows = [
          {
            id: "flow",
            path: "flow-path",
            direction: 1,
            count: 1,
            shape: "dot",
            size: 3,
            color: "#F02040",
            window: { start: 0, end: input.frameCount },
            speed: [{ frame: 0, pxPerFrame: 2 }],
          },
        ];
        input.componentData = ComponentDataV3Schema.parse({
          schemaVersion: "scene-components-3",
          masks: [{ target: "flow-path", mask: "flow-mask" }],
          visibility: [
            {
              id: "flow-gate",
              target: "flow-path",
              window: { start: 24, end: 48 },
            },
          ],
        });
        const canvas = document.createElement("canvas");
        const renderer = createIllustratedPreview(
          canvas,
          compilePreparedScene(StorySceneSchema.parse(input)),
          images,
        );
        const reference = document.createElement("canvas").getContext("2d")!;
        for (const frame of [23, 30, 36, 47, 48, 60, 36]) {
          renderer.renderFrame(frame);
          const center = 100 + ((frame * 2) % 100);
          reference.fillStyle =
            frame >= 24 && frame < 48 && center >= 150
              ? "#F02040"
              : source.background;
          reference.fillRect(0, 0, 1, 1);
          const expected = reference.getImageData(0, 0, 1, 1).data,
            actual = canvas
              .getContext("2d")!
              .getImageData(center, 740, 1, 1).data;
          for (let i = 0; i < 4; i++)
            if (Math.abs(expected[i]! - actual[i]!) > 1)
              throw new Error("Flow escaped gate/mask at " + frame);
          flowChecks++;
        }
        renderer.dispose();
      }
      const fitSource = buildReusableDemo(
        ReusableDemoSchema.parse({
          schemaVersion: "reusable-demo-3",
          example: "text-fit",
          mode,
        }),
      );
      const fitImages = await loadIllustratedImages(
        compilePreparedScene(fitSource),
        assetUrl,
      );
      const fitted = createIllustratedPreview(
        document.createElement("canvas"),
        compilePreparedScene(fitSource),
        fitImages,
      );
      const node = fitSource.nodes.find(
        (n: { id: string }) => n.id === "timing__caption",
      )!;
      const size = fitted.resolvedTextSizes[node.id];
      const font = fitImages.fonts.get(node.fontAsset)!;
      const measure = document.createElement("canvas").getContext("2d")!;
      measure.font = `${font.weight} ${size}px "${font.family}"`;
      for (const text of node.states) {
        measureTextLayout(measure, { ...node, text, fontSize: size });
        fitChecks++;
      }
      if (size < fitSource.componentData.textFits[0].maxSize) {
        measure.font = `${font.weight} ${size + 1}px "${font.family}"`;
        let overflow = false;
        for (const text of node.states)
          try {
            measureTextLayout(measure, { ...node, text, fontSize: size + 1 });
          } catch {
            overflow = true;
          }
        if (!overflow)
          throw new Error("Text fit did not choose the largest fitting size");
      }
      fitted.dispose();
    }
    return {
      samples,
      maximumDifference,
      fitChecks,
      imageCutChecks,
      flowChecks,
      worst,
    };
  }, root);
  assert.ok(result.maximumDifference <= 1, JSON.stringify(result));
  return result;
}
