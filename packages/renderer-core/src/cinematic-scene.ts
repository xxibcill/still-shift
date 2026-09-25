import type { CinematicScene } from "../../scene-contract/src/cinematic.ts";
import { CameraValidationSchema } from "../../scene-contract/src/cinematic.ts";
import type { PreparedImage } from "../../scene-contract/src/prepared.ts";

export const CINEMATIC_RENDERER_VERSION = "cinematic-canvas-0.8.0";

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

function cameraProfile(scene: CinematicScene) {
  const profile = motionProfile(scene.recipe.intensity);
  if (scene.recipe.preset === "focus_handoff")
    return {
      ...profile,
      horizontalStrength:
        scene.recipe.intensity === "dramatic"
          ? 4
          : scene.recipe.intensity === "standard"
            ? 3
            : 2,
      start: 0.04,
      end: 0.65,
    };
  if (scene.recipe.preset === "detail_to_world")
    return { ...profile, start: 0.06, end: 0.82 };
  if (["rising_vista", "curved_approach"].includes(scene.recipe.preset)) {
    const strength =
      scene.recipe.intensity === "dramatic"
        ? 1
        : scene.recipe.intensity === "standard"
          ? 0.75
          : 0.5;
    return {
      ...profile,
      horizontalStrength: 3 * strength,
      verticalStrength:
        (scene.recipe.preset === "rising_vista" ? 5 : 3) * strength,
      start: 0.04,
      end: 0.92,
      maximumVerticalTravel: 0.25,
    };
  }
  if (scene.recipe.preset === "foreground_reveal") {
    const intensity = scene.recipe.intensity;
    return {
      ...profile,
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
    };
  }
  if (scene.recipe.preset !== "lateral_track") return profile;
  return {
    ...profile,
    horizontalStrength:
      scene.recipe.intensity === "dramatic"
        ? 5
        : scene.recipe.intensity === "standard"
          ? 3
          : 2,
    start: 0.02,
    end: 0.94,
  };
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
  rendererVersion: typeof CINEMATIC_RENDERER_VERSION;
  canvas: { width: number; height: number };
  timeline: { fps: number; durationMs: number; frameCount: number };
  cameraFrames: CameraKey[];
};
export type CinematicRenderScene = CompiledCamera & {
  cameraValidation: ReturnType<typeof CameraValidationSchema.parse>;
};

