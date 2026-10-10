import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  COMPOSITION_LIMITS,
  validateComposition,
  type BezierPath,
  type Composition,
  type CompositionLayer,
  type MechanismEpisode,
  type MechanismLabel,
  type MechanismScene,
  type MechanismSidecar,
} from "@still-shift/scene-contract";
import {
  PassageError,
  passageError,
} from "../../../renderer-core/src/passage-diagnostics.ts";
import { canonicalMechanismJson } from "../../../renderer-core/src/mechanism/index.ts";
import type { FontAxes } from "../../../scene-contract/src/typography.ts";
import type { Bounds } from "../../../renderer-core/src/composition/evaluate/types.ts";
import type {
  CompositionQualityPolicy,
  CompositionSpeechCaption,
} from "../../../renderer-core/src/composition/quality-policy.ts";

export type MechanismPlateCapture = {
  shotId: string;
  outputDirectory: string;
  sequenceManifestPath: string;
  sidecarPath: string;
  frames: readonly string[];
  sidecar: MechanismSidecar;
  sequenceSha256: string;
  firstFrame?: number;
  pattern?: string;
};
export type MechanismOverlaySource = {
  episode: MechanismEpisode;
  scene: MechanismScene;
  dependencyPaths: Readonly<Record<string, string>>;
  fontAxes?: Readonly<Record<string, FontAxes>>;
  audioMetadata?: { sampleRate: 48000; sampleCount: number; channels: 1 | 2 };
};
type AudioAsset = Extract<Composition["assets"][number], { type: "audio" }>;
export type MechanismOverlayOptions = { audio?: AudioAsset };
type SidecarFrame = MechanismSidecar["frames"][number];
type SidecarInput = Pick<MechanismPlateCapture, "shotId" | "sidecar">;
type LabelKind =
  | "annotation"
  | "scene"
  | "label"
  | "qualification"
  | "leader"
  | "indicator"
  | "caption"
  | "plate"
  | "plate-group"
  | "font"
  | "panel"
  | "caption-panel";

