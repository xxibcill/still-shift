import { z } from "zod";
import { join, relative } from "node:path";
import {
  CompositionNodeMemory,
  compositionNodeJsonSize,
} from "@still-shift/execution-runtime/export";
import { MechanismSemanticRegistry } from "./production-semantic.ts";
import { groupMechanismProductionWarnings } from "./production-warnings.ts";
import { mechanismPackHash } from "./pack-support.ts";
import {
  readProductionJSON,
  writeProductionJSON,
  productionFile,
  productionOwnedPath,
} from "./production-queue-files.ts";
import {
  checkBlenderEpisodePlates,
  type BlenderEpisodePlates,
} from "./blender-episode-plates.ts";
import {
  BlenderProductionObservationSchema,
  BlenderProductionQAFactsSchema,
  admitBlenderProductionQAPlan,
  BLENDER_PRODUCTION_QA_LIMITS as LIMIT,
  type BlenderProductionMeasurement,
  type BlenderProductionObservation,
} from "./blender-production-qa-contract.ts";
import type { compileBlenderEpisode } from "./blender-episode-compile.ts";
type BlenderCompiledEpisode = ReturnType<typeof compileBlenderEpisode>;
import type { BlenderProductionIdentity } from "./blender-production-identity.ts";
import type { MechanismProductionBinding } from "./production-report.ts";

/** Bpy captures row-major matrices; its translation is at 3, 7 and 11. */
const origin = (p: BlenderProductionObservation["parts"][number]) => [
  p.worldMatrix[3]!,
  p.worldMatrix[7]!,
  p.worldMatrix[11]!,
];
const distance = (a: number[], b: number[]) =>
  Math.hypot(...a.map((v, i) => v - b[i]!));
