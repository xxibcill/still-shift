import assert from "node:assert/strict";
import type { Page } from "playwright";

export async function verifyBehaviorPixels(page: Page, root: string) {
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
        schemaVersion: "reusable-demo-2",
        example: "state",
        mode: "commerce",
      }),
    );
    source.geometry = [];
    source.nodes = [];
    source.events = [];
    source.background = "#FFFFFF";
    const fonts = await loadPreparedFonts(
      source,
      () => "/commerce/assets/noto-sans-thai.ttf",
    );
    const images = Object.assign(new Map(), { fonts });
    for (const [id, color] of [
      ["red", "#FF0000"],
      ["blue", "#0000FF"],
    ]) {
      const canvas = document.createElement("canvas");
      canvas.width = 4;
      canvas.height = 4;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = color!;
      ctx.fillRect(0, 0, 4, 4);
      images.set(id, canvas);
    }
    source.assets = ["red", "blue"].map((id) => ({
      id,
      path: id + ".png",
      width: 4,
      height: 4,
      sha256: "sha256:" + "0".repeat(64),
    }));
    const render = (input: unknown, frame: number) => {
      const canvas = document.createElement("canvas");
      const renderer = createIllustratedPreview(
        canvas,
        compilePreparedScene(CommerceSceneSchema.parse(input)),
        images,
      );
      renderer.renderFrame(frame);
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, 400, 220).data;
      renderer.dispose();
      return pixels;
    };
    const difference = (
      actual: Uint8ClampedArray,
      references: Uint8ClampedArray[],
    ) => {
      let max = 0;
      for (let i = 0; i < actual.length; i++)
        max = Math.max(
          max,
          Math.abs(
            actual[i]! -
              Math.round(
                references.reduce((sum, pixels) => sum + pixels[i]!, 0) /
                  references.length,
              ),
          ),
        );
      return max;
    };
    source.nodes = [
      {
        type: "image",
        id: "image",
        x: 10,
        y: 10,
        width: 60,
        height: 60,
        states: [{ asset: "red" }, { asset: "blue" }],
      },
      {
        type: "text",
        id: "caption",
        x: 100,
        y: 10,
        width: 280,
        height: 60,
        text: "Before",
        states: ["Before", "After"],
        fontAsset: source.fonts[0].id,
        fontSize: 32,
        color: "#222222",
        textBox: { locale: "en", maxLines: 1, lineHeight: 1.25 },
      },
      {
        type: "rect",
        id: "moving",
        x: 10,
        y: 100,
        width: 30,
        height: 30,
        fill: "#227755",
      },
    ];
    source.events = [
      {
        node: "moving",
        property: "x",
        start: 0,
        end: 100,
        to: 210,
        easing: "linear",
      },
    ];
    source.componentData = {
      schemaVersion: "scene-components-2",
      states: ["image", "caption"].map((target) => ({
        id: target,
        target,
        initial: 0,
        cuts: [{ id: target + "-change", frame: 20, state: 1 }],
      })),
    };
    source.effects = [{ type: "motion-blur", samples: 4, shutterAngle: 360 }];
    let stateMaximum = 0;
    for (const fps of [24, 30]) {
      source.fps = fps;
      source.frameCount = fps * 8;
      for (const frame of [21, 0, 19, 20, 19, 20]) {
        const references = [-0.375, -0.125, 0.125, 0.375].map((offset) => {
          const input = structuredClone(source);
          delete input.componentData;
          input.effects = [];
          input.events = [];
          const index = frame < 20 ? 0 : 1;
          input.nodes[0].states = [input.nodes[0].states[index]];
          input.nodes[1].text = input.nodes[1].states[index];
          delete input.nodes[1].states;
          const sample = Math.max(
            frame < 20 ? 0 : 20,
            Math.min(
              frame < 20 ? 20 - 1e-7 : source.frameCount - 1,
              frame + offset,
            ),
          );
          input.nodes[2].x = 10 + sample * 2;
          return render(input, frame);
        });
        stateMaximum = Math.max(
          stateMaximum,
          difference(render(source, frame), references),
        );
      }
    }
    const { ComponentDefinitionSchema } = await import(
      base + "scene-contract/src/components.ts"
    );
    const { repeatComponent, addCommerceComponents } = await import(
      base + "renderer-core/src/component-instances.ts"
    );
    const definition = ComponentDefinitionSchema.parse({
      schemaVersion: "component-2",
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      exports: { image: "image" },
      nodes: [
        { type: "group", id: "root", width: 100, height: 100 },
        {
          type: "image",
          id: "image",
          parent: "root",
          x: 10,
          y: 10,
          width: 40,
          height: 40,
          states: [{ asset: "red" }, { asset: "blue" }],
        },
        {
          type: "path",
          id: "path",
          parent: "root",
          points: [
            [10, 80],
            [90, 80],
          ],
          lineWidth: 2,
          stroke: "#777777",
        },
        {
          type: "rect",
          id: "dot",
          parent: "root",
          width: 10,
          height: 10,
          fill: "#227755",
        },
      ],
      motions: [
        {
          id: "grow",
          node: "root",
          property: "scale",
          to: 1.1,
          window: { start: 10, end: 30 },
        },
      ],
      componentData: {
        schemaVersion: "scene-components-2",
        states: [
          {
            id: "image",
            target: "image",
            initial: 0,
            cuts: [{ id: "change", frame: 20, state: 1 }],
          },
        ],
        travels: [
          {
            id: "journey",
            target: "dot",
            path: "path",
            from: 0,
            to: 1,
            window: { start: 10, end: 30 },
          },
        ],
      },
    });
    const host = CommerceSceneSchema.parse({
      ...source,
      nodes: [
        {
          id: "host",
          type: "rect",
          width: 1,
          height: 1,
          opacity: 0,
          fill: "#FFFFFF",
        },
      ],
      events: [],
      effects: [],
      componentData: undefined,
    });
    const copies = repeatComponent(host, definition, {
      ids: ["a", "b", "c"],
      offsets: [
        [20, 20],
        [145, 20],
        [270, 20],
      ],
    });
    const before = render(addCommerceComponents(host, copies), 22);
    copies[1].componentData.states[0].cuts[0].frame = 24;
    copies[1].componentData.travels[0].window = {
      start: 20,
      end: 40,
      easing: "linear",
      cue: "b__journey",
    };
    copies[1].motions[0].to = 1.3;
    const after = render(addCommerceComponents(host, copies), 22);
    let unchangedInstanceMaximum = 0,
      editedInstancePixels = 0;
    for (let i = 0; i < before.length; i += 4) {
      const x = (i / 4) % 400;
      for (let channel = 0; channel < 4; channel++) {
        const diff = Math.abs(before[i + channel]! - after[i + channel]!);
        if (x < 140 || x >= 265)
          unchangedInstanceMaximum = Math.max(unchangedInstanceMaximum, diff);
        else if (diff) editedInstancePixels++;
      }
    }
    source.effects = [];
    source.nodes = [
      {
        type: "group",
        id: "plane",
        x: 250,
        y: 20,
        width: 100,
        height: 100,
        rotation: 90,
        origin: [0, 0],
      },
      {
        type: "path",
        id: "path",
        parent: "plane",
        points: [
          [0, 0],
          [80, 0],
          [80, 40],
        ],
        stroke: "#999999",
        lineWidth: 2,
      },
      {
        type: "group",
        id: "parent",
        x: 20,
        y: 10,
        width: 1,
        height: 1,
        rotation: -90,
        origin: [0, 0],
      },
      {
        type: "rect",
        id: "marker",
        parent: "parent",
        width: 16,
        height: 12,
        origin: [0.25, 0.75],
        rotation: 25,
        fill: "#FF0000",
      },
    ];
    source.events = [
      ...["scaleX", "scaleY"].map((property) => ({
        node: "plane",
        property,
        start: 10,
        end: 30,
        to: 2,
        easing: "linear",
      })),
      ...["scaleX", "scaleY"].map((property) => ({
        node: "parent",
        property,
        start: 0,
        end: 1,
        from: 0.5,
        to: 0.5,
        easing: "linear",
      })),
    ];
    source.componentData = {
      schemaVersion: "scene-components-2",
      travels: [
        {
          id: "journey",
          target: "marker",
          path: "path",
          from: 0,
          to: 1,
          window: { start: 10, end: 30, easing: "linear" },
        },
      ],
    };
    let travelMaximum = 0;
    for (const fps of [24, 30])
      for (const reverse of [false, true]) {
        source.fps = fps;
        source.frameCount = fps * 8;
        Object.assign(source.componentData.travels[0], {
          from: reverse ? 1 : 0,
          to: reverse ? 0 : 1,
        });
        for (const frame of [31, 0, 9, 10, 20, 30, 20]) {
          const input = structuredClone(source);
          delete input.componentData;
          const p = Math.max(0, Math.min(1, (frame - 10) / 20));
          const distance = (reverse ? 1 - p : p) * 120;
          const canvasX = 250 - Math.max(0, distance - 80) * (1 + p),
            canvasY = 20 + Math.min(80, distance) * (1 + p);
          input.nodes[3].x = (10 - canvasY) * 2 - 4;
          input.nodes[3].y = (canvasX - 20) * 2 - 9;
          travelMaximum = Math.max(
            travelMaximum,
            difference(render(source, frame), [render(input, frame)]),
          );
        }
      }
    return {
      stateMaximum,
      stateSamples: 12,
      travelMaximum,
      travelSamples: 28,
      unchangedInstanceMaximum,
      editedInstancePixels,
    };
  }, root);
  assert.ok(
    result.stateMaximum <= 1,
    "State cut exposure: " + JSON.stringify(result),
  );
  assert.equal(
    result.travelMaximum,
    0,
    "Transformed path pixels must match independently placed markers",
  );
  assert.equal(
    result.unchangedInstanceMaximum,
    0,
    "Editing the middle copy must leave both neighbors pixel-identical",
  );
  assert.ok(result.editedInstancePixels > 0);
  return result;
}
