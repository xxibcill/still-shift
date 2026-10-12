import { mechanismPackHash } from "./pack-support.ts";
import type {
  Composition,
  MechanismNarratedCycle,
} from "@still-shift/scene-contract";
import type { CompositionQualityReport } from "@still-shift/renderer-core";
import { groupMechanismProductionWarnings } from "./production-warnings.ts";
import type { MechanismProductionBinding } from "./production-report.ts";
import type { MechanismProductionQAPlan } from "./production-qa-contract.ts";
const units: Record<string, string> = {
  "opacity-pop": "opacity-alpha",
  "scale-pop": "scale-ratio",
  "velocity-discontinuity": "velocity-jump-ratio",
  "frozen-run": "output-frames",
  "frozen-pixels": "output-frames",
  "easing-monotony": "fraction",
  "co-start": "layer-count",
  "off-canvas": "indicator",
  "outside-safe-area": "indicator",
  coverage: "indicator",
};
/** Cross-event aggregates retain their original interval and peak; they are never split into invented per-event maxima. */
export function mapMechanismProductionWarnings(input: {
  composition: Composition;
  document: MechanismNarratedCycle;
  plan: MechanismProductionQAPlan;
  diagnostics: CompositionQualityReport["diagnostics"];
  binding: MechanismProductionBinding;
  rawEvidence: { path: string; sha256: string };
  video: { path: string; sha256: string };
}) {
  const layers = new Map(input.composition.layers.map((l) => [l.id, l]));
  const cues = input.document.cues.map((c) => ({
    id: c.id,
    start: Number(
      (BigInt(c.startSample) * BigInt(input.document.output.fps) + 47999n) /
        48000n,
    ),
    endExclusive: Number(
      (BigInt(c.endSampleExclusive) * BigInt(input.document.output.fps) +
        47999n) /
        48000n,
    ),
  }));
  const warnings = input.diagnostics.map((diagnostic, index) => {
    const property =
      diagnostic.code === "opacity-pop"
        ? "opacity"
        : diagnostic.code === "scale-pop"
          ? "scale"
          : "position";
    let layer = layers.get(diagnostic.nodes[0] ?? ""),
      controller = layer?.id ?? null;
    let declared = input.plan.warningBindings.find(
      (b) => b.layer === layer?.id,
    );
    const seen = new Set<string>(),
      contributors: string[] = [];
    while (layer && !seen.has(layer.id)) {
      seen.add(layer.id);
      const track = layer.transform?.[property];
      if (
        typeof track === "string" ||
        (track !== null &&
          typeof track === "object" &&
          !Array.isArray(track) &&
          "keys" in track)
      )
        contributors.push(layer.id);
      declared ??= input.plan.warningBindings.find(
        (b) => b.layer === layer!.id,
      );
      layer = layer.parent ? layers.get(layer.parent) : undefined;
    }
    controller =
      contributors.length === 1
        ? contributors[0]!
        : contributors.length > 1
          ? null
          : controller;
    const cue = cues.find(
      (c) =>
        diagnostic.frames[0] >= c.start &&
        diagnostic.frames[1] < c.endExclusive,
    );
    return {
      diagnostic: {
        ...diagnostic,
        originalDiagnosticIndex: index,
        controllerLayer: controller,
        controllerLayers: contributors,
        controllerMethod: declared
          ? "authored-physical-rig"
          : contributors.length > 1
            ? "multiple-animated-contributors"
            : contributors.length === 1
              ? "composition-inheritance"
              : "composition-layer",
      },
      controllingRig:
        declared?.controllingRig ??
        (controller
          ? "composition." + mechanismPackHash(controller).slice(7)
          : "unresolved." + mechanismPackHash(contributors).slice(7)),
      event: cue?.id ?? "cross-event",
      eventInterval: cue
        ? { start: cue.start, endExclusive: cue.endExclusive }
        : { start: 0, endExclusive: input.composition.frameCount },
      unit: units[diagnostic.code] ?? "unspecified-diagnostic-unit",
      parts: declared?.parts ?? [],
      badFrames: [...new Set(diagnostic.frames)].map((frame) => ({
        path: input.video.path + "#outputFrame=" + frame,
        sha256: input.video.sha256,
      })),
    };
  });
  return groupMechanismProductionWarnings({
    binding: input.binding,
    rawEvidence: input.rawEvidence,
    warnings,
  });
}
