/**
 * CG7: the color-management contract (media color descriptor, composition
 * working space, grade.color-space-transform) and the grade run's working
 * space conversions. Design: docs/color-grading-cg7-decisions.md.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bakeCubeLut,
  COLOR_SPACE_TRANSFORM_SPACES,
  sampleLut,
  INPUT_TRANSFORMS,
  spaceConversion,
  WORKING_SPACES,
  type Rgb,
} from "@still-shift/color-science";
import {
  COMPOSITION_CAMERA_ENCODINGS,
  COMPOSITION_CONVERSION_SPACES,
  COMPOSITION_MANAGED_WORKING_SPACES,
  COMPOSITION_UNAVAILABLE_CAMERA_ENCODINGS,
  compositionEffectDefinition,
  compositionWarnings,
  compositionWorkingSpace,
  CompositionSchema,
  validateComposition,
  type Composition,
  type CompositionAsset,
} from "@still-shift/scene-contract";
import {
  ACESCCT_DECODE_CEILING,
  conversionOp,
  floatGradeBytes,
  floatGradeOp,
  floatGradeRun,
} from "../../packages/renderer-core/src/composition/render/float-grade.ts";
import type { RenderEffect } from "../../packages/renderer-core/src/composition/render/graph.ts";
import {
  EFFECT_LUTS,
  preparedLut,
} from "../../packages/renderer-core/src/composition/render/luts.ts";

const fixture = (): Composition =>
  CompositionSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../../benchmarks/fixtures/composition/ce13/contract.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
type Video = Extract<CompositionAsset, { type: "video" }>;
type Sequence = Extract<CompositionAsset, { type: "sequence" }>;
const video = (doc: Composition) => doc.assets[0] as Video;
const codes = (doc: Composition) =>
  validateComposition(doc)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code);
const managed = (doc: Composition, workingSpace?: "acescg") => {
  doc.colorManagement = workingSpace ? { workingSpace } : {};
  return doc;
};

describe("CG7 contract lists match @still-shift/color-science", () => {
  it("camera encodings: validated and unavailable", () => {
    expect([...COMPOSITION_CAMERA_ENCODINGS]).toEqual(
      INPUT_TRANSFORMS.filter((t) => t.status === "validated").map((t) => t.id),
    );
    expect(Object.keys(COMPOSITION_UNAVAILABLE_CAMERA_ENCODINGS)).toEqual(
      INPUT_TRANSFORMS.filter((t) => t.status === "unavailable").map(
        (t) => t.id,
      ),
    );
  });
  it("conversion and working spaces", () => {
    expect([...COMPOSITION_CONVERSION_SPACES]).toEqual([
      ...COLOR_SPACE_TRANSFORM_SPACES,
    ]);
    expect(["legacy-srgb", ...COMPOSITION_MANAGED_WORKING_SPACES]).toEqual([
      ...WORKING_SPACES,
    ]);
  });
});

describe("composition working space", () => {
  it("is legacy-srgb without color management and ACEScct by default with it", () => {
    const doc = fixture();
    expect(compositionWorkingSpace(doc)).toBe("legacy-srgb");
    expect(compositionWorkingSpace(managed(doc))).toBe("acescct");
    expect(compositionWorkingSpace(managed(fixture(), "acescg"))).toBe(
      "acescg",
    );
    expect(codes(managed(fixture()))).toEqual([]);
  });
  it("rejects an unknown working space", () => {
    const doc = {
      ...fixture(),
      colorManagement: { workingSpace: "legacy-srgb" },
    };
    expect(CompositionSchema.safeParse(doc).success).toBe(false);
  });
});

describe("media color descriptor", () => {
  const scene: Video["color"] = {
    primaries: "bt2020",
    transfer: "smpte2084",
    matrix: "bt2020nc",
    range: "tv",
  };
  it("a legacy composition accepts only the SDR set", () => {
    for (const color of [
      scene,
      { ...video(fixture()).color, encoding: "sony-slog3-sgamut3" as const },
      { ...video(fixture()).color, primaries: "smpte432" as const },
    ]) {
      const doc = fixture();
      video(doc).color = color;
      expect(codes(doc)).toEqual(["comp-media-color"]);
    }
  });
  it("a color-managed composition accepts BT.2020, P3, PQ, HLG and camera encodings", () => {
    for (const color of [
      scene,
      { ...scene, transfer: "arib-std-b67" as const },
      { ...scene, primaries: "smpte432" as const, transfer: "bt709" as const },
      {
        primaries: "unspecified" as const,
        transfer: "unspecified" as const,
        matrix: "bt709" as const,
        range: "tv" as const,
        encoding: "arri-logc4-awg4" as const,
      },
    ]) {
      const doc = managed(fixture());
      video(doc).color = color;
      expect(codes(doc)).toEqual([]);
    }
  });
  it("refuses unavailable encodings with their reason", () => {
    const doc = managed(fixture());
    video(doc).color = { ...scene, encoding: "dji-dlog-dgamut" };
    const found = validateComposition(doc).diagnostics;
    expect(found.map((d) => d.code)).toEqual(["comp-media-color"]);
    expect(found[0]!.message).toMatch(/unavailable: No independent/);
  });
  it("needs an encoding when the stream names no transfer or primaries", () => {
    const doc = managed(fixture());
    video(doc).color = { ...scene, transfer: "unspecified" };
    expect(codes(doc)).toEqual(["comp-media-color"]);
  });
  it("keeps sequences on sRGB PNG", () => {
    const doc = managed(fixture());
    (doc.assets[1] as Sequence).color = {
      ...(doc.assets[1] as Sequence).color,
      primaries: "bt2020",
    };
    expect(codes(doc)).toContain("comp-media-sequence");
  });
  it("warns when a declared encoding contradicts the stream metadata", () => {
    const doc = managed(fixture());
    video(doc).color = {
      primaries: "bt709",
      transfer: "bt709",
      matrix: "bt709",
      range: "tv",
      encoding: "sony-slog3-sgamut3",
    };
    expect(codes(doc)).toEqual([]);
    expect(validateComposition(doc).ok).toBe(true);
    const warnings = compositionWarnings(doc).filter(
      (w) => w.code === "comp-media-color-declared",
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.path).toEqual(["assets", 0, "color", "encoding"]);
    expect(warnings[0]!.message).toMatch(/transfer bt709 and primaries bt709/);
    video(doc).color = {
      primaries: "bt2020",
      transfer: "unspecified",
      matrix: "bt2020nc",
      range: "tv",
      encoding: "apple-log-bt2020",
    };
    expect(
      compositionWarnings(doc).filter(
        (w) => w.code === "comp-media-color-declared",
      ),
    ).toEqual([]);
  });
});

describe("grade.color-space-transform", () => {
  const definition = compositionEffectDefinition(
    "grade.color-space-transform",
  )!;
  it("codes index the conversion spaces; same space is neutral", () => {
    expect(definition.version).toBe("1.0.0");
    for (const name of ["from", "to"])
      expect(definition.properties[name]).toMatchObject({
        min: 0,
        max: COMPOSITION_CONVERSION_SPACES.length - 1,
        integer: true,
      });
    for (let code = 0; code < COMPOSITION_CONVERSION_SPACES.length; code++)
      expect(
        floatGradeOp("grade.color-space-transform", { from: code, to: code }),
      ).toBeNull();
  });
  it("equals the float64 conversion for every pair", () => {
    const v: Rgb = [0.2, 0.45, 0.7];
    COMPOSITION_CONVERSION_SPACES.forEach((from, f) =>
      COMPOSITION_CONVERSION_SPACES.forEach((to, t) => {
        if (f === t) return;
        const op = floatGradeOp("grade.color-space-transform", {
          from: f,
          to: t,
        })!;
        expect(op.apply(v)).toEqual(spaceConversion(from, to).apply(v));
      }),
    );
  });
});

describe("grade runs in a working space", () => {
  const effect = (
    id: string,
    name: string,
    params: Record<string, number>,
    workingSpace?: "acescct",
  ): RenderEffect =>
    ({
      id,
      effect: name,
      enabled: true,
      params: {
        ...Object.fromEntries(
          Object.entries(compositionEffectDefinition(name)!.properties).map(
            ([k, p]) => [k, p.default],
          ),
        ),
        ...params,
      },
      ...(workingSpace ? { workingSpace } : {}),
    }) as RenderEffect;
  it("a lone effect is a run only in a color-managed composition", () => {
    const legacy = [effect("a", "grade.primary", { gainMaster: 1.2 })];
    expect(floatGradeRun(legacy, 0)).toBeUndefined();
    const cm = [effect("a", "grade.primary", { gainMaster: 1.2 }, "acescct")];
    expect(floatGradeRun(cm, 0)).toBeDefined();
  });
  it("display → ACEScct → display is exact on every 8-bit code", () => {
    const into = conversionOp("srgb", "acescct")!,
      out = conversionOp("acescct", "srgb")!;
    for (let code = 0; code < 256; code++) {
      const v = code / 255;
      expect(floatGradeBytes([into, out], [v, v, v])).toEqual([
        code,
        code,
        code,
      ]);
    }
  });
  it("legacy and same-space conversions are absent", () => {
    expect(conversionOp("legacy-srgb", "srgb")).toBeNull();
    expect(conversionOp("acescct", "acescct")).toBeNull();
  });
  it("decodes ACEScct above the shared ceiling as the ceiling, like gCctDec", () => {
    for (const to of ["srgb", "acescg", "linear-bt709"]) {
      const op = conversionOp("acescct", to)!;
      // Up to GRADE_LIMIT; two overflowing channels used to give Inf − Inf.
      const got = op.apply([60, 60, 0.4]);
      expect(got.every(Number.isFinite)).toBe(true);
      expect(got).toEqual(
        op.apply([ACESCCT_DECODE_CEILING, ACESCCT_DECODE_CEILING, 0.4]),
      );
      expect(op.apply([10_000, 0.4, 10_000]).every(Number.isFinite)).toBe(true);
    }
    // In-range values are untouched by the ceiling.
    const v: Rgb = [1.2, 0.41, -0.05];
    expect(conversionOp("acescct", "srgb")!.apply(v)).toEqual(
      spaceConversion("acescct", "srgb")
        .apply(v)
        .map((x) => Math.min(10_000, Math.max(-10_000, x))),
    );
  });
});

describe("grade.lut declared spaces", () => {
  const lut = bakeCubeLut(
    ([r, g, b]) => [0.9 * r + 0.05, g * g, 0.2 + 0.7 * b],
    17,
  );
  const prepared = { lut: preparedLut(`sha256:${"c".repeat(64)}`, lut) };
  const op = (source: object) =>
    floatGradeOp(
      "grade.lut",
      { intensity: 0.75, interpolation: 0 },
      { [EFFECT_LUTS]: prepared, ...source },
    )!;
  const v: Rgb = [0.31, 0.47, 0.62];
  it("converts working → input space → table → output space → working", () => {
    const got = op({
      workingSpace: "acescct",
      lutSpaces: { lut: { input: "srgb", output: "linear-bt709" } },
    }).apply(v);
    const x = spaceConversion("acescct", "srgb").apply(v);
    const t = sampleLut(lut, x, "tetrahedral");
    const o = spaceConversion("linear-bt709", "acescct").apply(t);
    got.forEach((g, c) =>
      expect(Math.abs(g - (v[c]! + 0.75 * (o[c]! - v[c]!)))).toBeLessThan(
        1e-12,
      ),
    );
  });
  it("legacy LUTs and spaces equal to the working space convert nothing", () => {
    const legacy = op({}).apply(v);
    const t = sampleLut(lut, v, "tetrahedral");
    legacy.forEach((g, c) => expect(g).toBe(v[c]! + 0.75 * (t[c]! - v[c]!)));
    expect(
      op({
        workingSpace: "acescct",
        lutSpaces: { lut: { input: "acescct", output: "acescct" } },
      }).apply(v),
    ).toEqual(legacy);
  });
  it("wraps a legacy-srgb LUT in a color-managed composition as sRGB", () => {
    // No lutSpaces: the asset declares legacy-srgb, which is encoded sRGB.
    const got = op({ workingSpace: "acescct" }).apply(v);
    const declared = op({
      workingSpace: "acescct",
      lutSpaces: { lut: { input: "srgb", output: "srgb" } },
    }).apply(v);
    expect(got).toEqual(declared);
    const x = spaceConversion("acescct", "srgb").apply(v);
    const o = spaceConversion("srgb", "acescct").apply(
      sampleLut(lut, x, "tetrahedral"),
    );
    got.forEach((g, c) =>
      expect(Math.abs(g - (v[c]! + 0.75 * (o[c]! - v[c]!)))).toBeLessThan(
        1e-12,
      ),
    );
  });
});
