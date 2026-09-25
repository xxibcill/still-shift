import type { CinematicScene } from "../../scene-contract/src/cinematic.ts";
import { CameraValidationSchema } from "../../scene-contract/src/cinematic.ts";
import type { PreparedImage } from "../../scene-contract/src/prepared.ts";

export const CINEMATIC_RENDERER_VERSION = "cinematic-canvas-0.2.0";

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
        scene.recipe.intensity === "dramatic"
          ? p * p * (6 - 8 * p + 3 * p * p)
          : p * p * (3 - 2 * p);
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
  return {
    left: projected.x + anchorX - anchor.x,
    top: projected.y + anchorY - anchor.y,
    scale: projected.scale,
    width: node.width * projected.scale,
    height: node.height * projected.scale,
  };
}

function inspectCamera(scene: CompiledCamera) {
  const profile = motionProfile(scene.recipe.intensity);
  let minimumCoverageMargin = Infinity,
    subjectTravelPx = 0,
    subjectScaleChange = 0;
  const subject = scene.nodes.find((node) => node.id === scene.recipe.subject)!;
  const plate = scene.nodes.find(
    (node) => node.id === scene.recipe.background,
  )!;
  const painted = scene.layers.find(
    (layer) => layer.node === plate.id,
  )!.paintedBounds!;
  for (let frame = 0; frame < scene.timeline.frameCount; frame++) {
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
      if (
        Math.abs(p.top - node.y) >
        scene.height * profile.maximumVerticalTravel
      )
        throw new Error(
          `Camera exceeds the vertical parallax envelope at frame ${frame}`,
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
  }
  const travel = (id: string) => {
    const node = scene.nodes.find((item) => item.id === id)!;
    const end = projectCinematicNode(
      scene,
      node,
      scene.timeline.frameCount - 1,
    );
    return Math.abs(end.left - node.x);
  };
  const foregroundTravelPx = travel(scene.recipe.foreground),
    backgroundTravelPx = travel(scene.recipe.background);
  const minimumNear = scene.width * profile.minimumForegroundTravel;
  if (
    foregroundTravelPx < minimumNear ||
    backgroundTravelPx < scene.width * 0.0015 ||
    foregroundTravelPx < backgroundTravelPx * 2
  )
    throw new Error(
      "Insufficient visible parallax separation; choose more distinct depths or camera travel",
    );
  if (
    foregroundTravelPx > scene.width * profile.maximumForegroundTravel ||
    backgroundTravelPx > scene.width * profile.maximumBackgroundTravel ||
    subjectTravelPx > scene.width * 0.005 ||
    subjectScaleChange > 0.01
  )
    throw new Error("Camera exceeds the parallax movement envelope");
  const sourcePixelsPerOutputPixel = Math.min(
    ...scene.nodes.map((node) => {
      const state = node.states[0]!;
      const asset = scene.assets.find((item) => item.id === state.asset)!;
      return Math.min(
        (state.crop?.[2] ?? asset.width) / node.width,
        (state.crop?.[3] ?? asset.height) / node.height,
      );
    }),
  );
  if (sourcePixelsPerOutputPixel < 2 / 3)
    throw new Error("Source resolution requires more than 1.5x upscaling");
  return CameraValidationSchema.parse({
    checkedFrames: scene.timeline.frameCount,
    minimumCoverageMargin,
    foregroundTravelPx,
    backgroundTravelPx,
    subjectTravelPx,
    subjectScaleChange,
    sourcePixelsPerOutputPixel,
  });
}

export function compileCinematicScene(
  input: CinematicScene,
): CinematicRenderScene {
  const frameCount = (input.fps * input.durationMs) / 1000;
  const profile = motionProfile(input.recipe.intensity);
  const x = input.camera.travel[0] * profile.horizontalStrength;
  const y = input.camera.travel[1] * profile.verticalStrength;
  const key = (frame: number, x: number, y: number): CameraKey => ({
    frame,
    x,
    y,
    z: 0,
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
      key(0, 0, 0),
      key(Math.round((frameCount - 1) * profile.start), 0, 0),
      key(Math.round((frameCount - 1) * profile.end), x, y),
      key(frameCount - 1, x, y),
    ],
  };
  return { ...scene, cameraValidation: inspectCamera(scene) };
}