export function sampleBlenderProductionMeasurement(
  selector: BlenderProductionMeasurement,
  observed: BlenderProductionObservation,
  reference?: BlenderProductionObservation["parts"][number],
): number | undefined {
  if (selector.kind === "actual-control")
    return Object.hasOwn(observed.actualControls, selector.control)
      ? observed.actualControls[selector.control]
      : undefined;
  const part = observed.parts.find(
    (p) => p.name === ("part" in selector ? selector.part : selector.parts[0]),
  );
  if (!part) return undefined;
  switch (selector.kind) {
    case "part-render-flag":
      return Number(part.visible);
    case "part-origin-drift":
      return reference ? distance(origin(part), origin(reference)) : undefined;
    case "part-matrix-drift":
      return reference
        ? Math.max(
            ...part.worldMatrix.map((v, i) =>
              Math.abs(v - reference.worldMatrix[i]!),
            ),
          )
        : undefined;
    case "surface-hash-change":
      return reference
        ? Number(
            part.positionsSha256 !== reference.positionsSha256 ||
              part.triangleIndicesSha256 !== reference.triangleIndicesSha256,
          )
        : undefined;
    case "part-bounds-span": {
      const i = "xyz".indexOf(selector.axis);
      return part.worldBounds
        ? part.worldBounds.max[i]! - part.worldBounds.min[i]!
        : undefined;
    }
    case "part-origin-separation": {
      const other = observed.parts.find((p) => p.name === selector.parts[1]);
      return other ? distance(origin(part), origin(other)) : undefined;
    }
    case "part-bounds-separation": {
      const other = observed.parts.find((p) => p.name === selector.parts[1]),
        i = "xyz".indexOf(selector.axis);
      return part.worldBounds && other?.worldBounds
        ? Math.max(
            other.worldBounds.min[i]! - part.worldBounds.max[i]!,
            part.worldBounds.min[i]! - other.worldBounds.max[i]!,
          )
        : undefined;
    }
  }
}
/** Replays authenticated retained observations; never starts Blender or grants whole-mechanism acceptance. */
export async function evaluateBlenderProductionQA(input: {
  plan: unknown;
  planSha256: string;
  compiled: BlenderCompiledEpisode;
  map: BlenderEpisodePlates;
  identity: BlenderProductionIdentity;
  binding: MechanismProductionBinding;
  outputRoot: string;
  directory: string;
  plates: Awaited<ReturnType<typeof productionFile>>;
  owner: CompositionNodeMemory;
  signal?: AbortSignal | undefined;
  verify?: boolean;
  rendered?: Awaited<ReturnType<typeof productionFile>> | undefined;
}) {
  const plan = admitBlenderProductionQAPlan(
      input.plan,
      input.compiled.frameCount,
    ),
    owner = new CompositionNodeMemory(input.owner);
  owner.reserve(LIMIT.retainedCapacityBytes);
  try {
    await checkBlenderEpisodePlates(
      input.map,
      input.compiled,
      input.identity,
      input.outputRoot,
      owner,
      input.signal,
    );
    const load = async (frame: number) => {
      input.signal?.throwIfAborted();
      const pin = input.map.frames[frame]!.observation;
      const read = await readProductionJSON(
        await productionOwnedPath(input.outputRoot, pin.path),
        BlenderProductionObservationSchema,
        owner,
        LIMIT.observationBytes,
        input.signal,
      );
      if (
        read.sha256 !== pin.sha256 ||
        read.value.sourceAssetSha256 !== input.compiled.source.asset.sha256
      ) {
        read.release();
        throw Error(
          "Native QA observation does not match its authenticated source pin",
        );
      }
      return read;
    };
    const references = new Map<
      string,
      BlenderProductionObservation["parts"][number]
    >();
    for (const s of plan.measurements)
      if ("referenceFrame" in s) {
        const read = await load(s.referenceFrame);
        try {
          const part = read.value.parts.find((p) => p.name === s.part);
          if (part) references.set(s.measurement, structuredClone(part));
        } finally {
          read.release();
        }
      }
    const semantics = plan.programs.map((p) => ({
      id: p.id,
      registry: new MechanismSemanticRegistry(p.registrations),
      interval: p.interval,
      samples: [] as {
        frame: number;
        measurements: Record<string, number>;
        evidence: { path: string; sha256: string };
      }[],
    }));
    for (let frame = 0; frame < input.compiled.frameCount; frame++) {
      const active = semantics.filter(
        (p) => frame >= p.interval.start && frame < p.interval.endExclusive,
      );
      if (!active.length) continue;
      const read = await load(frame);
      try {
        const measurements: Record<string, number> = {};
        for (const s of plan.measurements) {
          const value = sampleBlenderProductionMeasurement(
            s,
            read.value,
            references.get(s.measurement),
          );
          if (value !== undefined && Number.isFinite(value))
            measurements[s.measurement] = value;
        }
        const pin = input.map.frames[frame]!.observation;
        for (const p of active) {
          const names = new Set(
            p.registry.registrations.flatMap((r) =>
              r.rules.map((rule) => rule.measurement),
            ),
          );
          p.samples.push({
            frame,
            measurements: Object.fromEntries(
              Object.entries(measurements).filter(([name]) => names.has(name)),
            ),
            evidence: { path: pin.path, sha256: pin.sha256 },
          });
        }
      } finally {
        read.release();
      }
    }
    const executions = semantics.map((p) => ({
      id: p.id,
      execution: p.registry.execute({
        binding: input.binding,
        interval: p.interval,
        samples: p.samples,
      }),
    }));
    compositionNodeJsonSize(executions, 0, "", LIMIT.factsBytes);
    const artifacts: Awaited<ReturnType<typeof productionFile>>[] = [];
    const publish = async (name: string, value: unknown) => {
      const path = join(input.directory, name);
      if (input.verify) {
        const read = await readProductionJSON(
          path,
          z.unknown(),
          owner,
          LIMIT.factsBytes,
          input.signal,
        );
        try {
          if (mechanismPackHash(read.value) !== mechanismPackHash(value))
            throw Error(
              "Retained native QA artifact differs from current observation replay: " +
                name,
            );
        } finally {
          read.release();
        }
      } else
        await writeProductionJSON(path, value, owner, LIMIT.factsBytes, true);
      const pin = await productionFile(
        input.outputRoot,
        relative(input.outputRoot, path),
        owner,
      );
      artifacts.push(pin);
      return pin;
    };
    const program = await publish("qa-program.json", {
      schemaVersion: "blender-production-qa-program-1",
      plan,
      planSha256: input.planSha256,
    });
    type Warning = Parameters<typeof groupMechanismProductionWarnings>[0];
    // Each raw row is a consecutive failure run; all original numeric samples/findings stay in facts.
    const warnings: {
      diagnostic: {
        code: string;
        severity: "error";
        frames: [number, number];
        nodes: string[];
        measured: number;
        message: string;
        peakFrame: number;
        assertion: string;
        measurement: string | null;
        expectedRange: [number, number] | null;
        relationship: string | null;
        observedValue: number | null;
      };
      controllingRig: string;
      event: string;
      eventInterval: { start: number; endExclusive: number };
      unit: string;
      parts: string[];
      badFrames: { path: string; sha256: string }[];
    }[] = [];
    for (const p of executions)
      for (const a of p.execution.assertions) {
        const buckets = new Map<string, typeof a.findings>();
        for (const f of a.findings) {
          if (f.frame === null)
            throw Error(
              "Native full-frame sampling unexpectedly lacks a frame",
            );
          const key = mechanismPackHash([
            f.code,
            f.measurement,
            f.rig,
            f.parts,
            f.unit,
            f.expectedRange,
            f.relationship,
          ]);
          const bucket = buckets.get(key) ?? [];
          bucket.push(f);
          buckets.set(key, bucket);
        }
        for (const bucket of buckets.values()) {
          let row: (typeof warnings)[number] | undefined;
          for (const f of bucket) {
            const frame = f.frame!,
              missing = f.measured === null,
              delta = missing
                ? 1
                : Math.max(
                    0,
                    f.expectedRange![0] - f.measured!,
                    f.measured! - f.expectedRange![1],
                  );
            if (!row || frame !== row.diagnostic.frames[1] + 1) {
              row = {
                diagnostic: {
                  code:
                    f.code +
                    "." +
                    mechanismPackHash([
                      a.id,
                      f.measurement,
                      f.expectedRange,
                      f.relationship,
                    ]).slice(7, 19),
                  severity: "error",
                  frames: [frame, frame],
                  nodes: [...f.parts],
                  measured: delta,
                  message: missing
                    ? "Observed native measurement missing: " + f.measurement
                    : "Observed native measurement outside its registered range: " +
                      f.measurement,
                  peakFrame: frame,
                  assertion: a.id,
                  measurement: f.measurement,
                  expectedRange: f.expectedRange,
                  relationship: f.relationship,
                  observedValue: f.measured,
                },
                controllingRig: f.rig!,
                event: p.id,
                eventInterval: p.execution.interval,
                unit: missing ? "missing-measurements" : f.unit!,
                parts: [...f.parts],
                badFrames: [
                  {
                    path: input.map.frames[frame]!.image.path,
                    sha256: input.map.frames[frame]!.image.sha256,
                  },
                ],
              };
              warnings.push(row);
              if (warnings.length > LIMIT.warningRows)
                throw Error(
                  "Native QA warning-run budget exceeded; all-frame facts must be inspected in smaller programs",
                );
            } else {
              row.diagnostic.frames[1] = frame;
              if (delta > row.diagnostic.measured) {
                row.diagnostic.measured = delta;
                row.diagnostic.peakFrame = frame;
                row.diagnostic.observedValue = f.measured;
                row.badFrames = [
                  {
                    path: input.map.frames[frame]!.image.path,
                    sha256: input.map.frames[frame]!.image.sha256,
                  },
                ];
              }
            }
          }
        }
      }
    const raw = await publish("qa-warnings.json", {
      schemaVersion: "blender-production-qa-warnings-1",
      binding: input.binding,
      warnings,
    });
    const grouped = groupMechanismProductionWarnings({
      binding: input.binding,
      rawEvidence: { path: raw.path, sha256: raw.sha256 },
      warnings,
    } satisfies Warning);
    const groupedPin = await publish("qa-warning-groups.json", grouped);
    const failures = executions.reduce(
      (n, p) =>
        n + p.execution.assertions.reduce((m, a) => m + a.findings.length, 0),
      0,
    );
    const facts = BlenderProductionQAFactsSchema.parse({
      schemaVersion: "blender-production-qa-facts-1",
      binding: input.binding,
      planSha256: input.planSha256,
      source: { plates: input.plates, program },
      semantics: executions,
      warnings: {
        raw,
        ...(input.rendered ? { rendered: input.rendered } : {}),
        grouped: groupedPin,
        groups: grouped.groups.length,
      },
      failures: { mechanical: failures },
      continuousCollision: "unreviewed",
      mechanicalAcceptance: "separate-whole-mechanism-review",
      qualification:
        "Registered numeric rules use actual retained Bpy controls, row-major matrices, evaluated bounds and surface hashes. Render flags do not prove visibility; AABB separation does not prove surface contact or collision. Native units are source-library units. Whole mechanical, factual, encoded readability, continuous and listening reviews remain separate.",
    });
    const factsPin = await publish("qa-facts.json", facts);
    return { facts, factsPin, artifacts };
  } finally {
    owner.dispose();
  }
}
