import { describe, expect, it } from "vitest";
import {
  isPropertyPathError,
  locateShapeProperty,
  parsePropertyPath,
  ShapeLayerSchema,
  SHAPE_LIMITS,
  type ShapeContent,
} from "@still-shift/scene-contract";

const contents: ShapeContent[] = [
  {
    id: "outer",
    type: "group",
    contents: [
      {
        id: "rect",
        type: "rect",
        size: {
          x: {
            keys: [
              { frame: 0, value: 10 },
              { frame: 12, value: 40 },
            ],
          },
          y: 20,
        },
      },
      {
        id: "paint",
        type: "gradient-fill",
        gradient: "linear",
        start: [0, 0],
        end: [100, 0],
        stops: [
          { id: "start", offset: 0, color: "#ff0000" },
          {
            id: "end",
            offset: 1,
            color: {
              keys: [
                { frame: 0, value: "#0000ff" },
                { frame: 12, value: "#00ff00" },
              ],
            },
          },
        ],
      },
    ],
  },
];
const layer = (values: unknown) => ({
  id: "art",
  type: "shape",
  contents: values,
});
const locate = (path: string) => {
  const parsed = parsePropertyPath(`art.${path}`);
  if (isPropertyPathError(parsed)) throw new Error(parsed.message);
  return locateShapeProperty(contents, parsed.segments);
};

describe("native shape contract", () => {
  it("retains authored nested curves, stop IDs and opaque metadata", () => {
    const input = layer(contents);
    const parsed = ShapeLayerSchema.parse(input);
    expect(parsed).toEqual(input);
    expect(
      ShapeLayerSchema.parse(
        layer([
          {
            id: "p",
            type: "ellipse",
            size: [0, 0],
            metadata: { future: { keys: ["opaque"] } },
          },
        ]),
      ),
    ).toEqual(
      layer([
        {
          id: "p",
          type: "ellipse",
          size: [0, 0],
          metadata: { future: { keys: ["opaque"] } },
        },
      ]),
    );
  });

  it("rejects 3D vectors, unknown paint fields and negative dimensions", () => {
    for (const content of [
      { id: "p", type: "rect", size: [10, 20, 30] },
      { id: "p", type: "rect", size: [-1, 20] },
      {
        id: "p",
        type: "group",
        transform: { position: { x: 0, y: 0, z: 0 } },
        contents: [],
      },
      { id: "p", type: "fill", color: "#ffffff", shader: "custom" },
    ])
      expect(ShapeLayerSchema.safeParse(layer([content])).success).toBe(false);
  });

  it("IDs are unique per sibling collection and per gradient", () => {
    const rect = { id: "same", type: "rect", size: [10, 20] };
    expect(ShapeLayerSchema.safeParse(layer([rect, rect])).success).toBe(false);
    const groups = ["a", "b"].map((id) => ({
      id,
      type: "group",
      contents: [rect],
    }));
    expect(ShapeLayerSchema.safeParse(layer(groups)).success).toBe(true);
    const gradient = {
      id: "g",
      type: "gradient-fill",
      gradient: "radial",
      start: [0, 0],
      end: [10, 0],
      stops: [
        { id: "a", offset: 0, color: "#ffffff" },
        { id: "a", offset: 1, color: "#000000" },
      ],
    };
    expect(ShapeLayerSchema.safeParse(layer([gradient])).success).toBe(false);
  });

  it("bounds total contents and nesting before native geometry work", () => {
    let nested: unknown = { id: "p", type: "ellipse", size: [1, 1] };
    for (let i = 0; i < SHAPE_LIMITS.depth; i++)
      nested = { id: "g", type: "group", contents: [nested] };
    const result = ShapeLayerSchema.safeParse(layer([nested]));
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("content or group-depth budget"),
        ),
      ).toBe(true);
    const branches = ["a", "b"].map((id) => ({
      id,
      type: "group",
      contents: Array.from({ length: 128 }, (_, i) => ({
        id: `p${i}`,
        type: "ellipse",
        size: [1, 1],
      })),
    }));
    expect(ShapeLayerSchema.safeParse(layer(branches)).success).toBe(false);
  });

  it("resolves stable nested IDs, components, defaults and emitted array indices", () => {
    const rectangle = locate("contents[outer].contents[rect].size.x");
    expect(rectangle).toMatchObject({
      key: "size",
      type: "scalar",
      component: 0,
      jsonPath: ["contents", 0, "contents", 0, "size", "x"],
    });
    expect(rectangle?.owner).toBe(
      contents[0]!.type === "group" ? contents[0]!.contents[0] : undefined,
    );
    expect(locate("contents[outer].transform.scale.y")).toMatchObject({
      type: "scalar",
      component: 1,
      descriptor: { default: [1, 1] },
    });
    expect(
      locate("contents[outer].contents[paint].stops[end].color.a"),
    ).toMatchObject({
      type: "scalar",
      component: 3,
      jsonPath: ["contents", 0, "contents", 1, "stops", 1, "color", "a"],
    });
  });

  it("never exposes metadata, missing IDs or unsupported vector axes", () => {
    for (const path of [
      "contents[missing].size",
      "contents[outer].contents[rect].size.z",
      "contents[outer].metadata.keys",
      "contents[outer].contents[rect].constructor",
      "contents[outer].contents[rect].toString",
      "contents[outer].contents[paint].stops[missing].color",
      "contents[outer].contents[paint].stops[end].id",
      "contents[outer].contents[rect].size.x.extra",
    ])
      expect(locate(path)).toBeUndefined();
  });
});
