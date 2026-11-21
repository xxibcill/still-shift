/**
 * CG5: grade interchange — bake a layer's pointwise grade stack to a `.cube`,
 * and export or import ASC CDL (`.cc`, `.ccc`, `.cdl`).
 *
 * A stack is pointwise when every enabled effect at the frame is a float
 * grade operator (`grade.*`): each output pixel then depends only on the same
 * input pixel, so a 3D table over the 0–1 input range holds the whole stack
 * (the legacy working space feeds the grade stage 8-bit straight color, so
 * 0–1 is every input it sees). Any other effect (blur, keys, distortion,
 * legacy `color.*` byte kernels) refuses to bake, naming the effect.
 */
import { createHash } from "node:crypto";
import {
  bakeCubeLut,
  parseCdlXml,
  writeCdlXml,
  writeCubeLut,
  type Cdl,
  type CdlCorrection,
  type CdlFileKind,
  type Rgb,
} from "@still-shift/color-science";
import {
  compositionEffectDefinition,
  isFloatGradeEffect,
  type FloatGradeEffectId,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../renderer-core/src/composition/evaluate/evaluate.ts";
import { floatGradeOp } from "../../renderer-core/src/composition/render/float-grade.ts";
import {
  EFFECT_LUTS,
  preparedLut,
} from "../../renderer-core/src/composition/render/luts.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import { readCompositionSource } from "./composition-source.ts";

export { cdlFileKind } from "@still-shift/color-science";

const DEFAULT_BAKE_SIZE = 33;

export type GradeBakeReport = {
  schema: "still-shift.grade-bake-1";
  source: { path: string; sha256: string };
  layer: string;
  frame: number;
  size: number;
  /** Baked effects in stack order; disabled or neutral ones are listed apart. */
  effects: string[];
  skipped: { id: string; reason: "disabled" | "neutral" }[];
  domain: [number, number];
  cubeSha256: string;
};

async function layerEffects(input: string, layerId: string, frame: number) {
  const source = await readCompositionSource(input);
  const { composition } = source;
  if (!Number.isInteger(frame) || frame < 0 || frame >= composition.frameCount)
    passageError(
      "comp-program-option",
      `--frame must be from 0 to ${composition.frameCount - 1}`,
      { path: "frame" },
    );
  const index = composition.layers.findIndex((l) => l.id === layerId);
  if (index < 0)
    passageError(
      "comp-grade-layer",
      `No root layer "${layerId}" in ${composition.id}`,
      { path: "layer" },
    );
  const state = evaluateComp(composition, frame).layers.find(
    (l) => l.id === layerId,
  )!;
  return { source, index, effects: state.effects };
}

/** Bake the layer's grade stack at `frame` to `.cube` text. */
export async function bakeCompositionGrade(
  input: string,
  options: {
    layer: string;
    frame?: number | undefined;
    size?: number | undefined;
    title?: string | undefined;
  },
): Promise<{ cube: string; report: GradeBakeReport }> {
  const frame = options.frame ?? 0;
  const size = options.size ?? DEFAULT_BAKE_SIZE;
  const { source, index, effects } = await layerEffects(
    input,
    options.layer,
    frame,
  );
  const ops: NonNullable<ReturnType<typeof floatGradeOp>>[] = [];
  const baked: string[] = [];
  const skipped: GradeBakeReport["skipped"] = [];
  for (const [slot, effect] of effects.entries()) {
    const at = { path: `layers.${index}.effects.${slot}` };
    if (!effect.enabled) {
      skipped.push({ id: effect.id, reason: "disabled" });
      continue;
    }
    if (!isFloatGradeEffect(effect.effect))
      passageError(
        "comp-grade-not-pointwise",
        `Cannot bake ${effect.effect} ("${effect.id}"): only grade.* operators are pointwise; a LUT cannot hold blurs, keys, distortions or the legacy color.* byte kernels`,
        at,
      );
    const lutSlots: Record<string, ReturnType<typeof preparedLut>> = {};
    for (const [name, id] of Object.entries(effect.assets ?? {})) {
      const asset = source.composition.assets.find((a) => a.id === id);
      const lut = source.luts?.get(id);
      if (asset?.type === "lut" && lut)
        lutSlots[name] = preparedLut(asset.sha256, lut);
    }
    const op = floatGradeOp(
      effect.effect as FloatGradeEffectId,
      effect.params as never,
      { [EFFECT_LUTS]: lutSlots },
    );
    if (!op) {
      skipped.push({ id: effect.id, reason: "neutral" });
      continue;
    }
    ops.push(op);
    baked.push(effect.id);
  }
  if (!ops.length)
    passageError(
      "comp-grade-empty",
      `Layer "${options.layer}" has no enabled, non-neutral grade.* effect at frame ${frame}`,
      { path: `layers.${index}.effects` },
    );
  const lut = bakeCubeLut(
    (v) => {
      let value: Rgb = v;
      for (const op of ops) value = op.apply(value);
      return value;
    },
    size,
    options.title === undefined ? {} : { title: options.title },
  );
  const cube = writeCubeLut(lut);
  return {
    cube,
    report: {
      schema: "still-shift.grade-bake-1",
      source: { path: source.sourcePath, sha256: source.sourceChecksum },
      layer: options.layer,
      frame,
      size,
      effects: baked,
      skipped,
      domain: [0, 1],
      cubeSha256: `sha256:${createHash("sha256").update(cube).digest("hex")}`,
    },
  };
}

const CHANNELS = ["R", "G", "B"] as const;
const cdlOf = (params: Record<string, unknown>): Cdl => {
  const rgb = (name: string) =>
    CHANNELS.map((c) => params[`${name}${c}`] as number) as unknown as Rgb;
  return {
    slope: rgb("slope"),
    offset: rgb("offset"),
    power: rgb("power"),
    saturation: params.saturation as number,
  };
};

export type CdlExportReport = {
  schema: "still-shift.cdl-export-1";
  kind: CdlFileKind;
  layer: string;
  frame: number;
  corrections: { id: string; style: "asc" | "no-clamp" }[];
  /** Effects whose unclamped style an ASC reader applies with the Release 1.2 clamp. */
  notes: string[];
};

/** The layer's enabled `grade.cdl` effects (or one by ID) as ASC CDL text. */
export async function exportCompositionCdl(
  input: string,
  options: {
    layer: string;
    kind: CdlFileKind;
    effect?: string | undefined;
    frame?: number | undefined;
  },
): Promise<{ text: string; report: CdlExportReport }> {
  const frame = options.frame ?? 0;
  const { index, effects } = await layerEffects(input, options.layer, frame);
  const chosen = effects.filter(
    (e) =>
      e.effect === "grade.cdl" &&
      (options.effect === undefined ? e.enabled : e.id === options.effect),
  );
  if (!chosen.length)
    passageError(
      "comp-grade-empty",
      options.effect === undefined
        ? `Layer "${options.layer}" has no enabled grade.cdl at frame ${frame}`
        : `Layer "${options.layer}" has no grade.cdl "${options.effect}"`,
      { path: `layers.${index}.effects` },
    );
  if (options.kind === "cc" && chosen.length > 1)
    passageError(
      "comp-cdl-count",
      `A .cc holds one correction; layer "${options.layer}" has ${chosen.length} grade.cdl effects (use .ccc or .cdl, or --effect)`,
      { path: "output" },
    );
  const corrections: CdlCorrection[] = chosen.map((e) => ({
    id: e.id,
    cdl: cdlOf(e.params),
  }));
  const styles = chosen.map((e) => ({
    id: e.id,
    style: ((e.params.clamp as number) >= 0.5 ? "asc" : "no-clamp") as
      | "asc"
      | "no-clamp",
  }));
  return {
    text: writeCdlXml({ kind: options.kind, corrections }),
    report: {
      schema: "still-shift.cdl-export-1",
      kind: options.kind,
      layer: options.layer,
      frame,
      corrections: styles,
      notes: styles
        .filter((s) => s.style === "no-clamp")
        .map(
          (s) =>
            `"${s.id}" uses the unclamped style (clamp 0); ASC readers apply Release 1.2, which clamps to 0–1`,
        ),
    },
  };
}

export type CdlImportReport = {
  schema: "still-shift.cdl-import-1";
  kind: CdlFileKind;
  effects: {
    id: string;
    effect: "grade.cdl";
    description?: string;
    params: Record<string, number>;
  }[];
  /**
   * Corrections whose id is not a composition id (e.g. "001" or "shot 010"),
   * or repeats one, with the effect id each was given.
   */
  renamed?: { correction: string | null; id: string }[];
};

const COMPOSITION_ID = /^[a-zA-Z][\w-]*$/;
/**
 * The effect id for a correction: its own id when that is a composition id,
 * else `cdl-` and the id with other characters turned into "-" (or the
 * correction's position when nothing is left), made unique.
 */
function correctionEffectId(
  correction: string | undefined,
  index: number,
  used: Set<string>,
) {
  const base =
    correction && COMPOSITION_ID.test(correction) && correction.length <= 128
      ? correction
      : `cdl-${
          (correction ?? "")
            .replace(/[^\w-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 100) || index + 1
        }`;
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

/**
 * ASC CDL text → `grade.cdl` effect instances (one per correction, or the
 * one named), checked against the effect's bounds. `clamp` defaults to 1
 * (Release 1.2, what ASC files mean).
 */
export function importCdl(
  text: string,
  options: {
    correction?: string | undefined;
    clamp?: boolean | undefined;
  } = {},
): CdlImportReport {
  const document = parseCdlXml(text);
  const chosen = document.corrections.filter(
    (c) => options.correction === undefined || c.id === options.correction,
  );
  if (!chosen.length)
    passageError(
      "comp-cdl-correction",
      `No ColorCorrection "${options.correction}"; found ${document.corrections.map((c) => c.id ?? "(no id)").join(", ")}`,
      { path: "correction" },
    );
  const definition = compositionEffectDefinition("grade.cdl")!;
  const used = new Set<string>();
  const renamed: NonNullable<CdlImportReport["renamed"]> = [];
  const effects = chosen.map((correction, index) => {
    const { cdl } = correction;
    const params: Record<string, number> = {
      ...Object.fromEntries(
        (["slope", "offset", "power"] as const).flatMap((name) =>
          CHANNELS.map((c, i) => [`${name}${c}`, cdl[name][i]!]),
        ),
      ),
      saturation: cdl.saturation,
      clamp: options.clamp === false ? 0 : 1,
    };
    const checked = definition.params.safeParse(params);
    if (!checked.success)
      passageError(
        "comp-cdl-range",
        `ColorCorrection ${correction.id ?? index + 1}: ${checked.error.issues
          .map(
            (i) =>
              `${i.path.join(".")} ${params[String(i.path[0])]}: ${i.message}`,
          )
          .join("; ")}`,
        { path: `corrections.${index}` },
      );
    const id = correctionEffectId(correction.id, index, used);
    if (id !== correction.id)
      renamed.push({ correction: correction.id ?? null, id });
    return {
      id,
      effect: "grade.cdl" as const,
      ...(correction.description === undefined
        ? {}
        : { description: correction.description }),
      params,
    };
  });
  return {
    schema: "still-shift.cdl-import-1",
    kind: document.kind,
    effects,
    ...(renamed.length ? { renamed } : {}),
  };
}