/** Source IDs permit dots; native composition IDs do not. Hashing prevents encoding collisions. */
export function mechanismOverlayLayerId(kind: LabelKind, sourceId: string) {
  const digest = createHash("sha256")
    .update(sourceId)
    .digest("hex")
    .slice(0, 16);
  return `mechanism-${kind}-${sourceId.replace(/[^\w-]/g, "-").slice(0, 72)}-${digest}`;
}
function fail(
  code: string,
  message: string,
  path: string,
  frame?: number,
): never {
  return passageError(code, message, {
    path,
    ...(frame === undefined ? {} : { frame }),
  });
}
function sidecarFor(
  episode: MechanismEpisode,
  input: readonly SidecarInput[],
  shotIndex: number,
) {
  const shot = episode.shots[shotIndex]!;
  const matches = input.filter((capture) => capture.shotId === shot.id);
  if (matches.length !== 1)
    fail(
      "mechanism-overlay-capture",
      "Each shot requires exactly one sidecar",
      `shots.${shotIndex}.id`,
    );
  const sidecar = matches[0]!.sidecar;
  const { width, height, fps } = episode.output;
  const count = shot.endFrameExclusive - shot.startFrame;
  if (
    sidecar.width !== width ||
    sidecar.height !== height ||
    sidecar.fps !== fps ||
    sidecar.frameCount !== count ||
    sidecar.frames.length !== count
  )
    fail(
      "mechanism-overlay-capture",
      "Sidecar dimensions, rate and frame count must match the shot",
      `shots.${shotIndex}`,
    );
  sidecar.frames.forEach((frame, ordinal) => {
    if (
      frame.frame !== ordinal ||
      frame.sourceFrame !== shot.startFrame + ordinal
    )
      fail(
        "mechanism-overlay-frame",
        "Sidecar source frame must match the shot's ordered output frame",
        `shots.${shotIndex}.sidecar.frames.${ordinal}.sourceFrame`,
        shot.startFrame + ordinal,
      );
  });
  return sidecar;
}
function validateCapture(
  source: MechanismOverlaySource,
  captures: readonly MechanismPlateCapture[],
  shotIndex: number,
) {
  const shot = source.episode.shots[shotIndex]!;
  const sidecar = sidecarFor(source.episode, captures, shotIndex);
  const capture = captures.find((value) => value.shotId === shot.id)!;
  const sceneHash =
    "sha256:" +
    createHash("sha256")
      .update(canonicalMechanismJson(source.scene))
      .digest("hex");
  if (
    sidecar.sceneId !== source.scene.id ||
    sidecar.sceneSha256 !== sceneHash ||
    sidecar.geometrySha256 !== source.scene.geometrySha256
  )
    fail(
      "mechanism-overlay-identity",
      "Sidecar scene and geometry identities must match the loaded scene",
      `shots.${shotIndex}.sidecar`,
    );
  if (
    capture.frames.length !== sidecar.frameCount ||
    capture.frames.some(
      (hash, index) => hash !== sidecar.frames[index]!.plateSha256,
    )
  )
    fail(
      "mechanism-overlay-plate",
      "Ordered plate hashes must match the captured sidecar",
      `shots.${shotIndex}.frames`,
    );
  const declaredAnchors = new Map(
    source.scene.anchors.map((anchor) => [anchor.id, anchor]),
  );
  shot.labels.forEach((label, labelIndex) => {
    const target = declaredAnchors.get(label.anchor);
    if (!target)
      fail(
        "mechanism-overlay-anchor",
        "Label anchor is missing from the scene",
        `shots.${shotIndex}.labels.${labelIndex}.anchor`,
      );
    sidecar.frames.forEach((frame, ordinal) => {
      const anchor = frame.anchors.find(
        (value) => value.anchor === label.anchor,
      );
      if (!anchor || anchor.part !== target.part)
        fail(
          "mechanism-overlay-anchor",
          "Every label target must retain its declared physical part",
          `shots.${shotIndex}.labels.${labelIndex}.anchor`,
          shot.startFrame + ordinal,
        );
    });
  });
  return capture;
}
function anchorAt(label: MechanismLabel, frame: SidecarFrame) {
  return frame.anchors.find((anchor) => anchor.anchor === label.anchor);
}
function displayState(label: MechanismLabel, frame: SidecarFrame) {
  const anchor = anchorAt(label, frame);
  const visible = anchor?.visibility === "visible" && !!anchor.pixel;
  const indicator =
    label.visibilityPolicy === "offscreen-indicator" &&
    anchor?.visibility === "outside-frame" &&
    !!anchor.pixel;
  return { anchor, visible, indicator, shown: visible || indicator };
}
function discreteKeys<T>(values: readonly T[], path: string) {
  const keys: { frame: number; value: T; interpolation: "hold" }[] = [];
  let last: string | undefined;
  values.forEach((value, frame) => {
    const identity = JSON.stringify(value);
    if (identity !== last) keys.push({ frame, value, interpolation: "hold" });
    last = identity;
  });
  if (keys.length > COMPOSITION_LIMITS.maxKeys)
    fail(
      "mechanism-overlay-key-budget",
      "Animated annotation exceeds the native key budget; split the shot",
      path,
    );
  return keys.length === 1 ? keys[0]!.value : { keys };
}
function labelPlacement(
  label: MechanismLabel,
  qualification = false,
): [number, number] {
  // Authored positions are center-x/top-y in output pixels, independent of model transforms.
  return [
    label.position[0],
    label.position[1] + (qualification ? label.fontSize * 1.35 : 0),
  ];
}
function fontAssetId(id: string) {
  return mechanismOverlayLayerId("font", id);
}
function labelTextLayer(
  label: MechanismLabel,
  shot: MechanismEpisode["shots"][number],
  sidecar: MechanismSidecar | undefined,
  defaultFont: string,
  qualification = false,
): CompositionLayer {
  const kind = qualification ? "qualification" : "label";
  const opacity = sidecar
    ? discreteKeys(
        sidecar.frames.map((frame) => Number(displayState(label, frame).shown)),
        `labels.${label.id}.visibilityPolicy`,
      )
    : 1;
  return {
    id: mechanismOverlayLayerId(kind, label.id),
    type: "text",
    text: qualification ? label.qualification! : label.text,
    fontAsset: fontAssetId(label.font ?? defaultFont),
    style: fontAssetId(label.font ?? defaultFont),
    fontSize: label.fontSize * (qualification ? 0.64 : 1),
    color: qualification ? "#ebedf0" : "#fff5df",
    align: "center",
    anchor: "top",
    textRole: kind,
    inPoint: label.readingInterval.startFrame,
    outPoint: label.readingInterval.endFrameExclusive,
    startFrame: shot.startFrame,
    transform: { position: labelPlacement(label, qualification), opacity },
    metadata: {
      mechanismLabel: label.id,
      role: label.role,
      anchor: label.anchor,
      proofTarget: label.proofTarget ?? label.anchor,
      visibilityPolicy: label.visibilityPolicy,
    },
  };
}
function labelPanel(
  label: MechanismLabel,
  shot: MechanismEpisode["shots"][number],
  sidecar: MechanismSidecar | undefined,
): CompositionLayer {
  const estimatedWidth = (text: string, size: number) =>
    [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)]
      .length *
    size *
    0.7;
  const width =
    Math.max(
      estimatedWidth(label.text, label.fontSize),
      label.qualification
        ? estimatedWidth(label.qualification, label.fontSize * 0.64)
        : 0,
    ) +
    label.fontSize * 1.2;
  const height = label.fontSize * (label.qualification ? 2.65 : 1.7);
  return {
    id: mechanismOverlayLayerId("panel", label.id),
    type: "shape",
    inPoint: label.readingInterval.startFrame,
    outPoint: label.readingInterval.endFrameExclusive,
    startFrame: shot.startFrame,
    transform: {
      position: [
        label.position[0],
        label.position[1] + height / 2 - label.fontSize * 0.2,
      ],
      opacity: sidecar
        ? discreteKeys(
            sidecar.frames.map((frame) =>
              Number(displayState(label, frame).shown),
            ),
            `labels.${label.id}.visibilityPolicy`,
          )
        : 1,
    },
    contents: [
      {
        id: "panel",
        type: "rect",
        size: [width, height],
        roundness: Math.min(14, label.fontSize * 0.25),
      },
      { id: "fill", type: "fill", color: "#101a29f5" },
    ],
    metadata: {
      mechanismLabel: label.id,
      boundsMethod: "conservative-text-estimate",
    },
  };
}
function captionPanel(
  episode: MechanismEpisode,
  caption: MechanismEpisode["captions"][number],
): CompositionLayer {
  const position = captionPlacement(episode),
    height = episode.output.height * 0.12;
  return {
    id: mechanismOverlayLayerId("caption-panel", caption.id),
    type: "shape",
    inPoint: caption.startFrame,
    outPoint: caption.endFrameExclusive,
    transform: { position: [position[0], position[1] + height / 2 - 12] },
    contents: [
      {
        id: "panel",
        type: "rect",
        size: [episode.output.width * 0.9, height],
        roundness: 14,
      },
      { id: "fill", type: "fill", color: "#0b1020eb" },
    ],
    metadata: { mechanismCaption: caption.id },
  };
}
function clampPoint(
  point: [number, number],
  width: number,
  height: number,
): [number, number] {
  return [
    Math.max(12, Math.min(width - 12, point[0])),
    Math.max(12, Math.min(height - 12, point[1])),
  ];
}
function leaderLayers(
  label: MechanismLabel,
  shot: MechanismEpisode["shots"][number],
  sidecar: MechanismSidecar,
): CompositionLayer[] {
  const start: [number, number] = [
    label.position[0],
    label.position[1] + label.fontSize * (label.qualification ? 2.3 : 1.3),
  ];
  const paths = sidecar.frames.map((frame) => {
    const state = displayState(label, frame);
    const endpoint = state.shown ? state.anchor!.pixel! : start;
    const point = state.indicator
      ? clampPoint(endpoint, sidecar.width, sidecar.height)
      : endpoint;
    return { closed: false, vertices: [start, point] } satisfies BezierPath;
  });
  const common = {
    inPoint: label.readingInterval.startFrame,
    outPoint: label.readingInterval.endFrameExclusive,
    startFrame: shot.startFrame,
  };
  const leader: CompositionLayer = {
    ...common,
    id: mechanismOverlayLayerId("leader", label.id),
    type: "shape",
    transform: {
      opacity: discreteKeys(
        sidecar.frames.map((frame) => Number(displayState(label, frame).shown)),
        `labels.${label.id}.visibilityPolicy`,
      ),
    },
    contents: [
      {
        id: "path",
        type: "path",
        path: discreteKeys(paths, `labels.${label.id}.anchor`),
      },
      {
        id: "stroke",
        type: "stroke",
        color: "#e2e6ed",
        width: 2,
        cap: "round",
      },
    ],
    metadata: {
      mechanismLabel: label.id,
      anchor: label.anchor,
      binding: "captured-projected-anchor",
      occlusionPolicy: label.visibilityPolicy,
    },
  };
  if (label.visibilityPolicy !== "offscreen-indicator") return [leader];
  const triangles = sidecar.frames.map((frame) => {
    const state = displayState(label, frame);
    const p = state.indicator
      ? clampPoint(state.anchor!.pixel!, sidecar.width, sidecar.height)
      : start;
    return {
      closed: true,
      vertices: [
        [p[0], p[1] - 7],
        [p[0] + 7, p[1] + 7],
        [p[0] - 7, p[1] + 7],
      ],
    } satisfies BezierPath;
  });
  return [
    leader,
    {
      ...common,
      id: mechanismOverlayLayerId("indicator", label.id),
      type: "shape",
      transform: {
        opacity: discreteKeys(
          sidecar.frames.map((frame) =>
            Number(displayState(label, frame).indicator),
          ),
          `labels.${label.id}.visibilityPolicy`,
        ),
      },
      contents: [
        {
          id: "path",
          type: "path",
          path: discreteKeys(triangles, `labels.${label.id}.anchor`),
        },
        { id: "fill", type: "fill", color: "#e2e6ed" },
      ],
      metadata: {
        mechanismLabel: label.id,
        meaning: "offscreen-target-indicator",
      },
    },
  ];
}
function captionPlacement(episode: MechanismEpisode): [number, number] {
  return [episode.output.width / 2, episode.output.height * 0.87];
}
function captionOrigin(episode: MechanismEpisode): [number, number] {
  return [episode.output.width * 0.08, episode.output.height * 0.87];
}
function captionSize(episode: MechanismEpisode) {
  return Math.max(24, Math.min(48, episode.output.width * 0.044));
}
function speechCueMetadata(cue: CompositionSpeechCaption) {
  const { locale, ...values } = cue;
  return { ...values, ...(locale ? { locale } : {}) };
}
function captionLayer(
  episode: MechanismEpisode,
  caption: MechanismEpisode["captions"][number],
): CompositionLayer {
  const speechCue = mechanismOverlayQualityPolicy(episode).speechCaptions?.find(
    (cue) => cue.cueId === caption.id,
  );
  return {
    id: mechanismOverlayLayerId("caption", caption.id),
    type: "text",
    text: caption.text,
    fontAsset: fontAssetId(episode.font),
    style: fontAssetId(episode.font),
    fontSize: captionSize(episode),
    color: "#ffffff",
    align: "center",
    anchor: "top",
    textRole: "body",
    inPoint: caption.startFrame,
    outPoint: caption.endFrameExclusive,
    transform: { anchor: [0, 0], position: captionOrigin(episode) },
    size: [episode.output.width * 0.84, episode.output.height * 0.1],
    textBox: { locale: "en", maxLines: 3, lineHeight: 1.2 },
    metadata: {
      mechanismCaption: caption.id,
      ...(speechCue ? { speechCue: speechCueMetadata(speechCue) } : {}),
    },
  };
}
/** Exact integer ordinal mapping preserves deterministic random seeks across every shot. */
export function compileMechanismOverlays(
  source: MechanismOverlaySource,
  captures: readonly MechanismPlateCapture[],
  options: MechanismOverlayOptions = {},
): Composition {
  const { episode } = source;
  if (captures.length !== episode.shots.length)
    fail(
      "mechanism-overlay-capture",
      "Capture count must equal the episode's shot count",
      "shots",
    );
  const assets: Composition["assets"] = episode.dependencies
    .filter((dependency) => dependency.type === "font")
    .map((dependency) => {
      if (dependency.style === "oblique")
        fail(
          "mechanism-overlay-font",
          "Native font assets do not support oblique style declarations",
          `dependencies.${episode.dependencies.indexOf(dependency)}.style`,
        );
      const path = source.dependencyPaths[dependency.id];
      if (!path || !dependency.weight)
        fail(
          "mechanism-overlay-font",
          "Native overlay fonts require prepared paths and declared cut weights",
          `dependencies.${episode.dependencies.indexOf(dependency)}`,
        );
      const variable = source.fontAxes?.[dependency.id];
      if (dependency.axes && !variable)
        fail(
          "mechanism-overlay-font",
          "Declared font axes require prepared ranges from the pinned font bytes",
          `dependencies.${episode.dependencies.indexOf(dependency)}.axes`,
        );
      return {
        id: fontAssetId(dependency.id),
        type: "font",
        path,
        sha256: dependency.sha256,
        weight: dependency.weight,
        ...(dependency.style ? { style: dependency.style } : {}),
        ...(variable && Object.keys(variable).length ? { variable } : {}),
      };
    });
  const plateGroup: CompositionLayer = {
    id: mechanismOverlayLayerId("plate-group", episode.id),
    type: "group",
    size: [episode.output.width, episode.output.height],
    transform: { anchor: [0, 0], position: [0, 0] },
    coverage: "required",
  };
  const plates: CompositionLayer[] = [];
  const overlays: CompositionLayer[] = [];
  episode.shots.forEach((shot, shotIndex) => {
    const capture = validateCapture(source, captures, shotIndex);
    const id = mechanismOverlayLayerId("plate", shot.id);
    assets.push({
      id,
      type: "sequence",
      path: capture.pattern ?? join(capture.outputDirectory, "%06d.png"),
      sha256: capture.sequenceSha256,
      manifestPath: capture.sequenceManifestPath,
      firstFrame: capture.firstFrame ?? 0,
      width: episode.output.width,
      height: episode.output.height,
      frameCount: capture.frames.length,
      frameRate: { numerator: episode.output.fps, denominator: 1 },
      color: {
        primaries: "bt709",
        transfer: "iec61966-2-1",
        matrix: "gbr",
        range: "pc",
      },
    });
    const proof = physicalProofHold(episode, {
      shotId: shot.id,
      sidecar: capture.sidecar,
    });
    plates.push({
      id,
      type: "sequence",
      parent: plateGroup.id,
      asset: id,
      size: [episode.output.width, episode.output.height],
      fit: "stretch",
      inPoint: shot.startFrame,
      outPoint: shot.endFrameExclusive,
      startFrame: shot.startFrame,
      sourceInFrame: 0,
      sourceOutFrame: capture.frames.length,
      frameBlending: "hold",
      transform: { anchor: [0, 0], position: [0, 0] },
      metadata: {
        mechanismShot: shot.id,
        sidecarPath: capture.sidecarPath,
        ...(proof ? { physicalProof: proof } : {}),
      },
    });
    for (const label of shot.labels) {
      overlays.push(
        ...leaderLayers(label, shot, capture.sidecar),
        labelPanel(label, shot, capture.sidecar),
        labelTextLayer(label, shot, capture.sidecar, episode.font),
      );
      if (label.qualification)
        overlays.push(
          labelTextLayer(label, shot, capture.sidecar, episode.font, true),
        );
    }
  });
  overlays.push(
    ...episode.captions.flatMap((caption) => [
      captionPanel(episode, caption),
      captionLayer(episode, caption),
    ]),
  );
  const audioDependency = episode.dependencies.find(
    (dependency) =>
      dependency.id === episode.audio && dependency.type === "audio",
  );
  const audio =
    options.audio ??
    (source.audioMetadata && audioDependency
      ? {
          id: audioDependency.id,
          type: "audio" as const,
          path: source.dependencyPaths[audioDependency.id]!,
          sha256: audioDependency.sha256,
          ...source.audioMetadata,
        }
      : undefined);
  if (episode.audio && !audio)
    fail(
      "mechanism-overlay-audio",
      "Pinned narration needs actual decoded PCM metadata",
      "audio",
    );
  if (audio) {
    if (
      !episode.audio ||
      audio.id !== episode.audio ||
      !audioDependency ||
      audioDependency.sha256 !== audio.sha256
    )
      fail(
        "mechanism-overlay-audio",
        "Decoded audio metadata must match the episode's pinned audio dependency",
        "audio",
      );
    assets.push(audio);
    overlays.push({
      id: "mechanism-narration",
      type: "audio",
      asset: audio.id,
      role: "narration",
      inPoint: 0,
      outPoint: episode.output.frameCount,
      sourceStartSample: 0,
      sourceEndSample: audio.sampleCount,
    });
  }
  const { physicalProofHolds = [], ...readingPolicy } =
    mechanismOverlayQualityPolicy(episode, captures);
  const validation = validateComposition({
    schemaVersion: "composition-1",
    id: mechanismOverlayLayerId("plate", episode.id),
    ...episode.output,
    background: "#0b1020",
    textStyles: Object.fromEntries(
      episode.dependencies
        .filter((dependency) => dependency.type === "font")
        .map((dependency) => [
          fontAssetId(dependency.id),
          {
            fontAsset: fontAssetId(dependency.id),
            ...(dependency.axes ? { axes: dependency.axes } : {}),
          },
        ]),
    ),
    assets,
    layers: [...overlays.reverse(), ...plates, plateGroup],
    markers: episode.shots.slice(1).map((shot) => ({
      id: mechanismOverlayLayerId("plate", shot.id),
      frame: shot.startFrame,
      label: "cut",
    })),
    metadata: {
      mechanismEpisode: episode.id,
      revision: episode.revision,
      overlayVersion: "mechanism-overlays-1",
      readingPolicy,
      physicalProofDeclarations: physicalProofHolds.map(
        ({ id, layer, start, end, evidenceSha256 }) => ({
          id,
          layer,
          start,
          end,
          evidenceSha256,
        }),
      ),
    },
  });
  if (!validation.ok) throw new PassageError(validation.diagnostics);
  return validation.composition;
}
export const compileMechanismComposition = compileMechanismOverlays;

