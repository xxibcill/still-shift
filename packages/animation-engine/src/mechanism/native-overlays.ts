import type {
  Composition,
  MechanismEpisode,
  NativeObservedAnchor,
  NativeObservedOutputFrame,
  NativeScreenBinding,
} from "@still-shift/scene-contract";
import {
  compositionQualityTree,
  evaluateCompositionExposure,
  passageError,
  transformPoint,
  type Bounds,
  type CompositionQualitySample,
  type DeepReadonly,
  type EvaluationOptions,
  type PreparedNative3DScene,
} from "@still-shift/renderer-core";
import { resolveCompositionQualityPolicy } from "../../../renderer-core/src/composition/quality-policy.ts";
import { mechanismOverlayLayerId } from "./overlays.ts";

export type NativeMechanismOverlayFinding = {
  code: string;
  path: string;
  message: string;
  frames: [number, number];
  measured: number;
  shot: string;
  label?: string;
  other?: string;
  measurement: "measured";
};
export type NativeMechanismOverlayReport = {
  method: "actual-native-anchor-and-settled-composition";
  checkedOutputFrames: number;
  checkedPasses: number;
  physicalHoldsValid: boolean;
  layoutMeasurement: "measured" | "unassessed";
  layoutAccepted: boolean | null;
  /** Geometric bounds and exact logical copy do not assess encoded glyph readability. */
  renderedGlyphReadability: "requires-encoded-review";
  findings: NativeMechanismOverlayFinding[];
  holds: {
    shot: string;
    label: string;
    longestAnchoredFrames: number;
    longestReadableFrames: number | null;
    requiredFrames: 30;
    anchoredInterval: [number, number] | null;
    readableInterval: [number, number] | null;
  }[];
};
export type NativeMechanismOverlayCheckOptions = {
  textBounds?: EvaluationOptions["textBounds"];
};
type Hold = {
  current: number;
  longest: number;
  interval: [number, number] | null;
};
type LabelRun = {
  shot: MechanismEpisode["shots"][number];
  label: MechanismEpisode["shots"][number]["labels"][number];
  path: string;
  anchored: Hold;
  readable: Hold;
  measurementComplete: boolean;
};
const hold = (): Hold => ({ current: 0, longest: 0, interval: null });
function advance(run: Hold, eligible: boolean, frame: number) {
  run.current = eligible ? run.current + 1 : 0;
  if (run.current > run.longest) {
    run.longest = run.current;
    run.interval = [frame - run.current + 1, frame];
  }
}
function overlap(a: Bounds, b: Bounds) {
  return (
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  );
}
function measuredBounds(bounds: Bounds | undefined) {
  return (
    !!bounds &&
    Object.values(bounds).every(Number.isFinite) &&
    bounds.left < bounds.right &&
    bounds.top < bounds.bottom
  );
}
function observedBindingPoint(
  anchor: DeepReadonly<NativeObservedAnchor>,
  binding: NativeScreenBinding,
  width: number,
  height: number,
) {
  const indicator =
    anchor.visibility === "outside-frame" &&
    binding.visibilityPolicy === "offscreen-indicator";
  const shown =
    (anchor.visibility === "visible" || indicator) && anchor.pixel !== null;
  let pixel: [number, number] | null = shown ? [...anchor.pixel!] : null;
  if (pixel && binding.target.kind !== "visibility") {
    pixel[0] += binding.offsetPixels?.[0] ?? 0;
    pixel[1] += binding.offsetPixels?.[1] ?? 0;
    if (indicator) {
      const inset = binding.insetPixels ?? 12;
      pixel = [
        Math.min(width - inset, Math.max(inset, pixel[0])),
        Math.min(height - inset, Math.max(inset, pixel[1])),
      ];
    }
  }
  return { shown, indicator: indicator && shown, pixel };
}
function bindingOf(sample: CompositionQualitySample | undefined) {
  const binding = sample?.state.layer.native3D;
  return binding?.role === "screen-anchor" ? binding : undefined;
}

/**
 * Consume authenticated, pixel-paired packets after closure association validation.
 * Only frame-local trees, bounded findings and per-label counters are retained.
 */
