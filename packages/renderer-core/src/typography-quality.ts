import type { CommerceRenderScene } from "./commerce-scene.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import type { StoryScene } from "../../scene-contract/src/story.ts";
import type { StoryQualityDiagnostic } from "./story-quality.ts";
import type { ShapedLayout } from "./shaped-text.ts";
import type { PreparedTypography } from "./typography-renderer.ts";
import { evaluateTextPoses } from "./typography-animation.ts";
import { resolvedTextStyle } from "./typography-style.ts";
import { findNarrationPhrase } from "./narration-timing.ts";
import { storyCameraTransform } from "./story-camera.ts";
import { evaluatePreparedNode } from "./prepared-scene.ts";
import { resolveTextEvents } from "./typography-events.ts";
import type { TextStyle } from "../../scene-contract/src/typography.ts";
import {
  resolveDisplayedText,
  retypedClusters,
  settledText,
} from "./typography-transition.ts";

export type TypographyReviewScene = StoryRenderScene | CommerceRenderScene;
export type TypeQualityCode =
  | "reading-time"
  | "moving-while-read"
  | "animator-handoff-snap"
  | "rag"
  | "text-contrast"
  | "hierarchy-drift"
  | "idle-type-motion"
  | "x-height-floor"
  | "text-pose-jump";
