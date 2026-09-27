import type { StoryRenderScene } from "./story-scene.ts";
import type { StoryQualityDiagnostic } from "./story-quality.ts";
import { evaluatePreparedNode } from "./prepared-scene.ts";
import { sampleStoryCamera } from "./story-camera.ts";
import { storyAnchorPosition } from "./story-geometry.ts";
import type { PreparedNode } from "../../scene-contract/src/prepared.ts";

function visible(
  scene: StoryRenderScene,
  node: PreparedNode,
  frame: number,
): boolean {
  const state = evaluatePreparedNode(scene, node, frame);
  if (state.opacity <= 0 || state.reveal <= 0) return false;
  return (
    !node.parent ||
    visible(scene, scene.nodes.find((n) => n.id === node.parent)!, frame)
  );
}

function textPoints(
  scene: StoryRenderScene,
  node: Extract<PreparedNode, { type: "text" }>,
  frame: number,
) {
  // Authored bounds are preferred; the fallback is conservative, not an optical font measurement.
  const width =
    node.width ||
    Math.max(node.text.length, ...(node.states ?? []).map((t) => t.length)) *
      node.fontSize *
      0.65;
  const left =
    node.align === "center" ? -width / 2 : node.align === "right" ? -width : 0;
  return [
    [left, 0],
    [left + width, 0],
    [left, node.fontSize * 1.4],
    [left + width, node.fontSize * 1.4],
  ].map((p) =>
    storyAnchorPosition(scene, node.id, p as [number, number], frame),
  );
}

