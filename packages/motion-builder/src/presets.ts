import type {
  CompositionLayer,
  TextEvent,
  NumericMotionProperty,
} from "@still-shift/scene-contract";
import type { Duration } from "./timeline.ts";
import type { Motion } from "./properties.ts";
import { recordSource, sourceLocation, type SourceLocation } from "./source.ts";
export type IntentOwner = { id: string; draft: CompositionLayer };
export type MotionPresetName =
  | "settle"
  | "press"
  | "recoil"
  | "handoff"
  | "breathe"
  | "draw-on"
  | "land";
export type MotionPresetOptions = {
  amount?: number;
  property?: NumericMotionProperty;
};
export type TextPresetOptions = Partial<
  Pick<
    TextEvent,
    | "span"
    | "manner"
    | "color"
    | "amount"
    | "replacement"
    | "id"
    | "signal"
    | "layer"
    | "blend"
  >
> & { target?: string | { id: string } };
export type IntentCommand = {
  owner: IntentOwner;
  intent: MotionPresetName | `text-${TextEvent["verb"]}`;
  options: MotionPresetOptions | TextPresetOptions;
  location: SourceLocation;
};
function motion(intent: MotionPresetName, defaultDuration = 24) {
  return (
    owner: IntentOwner,
    duration: Duration = defaultDuration,
    options: MotionPresetOptions = {},
  ): Motion => {
    const location = sourceLocation();
    return recordSource<Motion>(
      {
        kind: "clip",
        duration,
        value: { owner, intent, options: structuredClone(options), location },
      },
      location,
    );
  };
}
function text(verb: TextEvent["verb"]) {
  return (
    owner: IntentOwner,
    duration: Duration = 24,
    options: TextPresetOptions = {},
  ): Motion => {
    const location = sourceLocation();
    const { target, ...fields } = options;
    return recordSource<Motion>(
      {
        kind: "clip",
        duration,
        value: {
          owner,
          intent: `text-${verb}`,
          options: {
            ...structuredClone(fields),
            ...(target === undefined
              ? {}
              : {
                  target: typeof target === "string" ? target : target.id,
                }),
          },
          location,
        },
      },
      location,
    );
  };
}
/** Plain recipes emit native signals, drivers, periodic motion and text fields. */
export const presets = {
  settle: motion("settle"),
  press: motion("press"),
  recoil: motion("recoil"),
  handoff: motion("handoff"),
  breathe: motion("breathe", 48),
  drawOn: (owner: IntentOwner, duration: Duration = 24): Motion =>
    motion("draw-on")(owner, duration),
  land: motion("land"),
  text: {
    reveal: text("reveal"),
    emphasize: text("emphasize"),
    correct: text("correct"),
    qualify: text("qualify"),
    retype: text("retype"),
    count: text("count"),
    redact: text("redact"),
    release: text("release"),
  },
};
