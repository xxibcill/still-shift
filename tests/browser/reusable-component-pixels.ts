import assert from "node:assert/strict";
import type { Page } from "playwright";

export async function verifyReusableExposure(page: Page, root: string) {
  await page.evaluate("globalThis.__name = value => value");
  const result = await page.evaluate(async (root) => {
    const base = "/@fs/" + root + "/packages/";
    const { buildReusableDemo } = await import(
      base + "renderer-core/src/reusable-component-demo.ts"
    );
    const { ReusableDemoSchema } = await import(
      base + "scene-contract/src/reusable-component-demo.ts"
    );
    const { compilePreparedScene } = await import(
      base + "renderer-core/src/prepared-scene.ts"
    );
    const { createIllustratedPreview } = await import(
      base + "renderer-core/src/illustrated-renderer.ts"
    );
    const { loadPreparedFonts } = await import(
      base + "renderer-core/src/prepared-fonts.ts"
    );
    const source = buildReusableDemo(
      ReusableDemoSchema.parse({
        schemaVersion: "reusable-demo-1",
        example: "value",
        from: 0,
        to: 100,
      }),
    );
    source.width = 400;
    source.height = 120;
    source.nodes = source.nodes.filter(
      (n: { id: string }) => n.id === "quantity__number",
    );
    Object.assign(source.nodes[0], { x: 20, y: 20, width: 360, height: 80 });
    source.events = [];
    source.geometry = [];
    source.assets = [];
    source.componentData.values[0].window = {
      start: 10,
      end: 12,
      easing: "linear",
    };
    source.componentData.bindings = source.componentData.bindings.filter(
      (b: { kind: string }) => b.kind === "text",
    );
    const fonts = await loadPreparedFonts(
      source,
      () => "/commerce/assets/noto-sans-thai.ttf",
    );
    const render = (text?: string) => {
      const input = structuredClone(source);
      if (text !== undefined) {
        delete input.componentData;
        input.nodes[0].text = text;
        input.effects = [];
      } else
        input.effects = [
          { type: "motion-blur", samples: 4, shutterAngle: 360 },
        ];
      const canvas = document.createElement("canvas"),
        renderer = createIllustratedPreview(
          canvas,
          compilePreparedScene(input),
          Object.assign(new Map(), { fonts }),
        );
      renderer.renderFrame(11);
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, 400, 120).data;
      renderer.dispose();
      return pixels;
    };
    const actual = render(),
      references = ["31 units", "44 units", "56 units", "69 units"].map(
        (text) => render(text),
      );
    let maximum = 0;
    for (let i = 0; i < actual.length; i++)
      maximum = Math.max(
        maximum,
        Math.abs(
          actual[i]! -
            Math.round(
              references.reduce((sum, pixels) => sum + pixels[i]!, 0) / 4,
            ),
        ),
      );
    return { maximum };
  }, root);
  assert.ok(
    result.maximum <= 1,
    "Numeric text exposure must average fractional samples: " +
      JSON.stringify(result),
  );
  return result;
}