/** Native worlds and current anchor bindings; no captured plates or invented sidecars. */
export function compileNativeMechanismComposition(
  source: MechanismOverlaySource,
  options: MechanismOverlayOptions = {},
): Composition {
  const { episode } = source;
  const sceneDependency = episode.dependencies.find(
    (dependency) =>
      dependency.id === episode.scene && dependency.type === "scene",
  )!;
  const sceneAsset = mechanismOverlayLayerId("scene", episode.scene);
  const assets: Composition["assets"] = episode.dependencies
    .filter((dependency) => dependency.type === "font")
    .map((dependency) => {
      if (
        !dependency.weight ||
        dependency.style === "oblique" ||
        !source.dependencyPaths[dependency.id]
      )
        fail(
          "mechanism-overlay-font",
          "Native fonts require pinned paths, weights and supported style",
          `dependencies.${episode.dependencies.indexOf(dependency)}`,
        );
      const variable = source.fontAxes?.[dependency.id];
      if (dependency.axes && !variable)
        fail(
          "mechanism-overlay-font",
          "Declared font axes require verified ranges",
          `dependencies.${episode.dependencies.indexOf(dependency)}.axes`,
        );
      return {
        id: fontAssetId(dependency.id),
        type: "font" as const,
        path: source.dependencyPaths[dependency.id]!,
        sha256: dependency.sha256,
        weight: dependency.weight,
        ...(dependency.style ? { style: dependency.style } : {}),
        ...(variable && Object.keys(variable).length ? { variable } : {}),
      };
    });
  assets.push({
    id: sceneAsset,
    type: "native3d",
    path: source.dependencyPaths[episode.scene]!,
    sha256: sceneDependency.sha256,
    format: "mechanism-scene-1",
    textureFont: fontAssetId(episode.font),
  });
  const worlds: CompositionLayer[] = [],
    overlays: CompositionLayer[] = [];
  for (const shot of episode.shots) {
    const controller = mechanismOverlayLayerId("plate", shot.id);
    worlds.push({
      id: controller,
      type: "native3d",
      asset: sceneAsset,
      inPoint: shot.startFrame,
      outPoint: shot.endFrameExclusive,
      startFrame: shot.startFrame,
      sourceStartFrame: shot.startFrame,
      sourceFps: episode.output.fps,
      ...(shot.camera ? { camera: shot.camera } : {}),
      ...(shot.cameraKeys ? { cameraKeys: shot.cameraKeys } : {}),
      controls: shot.controls,
      hiddenParts: shot.hiddenParts,
      metadata: {
        mechanismShot: shot.id,
        nativeSource: sceneDependency.sha256,
        originalGeometry: source.scene.geometrySha256,
      },
    });
    for (const label of shot.labels) {
      const group = mechanismOverlayLayerId("annotation", label.id);
      const common = {
        inPoint: label.readingInterval.startFrame,
        outPoint: label.readingInterval.endFrameExclusive,
        startFrame: shot.startFrame,
      };
      const binding = {
        role: "screen-anchor" as const,
        sceneLayer: controller,
        anchor: label.anchor,
        visibilityPolicy: label.visibilityPolicy,
        insetPixels: 12,
      };
      overlays.push({
        ...common,
        id: group,
        type: "group",
        size: [episode.output.width, episode.output.height],
        transform: { anchor: [0, 0] },
        overlayAfter: controller,
        native3D: { ...binding, target: { kind: "visibility" } },
        metadata: {
          mechanismLabel: label.id,
          binding: "current-native-anchor",
        },
      });
      const start: [number, number] = [
        label.position[0],
        label.position[1] + label.fontSize * (label.qualification ? 2.3 : 1.3),
      ];
      overlays.push({
        ...common,
        id: mechanismOverlayLayerId("leader", label.id),
        type: "shape",
        parent: group,
        native3D: {
          ...binding,
          target: {
            kind: "path-endpoint",
            contentId: "path",
            endpoint: "last",
          },
        },
        contents: [
          {
            id: "path",
            type: "path",
            path: { closed: false, vertices: [start, start] },
          },
          {
            id: "stroke",
            type: "stroke",
            color: "#e2e6ed",
            width: 2,
            cap: "round",
          },
        ],
        metadata: {
          mechanismLabel: label.id,
          anchor: label.anchor,
          binding: "current-native-anchor",
          occlusionPolicy: label.visibilityPolicy,
        },
      });
      for (const child of [
        labelPanel(label, shot, undefined),
        labelTextLayer(label, shot, undefined, episode.font),
        ...(label.qualification
          ? [labelTextLayer(label, shot, undefined, episode.font, true)]
          : []),
      ])
        overlays.push({ ...child, parent: group });
      if (label.visibilityPolicy === "offscreen-indicator")
        overlays.push({
          ...common,
          id: mechanismOverlayLayerId("indicator", label.id),
          type: "shape",
          parent: group,
          native3D: {
            ...binding,
            visibleWhen: "indicator",
            target: { kind: "position" },
          },
          contents: [
            {
              id: "path",
              type: "path",
              path: {
                closed: true,
                vertices: [
                  [0, -7],
                  [7, 7],
                  [-7, 7],
                ],
              },
            },
            { id: "fill", type: "fill", color: "#e2e6ed" },
          ],
          metadata: {
            mechanismLabel: label.id,
            meaning: "offscreen-target-indicator",
          },
        });
    }
  }
  overlays.push(
    ...episode.captions.flatMap((caption) => [
      captionPanel(episode, caption),
      captionLayer(episode, caption),
    ]),
  );
  const audioDependency = episode.dependencies.find(
    (dependency) =>
      dependency.id === episode.audio && dependency.type === "audio",
  );
  const audio =
    options.audio ??
    (source.audioMetadata && audioDependency
      ? {
          id: audioDependency.id,
          type: "audio" as const,
          path: source.dependencyPaths[audioDependency.id]!,
          sha256: audioDependency.sha256,
          ...source.audioMetadata,
        }
      : undefined);
  if (episode.audio && !audio)
    fail(
      "mechanism-overlay-audio",
      "Native narration requires actual decoded PCM metadata",
      "audio",
    );
  if (audio) {
    if (audio.id !== episode.audio || audio.sha256 !== audioDependency?.sha256)
      fail(
        "mechanism-overlay-audio",
        "Native narration differs from its pinned dependency",
        "audio",
      );
    assets.push(audio);
    overlays.push({
      id: "mechanism-narration",
      type: "audio",
      asset: audio.id,
      role: "narration",
      inPoint: 0,
      outPoint: episode.output.frameCount,
      sourceStartSample: 0,
      sourceEndSample: audio.sampleCount,
    });
  }
  const readingPolicy = mechanismOverlayQualityPolicy(episode);
  delete readingPolicy.physicalProofHolds;
  const validation = validateComposition({
    schemaVersion: "composition-1",
    id: mechanismOverlayLayerId("plate", episode.id),
    ...episode.output,
    background: "#0b1020",
    assets,
    layers: [...overlays.reverse(), ...worlds],
    textStyles: Object.fromEntries(
      episode.dependencies
        .filter((dependency) => dependency.type === "font")
        .map((dependency) => [
          fontAssetId(dependency.id),
          {
            fontAsset: fontAssetId(dependency.id),
            ...(dependency.axes ? { axes: dependency.axes } : {}),
          },
        ]),
    ),
    markers: episode.shots.slice(1).map((shot) => ({
      id: mechanismOverlayLayerId("plate", shot.id),
      frame: shot.startFrame,
      label: "cut",
    })),
    metadata: {
      mechanismEpisode: episode.id,
      revision: episode.revision,
      overlayVersion: "mechanism-native-overlays-1",
      readingPolicy,
      nativePhysicalProofRequests: episode.shots.map((shot) => ({
        id: shot.id,
        purpose: shot.purpose,
        layer: mechanismOverlayLayerId("plate", shot.id),
        start: shot.startFrame,
        end: shot.endFrameExclusive,
      })),
    },
  });
  if (!validation.ok) throw new PassageError(validation.diagnostics);
  return validation.composition;
}

