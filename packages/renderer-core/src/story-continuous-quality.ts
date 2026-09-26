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
