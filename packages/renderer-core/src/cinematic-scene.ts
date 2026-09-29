import {
  CameraValidationSchema,
  CinematicSceneSchema,
  type CinematicScene,
} from "../../scene-contract/src/cinematic.ts";
import {
  OUTPUT_FORMATS,
  type OutputFormat,
} from "../../scene-contract/src/output-format.ts";
import type { PreparedImage } from "../../scene-contract/src/prepared.ts";
import {
  PassageError,
  passageDiagnostics,
  passageError,
} from "./passage-diagnostics.ts";

export const CINEMATIC_RENDERER_VERSION = "cinematic-canvas-0.8.0";
export const VERTICAL_CINEMATIC_RENDERER_VERSION = "cinematic-canvas-1.0.0";
export const DOLLY_ZOOM_RENDERER_VERSION = "cinematic-canvas-1.1.0";

type Edge = "left" | "top" | "right" | "bottom";
type CoverageKind =
  | "background"
  | "background-blur"
  | "cut-edge"
  | "focus-cut-edge";
export type CinematicCoverageReport = {
  kind: CoverageKind;
  node: string;
  frame: number;
  gaps: { edge: Edge; missingPixels: number }[];
};

export class CinematicCoverageError extends PassageError {
  constructor(readonly report: CinematicCoverageReport) {
    const gaps = report.gaps
      .map(({ edge, missingPixels }) => `${edge} ${missingPixels.toFixed(2)}px`)
      .join(", ");
    const label =
      report.kind === "background"
        ? "Background coverage fails"
        : report.kind === "background-blur"
          ? "Background blur coverage fails"
          : report.kind === "cut-edge"
            ? "Authored cut edge"
            : "Focus blur cut edge";
    const message =
      report.kind === "cut-edge" || report.kind === "focus-cut-edge"
        ? `${label} ${report.node}:${report.gaps[0]?.edge} enters the frame at frame ${report.frame}; missing ${gaps}`
        : `${label} at frame ${report.frame}: ${report.node} missing ${gaps}`;
    super([
      {
        code: `cinematic-${report.kind}-coverage`,
        severity: "error",
        message,
        node: report.node,
        frame: report.frame,
        ...(report.gaps[0] ? { path: report.gaps[0].edge } : {}),
      },
    ]);
    this.name = "CinematicCoverageError";
  }
}

export type CinematicSourceResolutionReport = {
  node: string;
  asset: string;
  assetPath: string;
  frame: number;
  sourcePixelsPerOutputPixel: number;
  minimumSourcePixelsPerOutputPixel: number;
  minimumSampledSize: { width: number; height: number };
};

export class CinematicSourceResolutionError extends PassageError {
  constructor(readonly report: CinematicSourceResolutionReport) {
    super([
      {
        code: "cinematic-source-resolution",
        severity: "error",
        message: `Source resolution requires more than 1.5x upscaling for ${report.node} at frame ${report.frame}: repaint ${report.assetPath} with at least ${report.minimumSampledSize.width}x${report.minimumSampledSize.height} sampled pixels`,
        node: report.node,
        frame: report.frame,
        path: report.assetPath,
      },
    ]);
    this.name = "CinematicSourceResolutionError";
  }
}

function coverageGaps(
  margins: Record<Edge, number>,
  requiredPadding: number,
): CinematicCoverageReport["gaps"] {
  return (["left", "top", "right", "bottom"] as const)
    .map((edge) => ({ edge, missingPixels: requiredPadding - margins[edge] }))
    .filter(({ missingPixels }) => missingPixels > 0);
}

function motionProfile(intensity: CinematicScene["recipe"]["intensity"]) {
  if (intensity === "dramatic")
    return {
      horizontalStrength: 5,
      verticalStrength: 1.5,
      start: 0.02,
      end: 0.92,
      minimumForegroundTravel: 0.1,
      maximumForegroundTravel: 0.2,
      maximumBackgroundTravel: 0.05,
      maximumVerticalTravel: 0.02,
    };
  const strength = intensity === "restrained" ? 0.65 : 1;
  return {
    horizontalStrength: strength,
    verticalStrength: strength,
    start: 0.1,
    end: 5.5 / 7,
    minimumForegroundTravel: intensity === "restrained" ? 0.01 : 0.02,
    maximumForegroundTravel: 0.04,
    maximumBackgroundTravel: 0.01,
    maximumVerticalTravel: 0.01,
  };
}

