import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import type { StoryScene } from "../../scene-contract/src/story.ts";
import { evaluatePreparedNode } from "./prepared-scene.ts";
import { storyAnchorPosition } from "./story-geometry.ts";
import { evaluateStoryPath } from "./story-geometry.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import { PassageError, type PassageDiagnostic } from "./passage-diagnostics.ts";
import { boundsFromPoints, overlapsSafeZone } from "./safe-zone-geometry.ts";

export function isStoryNodeVisible(
  scene: StoryRenderScene,
  node: PreparedNode,
  frame: number,
): boolean {
  const state = evaluatePreparedNode(scene, node, frame);
  if (state.opacity <= 0 || state.reveal <= 0) return false;
  if (!node.parent) return true;
  const parent = scene.nodes.find((item) => item.id === node.parent);
  return !!parent && isStoryNodeVisible(scene, parent, frame);
}

function localBounds(node: PreparedNode): [number, number][] {
  if (node.type === "path") return node.points;
  if (node.type !== "text")
    return [
      [0, 0],
      [node.width, 0],
      [node.width, node.height],
      [0, node.height],
    ];
  const text = [node.text, ...(node.states ?? [])];
  const lines = text.flatMap((value) => value.split("\n"));
  const width =
    node.textLayout?.width ??
    (node.width ||
      Math.max(...lines.map((line) => line.length)) * node.fontSize * 0.65);
  const height =
    node.textLayout?.height ??
    Math.max(...text.map((value) => value.split("\n").length)) *
      node.fontSize *
      1.4;
  const left =
    node.align === "center" ? -width / 2 : node.align === "right" ? -width : 0;
  return [
    [left, 0],
    [left + width, 0],
    [left + width, height],
    [left, height],
  ];
}

export function storyNodeBounds(
  scene: StoryRenderScene,
  node: PreparedNode,
  frame: number,
) {
  const local =
    node.type === "path"
      ? evaluateStoryPath(scene, node, frame).points
      : localBounds(node);
  return boundsFromPoints(
    local.map((point) =>
      storyAnchorPosition(scene, node.id, point as [number, number], frame),
    ),
  );
}

export function storyFocalSubjects(
  scene: StoryScene,
  focusIds: readonly string[] = [],
): Set<string> {
  const subjects = new Set([
    ...focusIds,
    ...(scene.review?.focalGroups ?? []).flatMap((group) => group.nodes),
    ...(scene.constraints ?? [])
      .filter((constraint) => constraint.type === "keep-in-safe-area")
      .map((constraint) => constraint.target),
  ]);
  if (!subjects.size && scene.format === "vertical")
    for (const node of scene.nodes)
      if (
        !node.parent &&
        (node.type === "image" ||
          node.type === "group" ||
          node.type === "rect") &&
        node.width * node.height < scene.width * scene.height * 0.7 &&
        !(node.width > scene.width * 0.8 && node.y > scene.height * 0.55)
      )
        subjects.add(node.id);
  return subjects;
}

export function storySafeZoneDiagnostics(
  scene: StoryRenderScene,
  focusIds: readonly string[] = [],
): PassageDiagnostic[] {
  const zones = Object.entries(scene.safeZones ?? {});
  if (!zones.length) return [];
  const subjects = storyFocalSubjects(scene, focusIds);
  const diagnostics: PassageDiagnostic[] = [];
  const reported = new Set<string>();
  for (const node of scene.nodes) {
    const text = node.type === "text";
    if (!text && !subjects.has(node.id)) continue;
    for (let frame = 0; frame < scene.frameCount; frame++) {
      if (!isStoryNodeVisible(scene, node, frame)) continue;
      const bounds = storyNodeBounds(scene, node, frame);
      for (const [name, zone] of zones) {
        const key = `${node.id}:${name}`;
        if (reported.has(key) || !overlapsSafeZone(bounds, zone)) continue;
        reported.add(key);
        diagnostics.push({
          code: text ? "text-in-safe-zone" : "subject-in-safe-zone",
          severity: "error",
          message: `${text ? "Text" : "Focal subject"} ${node.id} overlaps safe zone ${name} at frame ${frame}`,
          node: node.id,
          frame,
          path: `safeZones.${name}`,
        });
      }
    }
    if (
      text &&
      node.type === "text" &&
      (!node.textLayout || node.textLayout.overflow !== "error") &&
      scene.format === "vertical"
    )
      diagnostics.push({
        code: "text-unmeasured-safe-zone",
        severity: "error",
        message: `Text ${node.id} needs a measured textLayout box with overflow error to validate vertical safe zones`,
        node: node.id,
        path: `nodes.${node.id}.textLayout`,
      });
  }
  return diagnostics;
}

export function validateStorySafeZones(
  scene: StoryRenderScene,
  focusIds: readonly string[] = [],
) {
  const first = storySafeZoneDiagnostics(scene, focusIds)[0];
  if (first) throw new PassageError([first]);
}
