import { expect, it } from "vitest";
import {
  comp,
  solid,
  precomp,
  builderSource,
  BuilderError,
  at,
  seq,
  nullLayer,
  type AnimationKey,
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
it("preserves static scalar state before a delayed explicit from segment", () => {
  const result = comp({ ...options, frames: 48 }, (c) => {
    const n = c.add(box().at(5, 0));
    c.timeline(at(12, n.x.from(40).to(50, 10)));
  });
  for (const [frame, value] of [
    [0, 5],
    [11, 5],
    [12, 40],
    [17, 45],
    [22, 50],
    [0, 5],
  ])
    expect(evaluateProperty(result, "box.transform.position.x", frame!)).toBe(
      value,
    );
});
it("preserves static vector and by values before delayed from segments", () => {
  const result = comp({ ...options, frames: 48 }, (c) => {
    const n = c.add(box().at(5, 7).rotate(3));
    c.timeline(
      at(12, n.position.from([40, 60]).to([50, 80], 10)),
      at(12, n.rotation.from(20).by(10, 10)),
    );
  });
  expect(evaluateProperty(result, "box.transform.position", 11)).toEqual([
    5, 7,
  ]);
  expect(evaluateProperty(result, "box.transform.position", 12)).toEqual([
    40, 60,
  ]);
  expect(evaluateProperty(result, "box.transform.position", 17)).toEqual([
    45, 70,
  ]);
  expect(evaluateProperty(result, "box.transform.rotation", 11)).toBe(3);
  expect(evaluateProperty(result, "box.transform.rotation", 12)).toBe(20);
  expect(evaluateProperty(result, "box.transform.rotation", 22)).toBe(30);
});
it.each([0, 1])(
  "retains authored opacity %s before a delayed fade-in",
  (opacity) => {
    const result = comp({ ...options, frames: 48 }, (c) => {
      const n = c.add(box().opacity(opacity));
      c.timeline(at(12, n.fadeIn(12)));
    });
    expect(evaluateProperty(result, "box.transform.opacity", 0)).toBe(opacity);
    expect(evaluateProperty(result, "box.transform.opacity", 11)).toBe(opacity);
    expect(evaluateProperty(result, "box.transform.opacity", 12)).toBe(0);
    expect(evaluateProperty(result, "box.transform.opacity", 18)).toBe(0.5);
    expect(evaluateProperty(result, "box.transform.opacity", 24)).toBe(1);
  },
);
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

it("preserves the outgoing temporal handle at a shared clip boundary", () => {
  const incoming = { ease: 0.2, speed: 0 };
  const outgoing = { ease: 0.7, speed: 0 };
  const result = comp(options, (c) => {
    const n = c.add(box());
    c.timeline(
      seq(
        n.x.keys([
          { frame: 0, value: 0 },
          { frame: 10, value: 10, in: incoming },
        ]),
        n.x.keys([
          { frame: 0, value: 10, out: outgoing },
          { frame: 10, value: 20, in: incoming },
        ]),
      ),
    );
  });
  const position = result.layers[0]!.transform!.position;
  expect(position).toMatchObject({
    x: {
      keys: [
        { frame: 0, value: 0 },
        { frame: 10, value: 10, in: incoming, out: outgoing },
        { frame: 20, value: 20, in: incoming },
      ],
    },
  });
  expect(evaluateProperty(result, "box.x", 12)).toBeCloseTo(
    10.30288335775443,
    10,
  );
});

it("preserves each side of a spatial join when keyed clips are sequenced", () => {
  const result = comp(options, (c) => {
    const n = c.add(box());
    c.timeline(
      seq(
        n.position.keys([
          { frame: 0, value: [0, 0] },
          { frame: 10, value: [10, 0], spatialIn: [-4, 3] },
        ]),
        n.position.keys([
          { frame: 0, value: [10, 0], spatialOut: [0, 12] },
          { frame: 10, value: [20, 0], spatialIn: [0, 12] },
        ]),
      ),
    );
  });
  expect(result.layers[0]!.transform!.position).toMatchObject({
    keys: [
      { frame: 0, value: [0, 0] },
      { frame: 10, value: [10, 0], spatialIn: [-4, 3], spatialOut: [0, 12] },
      { frame: 20, value: [20, 0], spatialIn: [0, 12] },
    ],
  });
  const atMidpoint = evaluateProperty(
    result,
    "box.transform.position",
    15,
  ) as number[];
  expect(atMidpoint[1]).toBeGreaterThan(8);
});

it.each([
  [{ out: { ease: 2 } }, ".out.ease"],
  [{ out: { ease: 0.5, speed: [Infinity, 0] } }, ".out.speed"],
  [{ spatialOut: [Infinity, 0] }, ".spatialOut"],
] satisfies [Partial<AnimationKey<number[]>>, string][])(
  "locates merged outgoing handle errors at the second keyed clip (%s)",
  (fields, suffix) => {
    let call;
    try {
      comp(options, (c) => {
        const n = c.add(box());
        const first = n.position.keys([
          { frame: 0, value: [0, 0] },
          { frame: 10, value: [10, 0] },
        ]);
        const second = n.position.keys([
          { frame: 0, value: [10, 0], ...structuredClone(fields) },
          { frame: 10, value: [20, 0] },
        ]);
        call = second.value.location;
        c.timeline(seq(first, second));
      });
      expect.fail("invalid outgoing metadata must fail");
    } catch (error) {
      expect(error).toBeInstanceOf(BuilderError);
      expect((error as BuilderError).message).toContain(`keys[1]${suffix}`);
      expect((error as BuilderError).location).toEqual(call);
    }
  },
);

it("keeps incoming, outgoing and key-value call sites distinct through nested reuse", () => {
  let firstCall, secondCall;
  const child = comp({ ...options, id: "child" }, (c) => {
    const n = c.add(box());
    const first = n.position.keys([
      { frame: 0, value: [0, 0] },
      { frame: 10, value: [10, 0], in: { ease: 0.3 }, spatialIn: [-4, 3] },
    ]);
    const second = n.position.keys([
      { frame: 0, value: [10, 0], out: { ease: 0.7 }, spatialOut: [0, 12] },
      { frame: 10, value: [20, 0] },
    ]);
    firstCall = first.value.location;
    secondCall = second.value.location;
    c.timeline(seq(first, second));
  });
  const middle = comp({ ...options, id: "middle" }, (c) =>
    c.add(precomp("host", child)),
  );
  const outer = comp(options, (c) => {
    c.add(precomp("left", middle));
    c.add(precomp("right", middle));
  });
  const childIndex = outer.precomps!.findIndex((p) => p.id === "child");
  for (const [composition, prefix] of [
    [child, ""],
    [outer, `precomps[${childIndex}].`],
  ] as const) {
    const key = `${prefix}layers[0].transform.position.keys[1]`;
    for (const suffix of ["", ".value", ".in.ease", ".spatialIn[0]"])
      expect(builderSource(composition, key + suffix)).toEqual(firstCall);
    for (const suffix of [".out", ".out.ease", ".spatialOut[0]"])
      expect(builderSource(composition, key + suffix)).toEqual(secondCall);
    expect(
      builderSource(
        composition,
        `${prefix}layers[0].transform.position.keys[2].value`,
      ),
    ).toEqual(secondCall);
  }
});

it("locates invalid incoming metadata at the first clip after a join", () => {
  let call;
  try {
    comp(options, (c) => {
      const n = c.add(box());
      const first = n.x.keys([
        { frame: 0, value: 0 },
        { frame: 10, value: 10, in: { ease: 2 } },
      ]);
      call = first.value.location;
      c.timeline(
        seq(
          first,
          n.x.keys([
            { frame: 0, value: 10, out: { ease: 0.7 } },
            { frame: 10, value: 20 },
          ]),
        ),
      );
    });
    expect.fail("invalid incoming metadata must fail");
  } catch (error) {
    expect(error).toBeInstanceOf(BuilderError);
    expect((error as BuilderError).message).toContain("keys[1].in.ease");
    expect((error as BuilderError).location).toEqual(call);
  }
});
