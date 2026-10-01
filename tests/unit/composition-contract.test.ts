import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  COMPOSITION_DIAGNOSTICS,
  COMPOSITION_LIMITS,
  COMPOSITION_WARNINGS,
  CompositionAssetSchema,
  CompositionMarkerSchema,
  CompositionSchema,
  MaskSchema,
  PrecompSchema,
  TrackMatteSchema,
  TransformSchema,
  UNAVAILABLE_LAYER_TYPES,
  validateComposition,
  type Composition,
  type CompositionDiagnostic,
} from "@still-shift/scene-contract";
import * as layers from "../../packages/scene-contract/src/composition/layers.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

const root = resolve(import.meta.dirname, "../..");
const fixtureDir = resolve(root, "benchmarks/fixtures/composition/ce1");
const load = (name: string) =>
  JSON.parse(
    readFileSync(resolve(fixtureDir, `${name}.json`), "utf8"),
  ) as Composition;
const everyField = () => load("every-field");
const firstSlice = () => load("first-slice");

type Doc = ReturnType<typeof everyField> & Record<string, unknown>;
type AnyLayer = Record<string, unknown> & { id: string; type: string };
const layerOf = (doc: Doc, id: string) =>
  doc.layers.find((l) => l.id === id) as unknown as AnyLayer;
const indexOf = (doc: Doc, id: string) =>
  doc.layers.findIndex((l) => l.id === id);

const errors = (input: unknown) => {
  const result = validateComposition(input);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(false);
  return result.diagnostics;
};
const expectDiagnostic = (
  diagnostics: CompositionDiagnostic[],
  code: string,
  path?: string,
) =>
  expect(diagnostics).toContainEqual(
    expect.objectContaining({
      code,
      severity: "error",
      ...(path === undefined ? {} : { path }),
    }),
  );

