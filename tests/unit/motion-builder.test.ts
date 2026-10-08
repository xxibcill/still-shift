import { describe, expect, expectTypeOf, it } from "vitest";
import {
  comp,
  solid,
  image,
  text,
  precomp,
  nullLayer,
  audio,
  seq,
  par,
  at,
  after,
  stagger,
  delay,
  frames,
  ease,
  expr,
  ref,
  instance,
  builderSource,
  BuilderError,
  type Layer,
  type Property,
} from "@still-shift/motion";
import {
  validateComposition,
  type CompositionTransform,
} from "@still-shift/scene-contract";
const options = { width: 64, height: 64, fps: 24 as const, frames: 120 };
const box = (id = "box") => solid(id, { size: [10, 10], color: "#223344" });
const font = {
  id: "font",
  type: "font" as const,
  path: "pinned.ttf",
  sha256: `sha256:${"0".repeat(64)}`,
  weight: "400",
};
const withFonts = { ...options, assets: [font] };

describe("composition builder", () => {
  it("emits native JSON, deterministic IDs and typed constructors", () => {
    expectTypeOf(box()).toMatchTypeOf<Layer<"solid">>();
    expectTypeOf(box().x).toMatchTypeOf<Property<number>>();
    const build = () =>
      comp(withFonts, (c) => {
        c.add(text("first", { fontAsset: "font" }));
        c.add(text("second", { fontAsset: "font" }));
        const n = c.add(box().at(4, 8).anchor("center"));
        c.timeline(seq(n.x.by(10, 12, ease.outCubic), n.x.by(6, 12)));
      });
    const result = build();
    expect(result.layers.map((l) => l.id)).toEqual(["text", "text-2", "box"]);
    expect(validateComposition(result).ok).toBe(true);
    expect(result.layers[2]!.transform!.position).toEqual({
      x: {
        keys: [
          { frame: 0, value: 4 },
          { frame: 12, value: 14, easing: "out-cubic" },
          { frame: 24, value: 20 },
        ],
      },
      y: 8,
    });
    expect(build().layers).toEqual(result.layers);
    const native = structuredClone(result);
    delete native.metadata;
    expect(native).toMatchSnapshot();
  });
  it("schedules stagger, delay and forward references and rejects cycles", () => {
    const result = comp(options, (c) => {
      const a = c.add(box("a")),
        b = c.add(box("b"));
      const first = a.x.to(10, 8),
        second = b.x.to(20, 8);
      c.timeline(par(after(first, 4, second), delay(2, first)));
    });
    expect(result.layers[1]!.transform!.position).toMatchObject({
      x: {
        keys: [
          { frame: 14, value: 0 },
          { frame: 22, value: 20 },
        ],
      },
    });
    const staggered = comp(options, (c) => {
      const nodes = [c.add(box("a")), c.add(box("b"))];
      c.timeline(
        stagger(
          nodes.map((n) => n.x.to(10, 8)),
          4,
        ),
      );
    });
    expect(staggered.layers[1]!.transform!.position).toMatchObject({
      x: {
        keys: [
          { frame: 4, value: 0 },
          { frame: 12, value: 10 },
        ],
      },
    });
    expect(() =>
      comp(options, (c) => {
        const n = c.add(box()),
          a = n.x.to(10, 8),
          b = n.alpha.to(0, 8);
        c.timeline(par(after(a, 0, b), after(b, 0, a)));
      }),
    ).toThrow(/comp-builder-time-cycle/);
  });
  it("requires one duration and rounds finite seconds with Math.round", () => {
    expect(
      comp({ width: 64, height: 64, fps: 24, seconds: 0.1 }, () => {})
        .frameCount,
    ).toBe(2);
    expect(frames({ seconds: 0.0625 }, 24)).toBe(2);
    for (const value of [-1, 1.2, NaN, Infinity])
      expect(() => frames(value, 24)).toThrow(/comp-builder-time/);
    expect(() => frames({ seconds: -0.01 }, 24)).toThrow(/comp-builder-time/);
    expect(() => comp({ ...options, seconds: 1 }, () => {})).toThrow(
      /comp-builder-duration/,
    );
    expect(() => comp({ width: 64, height: 64, fps: 24 }, () => {})).toThrow(
      /comp-builder-duration/,
    );
  });
  it("rejects overlapping properties, mixed vector axes and impersonated owners", () => {
    expect(() =>
      comp(options, (c) => {
        const n = c.add(box());
        c.timeline(par(n.x.to(8, 12), n.x.to(9, 12)));
      }),
    ).toThrow(/comp-builder-conflict/);
    expect(() =>
      comp(options, (c) => {
        const n = c.add(box());
        c.timeline(seq(n.moveBy([4, 8], 12), n.x.to(9, 12)));
      }),
    ).toThrow(/comp-builder-property-mix/);
    expect(() =>
      comp(options, (c) => {
        c.add(box());
        c.timeline(box().x.to(10, 12));
      }),
    ).toThrow(/comp-builder-owner/);
  });
  it("holds static state before delayed explicit keys and rejects key order errors", () => {
    const result = comp(options, (c) => {
      const n = c.add(box().at(5, 0));
      c.timeline(
        at(
          20,
          n.x.keys([
            { frame: 0, value: 8 },
            { frame: 10, value: 9 },
          ]),
        ),
      );
    });
    expect(result.layers[0]!.transform!.position).toEqual({
      x: {
        keys: [
          { frame: 0, value: 5 },
          { frame: 20, value: 8, interpolation: "hold" },
          { frame: 30, value: 9 },
        ],
      },
      y: 0,
    });
    expect(() =>
      comp(options, (c) => {
        const n = c.add(box());
        c.timeline(
          n.x.keys([
            { frame: 10, value: 4 },
            { frame: 0, value: 8 },
          ]),
        );
      }),
    ).toThrow(/comp-builder-key-order/);
    expect(() =>
      comp(options, (c) => {
        const n = c.add(box());
        c.timeline(n.x.to(8, 121));
      }),
    ).toThrow(/comp-builder-duration/);
  });
  it("retains the previous endpoint through a gap before a changed from value", () => {
    const result = comp(options, (c) => {
      const n = c.add(box());
      c.timeline(par(n.x.to(8, 10), at(20, n.x.from(40).to(50, 10))));
    });
    expect(result.layers[0]!.transform!.position).toEqual({
      x: {
        keys: [
          { frame: 0, value: 0 },
          { frame: 10, value: 8 },
          { frame: 20, value: 40, interpolation: "hold" },
          { frame: 30, value: 50 },
        ],
      },
      y: 0,
    });
  });
  it("requires pinned native text, retains adapter warnings and locates failures", () => {
    expect(() =>
      comp(options, (c) => {
        c.add(text("unpinned"));
      }),
    ).toThrow(/comp-text-system-font/);
    expect(() =>
      comp(withFonts, (c) => {
        c.add(text("pinned", { fontAsset: "font" }));
      }),
    ).not.toThrow();
    expect(() =>
      comp(options, (c) => {
        c.add(
          text("adapter", { source: { family: "story-scene-1", id: "label" } }),
        );
      }),
    ).not.toThrow();
    try {
      comp(options, (c) => {
        c.add(audio("future", "future-audio"));
      });
      expect.fail("audio requires a pinned source");
    } catch (error) {
      expect(error).toBeInstanceOf(BuilderError);
      expect((error as BuilderError).code).toBe("comp-asset-missing");
      expect((error as BuilderError).location.file).toContain(
        "motion-builder.test.ts",
      );
    }
  });
  it("infers image size and symbolic anchor but preserves explicit one-pixel images", () => {
    const asset = {
      id: "art",
      type: "image" as const,
      path: "art.svg",
      sha256: `sha256:${"0".repeat(64)}`,
      width: 16,
      height: 24,
    };
    const result = comp({ ...options, assets: [asset] }, (c) => {
      c.add(image("inferred", "art").anchor("center"));
      c.add(image("explicit", "art", { size: [1, 1] }).anchor("center"));
      c.add(image("updated", "art").with({ size: [2, 2] }));
    });
    expect(result.layers[0]!.transform!.anchor).toEqual([8, 12]);
    expect(result.layers[1]!.transform!.anchor).toEqual([0.5, 0.5]);
    expect(result.layers[2]).toMatchObject({ size: [2, 2] });
  });
  it("validates IDs, conflicting asset registration and async callbacks", () => {
    expect(() => box("invalid.dot")).toThrow(/comp-builder-id/);
    expect(() =>
      comp(options, (c) => {
        c.add(box());
        c.add(box());
      }),
    ).toThrow(/comp-builder-id/);
    expect(() =>
      comp(withFonts, (c) => {
        c.asset({ ...font, weight: "700" });
      }),
    ).toThrow(/comp-builder-asset/);
    expect(() => comp(options, async () => {})).toThrow(/comp-builder-async/);
  });
  it("keeps nested source sites and rejects lost root-only precomp motion", () => {
    const child = comp({ ...options, id: "child" }, (c) => {
      c.add(box());
    });
    const result = comp(options, (c) => {
      c.add(precomp("host", child));
    });
    expect(builderSource(result, "precomps[0].layers[0]")).toEqual(
      builderSource(child, "layers[0]"),
    );
    expect(() =>
      comp(options, (c) => {
        c.add(
          precomp("host", {
            ...child,
            camera2d: { keys: [{ frame: 0, x: 0, y: 0, zoom: 1 }] },
          }),
        );
      }),
    ).toThrow(/comp-builder-precomp-scope/);
  });
  it("records every permitted root layer without exceeding bounded metadata", () => {
    const result = comp(options, (c) => {
      for (let i = 0; i < 2000; i++) c.add(nullLayer(`n${i}`));
    });
    expect(JSON.stringify(result.metadata).length).toBeLessThan(65536);
    expect(builderSource(result, "layers[1999]")?.file).toContain(
      "motion-builder.test.ts",
    );
  });
  it("validates expressions and parenthesizes nested interpolations", () => {
    const result = comp(options, (c) => {
      const n = c.add(box());
      c.expression(n.path("transform.position.x"), expr`${expr`1 + 2`} * 3`);
    });
    expect(Object.values(result.expressions!)[0]!.source).toBe("(1 + 2) * 3");
    expect(() => expr`unknownFunction(1)`).toThrow(/comp-expression/);
    expect(() => ref("broken..path")).toThrow();
    expect(instance("left", "child").path("transform.position.x")).toBe(
      "left/child.transform.position.x",
    );
  });
  it("addresses two reused instances explicitly for cross-instance drivers", () => {
    const child = comp({ ...options, id: "child" }, (c) => c.add(box()));
    const result = comp(options, (c) => {
      c.add(precomp("left", child));
      c.add(precomp("right", child));
      c.driver({
        source: instance("left", "box").path("transform.position.x"),
        target: instance("right", "box").path("transform.position.x"),
        blend: "replace",
      });
    });
    expect(result.drivers?.[0]).toMatchObject({
      source: "left/box.transform.position.x",
      target: "right/box.transform.position.x",
    });
  });
  it("validates complex easing bounds at the helper call", () => {
    expect(() => ease.spring({ stiffness: -1, damping: 18 })).toThrow(
      /comp-builder-easing/,
    );
    expect(() => ease.bezier(-1, 0, 1, 1)).toThrow(/comp-builder-easing/);
  });
});