function physicalProofHold(episode: MechanismEpisode, capture: SidecarInput) {
  const shot = episode.shots.find((shot) => shot.id === capture.shotId);
  if (
    !shot ||
    capture.sidecar.frames.some(
      (frame) =>
        !Object.keys(frame.parts).length || !Object.keys(frame.rigs).length,
    )
  )
    return undefined;
  const hash = (value: unknown) =>
    "sha256:" +
    createHash("sha256").update(canonicalMechanismJson(value)).digest("hex");
  return {
    id: shot.id,
    purpose: shot.purpose,
    layer: mechanismOverlayLayerId("plate", shot.id),
    start: shot.startFrame,
    end: shot.endFrameExclusive,
    evidenceSha256: hash(capture.sidecar),
    frames: capture.sidecar.frames.map((frame) => ({
      frame: frame.sourceFrame,
      plateSha256: frame.plateSha256,
      physicalSha256: hash({
        scene: capture.sidecar.sceneSha256,
        geometry: capture.sidecar.geometrySha256,
        camera: frame.camera,
        parts: frame.parts,
        rigs: frame.rigs,
      }),
    })),
  };
}
export function mechanismOverlayQualityPolicy(
  episode: MechanismEpisode,
  sidecars: readonly SidecarInput[] = [],
): CompositionQualityPolicy {
  return {
    shots: episode.shots.map((shot) => ({
      id: shot.id,
      start: shot.startFrame,
      end: shot.endFrameExclusive,
    })),
    ...(episode.audio &&
    episode.captions.length &&
    episode.dependencies.some((dependency) => dependency.type === "captions")
      ? {
          speechCaptions: episode.captions.map((cue) => ({
            id: cue.id,
            cueId: cue.id,
            purpose: "Follow supplied narration",
            layer: mechanismOverlayLayerId("caption", cue.id),
            text: cue.text,
            start: cue.startFrame,
            end: cue.endFrameExclusive,
            sourceSha256: episode.dependencies.find(
              (dependency) => dependency.type === "captions",
            )!.sha256,
            audioLayer: "mechanism-narration",
            audioSha256: episode.dependencies.find(
              (dependency) => dependency.id === episode.audio,
            )!.sha256,
          })),
        }
      : {}),
    physicalProofHolds: sidecars.flatMap((capture) => {
      const proof = physicalProofHold(episode, capture);
      return proof ? [proof] : [];
    }),
    readingDeclarations: episode.shots.flatMap((shot) =>
      shot.labels.map((label) => ({
        id: label.id,
        purpose: shot.purpose,
        start: label.readingInterval.startFrame,
        end: label.readingInterval.endFrameExclusive,
        members: [
          {
            layer: mechanismOverlayLayerId("label", label.id),
            text: label.text,
            kind: "value" as const,
          },
          ...(label.qualification
            ? [
                {
                  layer: mechanismOverlayLayerId("qualification", label.id),
                  text: label.qualification,
                  kind: "qualification" as const,
                },
              ]
            : []),
        ],
      })),
    ),
  };
}
export type MechanismOverlayFinding = {
  code: string;
  path: string;
  message: string;
  frames: [number, number];
  measured: number;
  shot?: string;
  label?: string;
  other?: string;
  measurement: "estimated" | "measured";
};
export type MechanismOverlayCheckOptions = {
  textBounds?: Readonly<Record<string, readonly Bounds[]>>;
};
export type MechanismOverlayReport = {
  version: "mechanism-overlay-check-1";
  measurement: "estimated" | "measured";
  layoutAccepted: boolean;
  findings: MechanismOverlayFinding[];
  holds: {
    shot: string;
    label: string;
    longestReadableFrames: number;
    requiredFrames: number;
  }[];
};
function intersects(a: Bounds, b: Bounds) {
  return (
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  );
}
function boundsAt(
  options: MechanismOverlayCheckOptions,
  id: string,
  frame: number,
  text: string,
  size: number,
  position: [number, number],
  maxWidth = Infinity,
) {
  const actual = options.textBounds?.[id]?.[0];
  if (
    actual &&
    (!Object.values(actual).every(Number.isFinite) ||
      actual.left > actual.right ||
      actual.top > actual.bottom)
  )
    fail(
      "mechanism-overlay-bounds",
      "Text bounds must be finite ordered local bounds",
      `textBounds.${id}`,
    );
  const width = Math.min(
    maxWidth,
    [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)]
      .length *
      size *
      0.7,
  );
  const local = actual ?? {
    left: Number.isFinite(maxWidth) ? (maxWidth - width) / 2 : -width / 2,
    right: Number.isFinite(maxWidth) ? (maxWidth + width) / 2 : width / 2,
    top: 0,
    bottom:
      size *
      1.25 *
      Math.max(1, Math.ceil((text.length * size * 0.7) / maxWidth)),
  };
  return {
    measurement: actual ? ("measured" as const) : ("estimated" as const),
    bounds: {
      left: local.left + position[0],
      right: local.right + position[0],
      top: local.top + position[1],
      bottom: local.bottom + position[1],
    },
  };
}
function outside(bounds: Bounds, width: number, height: number) {
  return Math.max(
    0,
    -bounds.left,
    -bounds.top,
    bounds.right - width,
    bounds.bottom - height,
  );
}
/** Estimated bounds are useful repair evidence; only complete measured bounds can accept layout. */
export function checkMechanismOverlays(
  episode: MechanismEpisode,
  sidecars: readonly SidecarInput[],
  options: MechanismOverlayCheckOptions = {},
): MechanismOverlayReport {
  const grouped = new Map<string, MechanismOverlayFinding>();
  const holds: MechanismOverlayReport["holds"] = [];
  let measurement: MechanismOverlayReport["measurement"] = "measured";
  const add = (finding: MechanismOverlayFinding) => {
    const key = JSON.stringify([finding.code, finding.path, finding.other]);
    const old = grouped.get(key);
    if (old) {
      old.frames[1] = finding.frames[1];
      old.measured = Math.max(old.measured, finding.measured);
      if (finding.measurement === "estimated") old.measurement = "estimated";
    } else grouped.set(key, finding);
  };
  episode.shots.forEach((shot, shotIndex) => {
    const sidecar = sidecarFor(episode, sidecars, shotIndex);
    const running = new Map<string, { current: number; longest: number }>();
    sidecar.frames.forEach((row, ordinal) => {
      const frame = shot.startFrame + ordinal;
      const eligibility = new Map<string, boolean>();
      const boxes: {
        bounds: Bounds;
        id: string;
        path: string;
        label?: string;
        measurement: "estimated" | "measured";
      }[] = [];
      shot.labels.forEach((label, labelIndex) => {
        if (
          frame < label.readingInterval.startFrame ||
          frame >= label.readingInterval.endFrameExclusive
        )
          return;
        const path = `shots.${shotIndex}.labels.${labelIndex}`;
        const state = displayState(label, row);
        let readable = state.visible;
        if (!state.visible)
          add({
            code: "mechanism-label-visibility",
            path: path + ".anchor",
            message: `Target is ${state.anchor?.visibility ?? "missing"}; it cannot prove a fully readable anchored hold`,
            frames: [frame, frame],
            measured: 1,
            shot: shot.id,
            label: label.id,
            measurement: "measured",
          });
        if (state.shown)
          for (const qualification of label.qualification
            ? [false, true]
            : [false]) {
            const kind = qualification ? "qualification" : "label";
            const box = boundsAt(
              options,
              mechanismOverlayLayerId(kind, label.id),
              frame,
              qualification ? label.qualification! : label.text,
              label.fontSize * (qualification ? 0.64 : 1),
              labelPlacement(label, qualification),
            );
            if (box.measurement === "estimated") measurement = "estimated";
            boxes.push({
              ...box,
              id: label.id + (qualification ? ":qualification" : ""),
              path: path + ".position",
              label: label.id,
            });
            const overflow = outside(
              box.bounds,
              episode.output.width,
              episode.output.height,
            );
            if (overflow) {
              readable = false;
              add({
                code: "mechanism-label-offscreen",
                path: path + ".position",
                message: "Active label extent leaves the output viewport",
                frames: [frame, frame],
                measured: overflow,
                shot: shot.id,
                label: label.id,
                measurement: box.measurement,
              });
            }
          }
        eligibility.set(label.id, readable);
      });
      episode.captions.forEach((caption, index) => {
        if (frame < caption.startFrame || frame >= caption.endFrameExclusive)
          return;
        const box = boundsAt(
          options,
          mechanismOverlayLayerId("caption", caption.id),
          frame,
          caption.text,
          captionSize(episode),
          captionOrigin(episode),
          episode.output.width * 0.84,
        );
        if (box.measurement === "estimated") measurement = "estimated";
        boxes.push({ ...box, id: caption.id, path: `captions.${index}.text` });
        const overflow = outside(
          box.bounds,
          episode.output.width,
          episode.output.height,
        );
        if (overflow)
          add({
            code: "mechanism-caption-offscreen",
            path: `captions.${index}.text`,
            message: "Active caption extent leaves the output viewport",
            frames: [frame, frame],
            measured: overflow,
            shot: shot.id,
            measurement: box.measurement,
          });
      });
      boxes.forEach((box, index) => {
        for (const other of boxes.slice(index + 1)) {
          const overlap = intersects(box.bounds, other.bounds);
          if (overlap) {
            if (box.label) eligibility.set(box.label, false);
            if (other.label) eligibility.set(other.label, false);
            add({
              code: "mechanism-label-overlap",
              path: box.path,
              message: "Active native text extents overlap",
              frames: [frame, frame],
              measured: overlap,
              shot: shot.id,
              ...(box.label ? { label: box.label } : {}),
              other: other.id,
              measurement:
                box.measurement === "measured" &&
                other.measurement === "measured"
                  ? "measured"
                  : "estimated",
            });
          }
        }
        for (const region of row.protectedRegions) {
          const [x, y, width, height] = region.bounds;
          const overlap = intersects(box.bounds, {
            left: x,
            top: y,
            right: x + width,
            bottom: y + height,
          });
          if (overlap) {
            if (box.label) eligibility.set(box.label, false);
            add({
              code: "mechanism-label-protected-region",
              path: box.path,
              message: "Active text overlaps a protected proof region",
              frames: [frame, frame],
              measured: overlap,
              shot: shot.id,
              ...(box.label ? { label: box.label } : {}),
              other: region.id,
              measurement: box.measurement,
            });
          }
        }
      });
      for (const [id, readable] of eligibility) {
        const hold = running.get(id) ?? { current: 0, longest: 0 };
        hold.current = readable ? hold.current + 1 : 0;
        hold.longest = Math.max(hold.longest, hold.current);
        running.set(id, hold);
      }
    });
    shot.labels.forEach((label, labelIndex) => {
      const longest = running.get(label.id)?.longest ?? 0;
      holds.push({
        shot: shot.id,
        label: label.id,
        longestReadableFrames: longest,
        requiredFrames: 30,
      });
      if (longest < 30)
        add({
          code: "mechanism-label-hold",
          path: `shots.${shotIndex}.labels.${labelIndex}.readingInterval`,
          message:
            "Anchored label needs at least 30 consecutive fully readable output frames",
          frames: [
            label.readingInterval.startFrame,
            label.readingInterval.endFrameExclusive - 1,
          ],
          measured: longest,
          shot: shot.id,
          label: label.id,
          measurement,
        });
    });
  });
  const findings = [...grouped.values()];
  return {
    version: "mechanism-overlay-check-1",
    measurement,
    layoutAccepted: measurement === "measured" && findings.length === 0,
    findings,
    holds,
  };
}
