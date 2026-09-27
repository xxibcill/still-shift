import type {
  ComponentSceneData,
  ComponentState,
} from "../../scene-contract/src/component-data.ts";
import { componentCapabilities } from "./component-capabilities.ts";

export function sampleComponentState(schedule: ComponentState, frame: number) {
  if (!Number.isFinite(frame))
    throw new Error("State sample requires a finite frame");
  let index = schedule.initial;
  for (const cut of schedule.cuts) {
    if (frame < cut.frame) break;
    index = cut.state;
  }
  return index;
}
export function applyComponentState(
  scene: ComponentSceneData,
  id: string,
  frame: number,
  state: { state: number },
) {
  if (!scene.componentData) return;
  const schedule = componentCapabilities(scene.componentData).states.find(
    (s) => s.target === id,
  );
  if (schedule) state.state = sampleComponentState(schedule, frame);
}
export function componentStateCuts(
  scene: Pick<ComponentSceneData, "componentData">,
): number[] {
  return componentCapabilities(scene.componentData).states.flatMap((s) =>
    s.cuts.map((c) => c.frame),
  );
}
export function validateStateOwnership(
  scene: ComponentSceneData & {
    tracks: Record<string, Partial<Record<string, unknown[]>>>;
    textFits?: { target: string }[] | undefined;
  },
) {
  const features = componentCapabilities(scene.componentData);
  for (const schedule of features.states) {
    if (
      scene.tracks[schedule.target]?.state?.length ||
      features.bindings.some(
        (b) => b.target === schedule.target && b.kind === "text",
      ) ||
      scene.textFits?.some((f) => f.target === schedule.target)
    )
      throw new Error(
        "Conflicting component state ownership: " + schedule.target,
      );
  }
}