type Intensity = CinematicScene["recipe"]["intensity"];
type CameraProfile = ReturnType<typeof motionProfile>;
type PresetBehavior = {
  profile: (intensity: Intensity, base: CameraProfile) => CameraProfile;
  tracking?: boolean;
  trackTiming?: boolean;
  curvedPath?: boolean;
  focusBlur?: boolean;
  axial?: boolean;
  pullback?: boolean;
  anchoredParallax?: boolean;
  risingVista?: boolean;
  lateralTrack?: boolean;
  foregroundReveal?: boolean;
  dollyZoom?: boolean;
};
const unchanged = (_: Intensity, base: CameraProfile) => base;
const vistaProfile =
  (vertical: number): PresetBehavior["profile"] =>
  (intensity, base) => {
    const strength =
      intensity === "dramatic" ? 1 : intensity === "standard" ? 0.75 : 0.5;
    return {
      ...base,
      horizontalStrength: 3 * strength,
      verticalStrength: vertical * strength,
      start: 0.04,
      end: 0.92,
      maximumVerticalTravel: 0.25,
    };
  };

const PRESET_BEHAVIORS: Record<
  CinematicScene["recipe"]["preset"],
  PresetBehavior
> = {
  layered_parallax: { profile: unchanged, anchoredParallax: true },
  threshold_push: { profile: unchanged, axial: true },
  detail_to_world: {
    profile: (_, base) => ({ ...base, start: 0.06, end: 0.82 }),
    pullback: true,
  },
  focus_handoff: {
    profile: (intensity, base) => ({
      ...base,
      horizontalStrength:
        intensity === "dramatic" ? 4 : intensity === "standard" ? 3 : 2,
      start: 0.04,
      end: 0.65,
    }),
    focusBlur: true,
  },
  rising_vista: {
    profile: vistaProfile(5),
    tracking: true,
    risingVista: true,
  },
  curved_approach: { profile: vistaProfile(3), curvedPath: true },
  foreground_reveal: {
    profile: (intensity, base) => ({
      ...base,
      horizontalStrength:
        intensity === "dramatic" ? 5 : intensity === "standard" ? 4 : 3,
      start:
        intensity === "dramatic"
          ? 0.04
          : intensity === "standard"
            ? 0.05
            : 0.06,
      end:
        intensity === "dramatic"
          ? 0.46
          : intensity === "standard"
            ? 0.52
            : 0.58,
    }),
    foregroundReveal: true,
  },
  lateral_track: {
    profile: (intensity, base) => ({
      ...base,
      horizontalStrength:
        intensity === "dramatic" ? 5 : intensity === "standard" ? 3 : 2,
      start: 0.02,
      end: 0.94,
    }),
    tracking: true,
    trackTiming: true,
    lateralTrack: true,
  },
  dolly_zoom_tension: {
    profile: (_, base) => ({
      ...base,
      start: 1 / 7,
      end: 4.8 / 7,
    }),
    dollyZoom: true,
  },
};

function cameraProfile(scene: CinematicScene) {
  return PRESET_BEHAVIORS[scene.recipe.preset].profile(
    scene.recipe.intensity,
    motionProfile(scene.recipe.intensity),
  );
}

function trackProgress(progress: number) {
  // Integrate smoothstep velocity ramps around a constant-speed plateau.
  // Their total area is 1 - ramp, which normalizes the final position to 1.
  const ramp = 0.12;
  const rampArea = (p: number) => {
    const u = p / ramp;
    return ramp * (u * u * u - 0.5 * u * u * u * u);
  };
  if (progress < ramp) return rampArea(progress) / (1 - ramp);
  if (progress > 1 - ramp) return 1 - rampArea(1 - progress) / (1 - ramp);
  return (progress - ramp / 2) / (1 - ramp);
}
type CameraKey = {
  frame: number;
  x: number;
  y: number;
  z: number;
  focal: number;
};
type CompiledCamera = CinematicScene & {
  rendererVersion:
    | typeof CINEMATIC_RENDERER_VERSION
    | "cinematic-canvas-0.9.0"
    | typeof VERTICAL_CINEMATIC_RENDERER_VERSION
    | typeof DOLLY_ZOOM_RENDERER_VERSION;
  canvas: { width: number; height: number };
  timeline: { fps: number; durationMs: number; frameCount: number };
  cameraFrames: CameraKey[];
};
export type CinematicRenderScene = CompiledCamera & {
  cameraValidation: ReturnType<typeof CameraValidationSchema.parse>;
};

