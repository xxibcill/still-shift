import { describe, expect, it } from "vitest";
import {
  comp,
  shape,
  par,
  presets,
  builderSource,
  solid,
} from "@still-shift/motion";
import {
  evaluateComp,
  evaluateProperty,
  bakeExpressions,
} from "@still-shift/renderer-core";
import {
  compositionTracks,
  sampleTrack,
} from "../../apps/lab/src/composition-keys.ts";
import {
  validateComposition,
  type Composition,
  type BezierPath,
} from "@still-shift/scene-contract";

const options = { width: 200, height: 100, fps: 24 as const, frames: 48 };
const path: BezierPath = {
  closed: false,
  vertices: [
    [0, 0],
    [100, 0],
  ],
};
const rect = {
  id: "rect",
  type: "rect" as const,
  size: [20, 10] as [number, number],
};
const fill = { id: "fill", type: "fill" as const, color: "#ff0000" };
function authored(): Composition {
  return comp(options, (c) => {
    const n = c.add(
      shape.native("shape", {
        contents: [
          {
            id: "g",
            type: "group",
            contents: [
              rect,
              {
                id: "gradient",
                type: "gradient-fill",
                gradient: "linear",
                start: [0, 0],
                end: [20, 0],
                stops: [
                  { id: "a", offset: 0, color: "#000000" },
                  { id: "b", offset: 1, color: "#ffffff" },
                ],
              },
            ],
          },
        ],
      }),
    );
    c.timeline(
      par(
        n.property<number>("contents[g].contents[rect].position.x").to(10, 12),
        n.property<number>("contents[g].transform.opacity").to(0.5, 12),
        n
          .property<string>("contents[g].contents[gradient].stops[a].color")
          .from("#000000")
          .to("#ff0000", 12),
        n
          .property<number>("contents[g].contents[gradient].stops[b].offset")
          .to(0.5, 12),
      ),
    );
  });
}