/** Layer-local focus approximation; the returned sigma is in output pixels. */
export function sampleCinematicBlur(
  scene: CompiledCamera,
  nodeId: string,
  frame: number,
) {
  if (
    !Number.isInteger(frame) ||
    frame < 0 ||
    frame >= scene.timeline.frameCount
  )
    throw new Error("Frame index outside cinematic timeline");
  if (scene.recipe.preset !== "focus_handoff") return 0;
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
    !Number.isInteger(frame) ||
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
      const eased =
        scene.recipe.preset === "lateral_track"
          ? trackProgress(p)
          : scene.recipe.intensity === "dramatic"
            ? p * p * (6 - 8 * p + 3 * p * p)
            : p * p * (3 - 2 * p);
      if (scene.recipe.preset === "curved_approach" && i === 2) {
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
  const tracking =
    scene.recipe.preset === "lateral_track" ||
    scene.recipe.preset === "rising_vista";
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
  const intensity = scene.recipe.intensity;
  const minimumNear =
    intensity === "dramatic" ? 0.15 : intensity === "standard" ? 0.08 : 0.04;
  const maximumNear =
    intensity === "dramatic" ? 0.3 : intensity === "standard" ? 0.18 : 0.12;
  const maximumSubject =
    intensity === "dramatic" ? 0.12 : intensity === "standard" ? 0.08 : 0.06;
  if (
    travel.foreground < scene.width * minimumNear ||
    travel.background < scene.width * 0.003 ||
    travel.foreground < travel.subject * 2 ||
    travel.subject < travel.background * 2
  )
    throw new Error(
      "Insufficient lateral track separation between foreground, subject and distance",
    );
  if (
    travel.foreground > scene.width * maximumNear ||
    travel.subject > scene.width * maximumSubject ||
    travel.background > scene.width * 0.05
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
    const padding =
      scene.recipe.preset === "focus_handoff"
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
  const axial = scene.recipe.preset === "threshold_push";
  const pullback = scene.recipe.preset === "detail_to_world";
  const focus = scene.recipe.preset === "focus_handoff";
  const anchoredParallax = scene.recipe.preset === "layered_parallax";
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
    if (pullback || focus) inspectSubjectVisibility(scene, frame);
    const projected = projectCinematicNode(scene, plate, frame);
    const left = projected.left + painted[0] * projected.scale;
    const top = projected.top + painted[1] * projected.scale;
    const right = left + painted[2] * projected.scale;
    const bottom = top + painted[3] * projected.scale;
    const margin = Math.min(
      -left,
      -top,
      right - scene.width,
      bottom - scene.height,
    );
    if (margin < -0.001)
      throw new Error(`Background coverage fails at frame ${frame}`);
    if (focus && margin < 3 * sampleCinematicBlur(scene, plate.id, frame))
      throw new Error(`Background blur coverage fails at frame ${frame}`);
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
          throw new Error(
            `Authored cut edge ${node.id}:${edge} enters the frame at frame ${frame}`,
          );
      if (focus) {
        const padding = 3 * sampleCinematicBlur(scene, node.id, frame);
        for (const edge of layer.edgeAttachments ?? [])
          if (edgeMargins[edge] < padding)
            throw new Error(
              `Focus blur cut edge ${node.id}:${edge} enters the frame at frame ${frame}`,
            );
        if (
          Math.abs(p.left - node.x) > scene.width * 0.01 ||
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
        scene.recipe.preset !== "curved_approach" &&
        Math.abs(p.top - node.y) > scene.height * profile.maximumVerticalTravel
      )
        throw new Error(
          `Camera exceeds the vertical parallax envelope at frame ${frame}`,
        );
      if (
        scene.recipe.preset === "curved_approach" &&
        (Math.abs(p.left - node.x) > scene.width * 0.3 ||
          Math.abs(p.top - node.y) > scene.height * 0.25 ||
          p.scale > 1.5)
      )
        throw new Error(
          `Camera exceeds the curved approach envelope at frame ${frame}`,
        );
      if (
        pullback &&
        (Math.abs(p.left - node.x) > scene.width * 0.65 ||
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
        throw new Error(
          `Source resolution requires more than 1.5x upscaling for ${node.id} at frame ${frame}`,
        );
      sourcePixelsPerOutputPixel = Math.min(
        sourcePixelsPerOutputPixel,
        density,
      );
      if (!layer.protectedRegion) continue;
      for (const [x, y] of layer.protectedRegion) {
        const px = p.left + x * p.scale,
          py = p.top + y * p.scale;
        if (
          px < scene.width * 0.1 ||
          px > scene.width * 0.9 ||
          py < scene.height * 0.1 ||
          py > scene.height * 0.9
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
  if (scene.recipe.preset === "rising_vista") {
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
    scene.recipe.preset === "curved_approach" &&
    (subjectScaleChange < 0.005 ||
      subjectScaleChange > 0.12 ||
      subjectAnchorTravelPx > 0.01)
  )
    throw new Error("Camera exceeds the curved approach subject envelope");
  const minimumNear = scene.width * profile.minimumForegroundTravel;
  if (
    anchoredParallax &&
    (foregroundTravelPx < minimumNear ||
      backgroundTravelPx < scene.width * 0.0015 ||
      foregroundTravelPx < backgroundTravelPx * 2)
  )
    throw new Error(
      "Insufficient visible parallax separation; choose more distinct depths or camera travel",
    );
  if (
    anchoredParallax &&
    (foregroundTravelPx > scene.width * profile.maximumForegroundTravel ||
      backgroundTravelPx > scene.width * profile.maximumBackgroundTravel ||
      subjectTravelPx > scene.width * 0.005 ||
      subjectScaleChange > 0.01)
  )
    throw new Error("Camera exceeds the parallax movement envelope");
  if (scene.recipe.preset === "lateral_track")
    inspectLateralTrack(scene, {
      foreground: foregroundTravelPx,
      subject: subjectTravelPx,
      background: backgroundTravelPx,
    });
  if (
    scene.recipe.preset === "foreground_reveal" &&
    (foregroundTravelPx > scene.width * 0.3 ||
      backgroundTravelPx > scene.width * 0.06 ||
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
    sourcePixelsPerOutputPixel,
  });
}

export function compileCinematicScene(
  input: CinematicScene,
): CinematicRenderScene {
  const frameCount = (input.fps * input.durationMs) / 1000;
  const profile = cameraProfile(input);
  const x = input.camera.travel[0] * profile.horizontalStrength;
  const y = input.camera.travel[1] * profile.verticalStrength;
  const pushStrength =
    input.recipe.intensity === "dramatic"
      ? 1
      : input.recipe.intensity === "standard"
        ? 0.65
        : 0.4;
  const z =
    input.recipe.preset === "threshold_push" ||
    input.recipe.preset === "curved_approach"
      ? input.camera.push! * pushStrength
      : 0;
  const startZ =
    input.recipe.preset === "detail_to_world"
      ? input.camera.pullback! *
        (input.recipe.intensity === "dramatic"
          ? 1
          : input.recipe.intensity === "standard"
            ? 0.75
            : 0.5)
      : 0;
  if (input.layers.some((layer) => layer.depth - Math.max(startZ, z) < 0.1))
    throw new Error("Camera crosses a depth plane");
  const key = (frame: number, x: number, y: number, z = 0): CameraKey => ({
    frame,
    x,
    y,
    z,
    focal: 1,
  });
  const depth = new Map(input.layers.map((layer) => [layer.node, layer.depth]));
  const scene: CompiledCamera = {
    ...input,
    nodes: [...input.nodes].sort((a, b) => depth.get(b.id)! - depth.get(a.id)!),
    rendererVersion: CINEMATIC_RENDERER_VERSION,
    canvas: { width: input.width, height: input.height },
    timeline: { frameCount, fps: input.fps, durationMs: input.durationMs },
    cameraFrames: [
      key(0, 0, 0, startZ),
      key(Math.round((frameCount - 1) * profile.start), 0, 0, startZ),
      key(Math.round((frameCount - 1) * profile.end), x, y, z),
      key(frameCount - 1, x, y, z),
    ],
  };
  return { ...scene, cameraValidation: inspectCamera(scene) };
}
