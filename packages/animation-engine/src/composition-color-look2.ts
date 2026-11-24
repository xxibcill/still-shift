/**
 * CGA2 A3: look 2 (`still-shift-look-2`). A look is an ordered list of float
 * `grade.*` operators at strength 1 — a serial node list, so CG9's `grade-1`
 * document can migrate it — plus the fit report, the solver targets, the
 * pinned sources and any LUT asset (pinned by SHA-256, its path relative to
 * the look file). A look-1 file reads as a one-entry `grade.rgb-mixer` look.
 *
 * `comp look fit --engine grade` fits models 1–3 (and the `lut` model when
 * asked for) in encoded and linear light, measures each by leave-one-shot-out
 * per-pixel residual through the renderer's ops, and keeps the best score
 * (residual plus a stated complexity penalty).
 */
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import {
  MAX_LUT_3D_SIZE,
  parseCubeLut,
  sampleLut,
  writeCubeLut,
  type CdlFileKind,
  type CubeLut,
  type Rgb,
} from "@still-shift/color-science";
import {
  COLOR_MATRIX_COEFFICIENTS,
  COLOR_MATRIX_OFFSETS,
  CompositionLutAssetSchema,
  compositionEffectDefinition,
  FLOAT_GRADE_EFFECT_IDS,
  type CompositionLutAsset,
} from "@still-shift/scene-contract";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import type { FloatGradeOp } from "../../renderer-core/src/composition/render/float-grade.ts";
import {
  EFFECT_LUTS,
  preparedLut,
} from "../../renderer-core/src/composition/render/luts.ts";
import {
  COLOR_LOOK_VERSION,
  ColorLookResidualSchema,
  colorLookAfterInterpretation,
  colorLookDataSummary,
  colorLookHeldOutSummary,
  colorLookSources,
  colorLookTargets,
  matchColorLookPairs,
  parseColorLook,
  type ColorLook,
  type ColorLookFitOptions,
  type ColorLookResidual,
} from "./composition-color-look.ts";
import {
  COLOR_BLOCK,
  type ColorBlockSet,
} from "./composition-color-matrix-fit.ts";
import {
  COLOR_LOOK_AUTO_MODELS,
  COLOR_LOOK_LUT_SIZE,
  COLOR_LOOK_MODELS,
  COLOR_LOOK_PENALTY_PER_PARAMETER,
  COLOR_LOOK_SPACES,
  colorLookModelOps,
  colorLookOps,
  colorLookOpsResidual,
  fitColorLookLut,
  fitColorLookModel,
  type ColorLookEffect,
  type ColorLookModel,
  type ColorLookModelFit,
  type ColorLookSpace,
} from "./composition-color-look-models.ts";
import { prepareCompositionLuts } from "./composition-luts.ts";
import { paramsWithDefaults } from "./composition-color-engine.ts";
import { bakeGradeOps, gradeCdlText } from "./composition-grade-interchange.ts";
import { roundTo } from "./composition-color-round.ts";

export const COLOR_LOOK_2_VERSION = "still-shift-look-2";
const round = (value: number, digits = 4) => roundTo(value, digits);

const LookEffectSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-zA-Z][\w-]*$/)
      .max(128),
    // Operators only: a look is pointwise, so it bakes to a LUT.
    effect: z.enum(
      FLOAT_GRADE_EFFECT_IDS.filter((id) => id !== "grade.key") as [
        Exclude<(typeof FLOAT_GRADE_EFFECT_IDS)[number], "grade.key">,
        ...Exclude<(typeof FLOAT_GRADE_EFFECT_IDS)[number], "grade.key">[],
      ],
    ),
    params: z.record(
      z.string(),
      z.union([z.number(), z.array(z.array(z.number()))]),
    ),
    assets: z.object({ lut: z.string() }).strict().optional(),
  })
  .strict()
  .superRefine((effect, ctx) => {
    // The contract's own bounds, so every valid look renders.
    const checked = compositionEffectDefinition(
      effect.effect,
    )!.params.safeParse(effect.params);
    if (!checked.success)
      ctx.addIssue({
        code: "custom",
        path: ["params", ...(checked.error.issues[0]?.path ?? [])] as (
          | string
          | number
        )[],
        message: checked.error.issues[0]?.message ?? "invalid parameters",
      });
    if ((effect.effect === "grade.lut") !== (effect.assets?.lut !== undefined))
      ctx.addIssue({
        code: "custom",
        path: ["assets"],
        message: "grade.lut (and only grade.lut) binds a LUT asset",
      });
  });