function reframeCinematicForVertical(input: CinematicScene): CinematicScene {
  const scale = input.height / OUTPUT_FORMATS.landscape.height;
  const subject = input.nodes.find((node) => node.id === input.recipe.subject)!;
  const region = input.layers.find(
    (layer) => layer.node === subject.id,
  )!.protectedRegion!;
  const sourceAnchor = [
    subject.x + subject.width * input.camera.anchor[0],
    subject.y + subject.height * input.camera.anchor[1],
  ];
  const axisOffset = (
    axis: 0 | 1,
    frameSize: number,
    subjectPosition: number,
  ) => {
    const coordinates = region.map((point) => subjectPosition + point[axis]);
    const min = Math.min(...coordinates) * scale;
    const max = Math.max(...coordinates) * scale;
    const proposed = frameSize / 2 - sourceAnchor[axis]! * scale;
    const allowedMin = frameSize * 0.05 - min;
    const allowedMax = frameSize * 0.95 - max;
    return allowedMin <= allowedMax
      ? Math.max(allowedMin, Math.min(allowedMax, proposed))
      : frameSize / 2 - (min + max) / 2;
  };
  const offsetX = axisOffset(0, input.width, subject.x);
  const offsetY = axisOffset(1, input.height, subject.y);
  const scalePoint = ([x, y]: readonly [number, number]): [number, number] => [
    x * scale,
    y * scale,
  ];
  return {
    ...input,
    nodes: input.nodes.map((node) => ({
      ...node,
      x: node.x * scale + offsetX,
      y: node.y * scale + offsetY,
      width: node.width * scale,
      height: node.height * scale,
    })),
    layers: input.layers.map((layer) => ({
      ...layer,
      paintedBounds: layer.paintedBounds?.map((value) => value * scale) as
        | [number, number, number, number]
        | undefined,
      protectedRegion: layer.protectedRegion?.map(scalePoint),
    })),
    recipe: {
      ...input.recipe,
      revealRegion: input.recipe.revealRegion?.map(scalePoint),
    },
  };
}

function horizontalMotionSpan(scene: CompiledCamera) {
  return scene.format === "vertical"
    ? scene.width *
        (OUTPUT_FORMATS.landscape.width / OUTPUT_FORMATS.vertical.width)
    : scene.width;
}

/** Layer-local focus approximation; the returned sigma is in output pixels. */
export function sampleCinematicBlur(
  scene: CompiledCamera,
  nodeId: string,
  frame: number,
) {
  if (
    (!scene.effectsVersion && !Number.isInteger(frame)) ||
    !Number.isFinite(frame) ||
    frame < 0 ||
    frame >= scene.timeline.frameCount
  )
    throw new Error("Frame index outside cinematic timeline");
  if (!PRESET_BEHAVIORS[scene.recipe.preset].focusBlur) return 0;
  const focus = scene.camera.focus!;
  const depth = (id: string) =>
    scene.layers.find((layer) => layer.node === id)!.depth;
  const near = 1 / depth(scene.recipe.foreground),
    far = 1 / depth(scene.recipe.subject);
  const progress = Math.max(
    0,
    Math.min(
      1,
      (frame / (scene.timeline.frameCount - 1) - focus.transition[0]) /
        (focus.transition[1] - focus.transition[0]),
    ),
  );
  const eased = progress * progress * (3 - 2 * progress);
  const focusInverseDepth = near + (far - near) * eased;
  const strength =
    scene.recipe.intensity === "dramatic"
      ? 1
      : scene.recipe.intensity === "standard"
        ? 0.75
        : 0.5;
  return (
    focus.maxBlurPx *
    strength *
    Math.min(1, Math.abs(1 / depth(nodeId) - focusInverseDepth) / (near - far))
  );
}

function sampleCamera(scene: CompiledCamera, frame: number): CameraKey {
  if (
    (!scene.effectsVersion && !Number.isInteger(frame)) ||
    !Number.isFinite(frame) ||
    frame < 0 ||
    frame >= scene.timeline.frameCount
  )
    throw new Error("Frame index outside cinematic timeline");
  for (let i = 1; i < scene.cameraFrames.length; i++) {
    const a = scene.cameraFrames[i - 1]!,
      b = scene.cameraFrames[i]!;
    if (frame <= b.frame) {
      const p = (frame - a.frame) / (b.frame - a.frame);
      // The dramatic curve peaks earlier and takes longer to decelerate.
      // Its velocity is 12p(1-p)^2: no overshoot and zero speed at both ends.
      const behavior = PRESET_BEHAVIORS[scene.recipe.preset];
      const eased = behavior.trackTiming
        ? trackProgress(p)
        : scene.recipe.intensity === "dramatic"
          ? p * p * (6 - 8 * p + 3 * p * p)
          : p * p * (3 - 2 * p);
      if (behavior.curvedPath && i === 2) {
        const profile = cameraProfile(scene);
        const control = scene.camera.curve!;
        const bend = (end: number, control: number) =>
          2 * (1 - eased) * eased * control + eased * eased * end;
        return {
          frame,
          x: bend(b.x, control[0] * profile.horizontalStrength),
          y: bend(b.y, control[1] * profile.verticalStrength),
          z: bend(b.z, (control[2] * b.z) / scene.camera.push!),
          focal: 1,
        };
      }
      const at = (key: "x" | "y" | "z" | "focal") =>
        a[key] + (b[key] - a[key]) * eased;
      return { frame, x: at("x"), y: at("y"), z: at("z"), focal: at("focal") };
    }
  }
  return scene.cameraFrames.at(-1)!;
}

