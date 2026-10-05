import { expect, it } from "vitest";
import {
  comp,
  solid,
  precomp,
  builderSource,
  BuilderError,
  at,
  nullLayer,
} from "@still-shift/motion";
import { evaluateComp, evaluateProperty } from "@still-shift/renderer-core";
const options = { width: 64, height: 64, fps: 24 as const, frames: 24 };
const box = () => solid("box", { size: [10, 10], color: "#223344" });
const path = {
  closed: true,
  vertices: [
    [0, 0],
    [10, 0],
    [10, 10],
  ] as [number, number][],
};
it("maps emitted keys to animation calls and retains them through nested reuse", () => {
  let call;
  const child = comp({ ...options, id: "child" }, (c) => {
    const n = c.add(box());
    const animation = n.x.to(8, 12);
    call = animation.value.location;
    c.timeline(animation);
  });
  expect(
    builderSource(child, "layers[0].transform.position.x.keys[1]"),
  ).toEqual(call);
  expect(
    builderSource(child, "layers[0].transform.position.x.keys[1]"),
  ).not.toEqual(builderSource(child, "layers[0]"));
  const parent = comp(options, (c) => {
    c.add(precomp("left", child));
    c.add(precomp("right", child));
  });
  expect(
    builderSource(parent, "precomps[0].layers[0].transform.position.x.keys[1]"),
  ).toEqual(call);
});
it("locates native key validation failures at the animation helper", () => {
  let call;
  try {
    comp(options, (c) => {
      const n = c.add(box());
      const motion = n.x.keys([
        { frame: 0, value: 0 },
        { frame: 12, value: Infinity },
      ]);
      call = motion.value.location;
      c.timeline(motion);
    });
    expect.fail("invalid key must fail");
  } catch (error) {
    expect(error).toBeInstanceOf(BuilderError);
    expect((error as BuilderError).location).toEqual(call);
  }
});
it("lowers named mask/effect selectors, defaults and path morphs into native JSON", () => {
  const result = comp(options, (c) => {
    const n = c.add(
      box().with({
        masks: [{ id: "cut", mode: "add", path }],
        effects: [{ id: "blur", effect: "blur.primitive", params: {} }],
      }),
    );
    c.timeline(
      n.property<number>("masks[cut].feather").to(4, 12),
      n.property<number>("effects[blur].radius").to(6, 12),
    );
  });
  expect(result.layers[0]!.masks![0]!.feather).toEqual({
    keys: [
      { frame: 0, value: 0 },
      { frame: 12, value: 4 },
    ],
  });
  expect(result.layers[0]!.effects![0]!.params).toEqual({
    radius: {
      keys: [
        { frame: 0, value: 0 },
        { frame: 12, value: 6 },
      ],
    },
  });
  expect(
    builderSource(result, "layers[0].effects[0].params.radius.keys[1]")?.file,
  ).toContain("motion-builder-properties.test.ts");
  const morph = comp(options, (c) => {
    const n = c.add(box().with({ masks: [{ id: "cut", mode: "add", path }] }));
    c.timeline(
      n.property<typeof path>("masks[cut].path").to(
        {
          ...path,
          vertices: [
            [0, 0],
            [20, 0],
            [20, 20],
          ],
        },
        12,
      ),
    );
  });
  expect(morph.layers[0]!.masks![0]!.path).toMatchObject({
    keys: [
      { frame: 0, value: path },
      {
        frame: 12,
        value: {
          vertices: [
            [0, 0],
            [20, 0],
            [20, 20],
          ],
        },
      },
    ],
  });
});
it("validates aliases, missing selectors, unavailable properties and component key limits", () => {
  const result = comp(options, (c) => {
    const n = c.add(box());
    c.timeline(n.property<number>("skewX").to(10, 12));
  });
  expect(result.layers[0]!.transform!.skewX).toMatchObject({
    keys: [
      { frame: 0, value: 0 },
      { frame: 12, value: 10 },
    ],
  });
  for (const property of [
    "masks[absent].opacity",
    "effects[absent].radius",
    "nonsense",
  ])
    expect(() =>
      comp(options, (c) => {
        const n = c.add(box());
        c.timeline(n.property<number>(property).from(0).to(1, 12));
      }),
    ).toThrow(/comp-path-property/);
  expect(() =>
    comp(options, (c) => {
      const n = c.add(box());
      c.timeline(
        n.property<number>("contents[line].strokeWidth").from(0).to(1, 12),
      );
    }),
  ).toThrow(/comp-path-property/);
  expect(() =>
    comp(options, (c) => {
      const n = c.add(box());
      c.timeline(n.property<number>("color.r").to(1, 12));
    }),
  ).toThrow(/comp-builder-color-component/);
});
it("preserves temporal handles in native evaluation", () => {
  const result = comp(options, (c) => {
    const n = c.add(box());
    c.timeline(
      n.x.keys([
        { frame: 0, value: 0, out: { speed: 0, ease: 0.5 } },
        {
          frame: 12,
          value: 8,
          in: { speed: 0, ease: 0.5 },
          bezier: [0.5, 0, 0.5, 1],
          interpolation: "bezier",
        },
      ]),
    );
  });
  expect(result.layers[0]!.transform!.position).toMatchObject({
    x: {
      keys: [
        { out: { speed: 0, ease: 0.5 } },
        {
          in: { speed: 0, ease: 0.5 },
          bezier: [0.5, 0, 0.5, 1],
          interpolation: "bezier",
        },
      ],
    },
  });
  expect(evaluateComp(result, 6)).toBeDefined();
});