describe("symbolic precomp anchors", () => {
  const child = comp({ ...options, id: "child", width: 64, height: 48 }, (c) =>
    c.add(box()),
  );
  for (const [anchor, expected] of [
    ["center", [32, 24]],
    ["top", [32, 0]],
    ["bottom", [32, 48]],
    ["left", [0, 24]],
    ["right", [64, 24]],
  ] as const) {
    it(`uses inline precomp dimensions for ${anchor}`, () => {
      const result = comp(options, (c) =>
        c.add(precomp("host", child).anchor(anchor).at(128, 128)),
      );
      expect(result.layers[0]!.transform!.anchor).toEqual(expected);
    });
    it(`resolves a later named definition for ${anchor}`, () => {
      const result = comp(options, (c) => {
        c.add(precomp("host", "child").anchor(anchor));
        c.define(child);
      });
      expect(result.layers[0]!.transform!.anchor).toEqual(expected);
    });
  }
  it("allows numeric anchors to override a pending symbolic anchor", () => {
    const result = comp(options, (c) => {
      c.add(precomp("host", "child").anchor("center").anchor(7, 9));
      c.define(child);
    });
    expect(result.layers[0]!.transform!.anchor).toEqual([7, 9]);
  });
  for (const method of ["transform", "with"] as const) {
    for (const anchor of [
      [7, 9],
      {
        keys: [
          { frame: 0, value: [7, 9] },
          { frame: 12, value: [11, 13] },
        ],
      },
    ] satisfies CompositionTransform["anchor"][]) {
      it(`lets ${method} replace symbolic anchors with ${Array.isArray(anchor) ? "static" : "animated"} values`, () => {
        const asset = {
          id: "art",
          type: "image" as const,
          path: "art.svg",
          sha256: `sha256:${"0".repeat(64)}`,
          width: 64,
          height: 48,
        };
        const result = comp({ ...options, assets: [asset] }, (c) => {
          const named = precomp("named", "child"),
            inline = precomp("inline", child),
            drawing = image("drawing", "art");
          for (const node of [named, inline, drawing]) {
            node.anchor("center");
            if (method === "transform") node.transform({ anchor });
            else node.with({ transform: { anchor } });
          }
          c.add(named);
          c.add(inline);
          c.add(drawing);
          c.define(child);
        });
        for (const node of result.layers)
          expect(node.transform!.anchor).toEqual(anchor);
      });
    }
    it(`preserves a pending symbolic anchor when ${method} changes another field`, () => {
      const result = comp(options, (c) => {
        const node = precomp("host", "child").anchor("center");
        if (method === "transform") node.transform({ position: [12, 13] });
        else node.with({ transform: { position: [12, 13] } });
        c.add(node);
        c.define(child);
      });
      expect(result.layers[0]!.transform).toMatchObject({
        anchor: [32, 24],
        position: [12, 13],
      });
    });
  }
});
