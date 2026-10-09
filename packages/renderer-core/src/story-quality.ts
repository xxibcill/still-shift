import { analyzeCompositionSemantics } from "./composition/semantic-quality.ts";
import { classifyPhysicalProofHolds } from "./composition/physical-proof-quality.ts";
import type { Composition } from "@still-shift/scene-contract";
import { analyzeCompositionStillness } from "./story-continuous-quality.ts";
import {
  analyzeCompositionTypography,
  analyzeDeclaredCompositionReading,
  analyzeCompositionSpeechCaptions,
} from "./typography-quality.ts";
import {
  layerQualityTracks,
  sampleCompositionQuality,
} from "./composition/quality-samples.ts";
import {
  compositionFramingFindings,
  compositionPopFindings,
  compositionTimingFindings,
  compositionVelocityFindings,
} from "./composition/quality-rules.ts";
import {
  resolveCompositionQualityPolicy,
  type CompositionQualityPolicy,
  type MotionLintDiagnostic,
} from "./composition/quality-policy.ts";
import {
  analyzeTypography,
  type TypeQualityCode,
  type TypographyQualityPolicy,
} from "./typography-quality.ts";
import {
  analyzeContinuousStory,
  analyzeMotionCraft,
  type LayerPixelEnergy,
} from "./story-continuous-quality.ts";
import { evaluatePreparedNode, type Property } from "./prepared-scene.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import type { PreparedNode } from "../../scene-contract/src/prepared.ts";

type FocusGroup = { id: string; nodes: string[] };
type Code =
  | TypeQualityCode
  | "velocity-discontinuity"
  | "entrance-pop"
  | "dead-stop-chain"
  | "peak-not-story"
  | "carrier-dominance"
  | "outside-safe-area"
  | "short-final-hold"
  | "small-essential-text"
  | "competing-focus"
  | "frozen-run"
  | "semantic-gap"
  | "text-velocity"
  | "camera-too-fast"
  | "label-in-motion-envelope";
export type StoryQualityPolicy = {
  typography?: TypographyQualityPolicy;
  preset?: "continuous";
  motionCraft?: boolean;
  pixelEnergy?: LayerPixelEnergy;
  displayWidth?: number;
  minimumTextPx?: number;
  preferredHoldSeconds?: number;
  essentialText?: string[];
  focalGroups?: FocusGroup[];
  exceptions?: { code: Code; frames: [number, number]; reason: string }[];
};
export type StoryQualityDiagnostic = {
  code: Code;
  nodes: string[];
  frames: [number, number];
  measured: number;
  message: string;
  exception?: string;
  path?: string;
  suggestedFix?: string;
};

function primaryGroups(scene: StoryRenderScene): FocusGroup[] {
  const recipe = scene.recipe;
  if (recipe.preset === "relationship_build")
    return recipe.branches.map((b) => ({
      id: b.destination,
      nodes: [b.path, b.destination],
    }));
  if (recipe.preset === "evidence_boundary")
    return [...recipe.supported, recipe.unknown, recipe.composite].map((e) => ({
      id: e.node,
      nodes: [e.node],
    }));
  // These recipes deliberately move several supports for one comparison or conclusion.
  return [{ id: recipe.preset, nodes: scene.nodes.map((n) => n.id) }];
}

type World = { opacity: number; matrix: [number, number, number, number] };

function frameState(scene: StoryRenderScene, frame: number) {
  const states = new Map(
    scene.nodes.map((n) => [n.id, evaluatePreparedNode(scene, n, frame)]),
  );
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const worlds = new Map<string, World>();
  const world = (id: string): World => {
    const cached = worlds.get(id);
    if (cached) return cached;
    const node = nodes.get(id)!,
      state = states.get(id)!;
    const parent = node.parent
      ? world(node.parent)
      : { opacity: 1, matrix: [1, 0, 0, 1] as World["matrix"] };
    const angle = (state.rotation * Math.PI) / 180;
    const c = Math.cos(angle),
      s = Math.sin(angle),
      [a, b, d, e] = parent.matrix;
    const value: World = {
      opacity: parent.opacity * state.opacity,
      matrix: [
        (a * c + d * s) * state.scaleX,
        (b * c + e * s) * state.scaleX,
        (-a * s + d * c) * state.scaleY,
        (-b * s + e * c) * state.scaleY,
      ],
    };
    worlds.set(id, value);
    return value;
  };
  scene.nodes.forEach((n) => world(n.id));
  const visible = new Set<string>();
  for (const node of scene.nodes) {
    if (node.type === "group" || world(node.id).opacity <= 0) continue;
    const [a, b, c, d] = world(node.id).matrix;
    if (Math.abs(a * d - b * c) < 1e-12) continue;
    const state = states.get(node.id)!;
    if (
      state.scaleX === 0 ||
      state.scaleY === 0 ||
      (node.type === "path" && state.reveal === 0)
    )
      continue;
    let current: PreparedNode | undefined = node;
    while (current) {
      visible.add(current.id);
      current = current.parent ? nodes.get(current.parent) : undefined;
    }
  }
  return { states, worlds, visible };
}