export function projectCinematicNode(
  scene: CompiledCamera,
  node: PreparedImage,
  frame: number,
) {
  const camera = sampleCamera(scene, frame);
  const layer = scene.layers.find((item) => item.node === node.id)!;
  const subject = scene.nodes.find((item) => item.id === scene.recipe.subject)!;
  const subjectDepth = scene.layers.find(
    (item) => item.node === subject.id,
  )!.depth;
  const project = (x: number, y: number, depth: number) => {
    const distance = depth - camera.z;
    if (distance < 0.1) throw new Error("Camera crosses a depth plane");
    const scale = (camera.focal * depth) / distance;
    return {
      x:
        scene.width / 2 +
        (x - scene.width / 2) * scale -
        (camera.x * camera.focal) / distance,
      y:
        scene.height / 2 +
        (y - scene.height / 2) * scale -
        (camera.y * camera.focal) / distance,
      scale,
    };
  };
  const anchorX = subject.x + subject.width * scene.camera.anchor[0];
  const anchorY = subject.y + subject.height * scene.camera.anchor[1];
  const anchor = project(anchorX, anchorY, subjectDepth);
  const projected = project(node.x, node.y, layer.depth);
  const tracking = PRESET_BEHAVIORS[scene.recipe.preset].tracking;
  return {
    left: tracking ? projected.x : projected.x + anchorX - anchor.x,
    top: tracking ? projected.y : projected.y + anchorY - anchor.y,
    scale: projected.scale,
    width: node.width * projected.scale,
    height: node.height * projected.scale,
  };
}

function inspectLateralTrack(
  scene: CompiledCamera,
  travel: { foreground: number; subject: number; background: number },
) {
  const horizontalSpan = horizontalMotionSpan(scene);
  const intensity = scene.recipe.intensity;
  const minimumNear =
    intensity === "dramatic" ? 0.15 : intensity === "standard" ? 0.08 : 0.04;
  const maximumNear =
    intensity === "dramatic" ? 0.3 : intensity === "standard" ? 0.18 : 0.12;
  const maximumSubject =
    intensity === "dramatic" ? 0.12 : intensity === "standard" ? 0.08 : 0.06;
  if (
    travel.foreground < horizontalSpan * minimumNear ||
    travel.background < horizontalSpan * 0.003 ||
    travel.foreground < travel.subject * 2 ||
    travel.subject < travel.background * 2
  )
    throw new Error(
      "Insufficient lateral track separation between foreground, subject and distance",
    );
  if (
    travel.foreground > horizontalSpan * maximumNear ||
    travel.subject > horizontalSpan * maximumSubject ||
    travel.background > horizontalSpan * 0.05
  )
    throw new Error("Camera exceeds the lateral track movement envelope");
}

function inspectSubjectVisibility(scene: CompiledCamera, frame: number) {
  const subject = scene.nodes.find((node) => node.id === scene.recipe.subject)!;
  const layer = scene.layers.find((layer) => layer.node === subject.id)!;
  const target = projectCinematicNode(scene, subject, frame);
  const xs = layer.protectedRegion!.map(
    ([x]) => target.left + x * target.scale,
  );
  const ys = layer.protectedRegion!.map(
    ([, y]) => target.top + y * target.scale,
  );
  for (const near of scene.layers.filter((near) => near.depth < layer.depth)) {
    const node = scene.nodes.find((node) => node.id === near.node)!;
    const p = projectCinematicNode(scene, node, frame);
    const padding = PRESET_BEHAVIORS[scene.recipe.preset].focusBlur
      ? 3 * sampleCinematicBlur(scene, node.id, frame)
      : 0;
    // Conservatively reject even transparent card overlap with the detail.
    if (
      p.left - padding < Math.max(...xs) &&
      p.left + p.width + padding > Math.min(...xs) &&
      p.top - padding < Math.max(...ys) &&
      p.top + p.height + padding > Math.min(...ys)
    )
      throw new Error(
        `${scene.recipe.preset} foreground ${node.id} occludes the protected subject at frame ${frame}`,
      );
  }
}

