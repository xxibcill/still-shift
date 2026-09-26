import {
  mergeCommerceFragments,
  validateCommerceClock,
  type CommerceClock,
  type CommerceFragment,
} from "./commerce-composition.ts";
export function timeWindow(
  clock: CommerceClock,
  fragment: CommerceFragment,
  start: number,
  duration: number,
): CommerceFragment {
  validateCommerceClock(clock);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(duration) ||
    start < 0 ||
    duration < 1 ||
    start + duration > clock.frameCount
  )
    throw new Error("Sequence window must fit the timeline");
  for (const event of fragment.events ?? [])
    if (event.end >= duration)
      throw new Error("Local event exceeds sequence duration");
  const visibility = (fragment.nodes ?? [])
    .filter((n) => !n.parent)
    .map((node) => {
      const local = fragment.visibility?.find((v) => v.target === node.id);
      if (local && (local.start >= local.end || local.end > duration))
        throw new Error("Local visibility exceeds sequence duration");
      return {
        target: node.id,
        start: start + (local?.start ?? 0),
        end: start + (local?.end ?? duration),
      };
    });
  const effects = (fragment.effects ?? []).map((effect) => {
    if (effect.type === "motion-blur")
      throw new Error(
        "Exposure belongs to the complete scene; add motion blur after sequencing",
      );
    if ("start" in effect && effect.end >= duration)
      throw new Error("Local effect exceeds sequence duration");
    if (
      effect.active &&
      (effect.active.end > duration || effect.active.end <= effect.active.start)
    )
      throw new Error("Local effect scope exceeds sequence duration");
    return {
      ...effect,
      ...("start" in effect
        ? { start: effect.start + start, end: effect.end + start }
        : {}),
      active: {
        start: start + (effect.active?.start ?? 0),
        end: start + (effect.active?.end ?? duration),
      },
    };
  });
  return {
    ...fragment,
    events: (fragment.events ?? []).map((e) => ({
      ...e,
      start: e.start + start,
      end: e.end + start,
    })),
    effects,
    visibility,
  };
}
export function sequenceCommerceFragments(
  clock: CommerceClock,
  clips: { fragment: CommerceFragment; start?: number; duration: number }[],
): CommerceFragment {
  let cursor = 0;
  return mergeCommerceFragments(
    clock,
    clips.map((clip) => {
      const start = clip.start ?? cursor;
      cursor = start + clip.duration;
      return timeWindow(clock, clip.fragment, start, clip.duration);
    }),
  );
}
