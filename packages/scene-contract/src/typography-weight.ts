import { z } from "zod";
import { FontAxisSchema } from "./typography.ts";
import { TextWeightTreatmentSchema } from "./motion-craft.ts";
import { resolvedTextStyle, type TextNode } from "./typography-style.ts";
import type { TextEventScene, ResolvedTextEvent } from "./typography-events.ts";
const finite = z.number().finite();
export const TextWeightTreatmentReceiptSchema = z
  .object({
    eventIndex: z.number().int().nonnegative(),
    eventId: z.string().nullable(),
    node: z.string(),
    span: z.string().nullable(),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    requestedTreatment: TextWeightTreatmentSchema,
    resolvedTreatment: z.enum(["genuine-weight", "outline"]).nullable(),
    status: z.enum(["resolved", "unavailable"]),
    units: z.enum(["wght-axis-delta", "stroke-pixels"]),
    requestedAmount: finite.positive(),
    resolvedAmount: finite.positive().nullable(),
    availableHeadroom: finite,
    targetScope: z.enum(["legacy-base-and-spans", "painted-style-runs"]),
    reason: z
      .enum([
        "static-or-max-weight-target",
        "insufficient-wght-headroom",
        "explicit-outline",
      ])
      .nullable(),
    fonts: z
      .array(
        z
          .object({
            span: z.string().nullable(),
            fontAsset: z.string().nullable(),
            sha256: z.string().nullable(),
            declaredWeight: z.string().nullable(),
            axisInstance: finite.nullable(),
            axisRange: FontAxisSchema.nullable(),
            headroom: finite,
          })
          .strict(),
      )
      .max(129),
  })
  .strict();
export const TextWeightTreatmentReportSchema = z
  .object({
    schemaVersion: z.literal("text-weight-treatments-1"),
    receipts: z.array(TextWeightTreatmentReceiptSchema).max(200),
  })
  .strict();
export type TextWeightTreatmentReceipt = z.infer<
  typeof TextWeightTreatmentReceiptSchema
>;
/** Shared resolver; auto retains the original base-plus-spans decision and numeric defaults. */
export function resolveTextWeightTreatment(
  scene: TextEventScene,
  node: TextNode,
  event: ResolvedTextEvent,
  eventIndex: number,
): TextWeightTreatmentReceipt {
  const requested = TextWeightTreatmentSchema.parse(
      event.weightTreatment ?? "auto",
    ),
    styles = scene.textStyles ?? {};
  const span = event.span
    ? node.spans?.find((s) => s.id === event.span)
    : undefined;
  if (event.span && !span)
    throw Error("text-weight-span: unknown target span " + event.span);
  const base = resolvedTextStyle(node, styles);
  let useBase = true;
  // Count formatting may paint strings longer than its authored endpoints.
  // Retain the base until shared generated-string coverage can prove it unused.
  const hasGeneratedCount =
    node.transition?.kind === "count" ||
    node.transitions?.some((transition) => transition.kind === "count") ||
    scene.textEvents?.some(
      (event) => event.node === node.id && event.verb === "count",
    ) ||
    scene.intentPresets?.motions.some(
      (motion) => motion.node === node.id && motion.preset === "text-count",
    );
  if (
    requested !== "auto" &&
    !event.span &&
    node.spans?.length &&
    !hasGeneratedCount
  ) {
    const segmenter = new Intl.Segmenter(node.locale ?? "en", {
      granularity: "grapheme",
    });
    const length = Math.max(
      ...[node.text, ...(node.states ?? [])].map(
        (text) => [...segmenter.segment(text)].length,
      ),
    );
    let covered = 0;
    for (const s of [...node.spans].sort((a, b) => a.start - b.start)) {
      if (s.start > covered) break;
      covered = Math.max(covered, s.end);
    }
    useBase = covered < length;
  }
  const targets = event.span
    ? [
        {
          span: event.span,
          style: resolvedTextStyle(node, styles, span?.style),
        },
      ]
    : [
        ...(useBase ? [{ span: null, style: base }] : []),
        ...(node.spans ?? []).map((s) => ({
          span: s.id ?? null,
          style: resolvedTextStyle(node, styles, s.style),
        })),
      ];
  const fonts = targets.map((target) => {
    const font = scene.fonts?.find(
        (font) => font.id === target.style.fontAsset,
      ),
      range = font?.variable?.wght;
    const instance = range ? (target.style.axes?.wght ?? range.default) : null;
    return {
      span: target.span ?? null,
      fontAsset: target.style.fontAsset ?? null,
      sha256: font?.sha256 ?? null,
      declaredWeight: font?.weight ?? null,
      axisInstance: instance,
      axisRange: range ?? null,
      headroom: range ? range.max - instance! : 0,
    };
  });
  const available = Math.min(...fonts.map((font) => font.headroom));
  const genuine =
    requested === "genuine-weight" || (requested === "auto" && available > 0);
  const amount = event.amount ?? (genuine ? 150 : base.size! * 0.014);
  if (!Number.isFinite(amount) || amount <= 0)
    throw Error("text-weight-amount: weight emphasis must be positive");
  if (!genuine && amount > 40)
    throw Error("text-weight-amount: outline width exceeds 40 px");
  const unavailable =
    requested === "genuine-weight" && (available <= 0 || amount > available);
  return TextWeightTreatmentReceiptSchema.parse({
    eventIndex,
    eventId: event.id ?? null,
    node: node.id,
    span: event.span ?? null,
    start: event.start,
    end: event.end,
    requestedTreatment: requested,
    resolvedTreatment: unavailable
      ? null
      : genuine
        ? "genuine-weight"
        : "outline",
    status: unavailable ? "unavailable" : "resolved",
    units: genuine ? "wght-axis-delta" : "stroke-pixels",
    requestedAmount: amount,
    resolvedAmount: unavailable
      ? null
      : genuine
        ? Math.min(amount, available)
        : amount,
    availableHeadroom: available,
    targetScope:
      requested === "auto" ? "legacy-base-and-spans" : "painted-style-runs",
    reason: unavailable
      ? "insufficient-wght-headroom"
      : requested === "outline"
        ? "explicit-outline"
        : !genuine
          ? "static-or-max-weight-target"
          : null,
    fonts,
  });
}