export type TypePixelEvidence = {
  node: string;
  frame: number;
  contrast?: number;
  handoffPixels?: number;
};
export type TypographyQualityPolicy = {
  readingRate?: number;
  readingFloorSeconds?: number;
  displacementBudget?: number;
  /** Largest single-frame glyph displacement, in px, allowed next to near-still frames. */
  jumpBudget?: number;
  minimumXHeight?: number;
  displayWidth?: number;
  prepared?: PreparedTypography;
  pixels?: TypePixelEvidence[];
  failOn?: TypeQualityCode[];
};
export type ReadingWindow = {
  node: string;
  start: number;
  end: number;
  requiredFrames: number;
  characters: number;
};
export function textReadingWindows(
  scene: TypographyReviewScene,
  policy: TypographyQualityPolicy = {},
): ReadingWindow[] {
  const essential = new Set(
    ("review" in scene ? scene.review?.essentialText : undefined) ??
      scene.nodes.filter((n) => n.type === "text").map((n) => n.id),
  );
  const windows: ReadingWindow[] = [];
  for (const node of scene.nodes) {
    if (node.type !== "text" || !essential.has(node.id)) continue;
    let start = -1;
    let shownText = node.text;
    const finish = (end: number) => {
      if (start < 0) return;
      const characters = [
        ...new Intl.Segmenter(node.locale ?? "en", {
          granularity: "grapheme",
        }).segment(shownText),
      ].length;
      const spokenSpan =
        scene.narrationTiming && /[\p{L}\p{N}]/u.test(shownText)
          ? findNarrationPhrase(scene.narrationTiming, shownText).find(
              (w) => w.start * scene.fps >= start && w.end * scene.fps <= end,
            )
          : undefined;
      const spoken = spokenSpan ? spokenSpan.end - spokenSpan.start : 0;
      const required =
        spoken ||
        Math.max(
          policy.readingFloorSeconds ?? 1,
          characters / (policy.readingRate ?? 15),
        );
      windows.push({
        node: node.id,
        start,
        end,
        requiredFrames: Math.ceil(required * scene.fps),
        characters,
      });
      start = -1;
    };
    for (let frame = 0; frame < scene.frameCount; frame++) {
      const state = evaluatePreparedNode(scene, node, frame);
      let opacity = state.opacity;
      let parent = node.parent;
      while (parent) {
        const p = scene.nodes.find((n) => n.id === parent)!;
        opacity *= evaluatePreparedNode(scene, p, frame).opacity;
        parent = p.parent;
      }
      const entering = scene.textAnimators?.some(
        (a) =>
          a.node === node.id &&
          frame < a.end &&
          (a.from.opacity !== undefined ||
            (!a.to &&
              (a.layer ?? "action") === "action" &&
              Object.keys(a.from).some(
                (key) => !["fill", "color", "stroke"].includes(key),
              ))),
      );
      const changing = (
        node.transitions ?? (node.transition ? [node.transition] : [])
      ).some((t) => frame >= t.window.start && frame < t.window.end);
      const settled =
        opacity >= 0.95 && state.reveal >= 0.99 && !entering && !changing;
      const displayed = settled
        ? settledText(node, frame, state.state)
        : undefined;
      if (settled && start >= 0 && displayed !== shownText) finish(frame);
      if (settled && start < 0) {
        start = frame;
        shownText = displayed!;
      }
      if (!settled) finish(frame);
    }
    finish(scene.frameCount);
    if (!windows.some((window) => window.node === node.id)) {
      const characters = [
        ...new Intl.Segmenter(node.locale ?? "en", {
          granularity: "grapheme",
        }).segment(node.text),
      ].length;
      windows.push({
        node: node.id,
        start: 0,
        end: 0,
        characters,
        requiredFrames: Math.ceil(
          Math.max(
            policy.readingFloorSeconds ?? 1,
            characters / (policy.readingRate ?? 15),
          ) * scene.fps,
        ),
      });
    }
  }
  return windows;
}
export function contrastRatio(a: string, b: string) {
  const luminance = (color: string) => {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function ragScore(layout: ShapedLayout) {
  const widths = layout.lines.map((l) => l.width),
    mean = widths.reduce((a, b) => a + b, 0) / widths.length;
  return mean
    ? Math.sqrt(
        widths.reduce((a, b) => a + (b - mean) ** 2, 0) / widths.length,
      ) / mean
    : 0;
}
function hierarchySignature(
  style: TextStyle,
  fontWeight: string | undefined,
  nodeWeight: string | undefined,
) {
  return JSON.stringify([
    style.size,
    style.axes?.wght ?? fontWeight ?? nodeWeight,
    style.tracking,
  ]);
}
/** Finds a one-frame glyph displacement that its neighbouring frames do not share. */
export function poseJump(
  node: Extract<TypographyReviewScene["nodes"][number], { type: "text" }>,
  layout: ShapedLayout,
  scene: TypographyReviewScene,
  budget: number,
  visibleFrames?: ReadonlySet<number>,
) {
  const animators = (scene.textAnimators ?? []).filter(
    (a) => a.node === node.id,
  );
  if (!animators.length) return undefined;
  const poses = new Map<number, ReturnType<typeof evaluateTextPoses>>();
  const poseAt = (frame: number) => {
    let pose = poses.get(frame);
    if (!pose) {
      pose = evaluateTextPoses(node, layout, animators, frame, scene);
      poses.set(frame, pose);
    }
    return pose;
  };
  const step = (frame: number) => {
    if (
      frame < 1 ||
      frame >= scene.frameCount ||
      (visibleFrames &&
        (!visibleFrames.has(frame) || !visibleFrames.has(frame - 1)))
    )
      return 0;
    const current = poseAt(frame),
      previous = poseAt(frame - 1);
    return Math.max(
      0,
      ...current.map((pose, i) => {
        const before = previous[i]!;
        if (Math.min(pose.opacity, before.opacity) < 0.05) return 0;
        const c = layout.clusters[i]!;
        return (
          Math.hypot(pose.x - before.x, pose.y - before.y) +
          Math.abs(pose.scale - before.scale) * c.advance +
          ((Math.abs(pose.rotation - before.rotation) * Math.PI) / 180) *
            layout.capHeight
        );
      }),
    );
  };
  let worst: { frame: number; distance: number } | undefined;
  const frames =
    visibleFrames ??
    new Set(Array.from({ length: scene.frameCount }, (_, frame) => frame));
  for (const frame of frames) {
    if (frame < 1) continue;
    const distance = step(frame),
      neighbours = Math.max(step(frame - 1), step(frame + 1));
    if (
      distance > budget &&
      distance > 3 * neighbours &&
      distance > (worst?.distance ?? 0)
    )
      worst = { frame, distance };
  }
  return worst;
}
export function analyzeTypography(
  scene: TypographyReviewScene,
  policy: TypographyQualityPolicy = {},
) {
  const diagnostics: StoryQualityDiagnostic[] = [],
    windows = textReadingWindows(scene, policy);
  const events = scene.typography ? resolveTextEvents(scene) : [];
  const add = (
    code: TypeQualityCode,
    node: string,
    frames: [number, number],
    measured: number,
    message: string,
  ) => diagnostics.push({ code, nodes: [node], frames, measured, message });
  for (const window of windows)
    if (window.end - window.start < window.requiredFrames)
      add(
        "reading-time",
        window.node,
        [window.start, Math.max(window.start, window.end - 1)],
        (window.end - window.start) / scene.fps,
        `${window.node} needs ${(window.requiredFrames / scene.fps).toFixed(1)} s of settled reading time.`,
      );
  const roles = new Map<string, { signature: string; node: string }>();
  for (const node of scene.nodes) {
    if (node.type !== "text") continue;
    const layouts = [
      ...(policy.prepared?.nodes.get(node.id)?.values() ?? []),
    ].map((r) => r.layout);
    const style = resolvedTextStyle(node, scene.textStyles ?? {});
    const font = scene.fonts?.find((f) => f.id === style.fontAsset);
    if (node.textRole) {
      const signature = hierarchySignature(style, font?.weight, node.weight),
        prior = roles.get(node.textRole);
      if (prior && signature !== prior.signature)
        add(
          "hierarchy-drift",
          node.id,
          [0, scene.frameCount - 1],
          style.size!,
          `${node.textRole} differs from ${prior.node} in size, weight, or tracking.`,
        );
      else roles.set(node.textRole, { signature, node: node.id });
    }
    // Older studies sometimes author one wrapped block as adjacent sibling text nodes.
    // Recognize that topology so an orphan does not disappear from the review report.
    if (!scene.typography && node.text.trim().split(/\s+/u).length === 1) {
      const preceding = scene.nodes.find(
        (other) =>
          other.type === "text" &&
          other.id !== node.id &&
          other.parent === node.parent &&
          Math.abs(other.x - node.x) < 1 &&
          other.align === node.align &&
          other.fontAsset === node.fontAsset &&
          other.fontSize === node.fontSize &&
          other.color === node.color &&
          node.y - other.y > node.fontSize * 0.75 &&
          node.y - other.y < node.fontSize * 1.7 &&
          other.text.trim().split(/\s+/u).length > 1,
      );
      if (preceding)
        add(
          "rag",
          node.id,
          [0, scene.frameCount - 1],
          1,
          `${preceding.id} and ${node.id} form a manually split block ending in one word; consider a shared block with pretty wrapping.`,
        );
    }
    for (const layout of layouts) {
      if (
        layout.lines.length > 1 &&
        node.wrap !== "pretty" &&
        node.wrap !== "balance"
      ) {
        const score = ragScore(layout),
          last = layout.lines.at(-1)!.text.trim().split(/\s+/u).length;
        if (last === 1 || score > 0.3)
          add(
            "rag",
            node.id,
            [0, scene.frameCount - 1],
            score,
            `${node.id} has an orphan or uneven line lengths; consider pretty or balance wrapping.`,
          );
      }
      const essential =
        ("review" in scene
          ? scene.review?.essentialText?.includes(node.id)
          : undefined) ?? true;
      const reading = windows.filter((w) => w.node === node.id);
      let displayed = Infinity,
        smallestFrame = 0;
      if (essential)
        for (const window of reading)
          for (let frame = window.start; frame < window.end; frame++) {
            let scale = 1,
              current: (typeof scene.nodes)[number] | undefined = node;
            let root = node.id;
            while (current) {
              const state = evaluatePreparedNode(scene, current, frame);
              scale *= Math.abs(state.scaleY);
              root = current.id;
              current = scene.nodes.find((n) => n.id === current!.parent);
            }
            if (scene.schemaVersion === "story-scene-1")
              scale *= storyCameraTransform(scene, root, frame).scale;
            const value =
              (layout.xHeight * scale * (policy.displayWidth ?? 350)) /
              scene.width;
            if (value < displayed) {
              displayed = value;
              smallestFrame = frame;
            }
          }
      if (displayed < (policy.minimumXHeight ?? 7))
        add(
          "x-height-floor",
          node.id,
          [smallestFrame, smallestFrame],
          displayed,
          `${node.id} x-height is ${displayed.toFixed(1)} px at the review width.`,
        );
      for (const window of windows.filter((w) => w.node === node.id)) {
        const base = evaluateTextPoses(
          node,
          layout,
          scene.textAnimators ?? [],
          window.start,
          scene,
        );
        let maximum = 0,
          at = window.start;
        for (
          let frame = window.start + 1;
          frame < Math.min(window.end, window.start + window.requiredFrames);
          frame++
        ) {
          const poses = evaluateTextPoses(
            node,
            layout,
            scene.textAnimators ?? [],
            frame,
            scene,
          );
          poses.forEach((pose, i) => {
            const c = layout.clusters[i]!,
              before = base[i]!;
            const displaced =
              Math.hypot(pose.x - before.x, pose.y - before.y) +
              Math.abs(pose.scale - before.scale) * c.advance +
              ((Math.abs(pose.rotation - before.rotation) * Math.PI) / 180) *
                layout.capHeight;
            if (displaced > maximum) {
              maximum = displaced;
              at = frame;
            }
          });
        }
        if (maximum > (policy.displacementBudget ?? 3))
          add(
            "moving-while-read",
            node.id,
            [window.start, at],
            maximum,
            `${node.id} glyphs move ${maximum.toFixed(1)} px during their reading window.`,
          );
      }
    }
    const layoutsByText = new Map(
      layouts.map((layout) => [layout.text, layout]),
    );
    const visibleFrames = new Map<string, Set<number>>();
    const markVisible = (text: string, frame: number) => {
      if (!layoutsByText.has(text)) return;
      const frames = visibleFrames.get(text) ?? new Set<number>();
      frames.add(frame);
      visibleFrames.set(text, frames);
    };
    for (let frame = 0; frame < scene.frameCount; frame++) {
      const state = evaluatePreparedNode(scene, node, frame).state;
      const displayed = resolveDisplayedText(node, frame, state);
      if (displayed.kind === "single") markVisible(displayed.text, frame);
      else if (displayed.transition.kind === "retype") {
        const from = layoutsByText.get(displayed.fromText),
          to = layoutsByText.get(displayed.toText);
        if (from && to)
          markVisible(
            retypedClusters(from, to, displayed.progress).layout.text,
            frame,
          );
      } else {
        markVisible(displayed.fromText, frame);
        markVisible(displayed.toText, frame);
      }
    }
    let jump: { frame: number; distance: number } | undefined;
    for (const [text, frames] of visibleFrames) {
      const candidate = poseJump(
        node,
        layoutsByText.get(text)!,
        scene,
        policy.jumpBudget ?? 2,
        frames,
      );
      if (candidate && candidate.distance > (jump?.distance ?? 0))
        jump = candidate;
    }
    if (jump)
      add(
        "text-pose-jump",
        node.id,
        [jump.frame - 1, jump.frame],
        jump.distance,
        `${node.id} glyphs jump ${jump.distance.toFixed(1)} px in one frame while neighbouring frames barely move.`,
      );
    const evidence = policy.pixels?.filter(
      (p) => p.node === node.id && p.contrast !== undefined,
    );
    if (evidence?.length) {
      const worst = evidence.reduce((a, b) =>
          a.contrast! < b.contrast! ? a : b,
        ),
        minimum = node.textRole === "heading" ? 3 : 4.5;
      if (worst.contrast! < minimum)
        add(
          "text-contrast",
          node.id,
          [worst.frame, worst.frame],
          worst.contrast!,
          `${node.id} contrast against rendered background is ${worst.contrast!.toFixed(2)}:1; target ${minimum}:1.`,
        );
    }
    for (const animator of scene.textAnimators?.filter(
      (a) => a.node === node.id,
    ) ?? []) {
      const linkedEvent = events.some(
        (event) =>
          (event.node === node.id || event.target === node.id) &&
          (!animator.span || !event.span || animator.span === event.span) &&
          animator.start < event.end &&
          event.start < animator.end,
      );
      if (!animator.cue && !animator.signal && !linkedEvent)
        add(
          "idle-type-motion",
          node.id,
          [animator.start, animator.end],
          animator.end - animator.start,
          `${node.id} text motion has no linked event, signal, or motion role.`,
        );
    }
  }
  for (const sample of policy.pixels ?? [])
    if (sample.handoffPixels)
      add(
        "animator-handoff-snap",
        sample.node,
        [sample.frame, sample.frame + 1],
        sample.handoffPixels,
        `${sample.node} changes ${sample.handoffPixels} pixels at animator completion.`,
      );
  const blocked = diagnostics.filter((d) =>
    policy.failOn?.includes(d.code as TypeQualityCode),
  );
  if (blocked.length)
    throw new Error(
      `typography-quality-gate: ${blocked.map((d) => d.code + ":" + d.nodes.join(",")).join("; ")}`,
    );
  return {
    version: "type-quality-1" as const,
    windows,
    diagnostics,
    measuredLayout: !!policy.prepared,
    measuredPixels: !!policy.pixels,
  };
}
export function analyzePassageTypography(scenes: StoryScene[]) {
  const seen = new Map<string, string>(),
    diagnostics: StoryQualityDiagnostic[] = [];
  let offset = 0;
  for (const scene of scenes) {
    if (!scene.typography) {
      offset += scene.frameCount;
      continue;
    }
    for (const node of scene.nodes) {
      if (node.type !== "text" || !node.textRole) continue;
      const style = resolvedTextStyle(node, scene.textStyles ?? {}),
        font = scene.fonts?.find((f) => f.id === style.fontAsset),
        signature = hierarchySignature(style, font?.weight, node.weight);
      if (seen.has(node.textRole) && seen.get(node.textRole) !== signature)
        diagnostics.push({
          code: "hierarchy-drift",
          nodes: [node.id],
          frames: [offset, offset + scene.frameCount - 1],
          measured: style.size!,
          message: `${node.textRole} size, weight, or tracking changes across passage beats.`,
        });
      seen.set(node.textRole, signature);
    }
    offset += scene.frameCount;
  }
  return diagnostics;
}
