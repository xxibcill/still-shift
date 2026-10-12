import { z } from "zod";
import { compositionNodeJsonSize } from "@still-shift/execution-runtime/export";
import {
  MechanismProductionBindingSchema,
  MechanismProductionArtifactSchema,
} from "./production-report.ts";
import { freezeMechanismPack } from "./pack-support.ts";
const raw = z
  .object({
    code: z.string().min(1).max(128),
    severity: z.enum(["error", "warning"]),
    frames: z.tuple([
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
    ]),
    nodes: z.array(z.string().min(1).max(1024)).max(128),
    measured: z.number().finite(),
    message: z.string().max(2048),
    path: z.string().max(2048).optional(),
  })
  .passthrough();
const interval = z
  .object({
    start: z.number().int().nonnegative().max(108000),
    endExclusive: z.number().int().positive().max(108000),
  })
  .strict()
  .refine((i) => i.endExclusive > i.start);
const request = z
  .object({
    binding: MechanismProductionBindingSchema,
    rawEvidence: MechanismProductionArtifactSchema,
    warnings: z
      .array(
        z
          .object({
            diagnostic: raw,
            controllingRig: z.string().min(1).max(128),
            event: z.string().min(1).max(128),
            eventInterval: interval,
            unit: z.string().min(1).max(32),
            parts: z.array(z.string().min(1).max(128)).max(128),
            badFrames: z.array(MechanismProductionArtifactSchema).max(4),
          })
          .strict(),
      )
      .max(2048),
  })
  .strict();
export interface MechanismProductionWarningGroup {
  code: string;
  controllingRig: string;
  event: string;
  unit: string;
  severity: "error" | "warning";
  interval: { start: number; endExclusive: number };
  maximumMeasuredChange: number;
  maximumRawIndex: number;
  parts: string[];
  children: string[];
  rawIndices: number[];
  badFrames: z.infer<typeof MechanismProductionArtifactSchema>[];
}
/** Group only connected intervals within the same controlling rig/event/code/unit. Original rows and peak ownership stay accessible. */
export function groupMechanismProductionWarnings(input: unknown): {
  schemaVersion: "mechanism-production-warning-groups-1";
  binding: z.infer<typeof MechanismProductionBindingSchema>;
  rawEvidence: z.infer<typeof MechanismProductionArtifactSchema>;
  rawWarnings: z.infer<typeof request>["warnings"];
  groups: MechanismProductionWarningGroup[];
} {
  compositionNodeJsonSize(input, 0, "", 8 * 1024 * 1024);
  const data = structuredClone(request.parse(input));
  const buckets = new Map<
    string,
    { index: number; row: (typeof data.warnings)[number] }[]
  >();
  for (const [index, row] of data.warnings.entries()) {
    const [start, end] = row.diagnostic.frames;
    if (
      start > end ||
      start < row.eventInterval.start ||
      end >= row.eventInterval.endExclusive
    )
      throw Error("Warning interval must fit its declared controlling event");
    const key = JSON.stringify([
      row.controllingRig,
      row.event,
      row.eventInterval,
      row.diagnostic.code,
      row.unit,
    ]);
    const bucket = buckets.get(key) ?? [];
    bucket.push({ index, row });
    buckets.set(key, bucket);
  }
  const groups: MechanismProductionWarningGroup[] = [];
  const accumulated = new Map<
    MechanismProductionWarningGroup,
    {
      parts: Set<string>;
      children: Set<string>;
      images: Map<string, z.infer<typeof MechanismProductionArtifactSchema>>;
    }
  >();
  for (const bucket of buckets.values()) {
    bucket.sort(
      (a, b) =>
        a.row.diagnostic.frames[0] - b.row.diagnostic.frames[0] ||
        a.index - b.index,
    );
    let group: MechanismProductionWarningGroup | undefined;
    for (const { index, row } of bucket) {
      const d = row.diagnostic;
      if (!group || d.frames[0] > group.interval.endExclusive) {
        group = {
          code: d.code,
          controllingRig: row.controllingRig,
          event: row.event,
          unit: row.unit,
          severity: d.severity,
          interval: { start: d.frames[0], endExclusive: d.frames[1] + 1 },
          maximumMeasuredChange: d.measured,
          maximumRawIndex: index,
          parts: [],
          children: [],
          rawIndices: [],
          badFrames: [],
        };
        groups.push(group);
        accumulated.set(group, {
          parts: new Set(),
          children: new Set(),
          images: new Map(),
        });
      }
      group.interval.endExclusive = Math.max(
        group.interval.endExclusive,
        d.frames[1] + 1,
      );
      if (d.severity === "error") group.severity = "error";
      if (d.measured > group.maximumMeasuredChange) {
        group.maximumMeasuredChange = d.measured;
        group.maximumRawIndex = index;
      }
      group.rawIndices.push(index);
      const values = accumulated.get(group)!;
      for (const part of row.parts) values.parts.add(part);
      for (const child of d.nodes) values.children.add(child);
      for (const image of row.badFrames)
        values.images.set(JSON.stringify([image.path, image.sha256]), image);
    }
  }
  for (const group of groups) {
    const values = accumulated.get(group)!;
    group.parts = [...values.parts].sort();
    group.children = [...values.children].sort();
    group.badFrames = [...values.images.values()];
  }
  groups.sort(
    (a, b) =>
      a.interval.start - b.interval.start ||
      a.controllingRig.localeCompare(b.controllingRig, "en") ||
      a.event.localeCompare(b.event, "en") ||
      a.code.localeCompare(b.code, "en") ||
      a.unit.localeCompare(b.unit, "en"),
  );
  const result = {
    schemaVersion: "mechanism-production-warning-groups-1" as const,
    binding: data.binding,
    rawEvidence: data.rawEvidence,
    rawWarnings: data.warnings,
    groups,
  };
  compositionNodeJsonSize(result, 0, "", 8 * 1024 * 1024);
  return freezeMechanismPack(result);
}
