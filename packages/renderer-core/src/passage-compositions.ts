import {
  validateComposition,
  PassageCompositionBindingsSchema,
  resolvePropertyPath,
  isResolvedProperty,
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
    validateNarrativeBindings(beat, composition);
    resolved[id] = composition;
  }
  return resolved;
}

function validateNarrativeBindings(
  beat: CompiledStoryPassage["beats"][number],
  composition: Composition,
) {
  const fail = (message: string) =>
    passageError("comp-passage-binding", message, {
      beat: beat.id,
      path: `compositions.${beat.id}.metadata.passage`,
    });
  const parsed = PassageCompositionBindingsSchema.safeParse(
    composition.metadata?.passage ?? {},
  );
  if (!parsed.success) fail(parsed.error.issues[0]!.message);
  const bindings = parsed.data!;
  if (
    ("actions" in beat && beat.actions?.length) ||
    ("poseTracks" in beat && Object.keys(beat.poseTracks ?? {}).length) ||
    ("propTracks" in beat && Object.keys(beat.propTracks ?? {}).length)
  )
    fail(
      "Native picture beats require authored actions/poses/props; legacy acting tracks are unavailable",
    );
  const markers = new Map(
    composition.markers?.map((marker) => [marker.id, marker]),
  );
  for (const cue of beat.cues ?? []) {
    const marker = markers.get(bindings.cueMarkers[cue.id]!);
    if (!marker || marker.frame !== cue.frame)
      fail(`Cue ${cue.id} requires a mapped root marker at frame ${cue.frame}`);
    for (const event of cue.windows) {
      const marker = markers.get(bindings.eventMarkers[event.cue]!);
      if (
        !marker ||
        marker.frame !== event.start ||
        (marker.duration ?? 0) !== event.end - event.start
      )
        fail(
          `Event ${event.cue} requires a mapped marker matching its narration-linked window`,
        );
    }
  }
  const subjects = new Set([
    ...(beat.focus ?? []),
    ...(beat.evidence ? [beat.evidence.node] : []),
  ]);
  for (const subject of subjects) {
    const path = bindings.subjectLayers[subject];
    const target = path
      ? resolvePropertyPath(composition, `${path}.opacity`)
      : undefined;
    if (!target || !isResolvedProperty(target) || !target.layer)
      fail(
        `Subject ${subject} requires a mapped native layer or precomp instance path`,
      );
    if (
      subject === beat.evidence?.node &&
      target &&
      isResolvedProperty(target) &&
      (target.layer?.type !== "text" ||
        target.layer.text !== beat.evidence.qualification)
    )
      fail(
        `Evidence ${subject} requires native text matching its qualification`,
      );
  }
  for (const key of Object.keys(bindings.cueMarkers))
    if (!beat.cues?.some((cue) => cue.id === key))
      fail(`Unknown narrative cue ${key}`);
  const events = new Set(
    beat.cues?.flatMap((cue) => cue.windows.map((event) => event.cue)),
  );
  for (const key of Object.keys(bindings.eventMarkers))
    if (!events.has(key)) fail(`Unknown narration-linked event ${key}`);
  for (const key of Object.keys(bindings.subjectLayers))
    if (!subjects.has(key)) fail(`Unknown narrative subject ${key}`);
}
