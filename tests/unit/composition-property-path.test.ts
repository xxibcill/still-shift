import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CompositionSchema,
  formatPropertyPath,
  isPropertyPathError,
  parsePropertyPath,
  resolvePropertyPath,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";

const comp = CompositionSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        "../../benchmarks/fixtures/composition/ce1/every-field.json",
      ),
      "utf8",
    ),
  ),
) as Composition;

describe("property path grammar", () => {
  it.each([
    [
      "title.transform.position",
      {
        scope: [],
        layer: "title",
        segments: [{ name: "transform" }, { name: "position" }],
      },
    ],
    [
      "title.transform.position.x",
      {
        scope: [],
        layer: "title",
        segments: [{ name: "transform" }, { name: "position" }, { name: "x" }],
      },
    ],
    [
      "bg.effects[glow].radius",
      {
        scope: [],
        layer: "bg",
        segments: [{ name: "effects", index: "glow" }, { name: "radius" }],
      },
    ],
    [
      "bars.contents[bar1].trimEnd",
      {
        scope: [],
        layer: "bars",
        segments: [{ name: "contents", index: "bar1" }, { name: "trimEnd" }],
      },
    ],
    [
      "scene/hero.transform.opacity",
      {
        scope: ["scene"],
        layer: "hero",
        segments: [{ name: "transform" }, { name: "opacity" }],
      },
    ],
    [
      "a/b-2/hero_1.x",
      { scope: ["a", "b-2"], layer: "hero_1", segments: [{ name: "x" }] },
    ],
    [
      "comp.camera.zoom",
      {
        scope: [],
        layer: "comp",
        segments: [{ name: "camera" }, { name: "zoom" }],
      },
    ],
  ])("parses %s", (text, expected) => {
    const parsed = parsePropertyPath(text);
    expect(parsed).toEqual(expected);
    expect(isPropertyPathError(parsed)).toBe(false);
    if (!isPropertyPathError(parsed))
      expect(formatPropertyPath(parsed)).toBe(text);
  });

  it.each([
    "title",
    "title.",
    ".x",
    "title..x",
    "1title.x",
    "title.x[",
    "title.x[]",
    "title.x[1]",
    "title.x]y",
    "title.x[a][b]",
    "/title.x",
    "scene//title.x",
    "scene/.x",
    "sce ne/title.x",
    "scene/comp.camera.zoom",
    `title.${"x".repeat(600)}`,
  ])("rejects %s with comp-path-syntax", (text) => {
    const parsed = parsePropertyPath(text);
    expect(isPropertyPathError(parsed) && parsed.code).toBe("comp-path-syntax");
  });
});

