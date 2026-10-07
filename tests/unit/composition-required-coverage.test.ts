import { expect, it } from "vitest";
import { uncoveredViewportPixel } from "../../packages/renderer-core/src/composition/render/required-coverage.ts";
it("uses the shared camera-cover alpha threshold and catches interior holes", () => {
  const pixels = new Uint8ClampedArray(4 * 4 * 4).fill(255);
  pixels[(2 * 4 + 2) * 4 + 3] = 254;
  expect(uncoveredViewportPixel(pixels, 4, 4)).toBeNull();
  pixels[(2 * 4 + 2) * 4 + 3] = 253;
  expect(uncoveredViewportPixel(pixels, 4, 4)).toEqual([2, 2]);
  expect(() => uncoveredViewportPixel(pixels, 5, 4)).toThrow("owning scope");
});

it("keeps ancestor group masks, mattes and effects while isolating the required child", async () => {
  const { CompositionSchema } = await import("@still-shift/scene-contract"),
    { evaluateComp } = await import(
      "../../packages/renderer-core/src/composition/evaluate/evaluate.ts"
    ),
    { buildLayerRenderGraph } = await import(
      "../../packages/renderer-core/src/composition/render/graph.ts"
    );
  const comp = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "ancestor-coverage",
    width: 100,
    height: 100,
    fps: 24,
    frameCount: 2,
    assets: [],
    layers: [
      {
        id: "group",
        type: "group",
        size: [100, 100],
        transform: { anchor: [0, 0] },
        masks: [
          {
            id: "hole",
            mode: "subtract",
            path: {
              closed: true,
              vertices: [
                [40, 40],
                [60, 40],
                [60, 60],
                [40, 60],
              ],
            },
          },
        ],
        effects: [
          {
            id: "wipe",
            effect: "transition.linear-wipe",
            params: { progress: 0.5 },
          },
        ],
        trackMatte: { layer: "matte", mode: "alpha" },
      },
      {
        id: "cover",
        type: "solid",
        size: [100, 100],
        color: "#ffffff",
        coverage: "required",
        parent: "group",
        transform: { anchor: [0, 0] },
      },
      {
        id: "sibling",
        type: "solid",
        size: [100, 100],
        color: "#ffffff",
        parent: "group",
        transform: { anchor: [0, 0] },
      },
      {
        id: "matte",
        type: "group",
        size: [100, 100],
        enabled: false,
        transform: { anchor: [0, 0] },
      },
      {
        id: "matte-art",
        type: "solid",
        size: [100, 100],
        color: "#ffffff",
        parent: "matte",
        transform: { anchor: [0, 0] },
      },
    ],
  });
  const group = buildLayerRenderGraph(
    comp,
    evaluateComp(comp, 0),
    comp,
    "cover",
    "",
  ).root.ops[0]!;
  expect(group.kind).toBe("isolate");
  if (group.kind !== "isolate")
    throw Error("Expected ancestor group processing");
  expect(group.ops.map((op) => op.layer)).toEqual(["cover"]);
  expect(group.masks.map((mask) => mask.id)).toEqual(["hole"]);
  expect(group.effects.map((effect) => effect.effect)).toEqual([
    "transition.linear-wipe",
  ]);
  expect(group.matte!.ops.map((op) => op.layer)).toEqual(["matte-art"]);
});

it.each(["out-point", "opacity"])(
  "keeps ancestor echo coverage when the current child is hidden by %s",
  async (mode) => {
    const { CompositionSchema } = await import("@still-shift/scene-contract"),
      { evaluateComp } = await import(
        "../../packages/renderer-core/src/composition/evaluate/evaluate.ts"
      ),
      { buildLayerRenderGraph } = await import(
        "../../packages/renderer-core/src/composition/render/graph.ts"
      );
    const comp = CompositionSchema.parse({
      schemaVersion: "composition-1",
      id: "ancestor-history",
      width: 100,
      height: 100,
      fps: 24,
      frameCount: 2,
      assets: [],
      layers: [
        {
          id: "group",
          type: "group",
          size: [100, 100],
          transform: { anchor: [0, 0] },
          effects: [
            {
              id: "history",
              effect: "time.echo",
              params: { count: 1, spacing: 1, decay: 1 },
            },
          ],
        },
        {
          id: "cover",
          type: "solid",
          size: [100, 100],
          color: "#ffffff",
          coverage: "required",
          parent: "group",
          ...(mode === "out-point" ? { outPoint: 1 } : {}),
          transform: {
            anchor: [0, 0],
            ...(mode === "opacity"
              ? {
                  opacity: {
                    keys: [
                      { frame: 0, value: 1 },
                      { frame: 1, value: 0 },
                    ],
                  },
                }
              : {}),
          },
        },
      ],
    });
    const group = buildLayerRenderGraph(
      comp,
      evaluateComp(comp, 1),
      comp,
      "cover",
      "",
    ).root.ops[0];
    expect(group?.kind).toBe("isolate");
    if (group?.kind !== "isolate") throw Error("Expected ancestor history");
    expect(group.ops.some((op) => op.layer === "cover")).toBe(true);
  },
);
