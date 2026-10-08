import {
  fallback2DScene,
  resolvePreviewScene,
  resolveDepthPreviewPreset,
  type PreviewPreset,
  type PreviewScene,
} from "@still-shift/renderer-core";

export type DepthReferenceFixture = {
  id: string;
  scene: PreviewScene;
  source: string;
  depth: string | null;
  width: number;
  height: number;
  requestedPreset: PreviewPreset | "auto";
  depthWidth?: number;
  depthHeight?: number;
};

/** Dedicated Q7 references; the 176 frozen CE0 family references are independent. */
export function depthReferenceFixtures(): DepthReferenceFixture[] {
  const presets: PreviewPreset[] = [
    "slow_push",
    "horizontal_drift",
    "cinematic_float",
    "locked_hold",
    "story_settle",
    "panel_reveal",
    "comparison_step",
  ];
  const result: DepthReferenceFixture[] = [];
  for (const vertical of [false, true])
    for (const preset of presets) {
      const scene = resolvePreviewScene({
        sourceWidth: 1600,
        sourceHeight: 900,
        depthWidth: 1600,
        depthHeight: 900,
        canvasWidth: vertical ? 1080 : 1920,
        canvasHeight: vertical ? 1920 : 1080,
        durationMs: 3000,
        fps: 30,
        preset,
        intensity: "standard",
        seed: 19,
        ...(vertical ? { focus: [0.62, 0.48] as [number, number] } : {}),
      });
      result.push({
        id: `${vertical ? "vertical" : "landscape"}-${preset}`,
        scene,
        source: "source.svg",
        depth: scene.motion.mode === "depth" ? "depth.svg" : null,
        width: vertical ? 360 : 640,
        height: vertical ? 640 : 360,
        requestedPreset: preset,
      });
    }
  const base = result[0]!;
  for (const reason of [
    "DEPTH_RANGE_FLAT",
    "DEPTH_PREPARATION_FAILED",
  ] as const)
    result.push({
      ...base,
      id: `fallback-${reason.toLowerCase()}`,
      scene: fallback2DScene(base.scene, reason),
      depth: reason === "DEPTH_RANGE_FLAT" ? "flat-depth.svg" : null,
    });
  result.push({ ...base, id: "discontinuous-depth", depth: "edge-depth.svg" });
  return result;
}

/** Additional pre-migration references preserve the original 17-case manifest. */
export function extendedDepthReferenceFixtures(
  normalizedSourceHash: string,
): DepthReferenceFixture[] {
  const base = depthReferenceFixtures()[0]!;
  const choices = new Map<PreviewPreset, number>();
  for (let seed = 0; seed < 64; seed++) {
    const preset = resolveDepthPreviewPreset(
      "auto",
      seed,
      1920,
      1080,
      normalizedSourceHash,
    );
    if (!choices.has(preset)) choices.set(preset, seed);
  }
  const result: DepthReferenceFixture[] = [...choices].map(
    ([preset, seed]) => ({
      ...base,
      id: `auto-landscape-${preset}`,
      requestedPreset: "auto",
      scene: resolvePreviewScene({
        sourceWidth: 1600,
        sourceHeight: 900,
        depthWidth: 1600,
        depthHeight: 900,
        canvasWidth: 1920,
        canvasHeight: 1080,
        durationMs: 3000,
        fps: 30,
        preset,
        intensity: "standard",
        seed,
      }),
    }),
  );
  result.push({
    ...base,
    id: "auto-vertical-protected-focus",
    width: 360,
    height: 640,
    requestedPreset: "auto",
    scene: resolvePreviewScene({
      sourceWidth: 1600,
      sourceHeight: 900,
      depthWidth: 1600,
      depthHeight: 900,
      canvasWidth: 1080,
      canvasHeight: 1920,
      durationMs: 3000,
      fps: 30,
      preset: resolveDepthPreviewPreset(
        "auto",
        37,
        1080,
        1920,
        normalizedSourceHash,
      ),
      intensity: "standard",
      seed: 37,
      focus: [0.16, 0.48],
    }),
  });
  result.push({
    ...base,
    id: "transparent-source-opaque-compatibility",
    source: "source-transparent.svg",
  });
  result.push({
    ...base,
    id: "prepared-depth-half-resolution",
    depth: "depth-half.svg",
    depthWidth: 800,
    depthHeight: 450,
  });
  return result;
}
