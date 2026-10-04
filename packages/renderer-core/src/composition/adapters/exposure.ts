import {
  COMPOSITION_LIMITS,
  type Composition,
} from "@still-shift/scene-contract";
import type { StoryRenderScene } from "../../story-scene.ts";
import type { CommerceRenderScene } from "../../commerce-scene.ts";
import { sourceExposureTimeline } from "../../commerce-exposure.ts";
import { componentCapabilities } from "../../component-capabilities.ts";
import { evaluatePreparedNodeAtTime } from "../../prepared-scene.ts";
import { passageError } from "../../passage-diagnostics.ts";

/** Compile every reachable shutter/history time once; rendering uses only native data. */
export function compileFamilyExposure(
  scene: CommerceRenderScene | StoryRenderScene,
):
  | {
      times: number[];
      motionBlur: NonNullable<Composition["motionBlur"]>;
    }
  | undefined {
  const blur = scene.effects?.find((effect) => effect.type === "motion-blur");
  if (!blur || !blur.shutterAngle) return undefined;
  const { cuts, times } = sourceExposureTimeline(scene);
  const components = componentCapabilities(scene.componentData);
  const canHold =
    scene.schemaVersion === "commerce-scene-1" &&
    !scene.motionModel &&
    !scene.mattes?.length &&
    !components.masks.length &&
    !scene.attachments?.length &&
    !scene.componentData?.annotations.length &&
    !scene.componentData?.bindings.some((binding) => binding.kind === "text") &&
    !scene.typography &&
    !scene.textAnimators?.length &&
    !scene.effects?.some((effect) =>
      [
        "light-sweep",
        "focus-blur",
        "echo",
        "grain",
        "particles",
        "background-light",
        "displacement",
      ].includes(effect.type),
    );
  let previous: string | undefined;
  const ordered = times.filter((time) => {
    if (!canHold) return true;
    const pose = JSON.stringify(
      scene.nodes.map((node) => evaluatePreparedNodeAtTime(scene, node, time)),
    );
    const changed = pose !== previous;
    previous = pose;
    return changed || time === scene.frameCount - 1;
  });
  if (ordered.length > COMPOSITION_LIMITS.maxKeys)
    passageError(
      "comp-adapter-limit",
      `Motion blur needs ${ordered.length} distinct samples; the bounded sample-clock limit is ${COMPOSITION_LIMITS.maxKeys}`,
      { path: "effects" },
    );
  return {
    times: ordered,
    motionBlur: {
      enabled: true,
      shutterAngle: blur.shutterAngle,
      shutterPhase: 0,
      samples: blur.samples,
      ...(blur.active
        ? { inPoint: blur.active.start, outPoint: blur.active.end }
        : {}),
      cuts: cuts.filter((cut) => cut < scene.frameCount),
    },
  };
}

export const compileCommerceExposure = compileFamilyExposure;
