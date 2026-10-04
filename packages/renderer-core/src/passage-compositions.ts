import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { passageError, PassageError } from "./passage-diagnostics.ts";
import type { CompiledStoryPassage } from "./story-passage.ts";

export type PassageCompositions = Readonly<Record<string, Composition>>;

/** Picture overrides use the same final frame interval as their resolved story beat. */
export function validatePassageCompositions(
  passage: Pick<CompiledStoryPassage, "beats">,
  compositions: PassageCompositions = {},
): Record<string, Composition> {
  if (Object.keys(compositions).length > 400)
    passageError("comp-passage-limit", "At most 400 native beat compositions", {
      path: "compositions",
    });
  const resolved: Record<string, Composition> = Object.create(null);
  for (const [id, input] of Object.entries(compositions)) {
    const beat = passage.beats.find((beat) => beat.id === id);
    if (!beat)
      passageError("comp-passage-beat", `Unknown beat ${id}`, {
        path: `compositions.${id}`,
        beat: id,
      });
    const result = validateComposition(input);
    if (!result.ok)
      throw new PassageError(
        result.diagnostics.map((diagnostic) => ({ ...diagnostic, beat: id })),
      );
    const composition = result.composition;
    if (
      composition.width !== beat.scene.width ||
      composition.height !== beat.scene.height ||
      composition.fps !== beat.scene.fps ||
      composition.frameCount !== beat.scene.frameCount
    )
      passageError(
        "comp-passage-timing",
        `Composition ${composition.id} must match ${id}'s dimensions, fps and final source frame count (${beat.scene.frameCount}, including outgoing handoff frames)`,
        { path: `compositions.${id}`, beat: id },
      );
    // Native clocks are authored explicitly. Never carry surrogate story transforms across this seam.
    const index = passage.beats.indexOf(beat);
    for (const boundary of [passage.beats[index], passage.beats[index + 1]])
      if (
        boundary &&
        "handoff" in boundary &&
        (boundary.handoff.camera === "carry" ||
          boundary.handoff.subjects.some((subject) => subject.mode === "carry"))
      )
        passageError(
          "comp-passage-handoff",
          "Native beat boundaries require authored transforms; camera/subject carry is unavailable",
          { path: `compositions.${id}`, beat: id },
        );
    resolved[id] = composition;
  }
  return resolved;
}
