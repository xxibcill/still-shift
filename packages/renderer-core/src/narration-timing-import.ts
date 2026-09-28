import {
  StoryAuthoringPlanSchema,
  type PassagePlan,
} from "../../scene-contract/src/story-authoring.ts";
import {
  NarrationTimingSchema,
  type NarrationTiming,
} from "../../scene-contract/src/narration-timing.ts";
import {
  findNarrationPhrase,
  narrationTimingEntries,
} from "./narration-timing.ts";

export type NarrationImportOptions = {
  mode: "match" | "add";
  reference: string;
  sha256: string;
  durationSeconds: number;
};
export type NarrationCueChange = {
  beat: string;
  id: string;
  phrase: string;
  frame: number;
  previousFrame?: number;
};

/** Propose an explicit edit; the passage compiler still validates all affected bindings. */
export function importNarrationTiming(
  input: PassagePlan,
  source: NarrationTiming,
  options: NarrationImportOptions,
) {
  if (input.schemaVersion !== "story-passage-2")
    throw new Error(
      "Enable linked authoring before importing narration timing",
    );
  if (options.mode !== "match" && options.mode !== "add")
    throw new Error("Choose match or add for narration import");
  const timing = NarrationTimingSchema.parse(source);
  const plan = structuredClone(input);
  const endFrame =
    plan.sourceStartFrame +
    plan.beats.reduce((total, beat) => total + beat.frameCount, 0);
  if (
    !Number.isFinite(options.durationSeconds) ||
    options.durationSeconds < endFrame / plan.fps
  )
    throw new Error(
      "Narration must cover the passage's complete source interval; adjust beat lengths or supply a longer audio file",
    );
  if (timing.segments.some((s) => s.end > options.durationSeconds + 0.001))
    throw new Error("Timing extends beyond the narration audio");
  const changes: NarrationCueChange[] = [];
  const entries = narrationTimingEntries(timing);
  let beatStart = plan.sourceStartFrame;
  for (const beat of plan.beats) {
    const localFrame = (seconds: number) =>
      Math.round(seconds * plan.fps) - beatStart;
    const inBeat = (seconds: number) =>
      localFrame(seconds) >= 0 && localFrame(seconds) < beat.frameCount;
    if (options.mode === "match") {
      for (const cue of beat.cues) {
        const matches = findNarrationPhrase(timing, cue.phrase).filter((s) =>
          inBeat(s.start),
        );
        if (!matches.length)
          throw new Error(
            `No timing match for ${beat.id}/${cue.id}: ${cue.phrase}. Match the phrase within this beat; SRT requires a complete subtitle.`,
          );
        if (matches.length !== 1)
          throw new Error(
            `Timing is ambiguous for ${beat.id}/${cue.id}. Use a longer unique phrase.`,
          );
        const frame = localFrame(matches[0]!.start);
        changes.push({
          beat: beat.id,
          id: cue.id,
          phrase: cue.phrase,
          frame,
          previousFrame: cue.frame,
        });
        cue.frame = frame;
      }
    } else {
      entries.forEach((entry, index) => {
        if (!inBeat(entry.start)) return;
        const id = `narration-${index + 1}`;
        if (beat.cues.some((cue) => cue.id === id))
          throw new Error(
            `Cue ${id} already exists in ${beat.id}; use Match existing cue phrases to retime it`,
          );
        const frame = localFrame(entry.start);
        beat.cues.push({ id, phrase: entry.text, frame, events: [] });
        changes.push({ beat: beat.id, id, phrase: entry.text, frame });
      });
    }
    beatStart += beat.frameCount;
  }
  if (!changes.length)
    throw new Error(
      options.mode === "match"
        ? "There are no existing cues to match. Choose Add transcript cues."
        : "No transcript cues start inside the passage's source interval",
    );
  plan.narration = {
    reference: options.reference,
    sha256: options.sha256,
    timing,
  };
  return {
    plan: StoryAuthoringPlanSchema.parse(plan),
    changes,
    granularity: timing.granularity,
  };
}
