import type { Composition } from "@still-shift/scene-contract";
import { boundaryVelocityJump } from "../camera-sampling.ts";
import {
  lintSeverity,
  type MotionLintCode,
  type MotionLintDiagnostic,
  type ResolvedCompositionQualityPolicy,
} from "./quality-policy.ts";
import {
  assertCompositionQualityCapacity,
  compositionQualityFrame,
  contributingMotionLayers,
  hasArea,
  qualityTrackContributes,
  qualityTrackSignature,
  layerQualityTracks,
  numericValues,
  type CompositionQualityFrame,
  type CompositionQualitySample,
} from "./quality-samples.ts";

type Finding = (
  code: MotionLintCode,
  sample: CompositionQualitySample,
  frames: [number, number],
  measured: number,
  message: string,
  path?: string,
) => void;
function findingsCollector(policy: ResolvedCompositionQualityPolicy) {
  const diagnostics: MotionLintDiagnostic[] = [];
  const last = new Map<string, MotionLintDiagnostic>();
  const add: Finding = (
    code,
    sample,
    frames,
    measured,
    message,
    path = sample.path,
  ) => {
    const shot = policy.shots.find(
      (s) => frames[0] >= s.start && frames[0] < s.end,
    )!.id;
    const key = `${code}:${sample.id}:${path}:${shot}`;
    const previous = last.get(key);
    if (
      previous &&
      previous.frames[1] === frames[0] - 1 &&
      !policy.cuts.has(frames[0])
    ) {
      previous.frames[1] = frames[1];
      previous.measured = Math.max(previous.measured, measured);
    } else {
      const diagnostic: MotionLintDiagnostic = {
        code,
        severity: lintSeverity(code, policy),
        nodes: [sample.id],
        node: sample.id,
        path,
        frames,
        measured,
        message,
        shot,
      };
      diagnostics.push(diagnostic);
      last.set(key, diagnostic);
    }
  };
  return { diagnostics, add };
}
function coversViewport(
  sample: CompositionQualitySample,
  width: number,
  height: number,
  size?: readonly [number, number],
) {
  const layer = sample.state.layer;
  const extent = size ?? ("size" in layer ? layer.size : undefined);
  if (!extent) return false;
  const [a, b, c, d, e, f] = sample.matrix;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-12) return false;
  return [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ].every(([x, y]) => {
    const localX = (d * (x! - e) - c * (y! - f)) / determinant;
    const localY = (-b * (x! - e) + a * (y! - f)) / determinant;
    return (
      localX >= -1e-6 &&
      localY >= -1e-6 &&
      localX <= extent[0] + 1e-6 &&
      localY <= extent[1] + 1e-6
    );
  });
}
export function compositionFramingFindings(
  comp: Composition,
  frames: readonly CompositionQualityFrame[],
  policy: ResolvedCompositionQualityPolicy,
) {
  const { diagnostics, add } = findingsCollector(policy);
  const coverage = new Set(
    policy.coverageLayers ??
      (Array.isArray(comp.metadata?.storyCameraCover)
        ? (comp.metadata.storyCameraCover as string[])
        : []),
  );
  const inset = policy.safeAreaFraction;
  frames.forEach((frame, at) => {
    for (const sample of frame.layers.values()) {
      // Framing measures the painted region after group and precomp clipping.
      const b = sample.clippedBounds;
      if (sample.visible && b && hasArea(b) && !coverage.has(sample.id)) {
        if (
          b.right <= 0 ||
          b.bottom <= 0 ||
          b.left >= comp.width ||
          b.top >= comp.height
        )
          add(
            "off-canvas",
            sample,
            [at, at],
            1,
            "Visible layer has no intersection with the canvas.",
          );
        else if (
          b.left < comp.width * inset ||
          b.top < comp.height * inset ||
          b.right > comp.width * (1 - inset) ||
          b.bottom > comp.height * (1 - inset)
        )
          add(
            "outside-safe-area",
            sample,
            [at, at],
            1,
            `Layer leaves the ${(inset * 100).toFixed(1)}% safe inset.`,
          );
      }
    }
    for (const id of coverage) {
      const sample = frame.layers.get(id);
      if (!sample) {
        if (at === 0)
          diagnostics.push({
            code: "coverage",
            severity: lintSeverity("coverage", policy),
            nodes: [id],
            node: id,
            frames: [0, comp.frameCount - 1],
            measured: 1,
            path: "layers",
            message: `Coverage layer ${id} does not exist.`,
          });
        continue;
      }
      const b = sample.clippedBounds;
      const ancestorClips = sample.ancestors.some((id) => {
        const ancestor = frame.layers.get(id);
        if (!ancestor) return false;
        const layer = ancestor.state.layer;
        if (layer.type === "group" && layer.clip)
          return !coversViewport(ancestor, comp.width, comp.height);
        if (layer.type === "precomp" && !layer.collapseTransforms) {
          const source = comp.precomps!.find((p) => p.id === layer.comp)!;
          return !coversViewport(ancestor, comp.width, comp.height, [
            source.width,
            source.height,
          ]);
        }
        return false;
      });
      if (
        !sample.visible ||
        sample.opacity < 0.999 ||
        !b ||
        b.left > 0 ||
        b.top > 0 ||
        b.right < comp.width ||
        b.bottom < comp.height ||
        !coversViewport(sample, comp.width, comp.height) ||
        ancestorClips ||
        sample.state.masks.some((mask) => mask.mode !== "none") ||
        !!sample.state.layer.trackMatte
      )
        add(
          "coverage",
          sample,
          [at, at],
          1,
          "Declared coverage layer does not cover the entire canvas with opaque content; bounds are conservative.",
        );
    }
  });
  return diagnostics;
}
const scaleDelta = (
  a: CompositionQualitySample,
  b: CompositionQualitySample,
) => {
  // Reflections can cancel across rotated parent/child axes. Translation does
  // not change scale; compare the effective linear transform before its signs.
  if (
    a.matrix
      .slice(0, 4)
      .every(
        (value, i) =>
          Math.abs(value - b.matrix[i]!) <=
          1e-10 * Math.max(1, Math.abs(value), Math.abs(b.matrix[i]!)),
      )
  )
    return 0;
  return Math.max(
    ...a.scale.map(
      (value, i) =>
        Math.abs(value - b.scale[i]!) / Math.max(1, Math.abs(b.scale[i]!)),
    ),
  );
};
export function compositionPopFindings(
  frames: readonly CompositionQualityFrame[],
  policy: ResolvedCompositionQualityPolicy,
) {
  const { diagnostics, add } = findingsCollector(policy);
  for (let at = 1; at < frames.length; at++) {
    if (policy.cuts.has(at)) continue;
    for (const [id, current] of frames[at]!.layers) {
      const before = frames[at - 1]!.layers.get(id);
      if (!before || !(before.visible || current.visible)) continue;
      const prior = frames[at - 2]?.layers.get(id),
        next = frames[at + 1]?.layers.get(id),
        after = frames[at + 2]?.layers.get(id);
      for (const [code, threshold, delta] of [
        [
          "opacity-pop",
          policy.opacityPop,
          (a: CompositionQualitySample, b: CompositionQualitySample) =>
            Math.abs(a.opacity - b.opacity),
        ],
        ["scale-pop", policy.scalePop, scaleDelta],
      ] as const) {
        const jump = delta(current, before);
        const priorJump =
          prior && !policy.cuts.has(at - 1) ? delta(before, prior) : 0;
        const nextJump =
          next && !policy.cuts.has(at + 1) ? delta(next, current) : 0;
        const neighbours = Math.max(priorJump, nextJump);
        const excursion =
          next &&
          !policy.cuts.has(at + 1) &&
          nextJump > threshold &&
          delta(next, before) <=
            Math.min(jump, nextJump) * policy.popNeighbourRatio &&
          priorJump <= jump * policy.popNeighbourRatio &&
          (!after ||
            policy.cuts.has(at + 2) ||
            delta(after, next) <= nextJump * policy.popNeighbourRatio);
        if (
          jump > threshold &&
          (neighbours <= jump * policy.popNeighbourRatio || excursion)
        )
          add(
            code,
            current,
            [at - 1, excursion ? at + 1 : at],
            jump,
            "Abrupt single-frame change next to settled frames; smooth it or mark an intentional cut.",
            `${current.path}.transform.${code === "scale-pop" ? "scale" : "opacity"}`,
          );
      }
    }
  }
  return diagnostics;
}
function easingSignature(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
) {
  if (
    a.out ||
    b.in ||
    a.smooth ||
    b.smooth ||
    a.interpolation === "smooth" ||
    b.interpolation === "smooth"
  )
    return JSON.stringify(["hermite", a.out, b.in, a.smooth, b.smooth]);
  return JSON.stringify(
    b.interpolation === "linear"
      ? "linear"
      : b.bezier
        ? { bezier: b.bezier }
        : (b.easing ?? "smoothstep"),
  );
}
function propertyEasingShare(
  segments: readonly { property: string; easing: string }[],
) {
  const properties = new Map<string, Set<string>>();
  for (const segment of segments) {
    if (!properties.has(segment.property))
      properties.set(segment.property, new Set());
    properties.get(segment.property)!.add(segment.easing);
  }
  const counts = new Map<string, number>();
  for (const profiles of properties.values())
    for (const easing of profiles)
      counts.set(easing, (counts.get(easing) ?? 0) + 1 / profiles.size);
  return {
    propertyCount: properties.size,
    share: properties.size ? Math.max(...counts.values()) / properties.size : 0,
  };
}
/** Authored moving segments are counted once per property/instance, never once per vector component. */
export function compositionTimingFindings(
  comp: Composition,
  frames: readonly CompositionQualityFrame[],
  policy: ResolvedCompositionQualityPolicy,
) {
  const diagnostics: MotionLintDiagnostic[] = [];
  const segments: {
    id: string;
    start: number;
    end: number;
    easing: string;
    path: string;
    property: string;
  }[] = [];
  const contributingFrames = frames.map(contributingMotionLayers);
  const instances = new Map<string, CompositionQualitySample>();
  for (const frame of contributingFrames)
    for (const sample of frame.values())
      if (!instances.has(sample.id) || sample.onScreen)
        instances.set(sample.id, sample);
  for (const sample of instances.values()) {
    for (const track of layerQualityTracks(sample.state.layer)) {
      for (let i = 1; i < track.keys.length; i++) {
        const a = track.keys[i - 1]!,
          b = track.keys[i]!;
        if (
          JSON.stringify(a.value) === JSON.stringify(b.value) ||
          !numericValues(a.value).length ||
          b.step ||
          b.interpolation === "hold"
        )
          continue;
        const visible = contributingFrames
          .map((frame, at) => ({ sample: frame.get(sample.id), at }))
          .filter(
            ({ sample: s, at }) =>
              s &&
              qualityTrackContributes(
                s,
                track.path,
                frames[at]!.matteSources.has(s.id),
              ) &&
              s.state.time >= Number(a.frame) &&
              s.state.time <= Number(b.frame),
          );
        if (visible.length < 2) continue;
        const firstValue = qualityTrackSignature(
          visible[0]!.sample!,
          track.path,
        );
        if (
          firstValue === undefined ||
          visible.every(
            ({ sample: s }) =>
              qualityTrackSignature(s!, track.path) === firstValue,
          )
        )
          continue;
        segments.push({
          id: sample.id,
          start: visible[0]!.at,
          end: visible.at(-1)!.at,
          easing: easingSignature(a, b),
          path: `${sample.path}.${track.path}`,
          property: `${sample.id}:${track.path}`,
        });
      }
    }
  }
  for (const shot of policy.shots) {
    const moving = segments.filter(
      (s) => s.start < shot.end && s.end >= shot.start,
    );
    const { propertyCount, share } = propertyEasingShare(moving);
    if (propertyCount >= policy.minimumMovingProperties) {
      if (share >= policy.easingMonotonyShare)
        diagnostics.push({
          code: "easing-monotony",
          severity: lintSeverity("easing-monotony", policy),
          nodes: [...new Set(moving.map((s) => s.id))],
          path: moving[0]!.path,
          frames: [shot.start, shot.end - 1],
          measured: share,
          shot: shot.id,
          message: `${(share * 100).toFixed(1)}% of moving properties share an easing; vary timing to support the story.`,
        });
    }
    const groups = new Map<string, typeof segments>();
    for (const segment of moving.filter((s) => s.start >= shot.start)) {
      const key = `${segment.start}:${segment.easing}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(segment);
    }
    for (const group of groups.values()) {
      const nodes = [...new Set(group.map((s) => s.id))];
      if (nodes.length >= policy.coStartLayers)
        diagnostics.push({
          code: "co-start",
          severity: lintSeverity("co-start", policy),
          nodes,
          path: group[0]!.path,
          frames: [
            Math.max(shot.start, group[0]!.start),
            Math.min(shot.end - 1, group[0]!.start),
          ],
          measured: nodes.length,
          shot: shot.id,
          message: `${nodes.length} layers begin on the same frame with identical easing; consider overlap.`,
        });
    }
  }
  return diagnostics;
}

function joinFrames(
  comp: Composition,
  frames: readonly CompositionQualityFrame[],
  policy: ResolvedCompositionQualityPolicy,
) {
  const joins = new Set<number>(
    Array.from({ length: Math.max(0, frames.length - 2) }, (_, i) => i + 1),
  );
  const keyTimes = new Map<string, number[]>();
  // Searches charge the shared lint budget. Within each frame interval, one
  // evaluation records every layer's clock, so layers sharing a clock reuse
  // the same bisection steps instead of repeating them per layer.
  let inspected = frames.reduce((total, f) => total + f.layers.size, 0);
  let previous = contributingMotionLayers(frames[0]!);
  for (let frame = 1; frame < frames.length; frame++) {
    const clocks = new Map<number, Map<string, number>>();
    const clockAt = (time: number) => {
      let sampled = clocks.get(time);
      if (!sampled) {
        const evaluated = compositionQualityFrame(
          comp,
          time,
          policy.evaluation,
        );
        inspected += evaluated.layers.size;
        assertCompositionQualityCapacity(inspected);
        sampled = new Map(
          [...evaluated.layers].map(([id, s]) => [id, s.state.time]),
        );
        clocks.set(time, sampled);
      }
      return sampled;
    };
    const contributing = contributingMotionLayers(frames[frame]!);
    for (const current of contributing.values()) {
      const before = previous.get(current.id);
      if (!before || before.state.time === current.state.time) continue;
      let keys = keyTimes.get(current.id);
      if (!keys) {
        keys = [
          ...new Set(
            layerQualityTracks(current.state.layer).flatMap((track) =>
              track.keys.map((key) => Number(key.frame)),
            ),
          ),
        ];
        keyTimes.set(current.id, keys);
      }
      for (const key of keys) {
        if (
          key <= Math.min(before.state.time, current.state.time) ||
          key >= Math.max(before.state.time, current.state.time)
        )
          continue;
        let lo = frame - 1,
          hi = frame;
        for (let pass = 0; pass < 24; pass++) {
          const mid = (lo + hi) / 2;
          const time = clockAt(mid).get(current.id);
          if (time === undefined) break;
          if (time < key === current.state.time > before.state.time) lo = mid;
          else hi = mid;
        }
        joins.add((lo + hi) / 2);
      }
    }
    previous = contributing;
  }
  return [...joins].sort((a, b) => a - b);
}
function velocityValues(sample: CompositionQualitySample) {
  return [
    sample.matrix[4],
    sample.matrix[5],
    ...sample.matrix.slice(0, 4).map((n) => n * 100),
    sample.opacity * 100,
    (sample.state.reveal ?? 1) * 100,
    ...(sample.state.color ?? []).map((n) => n * 100),
    ...numericValues(sample.effects),
    ...numericValues(sample.state.masks),
  ];
}
/**
 * Actual one-sided velocities include camera, nested clocks and fractional
 * stretched key joins. Each side is measured a step away from the join, so
 * per-frame held samples are frame evidence rather than velocity steps.
 */
export function compositionVelocityFindings(
  comp: Composition,
  frames: readonly CompositionQualityFrame[],
  policy: ResolvedCompositionQualityPolicy,
) {
  const { diagnostics, add } = findingsCollector(policy);
  const step = 0.0001;
  for (const at of joinFrames(comp, frames, policy)) {
    const nearest = Math.round(at);
    if (
      (policy.cuts.has(nearest) && Math.abs(nearest - at) < step) ||
      policy.cuts.has(Math.ceil(at + step))
    )
      continue;
    const middle = Number.isInteger(at)
      ? frames[at]!
      : compositionQualityFrame(comp, at, policy.evaluation);
    const outer = compositionQualityFrame(
      comp,
      at - 2 * step,
      policy.evaluation,
    );
    const left = compositionQualityFrame(comp, at - step, policy.evaluation);
    const right = compositionQualityFrame(comp, at + step, policy.evaluation);
    const outerRight = compositionQualityFrame(
      comp,
      at + 2 * step,
      policy.evaluation,
    );
    for (const current of middle.layers.values()) {
      const probes = [
        [outer, outer.layers.get(current.id)],
        [left, left.layers.get(current.id)],
        [right, right.layers.get(current.id)],
        [outerRight, outerRight.layers.get(current.id)],
      ] as const;
      if (
        !(current.contributesPaint || middle.matteSources.has(current.id)) ||
        probes.some(
          ([frame, sample]) =>
            !sample ||
            !(sample.contributesPaint || frame.matteSources.has(current.id)),
        )
      )
        continue;
      const [beforeOuter, before, after, afterOuter] = probes.map(
        ([, sample]) => velocityValues(sample!),
      ) as [number[], number[], number[], number[]];
      const value = velocityValues(current);
      if (
        [beforeOuter, before, after, afterOuter].some(
          (values) => values.length !== value.length,
        )
      )
        continue;
      const jump = boundaryVelocityJump(
        beforeOuter,
        before,
        after,
        afterOuter,
        step,
      );
      const adjacentBefore =
        frames[Math.max(0, Math.floor(at - 1))]!.layers.get(current.id) ??
        probes[1][1]!;
      const adjacentAfter =
        frames[Math.min(frames.length - 1, Math.ceil(at + 1))]!.layers.get(
          current.id,
        ) ?? probes[2][1]!;
      const previousValues = velocityValues(adjacentBefore);
      const magnitude = Math.max(
        1,
        Math.hypot(
          ...velocityValues(adjacentAfter).map(
            (v, i) => v - (previousValues[i] ?? v),
          ),
        ),
      );
      if (jump / magnitude > policy.velocityJumpRatio)
        add(
          "velocity-discontinuity",
          current,
          [Math.floor(at), Math.ceil(at)],
          jump / magnitude,
          "Velocity changes abruptly at this join or handoff.",
          current.path + ".transform",
        );
    }
  }
  return diagnostics;
}
