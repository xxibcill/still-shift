import type {
  IntentPresets,
  PeriodicMotion,
} from "../../scene-contract/src/motion-craft.ts";
import type { StoryMove } from "../../scene-contract/src/story.ts";

/** Serializable intent recipes; values are multiples of the author's amount. */
export const STORY_MOTION_PRESETS = {
  version: "story-motion-presets-1",
  settle: {
    layer: "response",
    keys: [
      [0, 0],
      [0.35, 1],
      [1, 0],
    ],
  },
  press: {
    layer: "action",
    keys: [
      [0, 0],
      [1, 1],
    ],
  },
  recoil: {
    layer: "response",
    keys: [
      [0, 0],
      [0.3, -1],
      [1, 0],
    ],
  },
  handoff: {
    layer: "action",
    keys: [
      [0, 0],
      [1, 1],
    ],
  },
  breathe: { layer: "carrier", generator: "oscillate" },
  "draw-on": {
    layer: "action",
    keys: [
      [0, 0],
      [1, 1],
    ],
  },
  land: {
    layer: "action",
    keys: [
      [0, -1],
      [1, 0],
    ],
  },
} as const;
export function expandMotionIntents(input?: IntentPresets) {
  const moves: StoryMove[] = [],
    periodic: PeriodicMotion[] = [];
  for (const motion of input?.motions ?? []) {
    const { node, window, preset } = motion,
      amount = motion.amount ?? 20;
    if (preset.startsWith("text-")) continue;
    if (preset === "breathe") {
      periodic.push({
        node,
        property: motion.property ?? "y",
        start: window.start,
        end: window.end,
        layer: "carrier",
        blend: "add",
        oscillate: {
          period: window.end - window.start,
          amplitude: motion.amount ?? 2,
        },
        ...(window.cue ? { cue: window.cue } : {}),
      });
      continue;
    }
    const definition =
        STORY_MOTION_PRESETS[
          preset as Exclude<
            keyof typeof STORY_MOTION_PRESETS,
            "version" | "breathe"
          >
        ],
      property = preset === "draw-on" ? "reveal" : (motion.property ?? "y");
    const keys = definition.keys.map(([at, value], i, all) => ({
      frame: window.start + Math.round((window.end - window.start) * at),
      [property]: value * (preset === "draw-on" ? 1 : amount),
      easing: "in-out-cubic" as const,
      ...(i > 0 && i < all.length - 1 ? { smooth: true } : {}),
    }));
    moves.push({
      node,
      layer: definition.layer,
      blend: preset === "draw-on" ? "replace" : "add",
      keys,
    });
  }
  return { moves, periodic };
}

export const TEXT_INTENT_PRESETS = [
  { preset: "text-reveal", label: "Reveal text" },
  { preset: "text-emphasize", label: "Emphasize on spoken word" },
  { preset: "text-correct", label: "Correct a claim" },
  { preset: "text-qualify", label: "Add qualification" },
  { preset: "text-retype", label: "Retype" },
  { preset: "text-count", label: "Count" },
  { preset: "text-redact", label: "Redact" },
  { preset: "text-release", label: "Release emphasis" },
] as const;