function inspectDetailScale(scene: CompiledCamera) {
  const reduction = (id: string) => {
    const node = scene.nodes.find((node) => node.id === id)!;
    return (
      1 -
      projectCinematicNode(scene, node, scene.timeline.frameCount - 1).scale /
        projectCinematicNode(scene, node, 0).scale
    );
  };
  const foregroundScaleReduction = reduction(scene.recipe.foreground);
  const subjectScaleReduction = reduction(scene.recipe.subject);
  const backgroundScaleReduction = reduction(scene.recipe.background);
  if (
    subjectScaleReduction < 0.04 ||
    foregroundScaleReduction < subjectScaleReduction * 1.6 ||
    backgroundScaleReduction > subjectScaleReduction * 0.5
  )
    throw new Error("Insufficient detail to world scale separation");
  if (
    subjectScaleReduction > 0.3 ||
    foregroundScaleReduction > 0.55 ||
    backgroundScaleReduction > 0.12
  )
    throw new Error("Camera exceeds the detail to world scale envelope");
  return {
    foregroundScaleReduction,
    subjectScaleReduction,
    backgroundScaleReduction,
  };
}

function inspectCamera(scene: CompiledCamera) {
  const profile = cameraProfile(scene);
  const behavior = PRESET_BEHAVIORS[scene.recipe.preset];
  const horizontalSpan = horizontalMotionSpan(scene);
  const framingInset = scene.format === "vertical" ? 0.05 : 0.1;
  const axial = behavior.axial;
  const pullback = behavior.pullback;
  const focus = behavior.focusBlur;
  const anchoredParallax = behavior.anchoredParallax;
  let minimumCoverageMargin = Infinity,
    subjectTravelPx = 0,
    subjectScaleChange = 0,
    subjectAnchorTravelPx = 0,
    sourcePixelsPerOutputPixel = Infinity;
  const subject = scene.nodes.find((node) => node.id === scene.recipe.subject)!;
  const plate = scene.nodes.find(
    (node) => node.id === scene.recipe.background,
  )!;
  const painted = scene.layers.find(
    (layer) => layer.node === plate.id,
  )!.paintedBounds!;
  for (let frame = 0; frame < scene.timeline.frameCount; frame++) {
    if (pullback || focus || behavior.dollyZoom)
      inspectSubjectVisibility(scene, frame);
    const projected = projectCinematicNode(scene, plate, frame);
    const left = projected.left + painted[0] * projected.scale;
    const top = projected.top + painted[1] * projected.scale;
    const right = left + painted[2] * projected.scale;
    const bottom = top + painted[3] * projected.scale;
    const backgroundMargins = {
      left: -left,
      top: -top,
      right: right - scene.width,
      bottom: bottom - scene.height,
    };
    const margin = Math.min(...Object.values(backgroundMargins));
    if (margin < -0.001)
      throw new CinematicCoverageError({
        kind: "background",
        node: plate.id,
        frame,
        gaps: coverageGaps(backgroundMargins, 0),
      });
    if (focus && margin < 3 * sampleCinematicBlur(scene, plate.id, frame))
      throw new CinematicCoverageError({
        kind: "background-blur",
        node: plate.id,
        frame,
        gaps: coverageGaps(
          backgroundMargins,
          3 * sampleCinematicBlur(scene, plate.id, frame),
        ),
      });
    minimumCoverageMargin = Math.min(
      minimumCoverageMargin,
      Math.max(0, margin),
    );
    for (const layer of scene.layers) {
      const node = scene.nodes.find((item) => item.id === layer.node)!;
      const p = projectCinematicNode(scene, node, frame);
      const edgeMargins = {
        left: -p.left,
        right: p.left + p.width - scene.width,
        top: -p.top,
        bottom: p.top + p.height - scene.height,
      };
      for (const edge of layer.edgeAttachments ?? [])
        if (edgeMargins[edge] < -0.001)
          throw new CinematicCoverageError({
            kind: "cut-edge",
            node: node.id,
            frame,
            gaps: [{ edge, missingPixels: -edgeMargins[edge] }],
          });
      if (focus) {
        const padding = 3 * sampleCinematicBlur(scene, node.id, frame);
        for (const edge of layer.edgeAttachments ?? [])
          if (edgeMargins[edge] < padding)
            throw new CinematicCoverageError({
              kind: "focus-cut-edge",
              node: node.id,
              frame,
              gaps: [{ edge, missingPixels: padding - edgeMargins[edge] }],
            });
        if (
          Math.abs(p.left - node.x) > horizontalSpan * 0.01 ||
          Math.abs(p.top - node.y) > 0.001 ||
          Math.abs(p.scale - 1) > 0.001
        )
          throw new Error(
            `Camera exceeds the focus handoff movement envelope at frame ${frame}`,
          );
      }
      if (
        !axial &&
        !pullback &&
        !behavior.curvedPath &&
        !behavior.dollyZoom &&
        Math.abs(p.top - node.y) > scene.height * profile.maximumVerticalTravel
      )
        throw new Error(
          `Camera exceeds the vertical parallax envelope at frame ${frame}`,
        );
      if (
        behavior.curvedPath &&
        (Math.abs(p.left - node.x) > horizontalSpan * 0.3 ||
          Math.abs(p.top - node.y) > scene.height * 0.25 ||
          p.scale > 1.5)
      )
        throw new Error(
          `Camera exceeds the curved approach envelope at frame ${frame}`,
        );
      if (
        pullback &&
        (Math.abs(p.left - node.x) > horizontalSpan * 0.65 ||
          Math.abs(p.top - node.y) > scene.height * 0.6 ||
          p.scale > 2.25)
      )
        throw new Error(
          `Camera exceeds the detail to world movement envelope at frame ${frame}`,
        );
      const source = node.states[0]!;
      const asset = scene.assets.find((item) => item.id === source.asset)!;
      const density = Math.min(
        (source.crop?.[2] ?? asset.width) / p.width,
        (source.crop?.[3] ?? asset.height) / p.height,
      );
      if (density < 2 / 3)
        throw new CinematicSourceResolutionError({
          node: node.id,
          asset: asset.id,
          assetPath: asset.path,
          frame,
          sourcePixelsPerOutputPixel: density,
          minimumSourcePixelsPerOutputPixel: 2 / 3,
          minimumSampledSize: {
            width: Math.ceil((p.width * 2) / 3),
            height: Math.ceil((p.height * 2) / 3),
          },
        });
      sourcePixelsPerOutputPixel = Math.min(
        sourcePixelsPerOutputPixel,
        density,
      );
      if (!layer.protectedRegion) continue;
      for (const [x, y] of layer.protectedRegion) {
        const px = p.left + x * p.scale,
          py = p.top + y * p.scale;
        if (
          px < scene.width * framingInset ||
          px > scene.width * (1 - framingInset) ||
          py < scene.height * framingInset ||
          py > scene.height * (1 - framingInset)
        )
          throw new Error(`Subject protected framing fails at frame ${frame}`);
      }
    }
    const p = projectCinematicNode(scene, subject, frame);
    subjectTravelPx = Math.max(
      subjectTravelPx,
      Math.hypot(p.left - subject.x, p.top - subject.y),
    );
    subjectScaleChange = Math.max(subjectScaleChange, Math.abs(p.scale - 1));
    subjectAnchorTravelPx = Math.max(
      subjectAnchorTravelPx,
      Math.hypot(
        p.left +
          p.width * scene.camera.anchor[0] -
          (subject.x + subject.width * scene.camera.anchor[0]),
        p.top +
          p.height * scene.camera.anchor[1] -
          (subject.y + subject.height * scene.camera.anchor[1]),
      ),
    );
  }
  const travel = (id: string) => {
    const node = scene.nodes.find((item) => item.id === id)!;
    const end = projectCinematicNode(
      scene,
      node,
      scene.timeline.frameCount - 1,
    );
    return Math.abs(end.left - projectCinematicNode(scene, node, 0).left);
  };
  const foregroundTravelPx = travel(scene.recipe.foreground),
    backgroundTravelPx = travel(scene.recipe.background);
  const verticalTravel = (id: string) => {
    const node = scene.nodes.find((item) => item.id === id)!;
    return Math.abs(
      projectCinematicNode(scene, node, scene.timeline.frameCount - 1).top -
        projectCinematicNode(scene, node, 0).top,
    );
  };
  const foregroundVerticalTravelPx = verticalTravel(scene.recipe.foreground),
    backgroundVerticalTravelPx = verticalTravel(scene.recipe.background);
  if (behavior.risingVista) {
    if (
      foregroundVerticalTravelPx < scene.height * 0.06 ||
      foregroundVerticalTravelPx < subjectTravelPx * 2 ||
      subjectTravelPx < backgroundVerticalTravelPx * 2 ||
      backgroundVerticalTravelPx < 1
    )
      throw new Error("Insufficient rising vista depth separation");
    if (
      subjectTravelPx > scene.height * 0.1 ||
      backgroundVerticalTravelPx > scene.height * 0.06
    )
      throw new Error("Camera exceeds the rising vista envelope");
  }
  if (
    behavior.curvedPath &&
    (subjectScaleChange < 0.005 ||
      subjectScaleChange > 0.12 ||
      subjectAnchorTravelPx > 0.01)
  )
    throw new Error("Camera exceeds the curved approach subject envelope");
  const minimumNear = horizontalSpan * profile.minimumForegroundTravel;
  if (
    anchoredParallax &&
    (foregroundTravelPx < minimumNear ||
      backgroundTravelPx < horizontalSpan * 0.0015 ||
      foregroundTravelPx < backgroundTravelPx * 2)
  )
    throw new Error(
      "Insufficient visible parallax separation; choose more distinct depths or camera travel",
    );
  if (
    anchoredParallax &&
    (foregroundTravelPx > horizontalSpan * profile.maximumForegroundTravel ||
      backgroundTravelPx > horizontalSpan * profile.maximumBackgroundTravel ||
      subjectTravelPx > horizontalSpan * 0.005 ||
      subjectScaleChange > 0.01)
  )
    throw new Error("Camera exceeds the parallax movement envelope");
  if (behavior.lateralTrack)
    inspectLateralTrack(scene, {
      foreground: foregroundTravelPx,
      subject: subjectTravelPx,
      background: backgroundTravelPx,
    });
  if (
    behavior.foregroundReveal &&
    (foregroundTravelPx > horizontalSpan * 0.3 ||
      backgroundTravelPx > horizontalSpan * 0.06 ||
      subjectAnchorTravelPx > 0.01 ||
      subjectScaleChange > 0.001)
  )
    throw new Error("Camera exceeds the foreground reveal movement envelope");
  const scaleChange = (id: string) => {
    const node = scene.nodes.find((node) => node.id === id)!;
    return (
      Math.max(
        projectCinematicNode(scene, node, 0).scale,
        projectCinematicNode(scene, node, scene.timeline.frameCount - 1).scale,
      ) - 1
    );
  };
  const nearScales = [
    scene.recipe.foreground,
    ...(axial ? [scene.recipe.foregroundRight!] : []),
  ].map(scaleChange);
  const foregroundScaleChange = Math.max(...nearScales);
  const backgroundScaleChange = scaleChange(scene.recipe.background);
  let backgroundScaleReduction: number | undefined;
  if (behavior.dollyZoom) {
    const last = scene.timeline.frameCount - 1;
    const startBackground = projectCinematicNode(scene, plate, 0);
    const endBackground = projectCinematicNode(scene, plate, last);
    backgroundScaleReduction = 1 - endBackground.scale / startBackground.scale;
    const subjectDepth = scene.layers.find(
      (layer) => layer.node === subject.id,
    )!.depth;
    const nearDisplacement = Math.max(
      ...scene.layers
        .filter((layer) => layer.depth < subjectDepth)
        .map((layer) => {
          const node = scene.nodes.find((item) => item.id === layer.node)!;
          const initial = projectCinematicNode(scene, node, 0);
          return Math.max(
            ...Array.from({ length: scene.timeline.frameCount }, (_, frame) => {
              const p = projectCinematicNode(scene, node, frame);
              return Math.max(
                Math.abs(p.left - initial.left),
                Math.abs(p.left + p.width - (initial.left + initial.width)),
              );
            }),
          );
        }),
    );
    if (subjectScaleChange > 0.01 || subjectAnchorTravelPx > 0.01)
      throw new Error(
        "Dolly zoom must hold the protected subject size and anchor",
      );
    if (backgroundScaleReduction < 0.03 || backgroundScaleReduction > 0.06)
      throw new Error("Dolly zoom distant scale change must be 3–6%");
    if (nearDisplacement > scene.width * 0.03)
      throw new Error("Dolly zoom near displacement exceeds 3% of frame width");
  }
  if (axial) {
    const minimumNear =
      scene.recipe.intensity === "dramatic"
        ? 0.2
        : scene.recipe.intensity === "standard"
          ? 0.1
          : 0.05;
    if (
      Math.min(...nearScales) < minimumNear ||
      Math.min(...nearScales) < subjectScaleChange * 2 ||
      subjectScaleChange < 0.02 ||
      backgroundScaleChange > subjectScaleChange * 0.6
    )
      throw new Error(
        "Insufficient threshold scale separation between doorway, subject and distance",
      );
    if (
      foregroundScaleChange > 0.5 ||
      subjectScaleChange > 0.15 ||
      backgroundScaleChange > 0.06 ||
      subjectAnchorTravelPx > 0.01
    )
      throw new Error("Camera exceeds the threshold push movement envelope");
  }
  return CameraValidationSchema.parse({
    ...(pullback ? inspectDetailScale(scene) : {}),
    checkedFrames: scene.timeline.frameCount,
    minimumCoverageMargin,
    foregroundTravelPx,
    backgroundTravelPx,
    subjectTravelPx,
    subjectScaleChange,
    subjectAnchorTravelPx,
    foregroundScaleChange,
    foregroundVerticalTravelPx,
    backgroundVerticalTravelPx,
    backgroundScaleChange,
    ...(backgroundScaleReduction === undefined
      ? {}
      : { backgroundScaleReduction }),
    sourcePixelsPerOutputPixel,
  });
}

