import type { CommerceRenderScene } from "./commerce-scene.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import type { CinematicRenderScene } from "./cinematic-scene.ts";
import { exposureFrames, isEffectActive } from "./commerce-effect-motion.ts";
import { componentStateCuts } from "./component-state.ts";
import { componentVisibilityCuts } from "./component-visibility.ts";

type ExposureScene =
  | CommerceRenderScene
  | StoryRenderScene
  | CinematicRenderScene;

/** Reachable source clocks for preparation and compilation, including raw echo history. */
export function sourceExposureTimeline(
  scene: ExposureScene,
  window: readonly [number, number] = [0, scene.timeline.frameCount],
) {
  const frameCount = scene.timeline.frameCount;
  const componentScene = {
    componentData: "componentData" in scene ? scene.componentData : undefined,
  };
  const blur = scene.effects?.find((effect) => effect.type === "motion-blur");
  const cuts = [
    ...new Set([
      0,
      frameCount,
      ...componentStateCuts(componentScene),
      ...componentVisibilityCuts(componentScene),
      ...("visibility" in scene ? (scene.visibility ?? []) : []).flatMap(
        (gate) => [gate.start, gate.end],
      ),
      ...(scene.effects ?? []).flatMap((effect) =>
        effect.active ? [effect.active.start, effect.active.end] : [],
      ),
    ]),
  ].sort((a, b) => a - b);
  const times = new Set<number>();
  for (let frame = window[0]; frame < window[1]; frame++) {
    times.add(frame);
    if (!blur?.shutterAngle || !isEffectActive(blur, frame)) continue;
    const lower = Math.max(...cuts.filter((cut) => cut <= frame));
    const upper = Math.min(...cuts.filter((cut) => cut > frame));
    for (const time of exposureFrames(
      frame,
      frameCount,
      blur.shutterAngle,
      blur.samples,
    ))
      times.add(Math.max(lower, Math.min(upper - 1e-7, time)));
  }
  const current = [...times];
  for (const effect of scene.effects ?? []) {
    if (effect.type !== "echo") continue;
    for (const time of current)
      if (isEffectActive(effect, time))
        for (let i = 1; i <= effect.count; i++)
          times.add(Math.max(0, time - i * effect.spacing));
  }
  return { blur, cuts, times: [...times].sort((a, b) => a - b) };
}