describe("composition-1 fixtures", () => {
  it.each(["first-slice", "every-field"])(
    "%s validates without diagnostics",
    (name) => {
      const result = validateComposition(load(name));
      expect(result.diagnostics).toEqual([]);
      expect(result.ok).toBe(true);
    },
  );

  it.each(["first-slice", "every-field"])(
    "%s pins asset hashes that match the files",
    (name) => {
      for (const asset of load(name).assets) {
        const bytes = readFileSync(resolve(fixtureDir, asset.path));
        expect(
          `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        ).toBe(asset.sha256);
      }
    },
  );

  it("every-field exercises every available CE1 field", () => {
    const doc = everyField();
    const used = (objects: unknown[]) =>
      new Set(objects.flatMap((o) => Object.keys(o as object)));
    const missing = (
      shape: z.ZodObject,
      objects: unknown[],
      exempt: string[] = [],
    ) =>
      Object.keys(shape.shape).filter(
        (key) => !used(objects).has(key) && !exempt.includes(key),
      );

    expect(missing(CompositionSchema, [doc])).toEqual([]);
    expect(missing(PrecompSchema, doc.precomps!)).toEqual([]);
    expect(
      missing(CompositionMarkerSchema, [
        ...doc.markers!,
        ...doc.precomps!.flatMap((p) => p.markers ?? []),
      ]),
    ).toEqual([]);
    for (const option of CompositionAssetSchema.options) {
      const type = option.shape.type.value;
      if (["video", "sequence", "audio"].includes(type)) continue;
      expect(
        missing(
          option,
          doc.assets.filter((a) => a.type === type),
        ),
        type,
      ).toEqual([]);
    }
    const allLayers = [doc, ...doc.precomps!].flatMap((s) => s.layers);
    for (const option of layers.CompositionLayerSchema.options) {
      const type = option.shape.type.value;
      if (UNAVAILABLE_LAYER_TYPES[type]) continue;
      expect(
        missing(
          option,
          allLayers.filter((l) => l.type === type),
          Object.keys(layerBaseExemptions),
        ),
        type,
      ).toEqual([]);
    }
    // Base fields need to appear on at least one layer of any type.
    expect(missing(layers.NullLayerSchema, allLayers)).toEqual([]);
    expect(
      missing(
        TransformSchema,
        allLayers.map((l) => l.transform ?? {}),
        ["rotationX", "rotationY", "orientation"],
      ),
    ).toEqual([]);
    expect(
      missing(
        MaskSchema,
        allLayers.flatMap((l) => l.masks ?? []),
      ),
    ).toEqual([]);
    expect(
      missing(
        TrackMatteSchema,
        allLayers.flatMap((l) => (l.trackMatte ? [l.trackMatte] : [])),
      ),
    ).toEqual([]);
    const matteModes = new Set(
      allLayers.flatMap((l) => (l.trackMatte ? [l.trackMatte.mode] : [])),
    );
    expect([...matteModes].sort()).toEqual(
      TrackMatteSchema.shape.mode.options.slice().sort(),
    );
  });

  it("round-trips through JSON unchanged", () => {
    for (const doc of [firstSlice(), everyField()]) {
      const parsed = CompositionSchema.parse(doc);
      const again = CompositionSchema.parse(JSON.parse(JSON.stringify(parsed)));
      expect(again).toEqual(parsed);
      expect(parsed).toEqual(doc);
    }
  });
});

/** Base fields only need to be covered once (by the null-layer check). */
const layerBaseExemptions = Object.fromEntries(
  Object.keys(layers.NullLayerSchema.shape).map((key) => [key, true]),
);

type Mutation = [
  name: string,
  mutate: (doc: Doc) => unknown,
  code: string,
  path?: string,
];

const house = (doc: Doc) => layerOf(doc, "house");
const houseIndex = (doc: Doc) => indexOf(doc, "house");
const set = <T>(target: T, patch: Partial<T>) =>
  Object.assign(target as object, patch);

const invalid: Mutation[] = [
  [
    "schema version",
    (d) => set(d, { schemaVersion: "composition-2" as never }),
    "comp-schema-version",
    "schemaVersion",
  ],
  [
    "unknown field",
    (d) => set(house(d), { wobble: 1 }),
    "comp-schema-unknown-key",
  ],
  [
    "unknown layer type",
    (d) => set(house(d), { type: "sprite" }),
    "comp-schema-union",
  ],
  [
    "wrong JSON type",
    (d) => set(d, { frameCount: "90" as never }),
    "comp-schema-type",
    "frameCount",
  ],
  [
    "size below range",
    (d) => set(d, { width: 10 }),
    "comp-schema-range",
    "width",
  ],
  [
    "bad colour",
    (d) => set(d, { background: "red" }),
    "comp-schema-format",
    "background",
  ],
  [
    "unknown blend mode",
    (d) => set(house(d), { blendMode: "plus" }),
    "comp-schema-value",
  ],
  ["zero stretch", (d) => set(house(d), { stretch: 0 }), "comp-schema-range"],
  [
    "too many masks",
    (d) =>
      set(house(d), {
        masks: Array.from({ length: 33 }, (_, i) => ({
          id: `m${i}`,
          mode: "add",
          path: {
            closed: true,
            vertices: [
              [0, 0],
              [1, 0],
              [1, 1],
            ],
          },
        })),
      }),
    "comp-limit",
  ],
  [
    "key order",
    (d) =>
      set(house(d).transform as object, {
        rotation: {
          keys: [
            { frame: 10, value: 0 },
            { frame: 5, value: 1 },
          ],
        },
      }),
    "comp-key-order",
  ],
  [
    "smooth first key",
    (d) =>
      set(house(d).transform as object, {
        rotation: {
          keys: [
            { frame: 0, value: 0, smooth: true },
            { frame: 5, value: 1 },
          ],
        },
      }),
    "comp-key-smooth",
  ],
  [
    "bezier without handles",
    (d) =>
      set(house(d).transform as object, {
        rotation: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 5, value: 1, interpolation: "bezier" },
          ],
        },
      }),
    "comp-key-bezier",
  ],
  [
    "vector speed handle",
    (d) =>
      set(house(d).transform as object, {
        scale: {
          keys: [
            { frame: 0, value: [1, 1], out: { ease: 0.3, speed: 1 } },
            { frame: 5, value: [2, 2] },
          ],
        },
      }),
    "comp-key-speed-vector",
  ],
  [
    "path tangent count",
    (d) =>
      set((house(d).masks as object[])[1]!, {
        path: {
          closed: true,
          vertices: [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
          inTangents: [[0, 0]],
        },
      }),
    "comp-path-tangents",
  ],
  [
    "path vertex count",
    (d) =>
      set((house(d).masks as object[])[1]!, {
        path: {
          keys: [
            {
              frame: 0,
              value: {
                closed: true,
                vertices: [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                ],
              },
            },
            {
              frame: 4,
              value: {
                closed: true,
                vertices: [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                ],
              },
            },
          ],
        },
      }),
    "comp-path-vertex-count",
  ],
  [
    "3D vector on a 2D layer",
    (d) => set(house(d).transform as object, { position: [0, 0, 10] }),
    "comp-vector-dimension",
  ],
  [
    "duplicate layer id",
    (d) => set(layerOf(d, "key"), { id: "needle" }),
    "comp-duplicate-id",
  ],
  [
    "reserved id",
    (d) => set(layerOf(d, "key"), { id: "comp" }),
    "comp-reserved-id",
  ],
  [
    "empty layer time",
    (d) => set(house(d), { inPoint: 40, outPoint: 40 }),
    "comp-layer-time",
  ],
  [
    "missing parent",
    (d) => set(house(d), { parent: "ghost" }),
    "comp-parent-missing",
  ],
  [
    "parent cycle",
    (d) => set(layerOf(d, "rig"), { parent: "house" }),
    "comp-parent-cycle",
  ],
  [
    "missing matte",
    (d) => set(house(d), { trackMatte: { layer: "ghost", mode: "alpha" } }),
    "comp-matte-missing",
  ],
  [
    "self matte",
    (d) => set(house(d), { trackMatte: { layer: "house", mode: "alpha" } }),
    "comp-matte-self",
  ],
  [
    "matte cycle",
    (d) =>
      set(layerOf(d, "panel-matte"), {
        trackMatte: { layer: "panel-store", mode: "alpha" },
      }),
    "comp-matte-cycle",
  ],
  [
    "open mask",
    (d) =>
      set((house(d).masks as object[])[1]!, {
        path: {
          closed: false,
          vertices: [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
        },
      }),
    "comp-mask-open",
  ],
  [
    "missing precomp",
    (d) => set(layerOf(d, "inset"), { comp: "ghost" }),
    "comp-precomp-missing",
  ],
  [
    "precomp cycle",
    (d) =>
      d.precomps![1]!.layers.push({
        id: "loop",
        type: "precomp",
        comp: "scene",
      }),
    "comp-precomp-cycle",
  ],
  [
    "missing asset",
    (d) => set((house(d).sources as object[])[0]!, { asset: "ghost" }),
    "comp-asset-missing",
  ],
  [
    "wrong asset type",
    (d) => set((house(d).sources as object[])[0]!, { asset: "display" }),
    "comp-asset-type",
  ],
  [
    "crop outside asset",
    (d) => set((house(d).sources as object[])[1]!, { crop: [0, 0, 700, 400] }),
    "comp-crop-bounds",
  ],
  [
    "registration without contain",
    (d) => set(house(d), { fit: "cover" }),
    "comp-image-registration",
  ],
  [
    "state out of range",
    (d) => set(house(d), { state: 2 }),
    "comp-state-range",
  ],
  [
    "stateFrom without stateMix",
    (d) => set(house(d), { stateMix: undefined }),
    "comp-state-mix",
  ],
  [
    "unknown text style",
    (d) => set(layerOf(d, "headline"), { style: "ghost" }),
    "comp-text-style-missing",
  ],
  [
    "display text without pinned font",
    (d) => set(layerOf(d, "textbox"), { fontSize: 200, fontAsset: undefined }),
    "comp-text-font",
  ],
  [
    "text state out of range",
    (d) => set(layerOf(d, "textbox"), { state: 2 }),
    "comp-state-range",
  ],
  [
    "marker after the end",
    (d) => set(d.markers![1]!, { frame: 120 }),
    "comp-marker-frame",
    "markers[1].frame",
  ],
  [
    "unknown cue",
    (d) => set(d.textAnimators![0]!, { cue: "ghost" }),
    "comp-marker-missing",
    "textAnimators[0].cue",
  ],
  [
    "unknown signal",
    (d) => set(d.drivers![0]!, { signal: "ghost" }),
    "comp-signal-missing",
    "drivers[0].signal",
  ],
  [
    "constraint without layer",
    (d) => set(d.constraints![0]!, { toward: "ghost" }),
    "comp-constraint-target",
    "constraints[0].toward",
  ],
  [
    "text animator on an image",
    (d) => set(d.textAnimators![0]!, { node: "house" }),
    "comp-text-animator-target",
  ],
  [
    "camera depth on a child",
    (d) => set(layerOf(d, "key"), { cameraDepth: 1 }),
    "comp-camera-depth",
  ],
  [
    "camera depth inside a precomp",
    (d) => set(d.precomps![0]!.layers[0]!, { cameraDepth: 1 }),
    "comp-camera-depth",
    "precomps[0].layers[0].cameraDepth",
  ],
  [
    "jolt after the end",
    (d) => set(d.camera2d!.jolts![0]!, { frame: 120 }),
    "comp-camera-jolt",
  ],
  [
    "camera key order",
    (d) => set(d.camera2d!.keys[1]!, { frame: 0 }),
    "comp-key-order",
    "camera2d.keys[1].frame",
  ],
  [
    "format size",
    (d) => set(d, { format: "vertical" }),
    "comp-format-size",
    "format",
  ],
  [
    "metadata size",
    (d) =>
      set(d, {
        metadata: { blob: "x".repeat(COMPOSITION_LIMITS.maxMetadataBytes) },
      }),
    "comp-metadata-size",
    "metadata",
  ],
  [
    "driver with two sources",
    (d) => set(d.drivers![0]!, { source: "house.x" }),
    "comp-driver-source",
  ],
  [
    "periodic with two targets",
    (d) => set(d.periodic![0]!, { node: "cloud", property: "x" }),
    "comp-periodic",
  ],
  [
    "path syntax",
    (d) => set(d.drivers![1]!, { target: "shadow..x" }),
    "comp-path-syntax",
    "drivers[1].target",
  ],
  [
    "path scope",
    (d) => set(d.drivers![1]!, { target: "leaf/dot.transform.rotation" }),
    "comp-path-scope",
  ],
  [
    "path layer",
    (d) => set(d.drivers![1]!, { target: "ghost.x" }),
    "comp-path-layer",
  ],
  [
    "path property",
    (d) => set(d.drivers![1]!, { target: "shadow.transform.wobble" }),
    "comp-path-property",
  ],
  [
    "non-scalar target",
    (d) => set(d.drivers![1]!, { target: "shadow.transform.position" }),
    "comp-path-type",
  ],
  [
    "read-only target",
    (d) => set(d.drivers![1]!, { target: "comp.camera.zoom" }),
    "comp-path-readonly",
  ],
  [
    "legacy property without a general form",
    (d) => set(d.drivers![1]!, { target: "shadow.blur" }),
    "comp-feature-unavailable",
    "drivers[1].target",
  ],
  [
    "shape layer",
    (d) => d.layers.push({ id: "shape", type: "shape", contents: [] } as never),
    "comp-feature-unavailable",
  ],
  [
    "3D layer",
    (d) => set(house(d), { threeD: true }),
    "comp-feature-unavailable",
  ],
  [
    "effects",
    (d) => set(house(d), { effects: [{ id: "glow", effect: "light.glow" }] }),
    "comp-feature-unavailable",
  ],
  [
    "expressions",
    (d) =>
      set(d, {
        expressions: {
          "house.transform.rotation": { source: "wiggle(2, 6, 7)" },
        },
      }),
    "comp-feature-unavailable",
    "expressions",
  ],
  [
    "motion blur",
    (d) => set(d.motionBlur!, { enabled: true }),
    "comp-feature-unavailable",
    "motionBlur",
  ],
  [
    "linear compositing",
    (d) => set(d, { colorSpace: "linear-srgb" }),
    "comp-feature-unavailable",
    "colorSpace",
  ],
  [
    "video asset",
    (d) =>
      d.assets.push({
        id: "clip",
        type: "video",
        path: "clip.mp4",
        sha256: `sha256:${"0".repeat(64)}`,
      }),
    "comp-feature-unavailable",
  ],
];

describe("composition-1 invalid variants", () => {
  it.each(invalid)("%s", (_, mutate, code, path) => {
    const doc = everyField() as Doc;
    mutate(doc);
    const diagnostics = errors(doc);
    expectDiagnostic(diagnostics, code, path);
    for (const d of diagnostics)
      expect(Object.keys(COMPOSITION_DIAGNOSTICS)).toContain(d.code);
  });

  it("reports JSON paths into nested keys", () => {
    const doc = everyField() as Doc;
    set(house(doc).transform as object, {
      rotation: {
        keys: [
          { frame: 10, value: 0 },
          { frame: 5, value: 1 },
        ],
      },
    });
    expectDiagnostic(
      errors(doc),
      "comp-key-order",
      `layers[${houseIndex(doc)}].transform.rotation.keys[1].frame`,
    );
  });

  it("names unknown fields", () => {
    const doc = everyField() as Doc;
    set(house(doc), { wobble: 1 });
    const [diagnostic] = errors(doc);
    expect(diagnostic).toMatchObject({
      code: "comp-schema-unknown-key",
      path: `layers[${houseIndex(doc)}]`,
      message: 'unknown field "wobble"',
    });
  });

  it("limits parent chains to 32", () => {
    const chain = (length: number) => {
      const doc = firstSlice() as Doc;
      doc.layers = Array.from({ length: length + 1 }, (_, i) => ({
        id: `n${i}`,
        type: "null" as const,
        ...(i ? { parent: `n${i - 1}` } : {}),
      }));
      return validateComposition(doc);
    };
    expect(chain(COMPOSITION_LIMITS.maxParentDepth).ok).toBe(true);
    expectDiagnostic(
      chain(COMPOSITION_LIMITS.maxParentDepth + 1).diagnostics,
      "comp-parent-depth",
    );
  });

  it("limits precomp nesting to 8", () => {
    const nest = (depth: number) => {
      const doc = firstSlice() as Doc;
      doc.precomps = Array.from({ length: depth }, (_, i) => ({
        id: `p${i}`,
        width: 100,
        height: 100,
        frameCount: 10,
        layers:
          i < depth - 1
            ? [{ id: "inner", type: "precomp" as const, comp: `p${i + 1}` }]
            : [],
      }));
      doc.layers = [{ id: "outer", type: "precomp", comp: "p0" }];
      return validateComposition(doc);
    };
    expect(nest(COMPOSITION_LIMITS.maxPrecompDepth).ok).toBe(true);
    expectDiagnostic(
      nest(COMPOSITION_LIMITS.maxPrecompDepth + 1).diagnostics,
      "comp-precomp-depth",
    );
  });

  it("limits the total layer count across precomps", () => {
    const doc = firstSlice() as Doc;
    const solids = (n: number, prefix: string) =>
      Array.from({ length: n }, (_, i) => ({
        id: `${prefix}${i}`,
        type: "solid" as const,
        size: [10, 10] as [number, number],
        color: "#000000",
      }));
    doc.layers = [
      ...solids(1500, "r"),
      { id: "inner", type: "precomp", comp: "big" },
    ];
    doc.precomps = [
      {
        id: "big",
        width: 100,
        height: 100,
        frameCount: 10,
        layers: solids(600, "p"),
      },
    ];
    expectDiagnostic(errors(doc), "comp-layer-limit");
  });
});

describe("composition-1 warnings", () => {
  const warnings = (doc: Doc) => {
    const result = validateComposition(doc);
    expect(result.ok).toBe(true);
    return result.diagnostics;
  };

  it.each<[string, (doc: Doc) => void, string]>([
    [
      "layer that never shows",
      (d) => set(layerOf(d, "key"), { inPoint: 120, outPoint: 130 }),
      "comp-layer-never-visible",
    ],
    [
      "matte not directly above",
      (d) =>
        set(layerOf(d, "key"), {
          trackMatte: { layer: "needle", mode: "alpha" },
        }),
      "comp-matte-not-adjacent",
    ],
    [
      "camera depth without a camera",
      (d) => set(d, { camera2d: undefined }),
      "comp-camera-depth-unused",
    ],
    [
      "unused precomp",
      (d) =>
        d.precomps!.push({
          id: "spare",
          width: 100,
          height: 100,
          frameCount: 10,
          layers: [],
        }),
      "comp-precomp-unused",
    ],
  ])("%s", (_, mutate, code) => {
    const doc = everyField() as Doc;
    mutate(doc);
    expect(warnings(doc)).toContainEqual(
      expect.objectContaining({ code, severity: "warning" }),
    );
  });
});

describe("composition diagnostics catalogue", () => {
  it("documents every code in the composition reference", () => {
    const reference = readFileSync(
      resolve(root, "docs/composition-reference.md"),
      "utf8",
    );
    for (const code of [
      ...Object.keys(COMPOSITION_DIAGNOSTICS),
      ...Object.keys(COMPOSITION_WARNINGS),
    ])
      expect(reference, code).toContain(`\`${code}\``);
  });

  it("keeps the generated JSON Schema next to the contract", () => {
    const schema = JSON.parse(
      readFileSync(
        resolve(
          root,
          "packages/scene-contract/schemas/composition-1.schema.json",
        ),
        "utf8",
      ),
    );
    expect(schema.title).toContain("composition-1");
  });
});

describe("passage diagnostics", () => {
  it("keeps stable contract codes from tagged schema issues", () => {
    const doc = everyField() as Doc;
    set(layerOf(doc, "key"), { parent: "ghost" });
    const error = CompositionSchema.safeParse(doc).error!;
    expect(passageDiagnostics(error)).toContainEqual(
      expect.objectContaining({
        code: "comp-parent-missing",
        severity: "error",
        path: `layers.${indexOf(doc, "key")}.parent`,
      }),
    );
    expect(
      passageDiagnostics(
        CompositionSchema.safeParse({ ...doc, width: "wide" }).error!,
      )[0]!.code,
    ).toBe("invalid-contract");
  });
});