export function compileCinematicScene(
  input: CinematicScene,
): CinematicRenderScene {
  const source =
    input.format === "vertical" ? reframeCinematicForVertical(input) : input;
  const frameCount = (source.fps * source.durationMs) / 1000;
  const behavior = PRESET_BEHAVIORS[source.recipe.preset];
  const profile = cameraProfile(source);
  const x = source.camera.travel[0] * profile.horizontalStrength;
  const y = source.camera.travel[1] * profile.verticalStrength;
  const pushStrength =
    source.recipe.intensity === "dramatic"
      ? 1
      : source.recipe.intensity === "standard"
        ? 0.65
        : 0.4;
  const z = behavior.dollyZoom
    ? source.camera.push! *
      (source.recipe.intensity === "dramatic"
        ? 1.12
        : source.recipe.intensity === "standard"
          ? 1
          : 0.88)
    : behavior.axial || behavior.curvedPath
      ? source.camera.push! * pushStrength
      : 0;
  const startZ = behavior.pullback
    ? source.camera.pullback! *
      (source.recipe.intensity === "dramatic"
        ? 1
        : source.recipe.intensity === "standard"
          ? 0.75
          : 0.5)
    : 0;
  if (source.layers.some((layer) => layer.depth - Math.max(startZ, z) < 0.1))
    throw new Error("Camera crosses a depth plane");
  const depth = new Map(
    source.layers.map((layer) => [layer.node, layer.depth]),
  );
  const subjectDepth = depth.get(source.recipe.subject)!;
  // Keep focal / (subjectDepth - z) constant throughout the axial move.
  const key = (frame: number, x: number, y: number, z = 0): CameraKey => ({
    frame,
    x,
    y,
    z,
    focal: behavior.dollyZoom ? (subjectDepth - z) / subjectDepth : 1,
  });
  const scene: CompiledCamera = {
    ...source,
    nodes: [...source.nodes].sort(
      (a, b) => depth.get(b.id)! - depth.get(a.id)!,
    ),
    rendererVersion: behavior.dollyZoom
      ? DOLLY_ZOOM_RENDERER_VERSION
      : source.format === "vertical"
        ? VERTICAL_CINEMATIC_RENDERER_VERSION
        : source.effectsVersion
          ? "cinematic-canvas-0.9.0"
          : CINEMATIC_RENDERER_VERSION,
    canvas: { width: source.width, height: source.height },
    timeline: { frameCount, fps: source.fps, durationMs: source.durationMs },
    cameraFrames: [
      key(0, 0, 0, startZ),
      key(Math.round((frameCount - 1) * profile.start), 0, 0, startZ),
      key(Math.round((frameCount - 1) * profile.end), x, y, z),
      key(frameCount - 1, x, y, z),
    ],
  };
  return { ...scene, cameraValidation: inspectCamera(scene) };
}

/** Resolve and validate a prepared cinematic variant before writing it for export. */
export function resolveCinematicFormat(
  input: CinematicScene,
  format: OutputFormat,
): CinematicScene {
  if (format === "landscape") {
    if (input.format === "vertical")
      passageError(
        "invalid-format-source",
        "A resolved vertical cinematic scene cannot supply the landscape base",
      );
    return input;
  }
  const parsed = CinematicSceneSchema.safeParse(
    input.format === "vertical"
      ? input
      : {
          ...structuredClone(input),
          format: "vertical",
          ...OUTPUT_FORMATS.vertical,
        },
  );
  if (!parsed.success) throw new PassageError(passageDiagnostics(parsed.error));
  try {
    compileCinematicScene(parsed.data);
  } catch (error) {
    if (error instanceof PassageError) throw error;
    passageError(
      "cinematic-reframe-failed",
      error instanceof Error ? error.message : String(error),
    );
  }
  return parsed.data;
}