const HeldOutSchema = z
  .object({
    rmsMean: z.number(),
    rmsMax: z.number(),
    p99Max: z.number(),
    blockRmsMean: z.number(),
    blockRmsMax: z.number(),
  })
  .strict();
const CandidateSchema = z
  .object({
    model: z.enum(COLOR_LOOK_MODELS),
    space: z.enum(COLOR_LOOK_SPACES),
    parameters: z.number().int().min(1),
    residual: ColorLookResidualSchema,
    heldOut: HeldOutSchema.nullable(),
    /** Held-out (or, with one shot, in-sample) RMS plus the penalty. */
    score: z.number(),
    selected: z.boolean(),
  })
  .strict();

/**
 * LUT spaces a look accepts: the legacy working space, in which CGA2's
 * compositions render, so neither converts anything there.
 */
const LOOK_LUT_SPACES: readonly string[] = ["legacy-srgb", "srgb"];

export const ColorLook2Schema = z
  .object({
    schemaVersion: z.literal(COLOR_LOOK_2_VERSION),
    model: z.enum(COLOR_LOOK_MODELS),
    space: z.enum(COLOR_LOOK_SPACES),
    /** Ordered `grade.*` operators at strength 1: a serial node list. */
    effects: z.array(LookEffectSchema).min(1).max(8),
    /**
     * LUT assets the effects bind; paths are relative to the look file. Their
     * tables map encoded sRGB (`LOOK_LUT_SPACES`): a look is predicted, fitted
     * and exported without CG7's LUT space conversions.
     */
    assets: z.array(CompositionLutAssetSchema).max(1),
    summary: z
      .object({
        neutralGains: z.tuple([z.number(), z.number(), z.number()]),
        lumaChange: z.number(),
        saturationScale: z.number(),
      })
      .strict(),
    fit: z
      .object({
        method: z.string(),
        afterInterpretation: z.enum(["code-values", "media-path"]),
        afterTransfer: z.string(),
        pairs: z.number().int().min(1),
        pixels: z.number().int().min(1),
        selection: z
          .object({
            requested: z.enum(["auto", ...COLOR_LOOK_MODELS]),
            basis: z.enum(["held-out", "in-sample"]),
            penaltyPerParameter: z.number(),
            rule: z.string(),
          })
          .strict(),
        candidates: z.array(CandidateSchema),
        residual: ColorLookResidualSchema,
        heldOut: HeldOutSchema.nullable(),
        shots: z.array(
          z
            .object({
              after: z.tuple([z.number().int(), z.number().int()]),
              before: z.string(),
              correlation: z.number(),
              pairs: z.array(z.tuple([z.number(), z.number(), z.number()])),
              residual: ColorLookResidualSchema,
              heldOut: ColorLookResidualSchema.nullable(),
            })
            .strict(),
        ),
        unmatchedShots: z.array(z.tuple([z.number().int(), z.number().int()])),
        /** `lut` model: table nodes no sample touched, kept at model 3. */
        lut: z
          .object({
            size: z.number().int(),
            nodes: z.number().int(),
            filledFromModel3: z.number().int(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    targets: z
      .object({
        medianLuma: z.number().min(0).max(1),
        saturation: z.number().min(0).max(1),
        strongSaturation: z.number().min(0).max(1),
      })
      .strict()
      .optional(),
    sources: z
      .object({
        before: z.array(
          z.object({ name: z.string(), sha256: z.string() }).strict(),
        ),
        after: z.object({ name: z.string(), sha256: z.string() }).strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((look, ctx) => {
    look.assets.forEach((asset, index) => {
      for (const key of ["inputSpace", "outputSpace"] as const)
        if (!LOOK_LUT_SPACES.includes(asset[key]))
          ctx.addIssue({
            code: "custom",
            path: ["assets", index, key],
            message: `A look's LUT maps encoded sRGB (${LOOK_LUT_SPACES.join(" or ")}), not ${asset[key]}`,
          });
    });
    const ids = new Set<string>();
    look.effects.forEach((effect, index) => {
      if (ids.has(effect.id))
        ctx.addIssue({
          code: "custom",
          path: ["effects", index, "id"],
          message: `Duplicate effect id ${effect.id}`,
        });
      ids.add(effect.id);
      const lut = effect.assets?.lut;
      if (lut !== undefined && !look.assets.some((asset) => asset.id === lut))
        ctx.addIssue({
          code: "custom",
          path: ["effects", index, "assets", "lut"],
          message: `No LUT asset ${lut}`,
        });
    });
  });
export type ColorLook2 = z.infer<typeof ColorLook2Schema>;
/** A look file of either version. */
export type AnyColorLook = ColorLook | ColorLook2;

/** Parse a look-1 or look-2 document (look 1 stays look 1). */
export function parseAnyColorLook(value: unknown): AnyColorLook {
  const version = (value as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (version === COLOR_LOOK_VERSION) return parseColorLook(value);
  const parsed = ColorLook2Schema.safeParse(value);
  if (!parsed.success)
    passageError(
      "comp-look-format",
      `Look file is not a valid ${COLOR_LOOK_VERSION} or ${COLOR_LOOK_2_VERSION} document`,
      { path: parsed.error.issues[0]?.path.join(".") || "look" },
    );
  return parsed.data;
}

export const isColorLook2 = (look: AnyColorLook): look is ColorLook2 =>
  look.schemaVersion === COLOR_LOOK_2_VERSION;

/** A look's operators at strength 1; look 1 is one `grade.rgb-mixer`. */
export function colorLookStack(look: AnyColorLook): ColorLookEffect[] {
  if (isColorLook2(look)) return look.effects as ColorLookEffect[];
  return [
    { id: "look", effect: "grade.rgb-mixer", params: { ...look.params } },
  ];
}

/** A look's LUT, read and verified against its pin, by asset id. */
export type ColorLookLut = {
  asset: CompositionLutAsset;
  /** Absolute path of the `.cube`. */
  path: string;
  lut: CubeLut;
};

/** Read and verify a look-2 file's LUT assets (paths relative to the look). */
export async function loadColorLookLuts(
  look: AnyColorLook,
  lookPath: string,
): Promise<Map<string, ColorLookLut>> {
  const out = new Map<string, ColorLookLut>();
  if (!isColorLook2(look) || !look.assets.length) return out;
  const prepared = await prepareCompositionLuts(
    { assets: look.assets },
    dirname(resolve(lookPath)),
  );
  for (const asset of look.assets)
    out.set(asset.id, {
      asset,
      path: prepared.assetPaths[asset.id]!,
      lut: prepared.luts.get(asset.id)!,
    });
  return out;
}

const tablesOf = (luts: ReadonlyMap<string, ColorLookLut>) =>
  new Map([...luts].map(([id, entry]) => [id, entry.lut]));

/** The look's ops at strength 1 (LUTs from `luts`). */
export const colorLookStackOps = (
  look: AnyColorLook,
  luts: ReadonlyMap<string, ColorLookLut> = new Map(),
): FloatGradeOp[] => colorLookOps(colorLookStack(look), tablesOf(luts));

/** An effect a correction can carry: a look operator or a strength key. */
export type ColorLookApplyEffect = {
  id: string;
  effect: string;
  params: Record<string, number | number[][]>;
  assets?: Record<string, string>;
};

/**
 * The grade-engine effects that apply a look at a 0–1 strength: the mix of
 * the look's output with its input. One `grade.rgb-mixer` (look 1) or one
 * `grade.lut` mixes by its own parameter; a longer look sits behind a
 * constant `grade.key` (gain = strength), closed by a neutral key when more
 * effects follow (`closed`), so they are not mixed too. A `grade.lut` effect
 * carries its prepared table for the exact prediction.
 */
export function colorLookApplyEffects(
  look: AnyColorLook,
  strength: number,
  luts: ReadonlyMap<string, ColorLookLut> = new Map(),
  options: { closed?: boolean } = {},
): ColorLookApplyEffect[] {
  const s = roundTo(Math.max(0, Math.min(1, strength)), 6);
  const stack = colorLookStack(look).map((effect) => {
    const lutId = effect.assets?.lut;
    if (lutId === undefined) return { ...effect, params: { ...effect.params } };
    const entry = luts.get(lutId);
    if (!entry)
      passageError("comp-look-lut", `Look LUT ${lutId} is not loaded`, {
        path: "look.assets",
      });
    return Object.assign(
      { ...effect, params: { ...effect.params } },
      { [EFFECT_LUTS]: { lut: preparedLut(entry.asset.sha256, entry.lut) } },
    );
  });
  if (stack.length === 1) {
    const only = stack[0]!;
    if (only.effect === "grade.rgb-mixer")
      return [{ ...only, params: { ...only.params, strength: s } }];
    if (only.effect === "grade.lut")
      return [{ ...only, params: { ...only.params, intensity: s } }];
  }
  if (s === 1) return stack;
  return [
    { id: "look-strength", effect: "grade.key", params: { gain: s } },
    ...stack,
    ...(options.closed
      ? [{ id: "look-end", effect: "grade.key", params: {} }]
      : []),
  ];
}

/**
 * Look 1 as `color.matrix` parameters for `--engine legacy`: a look-1 file,
 * or a look-2 file that is exactly look 1 (one encoded `grade.rgb-mixer`
 * within `color.matrix`'s bounds). Other looks need the grade engine.
 */
export function colorLookLegacyParams(
  look: AnyColorLook,
): Record<string, number> {
  if (!isColorLook2(look)) return { ...look.params };
  const only = look.effects.length === 1 ? look.effects[0]! : undefined;
  const definition = compositionEffectDefinition("color.matrix")!;
  if (
    only?.effect === "grade.rgb-mixer" &&
    (only.params.strength ?? 1) === 1 &&
    definition.params.safeParse({ ...only.params, strength: 1 }).success
  ) {
    const params = { ...only.params } as Record<string, number>;
    delete params.strength;
    return params;
  }
  passageError(
    "comp-look-engine",
    `A ${look.model} look (${look.space}) applies through the grade engine only; use --engine grade`,
    { path: "engine" },
  );
}

// --- fit ------------------------------------------------------------------------------

export type ColorLook2FitOptions = ColorLookFitOptions & {
  /** `auto` (default) picks among models 1–3; a model name forces it. */
  model?: "auto" | ColorLookModel;
  /** The LUT file name recorded in the look (relative to it), for `lut`. */
  lutPath?: string;
};
export type ColorLook2Fit = {
  look: ColorLook2;
  /** `.cube` text to write at `lutPath`, for a `lut` look. */
  cube?: string;
};

const SELECTION_RULE = `score = mean leave-one-shot-out per-pixel RMS (of 255; in-sample with one shot) + ${COLOR_LOOK_PENALTY_PER_PARAMETER} per free parameter; lowest score among the requested models in either space; lut is fitted only on request (owner decision 5 open; recommendation: opt-in)`;

type Measured = {
  fit: ColorLookModelFit;
  residual: ColorLookResidual;
  shotResidual: ColorLookResidual[];
  heldOut: (ColorLookResidual | null)[];
};

/**
 * Fit look 2: every requested model in both spaces, measured through the
 * renderer's ops per pixel (in-sample and leave-one-shot-out), the best score
 * kept.
 */
export async function fitColorLook2(
  beforePaths: readonly string[],
  afterPath: string,
  options: ColorLook2FitOptions = {},
): Promise<ColorLook2Fit> {
  const progress = options.progress ?? (() => undefined);
  const requested = options.model ?? "auto";
  const pairs = await matchColorLookPairs(beforePaths, afterPath, options);
  const { sets, matches } = pairs;
  const shots = matches.map((_, index) => index);
  const shotSets = shots.map((shot) => sets.filter((set) => set.shot === shot));
  const otherSets = shots.map((shot) =>
    sets.filter((set) => set.shot !== shot),
  );
  const measure = (
    fitOn: (subset: readonly ColorBlockSet[]) => ColorLookModelFit,
  ): Measured => {
    const fit = fitOn(sets);
    const ops = colorLookModelOps(fit);
    return {
      fit,
      residual: colorLookOpsResidual(ops, sets),
      shotResidual: shotSets.map((own) => colorLookOpsResidual(ops, own)),
      heldOut: shots.map((shot) =>
        otherSets[shot]!.length
          ? colorLookOpsResidual(
              colorLookModelOps(fitOn(otherSets[shot]!)),
              shotSets[shot]!,
            )
          : null,
      ),
    };
  };
  const scoreOf = (m: Measured) => {
    const held = m.heldOut.filter((r): r is ColorLookResidual => r !== null);
    const rms = held.length
      ? held.reduce((sum, r) => sum + r.rms, 0) / held.length
      : m.residual.rms;
    return round(rms + COLOR_LOOK_PENALTY_PER_PARAMETER * m.fit.parameters);
  };
  const measured: Measured[] = [];
  const models = [
    ...COLOR_LOOK_AUTO_MODELS,
    ...(requested === "lut" ? (["lut"] as const) : []),
  ];
  for (const model of models) {
    if (model === "lut") {
      // On model 3 in its better space; nodes with no sample keep model 3.
      const base = measured
        .filter((m) => m.fit.model === "matrix-curves")
        .sort((a, b) => scoreOf(a) - scoreOf(b))[0]!;
      progress(
        `fitting lut (${COLOR_LOOK_LUT_SIZE}³ on matrix-curves, ${base.fit.space})`,
      );
      measured.push(
        measure((subset) =>
          fitColorLookLut(
            subset,
            fitColorLookModel(subset, "matrix-curves", base.fit.space),
          ),
        ),
      );
      continue;
    }
    for (const space of COLOR_LOOK_SPACES) {
      progress(`fitting ${model} (${space})`);
      measured.push(
        measure((subset) => fitColorLookModel(subset, model, space)),
      );
    }
  }
  const eligible = measured.filter((m) =>
    requested === "auto" ? true : m.fit.model === requested,
  );
  const chosen = [...eligible].sort(
    (a, b) =>
      scoreOf(a) - scoreOf(b) ||
      a.fit.parameters - b.fit.parameters ||
      COLOR_LOOK_SPACES.indexOf(a.fit.space) -
        COLOR_LOOK_SPACES.indexOf(b.fit.space),
  )[0]!;
  const held = chosen.heldOut.filter((r): r is ColorLookResidual => r !== null);
  const lutPath = options.lutPath ?? "look.cube";
  let cube: string | undefined;
  const assets: CompositionLutAsset[] = [];
  if (chosen.fit.lut) {
    cube = writeCubeLut(chosen.fit.lut);
    assets.push({
      id: "look-lut",
      type: "lut",
      path: lutPath,
      sha256: `sha256:${createHash("sha256").update(cube).digest("hex")}`,
      format: "cube",
      inputSpace: "legacy-srgb",
      outputSpace: "legacy-srgb",
    });
  }
  const ops = colorLookModelOps(chosen.fit);
  let gray: Rgb = [0.5, 0.5, 0.5];
  for (const op of ops) gray = op.apply(gray);
  const look = parseColorLook2({
    schemaVersion: COLOR_LOOK_2_VERSION,
    model: chosen.fit.model,
    space: chosen.fit.space,
    effects: chosen.fit.effects,
    assets,
    summary: {
      neutralGains: gray.map((v) => round(v / 0.5)),
      ...colorLookDataSummary(sets),
    },
    fit: {
      method:
        "4x4 block means of the matched pairs; matrix: trimmed least squares (95%, 2 passes); cdl: Levenberg-Marquardt (trimmed 95%); matrix-curves: alternating matrix Gauss-Newton and 16-point monotone PCHIP curves; lut: 33³ tetrahedral least squares with Laplacian smoothing on model 3. Residuals per pixel through the renderer's float ops (one quantization)",
      afterInterpretation: colorLookAfterInterpretation(pairs),
      afterTransfer: pairs.after.probe.color.transfer,
      pairs: matches.reduce((count, match) => count + match.pairs.length, 0),
      pixels: sets.reduce(
        (sum, set) => sum + set.count * COLOR_BLOCK * COLOR_BLOCK,
        0,
      ),
      selection: {
        requested,
        basis: held.length ? "held-out" : "in-sample",
        penaltyPerParameter: COLOR_LOOK_PENALTY_PER_PARAMETER,
        rule: SELECTION_RULE,
      },
      candidates: measured.map((m) => ({
        model: m.fit.model,
        space: m.fit.space,
        parameters: m.fit.parameters,
        residual: m.residual,
        heldOut: colorLookHeldOutSummary(
          m.heldOut.filter((r): r is ColorLookResidual => r !== null),
        ),
        score: scoreOf(m),
        selected: m === chosen,
      })),
      residual: chosen.residual,
      heldOut: colorLookHeldOutSummary(held),
      shots: matches.map((match, shot) => ({
        after: match.shot,
        before: pairs.befores[match.clip]!.name,
        correlation: match.correlation,
        pairs: match.pairs,
        residual: chosen.shotResidual[shot]!,
        heldOut: chosen.heldOut[shot]!,
      })),
      unmatchedShots: pairs.unmatched,
      ...(chosen.fit.lutFill
        ? {
            lut: {
              size: COLOR_LOOK_LUT_SIZE,
              nodes: chosen.fit.lutFill.nodes,
              filledFromModel3: chosen.fit.lutFill.filled,
            },
          }
        : {}),
    },
    targets: colorLookTargets(pairs),
    sources: colorLookSources(pairs),
  });
  return { look, ...(cube === undefined ? {} : { cube }) };
}

export function parseColorLook2(value: unknown): ColorLook2 {
  const parsed = ColorLook2Schema.safeParse(value);
  if (!parsed.success)
    passageError(
      "comp-look-format",
      `Look is not a valid ${COLOR_LOOK_2_VERSION} document: ${parsed.error.issues[0]?.message}`,
      { path: parsed.error.issues[0]?.path.join(".") || "look" },
    );
  return parsed.data;
}

/** Look 1's `color.matrix` parameters as a matrix (rows of r, g, b, offset). */
export const colorLookMatrixRows = (params: Record<string, number>) =>
  [0, 1, 2].map((c) => [
    ...COLOR_MATRIX_COEFFICIENTS[c]!.map((name) => params[name]!),
    params[COLOR_MATRIX_OFFSETS[c]!]!,
  ]);

// --- export ---------------------------------------------------------------------------

/** CG5's bake bound at 33³, in code values. */
const CUBE_BOUND_CODES = 2;
const quantizeCode = (v: number) =>
  v >= 1 ? 255 : v > 0 ? Math.floor(v * 255 + 0.5) : 0;
/** The table through tetrahedral sampling against the ops, 8-bit in and out. */
function cubeRoundTrip(
  table: CubeLut,
  ops: readonly { apply: (v: Rgb) => Rgb }[],
) {
  let maxCodes = 0,
    colors = 0;
  const check = (r: number, g: number, b: number) => {
    const v: Rgb = [r / 255, g / 255, b / 255];
    let want: Rgb = v;
    for (const op of ops) want = op.apply(want);
    const got = sampleLut(table, v);
    for (let c = 0; c < 3; c++)
      maxCodes = Math.max(
        maxCodes,
        Math.abs(quantizeCode(got[c]!) - quantizeCode(want[c]!)),
      );
    colors++;
  };
  for (let r = 0; r < 256; r += 5)
    for (let g = 0; g < 256; g += 5)
      for (let b = 0; b < 256; b += 5) check(r, g, b);
  for (let v = 0; v < 256; v++) check(v, v, v);
  return { colors, maxCodes };
}

export type ColorLookExportReport = {
  schema: "still-shift.look-export-1";
  look: {
    schemaVersion: string;
    model: ColorLookModel;
    space: ColorLookSpace;
  };
  format: "cube" | CdlFileKind;
  /** The look's operators in order. */
  effects: string[];
  /** `.cube`: grid points per edge and the mix applied. */
  size?: number;
  strength?: number;
  /**
   * `.cube`: the written table through `grade.lut` (tetrahedral) against the
   * look itself, over 8-bit colors on a 5-code lattice and the neutral ramp,
   * in code values after one quantization.
   */
  roundTrip?: { colors: number; maxCodes: number };
  sha256: string;
  notes: string[];
};

/**
 * Write a look for other grading applications: `.cube` through CG5's bake
 * (any look; a look at `strength` < 1 is baked as that mix), or ASC CDL
 * through CG5's CDL export (a look that is one encoded `grade.cdl`).
 */
export function exportColorLook(
  look: AnyColorLook,
  luts: ReadonlyMap<string, ColorLookLut>,
  options:
    | {
        format: "cube";
        size?: number | undefined;
        title?: string | undefined;
        strength?: number | undefined;
      }
    | { format: CdlFileKind },
): { text: string; report: ColorLookExportReport } {
  const stack = colorLookStack(look);
  const description = isColorLook2(look)
    ? {
        schemaVersion: look.schemaVersion,
        model: look.model,
        space: look.space,
      }
    : {
        schemaVersion: look.schemaVersion,
        model: "matrix" as const,
        space: "encoded-srgb" as const,
      };
  const sha = (text: string) =>
    `sha256:${createHash("sha256").update(text).digest("hex")}`;
  if (options.format === "cube") {
    const size = options.size ?? COLOR_LOOK_LUT_SIZE;
    if (!Number.isInteger(size) || size < 2 || size > MAX_LUT_3D_SIZE)
      passageError(
        "comp-program-option",
        `--size must be a whole number of grid points from 2 to ${MAX_LUT_3D_SIZE}`,
        { path: "size" },
      );
    const strength = options.strength ?? 1;
    const ops = colorLookStackOps(look, luts);
    // A partial strength is the mix of the look's output with its input.
    const mixed =
      strength === 1
        ? ops
        : [
            {
              apply: (v: Rgb): Rgb => {
                let out: Rgb = v;
                for (const op of ops) out = op.apply(out);
                return [
                  v[0] + strength * (out[0] - v[0]),
                  v[1] + strength * (out[1] - v[1]),
                  v[2] + strength * (out[2] - v[2]),
                ];
              },
            },
          ];
    const { cube, sha256 } = bakeGradeOps(mixed, size, options.title);
    const roundTrip = cubeRoundTrip(parseCubeLut(cube), mixed);
    return {
      text: cube,
      report: {
        schema: "still-shift.look-export-1",
        look: description,
        format: "cube",
        effects: stack.map((effect) => effect.id),
        size,
        strength,
        sha256,
        roundTrip,
        notes:
          roundTrip.maxCodes > CUBE_BOUND_CODES
            ? [
                `The table differs from the look by up to ${roundTrip.maxCodes} code values (CG5's bound is ${CUBE_BOUND_CODES} at 33³): the look bends sharply between grid points${description.space === "linear-gamma-2.2" ? " (near black, in linear light)" : ""}; use a larger --size or apply the look itself`,
              ]
            : [],
      },
    };
  }
  const only = stack.length === 1 ? stack[0]! : undefined;
  if (only?.effect !== "grade.cdl")
    passageError(
      "comp-look-export",
      `A ${description.model} look (${description.space}, ${stack.length} operator(s)) is not one ASC CDL; export it with --cube`,
      { path: "cdl" },
    );
  const { text, notes } = gradeCdlText(
    [{ id: only.id, params: paramsWithDefaults(only) }],
    options.format,
  );
  return {
    text,
    report: {
      schema: "still-shift.look-export-1",
      look: description,
      format: options.format,
      effects: [only.id],
      sha256: sha(text),
      notes,
    },
  };
}