describe("property path resolution", () => {
  const inheritedNames = [
    "constructor",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
  ];
  const ok = (text: string) => {
    const resolved = resolvePropertyPath(comp, text);
    if ("code" in resolved)
      throw new Error(`${resolved.code}: ${resolved.message}`);
    return resolved;
  };
  const code = (text: string) => {
    const resolved = resolvePropertyPath(comp, text);
    return "code" in resolved ? resolved.code : undefined;
  };

  it.each([
    ["house.transform.position", "vec2"],
    ["house.transform.position.y", "scalar"],
    ["house.transform.anchor.x", "scalar"],
    ["house.transform.scale", "vec2"],
    ["house.transform.rotation", "scalar"],
    ["house.transform.skewY", "scalar"],
    ["house.transform.opacity", "scalar"],
    ["house.state", "discrete"],
    ["house.stateFrom", "discrete"],
    ["house.stateMix", "scalar"],
    ["house.masks[window].path", "path"],
    ["house.masks[window].feather", "scalar"],
    ["house.masks[hole].opacity", "scalar"],
    ["shadow.color", "color"],
    ["shadow.color.a", "scalar"],
    ["headline.color", "color"],
    ["headline.reveal", "scalar"],
    ["headline.state", "discrete"],
    ["inset.timeRemap", "scalar"],
    ["inset/inner-house.transform.position.x", "scalar"],
    ["inset/deeper/dot.color.r", "scalar"],
  ] as const)("%s is %s", (text, type) => {
    expect(ok(text).type).toBe(type);
  });

  it("addresses precomp scopes by layer instance id", () => {
    // Each hop names a precomp layer, then follows that layer's source definition.
    expect(ok("inset/inner-house.transform.position.x").scope).toEqual([
      "inset",
    ]);
    expect(ok("inset/deeper/dot.color").layer?.id).toBe("dot");
    expect(code("leaf/dot.color")).toBe("comp-path-scope");
    expect(code("ghost/dot.color")).toBe("comp-path-scope");
    // Layer ids are per scope: the root has no `dot`, and the inset has no `house`.
    expect(code("dot.color")).toBe("comp-path-layer");
    expect(code("inset/house.transform.rotation")).toBe("comp-path-layer");
  });

  it.each([
    ["house.x", "house.transform.position.x"],
    ["house.y", "house.transform.position.y"],
    ["house.scaleX", "house.transform.scale.x"],
    ["house.scaleY", "house.transform.scale.y"],
    ["house.rotation", "house.transform.rotation"],
    ["house.opacity", "house.transform.opacity"],
    ["house.anchorX", "house.transform.anchor.x"],
    ["house.anchorY", "house.transform.anchor.y"],
    ["house.skewX", "house.transform.skewX"],
    ["house.skewY", "house.transform.skewY"],
    ["headline.reveal", "headline.reveal"],
    ["inset/inner-house.x", "inset/inner-house.transform.position.x"],
  ])("legacy target %s resolves to %s", (text, canonical) => {
    expect(ok(text)).toMatchObject({ path: canonical, type: "scalar" });
  });

  it.each([
    ["house.blur", "comp-feature-unavailable"],
    ["house.trimEnd", "comp-feature-unavailable"],
    ["house.transform.rotationX", "comp-feature-unavailable"],
    ["house.effects[ghost].radius", "comp-path-property"],
    ["house.masks[ghost].path", "comp-path-property"],
    ["house.masks[window]", "comp-path-property"],
    ["house.masks[window].path.x", "comp-path-property"],
    ["house.masks.path", "comp-path-property"],
    ["house.transform", "comp-path-property"],
    ["house.transform.position.z", "comp-path-property"],
    ["house.transform.position.x.y", "comp-path-property"],
    ["house.transform[0].rotation", "comp-path-syntax"],
    ["house.transform[pos].rotation", "comp-path-property"],
    ["scene/inner-house.x", "comp-path-scope"],
    ["house.color", "comp-path-property"],
    ["house.reveal", "comp-path-property"],
    ["shadow.state", "comp-path-property"],
    ["shadow.timeRemap", "comp-path-property"],
    ["shadow.color.q", "comp-path-property"],
    ["comp.camera.rotation", "comp-path-property"],
    ["comp.transform.opacity", "comp-path-property"],
    ["ghost.x", "comp-path-layer"],
  ])("%s fails with %s", (text, expected) => {
    expect(code(text)).toBe(expected);
  });

  it("reads the composition camera but marks it read-only", () => {
    expect(ok("comp.camera.zoom")).toMatchObject({
      type: "scalar",
      readOnly: true,
    });
    const withoutCamera = { ...comp, camera2d: undefined };
    expect(resolvePropertyPath(withoutCamera, "comp.camera.x")).toMatchObject({
      code: "comp-path-property",
    });
  });

  it.each(inheritedNames)("rejects inherited property %s", (name) => {
    expect(resolvePropertyPath(comp, `house.${name}`)).toEqual({
      code: "comp-path-property",
      message: `"house.${name}" does not name a property`,
    });
  });

  it.each(inheritedNames)(
    "reports inherited property %s at each driver reference",
    (name) => {
      const invalidPath = `house.${name}`;
      const cases = [
        {
          driver: { target: invalidPath, source: "needle.opacity" },
          path: "drivers[0].target",
        },
        {
          driver: { target: "needle.opacity", source: invalidPath },
          path: "drivers[0].source",
        },
        {
          driver: { target: "needle.opacity", sum: [invalidPath] },
          path: "drivers[0].sum[0]",
        },
      ];
      for (const { driver, path } of cases) {
        const doc = structuredClone(comp);
        doc.drivers = [driver];
        expect(validateComposition(doc)).toMatchObject({
          ok: false,
          diagnostics: [
            {
              code: "comp-path-property",
              severity: "error",
              path,
              message: `"${invalidPath}" does not name a property`,
            },
          ],
        });
      }
    },
  );

  it("does not let the reserved root shadow a layer", () => {
    // A layer named `comp` is rejected by validation, so `comp.` is never ambiguous.
    const doc = structuredClone(comp);
    doc.layers.push({ id: "comp", type: "null" });
    expect(CompositionSchema.safeParse(doc).error?.issues[0]?.message).toMatch(
      /^comp-reserved-id/,
    );
  });

  it("types vector paths as 3D on 3D layers", () => {
    const doc = structuredClone(comp);
    doc.layers.find((l) => l.id === "needle")!.threeD = true;
    expect(resolvePropertyPath(doc, "needle.transform.position")).toMatchObject(
      { type: "vec3" },
    );
    expect(
      resolvePropertyPath(doc, "needle.transform.position.z"),
    ).toMatchObject({ type: "scalar" });
  });
});