export function analyzeContinuousStory(
  scene: StoryRenderScene,
  essential: string[],
) {
  const diagnostics: StoryQualityDiagnostic[] = [];
  const record = (
    code: StoryQualityDiagnostic["code"],
    nodes: string[],
    frame: number,
    measured: number,
    message: string,
  ) => {
    const previous = diagnostics.findLast(
      (d) => d.code === code && d.nodes.join() === nodes.join(),
    );
    if (previous && previous.frames[1] === frame - 1) {
      previous.frames[1] = frame;
      previous.measured = Math.max(previous.measured, measured);
    } else
      diagnostics.push({
        code,
        nodes,
        frames: [frame, frame],
        measured,
        message,
      });
  };
  let frozen = 0,
    longestFrozenRun = 0,
    frozenEnd = 0,
    maxTextVelocity = 0,
    maxPan = 0,
    maxZoomRate = 0;
  let previous = "";
  const textNodes = scene.nodes.filter(
    (n): n is Extract<PreparedNode, { type: "text" }> =>
      n.type === "text" && essential.includes(n.id),
  );
  const ancestors = (node: PreparedNode) => {
    const ids = [node.id];
    while (node.parent) {
      node = scene.nodes.find((n) => n.id === node.parent)!;
      ids.push(node.id);
    }
    return ids;
  };
  for (let frame = 0; frame < scene.frameCount; frame++) {
    const snapshot = JSON.stringify([
      scene.nodes.map((n) => evaluatePreparedNode(scene, n, frame)),
      sampleStoryCamera(scene, frame),
      scene.compiledFlows
        .filter((f) => frame >= f.window.start && frame < f.window.end)
        .map((f) => f.offsets[frame]),
    ]);
    if (frame > 0) {
      frozen = snapshot === previous ? frozen + 1 : 0;
      if (frozen > longestFrozenRun) {
        longestFrozenRun = frozen;
        frozenEnd = frame;
      }
      const camera = sampleStoryCamera(scene, frame),
        before = sampleStoryCamera(scene, frame - 1);
      const pan =
        Math.hypot(camera.x - before.x, camera.y - before.y) * camera.zoom;
      const zoom = Math.abs(camera.zoom - before.zoom);
      maxPan = Math.max(maxPan, pan);
      maxZoomRate = Math.max(maxZoomRate, zoom);
      if (pan > 2.5 + 1e-8 || zoom > 0.0009 + 1e-8)
        record(
          "camera-too-fast",
          [],
          frame,
          pan,
          `Camera exceeds 2.5 px/frame pan or 0.0009 zoom/frame (pan ${pan.toFixed(3)}, zoom ${zoom.toFixed(6)}).`,
        );
      for (const text of textNodes) {
        if (!visible(scene, text, frame) || !visible(scene, text, frame - 1))
          continue;
        const hierarchy = ancestors(text);
        if (
          scene.motionEvents.some(
            (e) =>
              ["entrance", "exit"].includes(e.kind) &&
              hierarchy.includes(e.node) &&
              frame > e.window.start &&
              frame <= e.window.end,
          )
        )
          continue;
        const now = textPoints(scene, text, frame),
          last = textPoints(scene, text, frame - 1);
        const speed = Math.max(
          ...now.map(
            (p, i) =>
              Math.hypot(p[0] - last[i]![0], p[1] - last[i]![1]) * scene.fps,
          ),
        );
        maxTextVelocity = Math.max(maxTextVelocity, speed);
        if (speed > 20 + 1e-8)
          record(
            "text-velocity",
            [text.id],
            frame,
            speed,
            `${text.id} exceeds 20 px/s outside its entrance/exit.`,
          );
      }
    }
    previous = snapshot;
  }
  if (longestFrozenRun > 6)
    diagnostics.push({
      code: "frozen-run",
      nodes: [],
      frames: [frozenEnd - longestFrozenRun + 1, frozenEnd],
      measured: longestFrozenRun,
      message: `${longestFrozenRun} frames have no compiled motion; the hard limit is 6.`,
    });
  const ends = [
    ...new Set([
      0,
      ...scene.motionEvents
        .filter((e) => e.role === "action" || e.role === "response")
        .map((e) => e.window.end),
      ...(scene.motionModel
        ? (scene.drivers ?? [])
            .filter((d) => ["action", "response"].includes(d.layer ?? "action"))
            .flatMap((driver) => {
              return Array.from(
                { length: scene.frameCount - 1 },
                (_, i) => i + 1,
              ).filter(
                (frame) =>
                  Math.abs(
                    sampleDriver(scene, driver, frame) -
                      sampleDriver(scene, driver, frame - 1),
                  ) > 1e-6,
              );
            })
        : []),
      scene.frameCount - 1,
    ]),
  ].sort((a, b) => a - b);
  let longestSemanticGap = 0;
  for (let i = 1; i < ends.length; i++) {
    const gap = ends[i]! - ends[i - 1]!;
    longestSemanticGap = Math.max(longestSemanticGap, gap);
    if (gap > 48)
      diagnostics.push({
        code: "semantic-gap",
        nodes: [],
        frames: [ends[i - 1]!, ends[i]!],
        measured: gap,
        message: `${gap} frames between action/response ends; the hard limit is 48.`,
      });
  }
  motionEnvelopes(scene, textNodes, diagnostics);
  return {
    longestFrozenRun,
    longestSemanticGap,
    maxTextVelocity,
    maxPanPixelsPerFrame: maxPan,
    maxZoomPerFrame: maxZoomRate,
    diagnostics,
  };
}