function secondaryEmphasis(
  scene: StoryRenderScene,
  id: string,
  property: Property,
  frame: number,
) {
  return (
    property === "opacity" &&
    "emphasis" in scene.recipe &&
    scene.recipe.emphasis.some(
      (e) => e.node === id && frame > e.window.start && frame <= e.window.end,
    )
  );
}

/** Advisory measurements only. Rendering and semantic validation never depend on this report. */
export function analyzeStoryQuality(
  scene: StoryRenderScene,
  policy: StoryQualityPolicy = {},
) {
  const displayWidth = policy.displayWidth ?? 350;
  const minimumTextPx = policy.minimumTextPx ?? 14;
  const preferredHoldSeconds = policy.preferredHoldSeconds ?? 2;
  for (const [name, value] of Object.entries({
    displayWidth,
    minimumTextPx,
    preferredHoldSeconds,
  }))
    if (!Number.isFinite(value) || value <= 0)
      throw new Error(`Invalid ${name}`);
  const essentialText =
    policy.essentialText ?? scene.review?.essentialText ?? [];
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  for (const id of essentialText)
    if (nodes.get(id)?.type !== "text")
      throw new Error(`Essential text missing: ${id}`);
  const groups =
    policy.focalGroups ?? scene.review?.focalGroups ?? primaryGroups(scene);
  const membership = new Map<string, string[]>();
  const ancestorsByNode = new Map<string, Set<string>>();
  for (const group of groups)
    for (const id of group.nodes)
      if (!nodes.has(id)) throw new Error(`Focus node missing: ${id}`);
  for (const node of scene.nodes) {
    const ancestors = new Set<string>();
    let current: typeof node | undefined = node;
    while (current) {
      ancestors.add(current.id);
      current = current.parent ? nodes.get(current.parent) : undefined;
    }
    ancestorsByNode.set(node.id, ancestors);
    membership.set(
      node.id,
      groups
        .filter((g) => g.nodes.some((id) => ancestors.has(id)))
        .map((g) => g.id),
    );
  }
  const diagnostics: StoryQualityDiagnostic[] = [];
  const minimumSizes = new Map<string, { size: number; frame: number }>();
  let lastChangedFrame = 0;
  let previous: ReturnType<typeof frameState> | undefined;
  let overlap: StoryQualityDiagnostic | undefined;
  const tracked = Object.entries(scene.tracks);
  const affectedNodes = new Map(
    tracked.map(([id]) => [
      id,
      scene.nodes
        .filter((n) => ancestorsByNode.get(n.id)!.has(id))
        .map((n) => n.id),
    ]),
  );
  for (let frame = 0; frame < scene.frameCount; frame++) {
    const current = frameState(scene, frame);
    const activeGroups = new Set<string>();
    if (previous)
      for (const [id, tracks] of tracked) {
        if (!current.visible.has(id) && !previous.visible.has(id)) continue;
        const now = current.states.get(id)!,
          before = previous.states.get(id)!;
        for (const property of Object.keys(tracks) as Property[]) {
          if (now[property] === before[property]) continue;
          lastChangedFrame = frame;
          if (!secondaryEmphasis(scene, id, property, frame))
            for (const affected of affectedNodes.get(id)!)
              if (
                current.visible.has(affected) ||
                previous.visible.has(affected)
              )
                membership
                  .get(affected)
                  ?.forEach((group) => activeGroups.add(group));
        }
      }
    for (const id of essentialText) {
      if (!current.visible.has(id)) continue;
      const node = nodes.get(id)!;
      if (node.type !== "text") continue;
      const matrix = current.worlds.get(id)!.matrix;
      const size =
        (node.fontSize * Math.hypot(matrix[2], matrix[3]) * displayWidth) /
        scene.width;
      if (size < (minimumSizes.get(id)?.size ?? Infinity))
        minimumSizes.set(id, { size, frame });
    }
    const active = [...activeGroups].sort();
    if (active.length > 1) {
      if (
        overlap &&
        overlap.nodes.join() === active.join() &&
        overlap.frames[1] === frame - 1
      )
        overlap.frames[1] = frame;
      else {
        overlap = {
          code: "competing-focus",
          nodes: active,
          frames: [frame, frame],
          measured: active.length,
          message: `${active.length} focal groups move together. Check that one idea leads.`,
        };
        diagnostics.push(overlap);
      }
    } else overlap = undefined;
    previous = current;
  }
  const finalHoldSeconds = (scene.frameCount - lastChangedFrame) / scene.fps;
  if (policy.preset !== "continuous" && finalHoldSeconds < preferredHoldSeconds)
    diagnostics.push({
      code: "short-final-hold",
      nodes: [],
      frames: [lastChangedFrame, scene.frameCount - 1],
      measured: finalHoldSeconds,
      message: `Final composition holds ${finalHoldSeconds.toFixed(2)} s; the review target is ${preferredHoldSeconds} s. Consider an earlier finish.`,
    });
  for (const [id, { size, frame }] of minimumSizes)
    if (size < minimumTextPx)
      diagnostics.push({
        code: "small-essential-text",
        nodes: [id],
        frames: [frame, frame],
        measured: size,
        message: `${id} displays at ${size.toFixed(1)} px at ${displayWidth} px video width. Aim for ${minimumTextPx} px or review the layout.`,
      });
  const continuous =
    policy.preset === "continuous"
      ? analyzeContinuousStory(scene, essentialText)
      : undefined;
  if (continuous) diagnostics.push(...continuous.diagnostics);
  if (scene.motionModel || policy.motionCraft)
    diagnostics.push(...analyzeMotionCraft(scene, policy.pixelEnergy));
  const typography =
    scene.typography || policy.typography
      ? analyzeTypography(scene, policy.typography)
      : undefined;
  if (typography) diagnostics.push(...typography.diagnostics);
  for (const diagnostic of diagnostics) {
    const exception = policy.exceptions?.find(
      (e) =>
        e.code === diagnostic.code &&
        e.frames[0] <= diagnostic.frames[0] &&
        e.frames[1] >= diagnostic.frames[1] &&
        e.reason.trim(),
    );
    if (exception) diagnostic.exception = exception.reason;
  }
  return {
    version: "story-quality-1" as const,
    ...(typography ? { typography } : {}),
    ...(continuous ? { continuous } : {}),
    displayWidth,
    minimumTextPx,
    preferredHoldSeconds,
    lastChangedFrame,
    finalHoldSeconds,
    minimumTextPxObserved: minimumSizes.size
      ? Math.min(...[...minimumSizes.values()].map((v) => v.size))
      : null,
    diagnostics,
  };
}