describe("native shape builder and inspector selectors", () => {
  it("emits nested keys/defaults, preserves native content/stops arrays and source locations", () => {
    const doc = authored();
    expect(validateComposition(doc).ok).toBe(true);
    expect(
      evaluateProperty(doc, "shape.contents[g].contents[rect].position.x", 12),
    ).toBe(10);
    expect(
      evaluateProperty(doc, "shape.contents[g].transform.opacity", 0),
    ).toBe(1);
    expect(
      evaluateProperty(doc, "shape.contents[g].transform.opacity", 12),
    ).toBe(0.5);
    expect(
      evaluateProperty(
        doc,
        "shape.contents[g].contents[gradient].stops[a].color.r",
        12,
      ),
    ).toBe(1);
    expect(
      builderSource(
        doc,
        "layers[0].contents[0].contents[0].position.x.keys[1]",
      ),
    ).toBeDefined();
    const g = (
      doc.layers[0] as Extract<Composition["layers"][number], { type: "shape" }>
    ).contents[0]!;
    expect(g.type).toBe("group");
    if (g.type !== "group") throw Error("group");
    expect(Array.isArray(g.contents)).toBe(true);
    const gradient = g.contents[1]!;
    if (gradient.type !== "gradient-fill") throw Error("gradient");
    expect(Array.isArray(gradient.stops)).toBe(true);
  });
  it("rejects native color component keys and mixed keyed vector/component authoring", () => {
    expect(() =>
      comp(options, (c) => {
        const n = c.add(shape.native("shape", { contents: [rect, fill] }));
        c.timeline(n.property<number>("contents[fill].color.r").to(1, 12));
      }),
    ).toThrow(/comp-builder-color-component/);
    expect(() =>
      comp(options, (c) => {
        const n = c.add(
          shape.native("shape", {
            contents: [
              {
                ...rect,
                position: {
                  keys: [
                    { frame: 0, value: [0, 0] },
                    { frame: 12, value: [1, 1] },
                  ],
                },
              },
            ],
          }),
        );
        c.timeline(n.property<number>("contents[rect].position.x").to(1, 12));
      }),
    ).toThrow(
      /Cannot split animated property|comp-builder-key-conflict|comp-builder-property/,
    );
  });
  it("discovers native groups, stops and separated axes without traversing metadata", () => {
    const doc = authored(),
      tracks = compositionTracks(doc);
    expect(tracks.map((track) => track.property)).toEqual(
      expect.arrayContaining([
        "contents[g].contents[rect].position.x",
        "contents[g].transform.opacity",
        "contents[g].contents[gradient].stops[a].color",
        "contents[g].contents[gradient].stops[b].offset",
      ]),
    );
    const position = tracks.find((track) =>
      track.property?.endsWith("rect].position.x"),
    )!;
    expect(position.path).toEqual([
      "layers",
      0,
      "contents",
      0,
      "contents",
      0,
      "position",
      "x",
    ]);
    expect(sampleTrack(position, 12)).toEqual([10]);
    const layer = doc.layers[0]!;
    layer.metadata = {
      fake: {
        keys: [
          { frame: 0, value: 0 },
          { frame: 12, value: 1 },
        ],
      },
    };
    expect(compositionTracks(doc)).toHaveLength(tracks.length);
  });
  it("adds native drawOn trim after painted groups while preserving existing trim IDs", () => {
    const doc = comp(options, (c) => {
      const n = c.add(
        shape.native("shape", {
          contents: [
            {
              id: "g",
              type: "group",
              contents: [
                { id: "path", type: "path", path },
                { id: "stroke", type: "stroke", color: "#ffffff", width: 2 },
              ],
            },
            { id: "draw-on", type: "trim-paths" },
          ],
        }),
      );
      c.timeline(presets.drawOn(n, 24));
    });
    const layer = doc.layers[0] as Extract<
      Composition["layers"][number],
      { type: "shape" }
    >;
    expect(layer.contents.at(-1)).toMatchObject({
      id: "draw-on-1",
      type: "trim-paths",
    });
    expect(evaluateComp(doc, 0).layers[0]!.shapes!.draws).toEqual([]);
    expect(
      evaluateComp(doc, 12).layers[0]!.shapes!.draws[0]!.paths[0]!.path
        .vertices,
    ).toEqual([
      [0, 0],
      [50, 0],
    ]);
    expect(
      evaluateComp(doc, 24).layers[0]!.shapes!.draws[0]!.paths[0]!.path
        .vertices,
    ).toEqual([
      [0, 0],
      [100, 0],
    ]);
    expect(
      shape.rect("plain", { size: [20, 10], color: "#ff0000" }).draft,
    ).toEqual(solid("plain", { size: [20, 10], color: "#ff0000" }).draft);
  });
});

describe("native shape expression baking", () => {
  it("bakes nested vectors, optional transforms and color components into their own roots", () => {
    const doc = authored();
    doc.expressions = {
      "shape.contents[g].contents[rect].position.y": { source: "time*24" },
      "shape.contents[g].transform.position": { source: "[time*24, 0]" },
      "shape.contents[g].contents[gradient].stops[a].color.g": { source: "1" },
    };
    const result = bakeExpressions(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(JSON.stringify(result.diagnostics));
    expect(result.baked.map((property) => property.path)).toEqual(
      expect.arrayContaining([
        "shape.contents[g].contents[rect].position",
        "shape.contents[g].transform.position",
        "shape.contents[g].contents[gradient].stops[a].color",
      ]),
    );
    expect(result.composition.expressions).toBeUndefined();
    for (const frame of [0, 8, 12, 24, 47])
      for (const property of result.baked) {
        const source = evaluateProperty(doc, property.path, frame),
          baked = evaluateProperty(result.composition, property.path, frame);
        if (Array.isArray(source) && Array.isArray(baked))
          source.forEach((value, i) => {
            const other = baked[i];
            if (typeof value !== "number" || typeof other !== "number")
              throw Error("Expected numeric vector or color channels");
            expect(Math.abs(value - other)).toBeLessThanOrEqual(
              property.path.endsWith(".color") ? 1 / 255 : 1e-9,
            );
          });
        else expect(baked).toEqual(source);
      }
  });
});