function motionEnvelopes(
  scene: StoryRenderScene,
  labels: Extract<PreparedNode, { type: "text" }>[],
  diagnostics: StoryQualityDiagnostic[],
) {
  // Restriction bands have declared bounds. Backgrounds and labels' own subjects are not obstacles.
  if (scene.recipe.preset !== "access_constraint") return;
  for (const id of scene.recipe.sides) {
    const node = scene.nodes.find((n) => n.id === id)!;
    const envelope = [Infinity, Infinity, -Infinity, -Infinity];
    for (let frame = 0; frame < scene.frameCount; frame++) {
      if (!visible(scene, node, frame)) continue;
      for (const point of [
        [0, 0],
        [node.width, 0],
        [0, node.height],
        [node.width, node.height],
      ]) {
        const [x, y] = storyAnchorPosition(
          scene,
          id,
          point as [number, number],
          frame,
        );
        envelope[0] = Math.min(envelope[0]!, x);
        envelope[1] = Math.min(envelope[1]!, y);
        envelope[2] = Math.max(envelope[2]!, x);
        envelope[3] = Math.max(envelope[3]!, y);
      }
    }
    for (const label of labels)
      for (let frame = 0; frame < scene.frameCount; frame++) {
        if (!visible(scene, label, frame)) continue;
        const points = textPoints(scene, label, frame);
        if (
          Math.min(...points.map((p) => p[0])) < envelope[2]! &&
          Math.max(...points.map((p) => p[0])) > envelope[0]! &&
          Math.min(...points.map((p) => p[1])) < envelope[3]! &&
          Math.max(...points.map((p) => p[1])) > envelope[1]!
        ) {
          diagnostics.push({
            code: "label-in-motion-envelope",
            nodes: [label.id, id],
            frames: [frame, frame],
            measured: 1,
            message: `${label.id} intersects the full motion envelope of ${id}; review optical clearance.`,
          });
          break;
        }
      }
  }
}

import { sampleCurve } from "./curve.ts";
import {
  sampleLayer,
  sampleDriver,
  layerOrder,
  type LayerTrack,
} from "./motion-craft.ts";
import type { MotionLayer } from "../../scene-contract/src/motion-craft.ts";
export type LayerPixelEnergy = {
  total: number[];
  layers: Record<MotionLayer, number[]>;
};

/** Marginal pixel-change contribution, measured by leaving each role out. Overlaps are not additive. */
export async function measureLayerPixelEnergy(
  frameCount: number,
  render: (frame: number, disabled?: MotionLayer) => Promise<Uint8ClampedArray>,
): Promise<LayerPixelEnergy> {
  const result: LayerPixelEnergy = {
    total: [],
    layers: { action: [], response: [], current: [], carrier: [] },
  };
  const previous = new Map<string, Uint8ClampedArray>();
  for (let frame = 0; frame < frameCount; frame++) {
    const full = await render(frame),
      before = previous.get("full");
    let total = 0;
    if (before)
      for (let i = 0; i < full.length; i += 4)
        for (let c = 0; c < 3; c++)
          total += Math.abs(full[i + c]! - before[i + c]!);
    result.total.push(total);
    for (const layer of layerOrder) {
      const pixels = await render(frame, layer),
        prior = previous.get(layer);
      let contribution = 0;
      if (before && prior)
        for (let i = 0; i < full.length; i += 4)
          for (let c = 0; c < 3; c++)
            contribution += Math.abs(
              full[i + c]! - before[i + c]! - (pixels[i + c]! - prior[i + c]!),
            );
      result.layers[layer].push(contribution);
      previous.set(layer, pixels);
    }
    previous.set("full", full);
  }
  return result;
}