export {
  CompositionQualityPolicySchema,
  CompositionSemanticAssociationSchema,
  CompositionReadingMemberSchema,
  MOTION_LINT_CODES,
  type CompositionQualityPolicy,
  type MotionLintDiagnostic,
  type MotionLintCode,
} from "./composition/quality-policy.ts";

/** Advisory composition craft report. Evaluation, contracts and rendered output never depend on lint. */
export function analyzeCompositionQuality(
  comp: Composition,
  policy: CompositionQualityPolicy = {},
) {
  const resolved = resolveCompositionQualityPolicy(comp, policy);
  const frames = sampleCompositionQuality(comp, resolved.evaluation);
  const semantic = analyzeCompositionSemantics(frames, comp.fps, resolved);
  const readingDeclarations = analyzeDeclaredCompositionReading(
    frames,
    comp.fps,
    resolved,
  ).windows;
  const diagnostics: MotionLintDiagnostic[] = [
    ...semantic.diagnostics,
    ...analyzeCompositionStillness(
      frames.map((f) => f.signature),
      resolved,
    ),
    ...analyzeCompositionTypography(frames, comp.fps, resolved),
    ...compositionFramingFindings(comp, frames, resolved),
    ...compositionPopFindings(frames, resolved),
    ...compositionTimingFindings(comp, frames, resolved),
    ...compositionVelocityFindings(comp, frames, resolved),
  ];
  frames.forEach((frame, at) =>
    frame.diagnostics.forEach((d) =>
      diagnostics.push({
        ...d,
        frames: [at, at],
        nodes: d.node ? [d.node] : [],
        measured: 1,
      }),
    ),
  );
  const unmeasuredText = [comp, ...(comp.precomps ?? [])].flatMap((scope) =>
    scope.layers.flatMap((layer) => {
      if (layer.type !== "text") return [];
      const key = scope === comp ? layer.id : `${scope.id}/${layer.id}`;
      return resolved.evaluation.textBounds?.[key]?.length ? [] : [key];
    }),
  );
  const opaqueProviders = [comp, ...(comp.precomps ?? [])].flatMap((scope) =>
    scope.layers
      .filter(
        (layer) =>
          layer.type === "provider" &&
          !layer.provider.startsWith("story.") &&
          !layer.provider.startsWith("component.") &&
          !layer.provider.startsWith("commerce."),
      )
      .map((layer) => layer.id),
  );
  const heldMotion = [comp, ...(comp.precomps ?? [])].some((scope) =>
    scope.layers.some((layer) =>
      layerQualityTracks(layer).some((track) =>
        track.keys.some(
          (key, i) =>
            i > 0 &&
            (key.step || key.interpolation === "hold") &&
            JSON.stringify(key.value) !==
              JSON.stringify(track.keys[i - 1]!.value),
        ),
      ),
    ),
  );
  const limitations = [
    ...(!resolved.pixelHashes
      ? [
          "Pixels were not measured; state motion does not prove visible pixel motion.",
        ]
      : []),
    ...(unmeasuredText.length
      ? [
          `Text bounds were not measured for ${unmeasuredText.join(", ")}; framing is incomplete for those layers.`,
        ]
      : []),
    ...(opaqueProviders.length
      ? [
          `Opaque provider content cannot be inferred from state: ${opaqueProviders.join(", ")}. Use rendered pixel checks.`,
        ]
      : []),
    ...(heldMotion
      ? [
          "Held keyframe steps are frame samples; velocity changes inside held motion are not measured.",
        ]
      : []),
    "Coverage lint measures geometry; image alpha and arbitrary mask coverage require the renderer's asset coverage validation.",
  ];
  if (readingDeclarations.length)
    for (const diagnostic of diagnostics) {
      if (
        diagnostic.code !== "frozen-run" &&
        diagnostic.code !== "frozen-pixels"
      )
        continue;
      const start = Math.max(0, diagnostic.frames[0] - 1);
      const end = diagnostic.frames[1] + 1;
      const purposes = readingDeclarations.filter((declaration) =>
        declaration.readableIntervals.some(
          (interval) => interval.start <= start && interval.end >= end,
        ),
      );
      diagnostic.readingPurposes = purposes.map((declaration) => ({
        id: declaration.id,
        purpose: declaration.purpose,
      }));
      // A declared reading hold cannot excuse frozen pixels while other paint state should move.
      const stillPaintState = frames
        .slice(start, end)
        .every((frame) => frame.signature === frames[start]!.signature);
      if (purposes.length && stillPaintState) {
        diagnostic.rawSeverity = diagnostic.severity;
        diagnostic.severity = "warning";
        diagnostic.classification = "declared-reading-hold";
      }
    }
  const physicalProofHolds = classifyPhysicalProofHolds(
    frames,
    resolved,
    diagnostics,
  );
  diagnostics.sort(
    (a, b) =>
      a.frames[0] - b.frames[0] ||
      a.code.localeCompare(b.code) ||
      (a.path ?? "").localeCompare(b.path ?? ""),
  );
  return {
    version: "composition-motion-lint-1" as const,
    composition: comp.id,
    frameCount: comp.frameCount,
    fps: comp.fps,
    status: diagnostics.some((d) => d.severity === "error")
      ? ("failed" as const)
      : ("passed" as const),
    measured: {
      evaluatedState: true,
      pixels: !!resolved.pixelHashes,
      pixelMethod: resolved.pixelMethod,
      textBounds: !!resolved.evaluation.textBounds,
    },
    diagnostics,
    semantic: {
      version: "composition-semantic-context-1" as const,
      status: semantic.status,
      profile: semantic.profile,
      associations: semantic.associations,
      policy: {
        version: "composition-semantic-context-policy-1" as const,
        profile: resolved.semanticProfile,
        readingOpacity: resolved.readingOpacity,
        readingReveal: resolved.readingReveal,
        associations: resolved.semanticAssociations ?? [],
      },
      method: "declared-copy-and-measured-layer-context" as const,
      factualTruth: "unassessed" as const,
      renderedGlyphReadability: "requires-encoded-review" as const,
    },
    ...(readingDeclarations.length ? { readingDeclarations } : {}),
    ...(physicalProofHolds.length ? { physicalProofHolds } : {}),
    ...(resolved.speechCaptions?.length
      ? {
          speechCaptions: analyzeCompositionSpeechCaptions(
            frames,
            comp.fps,
            resolved,
          ).windows,
        }
      : {}),
    limitations,
  };
}