export function createNativeMechanismOverlayChecker(
  episode: MechanismEpisode,
  composition: Composition,
  preparedNative3D: Readonly<Record<string, PreparedNative3DScene>>,
  options: NativeMechanismOverlayCheckOptions = {},
): {
  onFrame(packet: DeepReadonly<NativeObservedOutputFrame>): void;
  finish(): NativeMechanismOverlayReport;
} {
  if (
    composition.width !== episode.output.width ||
    composition.height !== episode.output.height ||
    composition.fps !== episode.output.fps ||
    composition.frameCount !== episode.output.frameCount
  )
    passageError(
      "comp-native3d-clock",
      "Native overlay evidence must use the authored output clock",
      { path: "composition.output" },
    );
  for (const [id, bounds] of Object.entries(options.textBounds ?? {}))
    for (const [index, value] of bounds.entries())
      if (!measuredBounds(value))
        passageError(
          "comp-native3d-observation",
          "Measured text bounds must be finite positive local extents",
          { path: `textBounds.${id}.${index}` },
        );
  const evaluation: EvaluationOptions = {
    preparedNative3D,
    nativeObservationRequired: true,
    ...(options.textBounds ? { textBounds: options.textBounds } : {}),
  };
  const policy = resolveCompositionQualityPolicy(composition, { evaluation });
  const runs: LabelRun[] = episode.shots.flatMap((shot, shotIndex) =>
    shot.labels.map((label, labelIndex) => ({
      shot,
      label,
      path: `shots.${shotIndex}.labels.${labelIndex}`,
      anchored: hold(),
      readable: hold(),
      measurementComplete: true,
    })),
  );
  const findings: NativeMechanismOverlayFinding[] = [];
  const latest = new Map<string, NativeMechanismOverlayFinding>();
  let findingBytes = 0,
    checkedOutputFrames = 0,
    checkedPasses = 0,
    finished = false;
  let layoutMeasured = !!options.textBounds;
  const add = (finding: NativeMechanismOverlayFinding) => {
    const key = JSON.stringify([finding.code, finding.path, finding.other]);
    const old = latest.get(key);
    if (
      old &&
      old.frames[1] + 1 >= finding.frames[0] &&
      old.frames[0] <= finding.frames[0]
    ) {
      old.frames[1] = Math.max(old.frames[1], finding.frames[1]);
      old.measured = Math.max(old.measured, finding.measured);
      return;
    }
    findingBytes +=
      Buffer.byteLength(JSON.stringify(finding)) * 2 + key.length * 2;
    if (findings.length >= 4096 || findingBytes > 8 * 1024 * 1024)
      passageError(
        "comp-native3d-limit",
        "Native overlay findings exceed bounded report capacity",
        { path: "overlay.findings" },
      );
    findings.push(finding);
    latest.set(key, finding);
  };
  const fault = (
    run: LabelRun,
    frame: number,
    code: string,
    path: string,
    message: string,
    measured = 1,
    other?: string,
    end = frame,
  ) => {
    add({
      code,
      path,
      message,
      frames: [frame, end],
      measured,
      shot: run.shot.id,
      label: run.label.id,
      ...(other === undefined ? {} : { other }),
      measurement: "measured",
    });
  };
  const expectedCopy = (id: string) => {
    // Supported saved-copy edits are authoritative; old episode declarations are not.
    const layer = composition.layers.find((layer) => layer.id === id);
    return layer?.type === "text" ? layer.text : undefined;
  };
  return {
    onFrame(packet) {
      if (
        finished ||
        packet.outputFrame !== checkedOutputFrames ||
        packet.outputFrame >= composition.frameCount
      )
        passageError(
          "comp-native3d-protocol",
          "Native overlay packets must cover each output frame once in order",
          { path: "overlay.outputFrame", frame: packet.outputFrame },
        );
      const frame = packet.outputFrame;
      const active = runs.filter(
        (run) =>
          frame >= run.label.readingInterval.startFrame &&
          frame < run.label.readingInterval.endFrameExclusive,
      );
      const eligibility = new Map(
        active.map((run) => [run.label.id, { anchored: true, readable: true }]),
      );
      const used = new Set<number>();
      let contributingTrees = 0;
      for (const tree of evaluateCompositionExposure(
        composition,
        frame,
        evaluation,
      )) {
        contributingTrees++;
        const quality = compositionQualityTree(composition, tree, evaluation);
        const controllers = tree.layers.filter(
          (state) =>
            state.layer.type === "native3d" &&
            state.visible &&
            state.nativeFrame,
        );
        if (controllers.length !== 1)
          passageError(
            "comp-native3d-observation",
            "Native episode overlay checking requires one active authored root controller",
            { path: "overlay.controllers", frame },
          );
        const controller = controllers[0]!,
          snapshot = controller.nativeFrame!;
        const index = packet.passes.findIndex(
          (pass, index) =>
            !used.has(index) &&
            pass.sampleFrame === tree.sampleFrame &&
            pass.observed.controller === controller.id &&
            pass.observed.scope === snapshot.scope &&
            pass.observed.frameKey === snapshot.frameKey,
        );
        if (index < 0)
          passageError(
            "comp-native3d-observation",
            "Current overlay tree lacks its exact actual contributing native pass",
            { path: "overlay.passes", frame },
          );
        used.add(index);
        const observed = packet.passes[index]!.observed;
        const boxes: { sample: CompositionQualitySample; run?: LabelRun }[] =
          [];
        for (const run of active) {
          const eligible = eligibility.get(run.label.id)!;
          if (controller.id !== mechanismOverlayLayerId("plate", run.shot.id))
            passageError(
              "comp-native3d-observation",
              "Label interval differs from its actual authored controller",
              { path: `${run.path}.readingInterval`, frame },
            );
          const anchor = observed.anchors[run.label.anchor];
          const groupId = mechanismOverlayLayerId("annotation", run.label.id),
            leaderId = mechanismOverlayLayerId("leader", run.label.id);
          const group = quality.layers.get(groupId),
            leader = quality.layers.get(leaderId);
          let bound =
            !!anchor &&
            anchor.visibility === "visible" &&
            anchor.pixel !== null;
          for (const { sample, id } of [
            { sample: group, id: groupId },
            { sample: leader, id: leaderId },
          ]) {
            const binding = bindingOf(sample),
              result = sample?.state.nativeScreenBinding;
            if (
              !anchor ||
              !sample ||
              !binding ||
              !result ||
              binding.sceneLayer !== controller.id ||
              binding.anchor !== run.label.anchor ||
              sample.state.nativeFrame?.frameKey !== snapshot.frameKey
            ) {
              bound = false;
              fault(
                run,
                frame,
                "mechanism-native-binding",
                `layers.${id}.native3D`,
                "Current annotation is missing its exact physical anchor binding",
              );
              continue;
            }
            const actual = observedBindingPoint(
              anchor,
              binding,
              composition.width,
              composition.height,
            );
            if (
              result.visibility !== anchor.visibility ||
              result.shown !== actual.shown ||
              result.indicator !== actual.indicator
            ) {
              bound = false;
              fault(
                run,
                frame,
                "mechanism-native-binding",
                `layers.${sample.id}.native3D.anchor`,
                "Settled annotation visibility differs from the actual physical anchor",
              );
            }
            if (sample === leader && actual.pixel && sample.state.visible) {
              const content = sample.state.contents?.find(
                (content) =>
                  content.id ===
                  (binding.target.kind === "path-endpoint"
                    ? binding.target.contentId
                    : ""),
              );
              if (
                binding.target.kind !== "path-endpoint" ||
                content?.type !== "path" ||
                content.path.closed ||
                content.path.vertices.length !== 2
              ) {
                bound = false;
                fault(
                  run,
                  frame,
                  "mechanism-native-leader",
                  `layers.${leaderId}.native3D.target`,
                  "Current leader must retain its admitted open two-vertex endpoint path",
                );
              } else {
                const endpoint = transformPoint(
                  sample.matrix,
                  content.path.vertices[1]!,
                );
                const error = Math.hypot(
                  endpoint[0] - actual.pixel[0],
                  endpoint[1] - actual.pixel[1],
                );
                if (error > 0.5) {
                  bound = false;
                  fault(
                    run,
                    frame,
                    "mechanism-native-leader",
                    `layers.${leaderId}.native3D.target`,
                    "Settled leader endpoint differs from its same-pass actual anchor",
                    error,
                  );
                }
                if (binding.offsetPixels?.some((value) => value !== 0)) {
                  bound = false;
                  fault(
                    run,
                    frame,
                    "mechanism-native-leader-offset",
                    `layers.${leaderId}.native3D.offsetPixels`,
                    "Physical leader attachment proof requires the zero-offset actual anchor",
                  );
                }
              }
            }
          }
          bound &&=
            !!group?.state.visible &&
            group.opacity >= policy.readingOpacity &&
            !!leader?.visible &&
            leader.opacity >= policy.readingOpacity;
          let readable = bound;
          for (const kind of run.label.qualification
            ? (["label", "qualification"] as const)
            : (["label"] as const)) {
            const id = mechanismOverlayLayerId(kind, run.label.id),
              sample = quality.layers.get(id),
              expected = expectedCopy(id);
            const completeCopy =
              !!sample?.visible &&
              sample.opacity >= policy.readingOpacity &&
              sample.reveal >= policy.readingReveal &&
              expected !== undefined &&
              sample.text === expected &&
              !sample.textCopies;
            bound &&= completeCopy;
            readable &&= completeCopy;
            const measured =
              !!sample &&
              !!options.textBounds?.[id] &&
              !!sample.bounds &&
              !!sample.clippedBounds;
            if (!measured) {
              run.measurementComplete = false;
              layoutMeasured = false;
              readable = false;
            }
            if (sample?.visible && measured) {
              boxes.push({ sample, run });
              if (!sample.fullyOnScreen) {
                readable = false;
                fault(
                  run,
                  frame,
                  "mechanism-label-offscreen",
                  `layers.${id}.transform`,
                  "Current measured label extent is clipped or leaves the output viewport",
                );
              }
            }
          }
          eligible.anchored &&= bound;
          eligible.readable &&= readable;
        }
        for (const caption of episode.captions) {
          const id = mechanismOverlayLayerId("caption", caption.id),
            sample = quality.layers.get(id);
          if (!sample?.visible) continue;
          if (options.textBounds?.[id] && sample.bounds && sample.clippedBounds)
            boxes.push({ sample });
          else layoutMeasured = false;
        }
        for (const [index, box] of boxes.entries())
          for (const other of boxes.slice(index + 1)) {
            const area = overlap(box.sample.bounds!, other.sample.bounds!);
            if (!area) continue;
            for (const [a, b] of [
              [box, other],
              [other, box],
            ] as const)
              if (a.run) {
                eligibility.get(a.run.label.id)!.readable = false;
                fault(
                  a.run,
                  frame,
                  "mechanism-label-overlap",
                  `layers.${a.sample.id}.transform`,
                  "Current measured text extents overlap",
                  area,
                  b.sample.id,
                );
              }
          }
      }
      if (!contributingTrees || used.size !== packet.passes.length)
        passageError(
          "comp-native3d-observation",
          "Native overlay packet has unmatched or missing contributing passes",
          { path: "overlay.passes", frame },
        );
      for (const run of active) {
        const eligible = eligibility.get(run.label.id)!;
        advance(run.anchored, eligible.anchored, frame);
        advance(run.readable, eligible.readable, frame);
      }
      checkedOutputFrames++;
      checkedPasses += packet.passes.length;
    },
    finish() {
      if (finished || checkedOutputFrames !== composition.frameCount)
        passageError(
          "comp-native3d-protocol",
          "Native overlay checking requires complete output coverage and one finalization",
          { path: "overlay.outputFrames" },
        );
      finished = true;
      for (const run of runs) {
        if (run.anchored.longest < 30)
          fault(
            run,
            run.label.readingInterval.startFrame,
            "mechanism-label-hold",
            `${run.path}.readingInterval`,
            "Label needs 30 consecutive output frames with an actual visible anchor, complete current copy and attached leader",
            run.anchored.longest,
            undefined,
            run.label.readingInterval.endFrameExclusive - 1,
          );
        else if (run.measurementComplete && run.readable.longest < 30)
          fault(
            run,
            run.label.readingInterval.startFrame,
            "mechanism-label-readable-hold",
            `${run.path}.readingInterval`,
            "Measured current label and qualification need 30 consecutive fully on-screen unobstructed output frames",
            run.readable.longest,
            undefined,
            run.label.readingInterval.endFrameExclusive - 1,
          );
      }
      const physicalHoldsValid =
        runs.every((run) => run.anchored.longest >= 30) &&
        findings.every(
          (finding) => !finding.code.startsWith("mechanism-native-"),
        );
      return {
        method: "actual-native-anchor-and-settled-composition",
        checkedOutputFrames,
        checkedPasses,
        physicalHoldsValid,
        layoutMeasurement: layoutMeasured ? "measured" : "unassessed",
        layoutAccepted: layoutMeasured
          ? physicalHoldsValid && findings.length === 0
          : null,
        renderedGlyphReadability: "requires-encoded-review",
        findings,
        holds: runs.map((run) => ({
          shot: run.shot.id,
          label: run.label.id,
          longestAnchoredFrames: run.anchored.longest,
          longestReadableFrames: run.measurementComplete
            ? run.readable.longest
            : null,
          requiredFrames: 30,
          anchoredInterval: run.anchored.interval,
          readableInterval: run.measurementComplete
            ? run.readable.interval
            : null,
        })),
      };
    },
  };
}