it("activates a native behaviour at its cue and preserves prior motion before it", () => {
  const result = comp({ ...options, frames: 48 }, (c) => {
    c.marker("bounce", 12);
    const n = c.add(box());
    c.timeline(
      n.moveTo([20, 0], 10),
      at("cue:bounce", n.behaviour("inertial-bounce")),
    );
  });
  expect(evaluateProperty(result, "box.transform.position", 11)).toEqual([
    20, 0,
  ]);
  expect(evaluateProperty(result, "box.transform.position", 13)).not.toEqual([
    20, 0,
  ]);
});
it("keeps source metadata bounded with a key track on every permitted root layer", () => {
  const result = comp(options, (c) => {
    for (let i = 0; i < 2000; i++) {
      const n = c.add(nullLayer(`n${i}`));
      c.timeline(n.x.to(8, 12));
    }
  });
  expect(JSON.stringify(result.metadata).length).toBeLessThan(65536);
  expect(
    builderSource(result, "layers[1999].transform.position.x.keys[1]")?.file,
  ).toContain("motion-builder-properties.test.ts");
});

it("retains deeply nested layer and key call sites through reused definitions", () => {
  const leaf = comp({ ...options, id: "leaf" }, (c) => {
    const n = c.add(box());
    c.timeline(n.x.to(8, 12));
  });
  const middle = comp({ ...options, id: "middle" }, (c) =>
    c.add(precomp("inner", leaf)),
  );
  const outer = comp(options, (c) => c.add(precomp("host", middle)));
  expect(builderSource(outer, "precomps[1].layers[0]")).toEqual(
    builderSource(leaf, "layers[0]"),
  );
  expect(
    builderSource(outer, "precomps[1].layers[0].transform.position.x.keys[1]"),
  ).toEqual(builderSource(leaf, "layers[0].transform.position.x.keys[1]"));
});
it("keeps nested marker and constraint call sites", () => {
  const leaf = comp({ ...options, id: "leaf" }, (c) => {
    c.add(box());
    c.marker("cue", 12);
    c.constraint({
      type: "keep-in-safe-area",
      target: "box",
      inset: 0,
    });
  });
  const parent = comp(options, (c) => c.add(precomp("host", leaf)));
  expect(builderSource(parent, "precomps[0].markers[0]")).toEqual(
    builderSource(leaf, "markers[0]"),
  );
  expect(builderSource(parent, "precomps[0].constraints[0]")).toEqual(
    builderSource(leaf, "constraints[0]"),
  );
});
it("locates invalid timeline clip duration at the property animation call", () => {
  let location;
  try {
    comp(options, (c) => {
      const n = c.add(box());
      const motion = n.x.to(1, -1);
      location = motion.value.location;
      c.timeline(motion);
    });
    expect.fail();
  } catch (error) {
    expect(error).toMatchObject({ code: "comp-builder-time", location });
  }
});