export function analyzeMotionCraft(
  scene: StoryRenderScene,
  pixels?: LayerPixelEnergy,
): StoryQualityDiagnostic[] {
  const diagnostics: StoryQualityDiagnostic[] = [];
  const layers: LayerTrack[] = scene.compiledMotion?.layers.slice() ?? [];
  for (const [node, tracks] of Object.entries(scene.tracks))
    for (const [property, keys] of Object.entries(tracks))
      if (keys.length > 1)
        layers.push({
          node,
          property,
          keys,
          layer:
            scene.motionEvents.find((e) => e.node === node)?.role ?? "action",
          blend: "replace",
          start: keys[0]!.time,
          end: keys.at(-1)!.time,
          path: `/tracks/${node}/${property}`,
        });
  const peaks: { node: string; frame: number; speed: number }[] = [];
  const report = (
    code: StoryQualityDiagnostic["code"],
    track: LayerTrack,
    frame: number,
    measured: number,
    message: string,
    suggestedFix?: string,
  ) =>
    diagnostics.push({
      code,
      nodes: [track.node],
      frames: [Math.round(frame), Math.round(frame)],
      measured,
      message,
      path: track.path,
      ...(suggestedFix ? { suggestedFix } : {}),
    });
  for (const track of layers) {
    const keys = track.keys;
    if (keys)
      for (let i = 1; i < keys.length - 1; i++) {
        const key = keys[i]!,
          dt = 1e-4;
        if (key.step || keys[i + 1]!.step) continue;
        const left =
          (sampleCurve(keys, key.time, scene.fps) -
            sampleCurve(keys, key.time - dt, scene.fps)) /
          dt;
        const right =
          (sampleCurve(keys, key.time + dt, scene.fps) -
            sampleCurve(keys, key.time, scene.fps)) /
          dt;
        const size = Math.max(
          1,
          Math.abs(keys[i + 1]!.value - keys[i - 1]!.value),
        );
        if (Math.abs(left - right) / size > 0.02)
          report(
            "velocity-discontinuity",
            track,
            key.time,
            Math.abs(left - right) / size,
            "Speed changes abruptly at this key.",
            `Set smooth: true on keys[${i}]`,
          );
        const arriving = Math.abs(key.value - keys[i - 1]!.value) > 1e-6,
          departing = Math.abs(keys[i + 1]!.value - key.value) > 1e-6;
        if (
          arriving &&
          departing &&
          (key.value - keys[i - 1]!.value) * (keys[i + 1]!.value - key.value) >
            0 &&
          Math.abs(left) + Math.abs(right) < 1e-3
        )
          report(
            "dead-stop-chain",
            track,
            key.time,
            0,
            "Chained movement stops at an interior key.",
            `Set smooth: true on keys[${i}]`,
          );
      }
    if (track.layer !== "action") continue;
    let peak = 0,
      peakFrame = track.start + 1;
    const start = Math.max(1, Math.ceil(track.start) + 1),
      end = Math.min(scene.frameCount - 1, Math.floor(track.end));
    const speeds: number[] = [];
    for (let frame = start; frame <= end; frame++) {
      const speed = Math.abs(
        sampleLayer(track, frame, scene.fps) -
          sampleLayer(track, frame - 1, scene.fps),
      );
      speeds.push(speed);
      if (speed > peak) {
        peak = speed;
        peakFrame = frame;
      }
    }
    if (peak > 1e-5) {
      peaks.push({ node: track.node, frame: peakFrame, speed: peak });
      if (peakFrame === start && speeds.length >= 3 && speeds[1]! < peak * 0.95)
        report(
          "entrance-pop",
          track,
          start,
          peak,
          "Motion reaches peak speed on its first frame.",
          "Use entranceProfile: accelerate or an in-out easing",
        );
    }
    // Legacy tracks include an initial hold. Check each event's true entrance window.
    for (const event of scene.motionEvents.filter(
      (e) =>
        e.node === track.node &&
        e.role === "action" &&
        e.window.end - e.window.start >= 3,
    )) {
      const start = Math.ceil(event.window.start),
        end = Math.floor(event.window.end);
      const speed = (f: number) =>
        Math.abs(
          sampleLayer(track, f, scene.fps) -
            sampleLayer(track, f - 1, scene.fps),
        );
      const first = speed(start + 1),
        peak = Math.max(
          ...Array.from({ length: end - start }, (_, i) =>
            speed(start + i + 1),
          ),
        );
      if (
        first > 1e-5 &&
        first >= peak &&
        speed(start + 2) < first * 0.95 &&
        !diagnostics.some(
          (d) => d.code === "entrance-pop" && d.path === track.path,
        )
      )
        report(
          "entrance-pop",
          track,
          start + 1,
          first,
          "Action reaches peak speed on its first frame.",
          "Use entranceProfile: accelerate",
        );
    }
  }
  const groups = scene.review?.focalGroups ?? [];
  for (let i = 0; i < peaks.length; i++)
    for (const other of peaks.slice(0, i)) {
      const peak = peaks[i]!,
        a = groups.find((g) => g.nodes.includes(peak.node)),
        b = groups.find((g) => g.nodes.includes(other.node));
      if (a && b && a.id !== b.id && Math.abs(peak.frame - other.frame) <= 3)
        diagnostics.push({
          code: "competing-focus",
          nodes: [peak.node, other.node],
          frames: [
            Math.min(peak.frame, other.frame),
            Math.max(peak.frame, other.frame),
          ],
          measured: 2,
          path: "/review/focalGroups",
          message:
            "Actions in different focal groups peak within three frames.",
        });
    }
  if (pixels) {
    const sums = Object.fromEntries(
      layerOrder.map((layer) => [
        layer,
        pixels.layers[layer].reduce((a, b) => a + b, 0),
      ]),
    ) as Record<MotionLayer, number>;
    const total = Object.values(sums).reduce((a, b) => a + b, 0),
      share = total ? sums.carrier / total : 0;
    if (share > 0.5)
      diagnostics.push({
        code: "carrier-dominance",
        nodes: [],
        frames: [0, scene.frameCount - 1],
        measured: share,
        path: "/periodic",
        message:
          "Carrier contributes more than half of measured marginal pixel motion.",
      });
    const peak = pixels.total.indexOf(Math.max(...pixels.total));
    const focal = scene.motionEvents.some(
      (e) =>
        e.role === "action" &&
        e.window.start <= peak &&
        e.window.end >= peak &&
        (!groups.length || groups.some((g) => g.nodes.includes(e.node))),
    );
    const actionEnergy = pixels.layers.action[peak] ?? 0;
    const otherEnergy = Math.max(
      ...layerOrder
        .filter((l) => l !== "action")
        .map((l) => pixels.layers[l][peak] ?? 0),
    );
    if (peak > 0 && (!focal || otherEnergy > actionEnergy * 1.25))
      diagnostics.push({
        code: "peak-not-story",
        nodes: [],
        frames: [peak, peak],
        measured: pixels.total[peak]!,
        path: "/review/focalGroups",
        message:
          "The strongest pixel change falls outside the declared focal action or is dominated by another motion role.",
      });
  }
  for (const constraint of scene.constraints ?? [])
    if (constraint.type === "keep-in-safe-area" && !constraint.clamp) {
      const node = scene.nodes.find((n) => n.id === constraint.target)!;
      for (let frame = 0; frame < scene.frameCount; frame++) {
        const points = [
            [0, 0],
            [node.width, 0],
            [node.width, node.height],
            [0, node.height],
          ].map((p) =>
            storyAnchorPosition(scene, node.id, p as [number, number], frame),
          ),
          inset = constraint.inset;
        if (
          points.some(
            ([x, y]) =>
              x < inset ||
              y < inset ||
              x > scene.width - inset ||
              y > scene.height - inset,
          )
        ) {
          diagnostics.push({
            code: "outside-safe-area",
            nodes: [node.id],
            frames: [frame, frame],
            measured: inset,
            path: "/constraints",
            message: "Node leaves the declared safe area.",
          });
          break;
        }
      }
    }
  return diagnostics;
}
export function requireMotionCraft(
  diagnostics: StoryQualityDiagnostic[],
  codes: StoryQualityDiagnostic["code"][] = [
    "velocity-discontinuity",
    "entrance-pop",
    "dead-stop-chain",
    "carrier-dominance",
    "peak-not-story",
  ],
) {
  const failed = diagnostics.filter(
    (d) => !d.exception && codes.includes(d.code),
  );
  if (failed.length)
    throw Object.assign(
      new Error(
        "motion-craft-gate: Motion craft gate failed: " +
          [...new Set(failed.map((d) => d.code))].join(", "),
      ),
      { code: "motion-craft-gate", diagnostics: failed },
    );
}
