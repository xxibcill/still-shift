import {
  validateComposition,
  PassageCompositionBindingsSchema,
  resolvePropertyPath,
  isResolvedProperty,
  type Composition,
  type SoundtrackProject,
} from "@still-shift/scene-contract";
import { passageError, PassageError } from "./passage-diagnostics.ts";
export { passageError, PassageError } from "./passage-diagnostics.ts";
import type { CompiledStoryPassage } from "./story-passage.ts";
import { evaluateComp } from "./composition/evaluate/evaluate.ts";
import type { EvaluatedLayerTree } from "./composition/evaluate/types.ts";

export type PassageCompositions = Readonly<Record<string, Composition>>;

/** Picture overrides use the same final frame interval as their resolved story beat. */
export function validatePassageCompositions(
  passage: Pick<CompiledStoryPassage, "beats"> &
    Partial<Pick<CompiledStoryPassage, "audio">>,
  compositions: PassageCompositions = {},
  soundtrack?: Pick<SoundtrackProject, "clips">,
): Record<string, Composition> {
  if (Object.keys(compositions).length > 400)
    passageError("comp-passage-limit", "At most 400 native beat compositions", {
      path: "compositions",
    });
  const resolved: Record<string, Composition> = Object.create(null);
  const sounds = [
    ...(passage.audio?.sounds ?? []),
    ...(soundtrack?.clips.flatMap((clip) =>
      clip.anchor
        ? [
            {
              id: clip.id,
              beat: clip.anchor.beat,
              anchor: clip.anchor.reference,
            },
          ]
        : [],
    ) ?? []),
  ];
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
    validateNarrativeBindings(
      beat,
      composition,
      passage.beats[index + 1],
      sounds.filter((sound) => sound.beat === id),
    );
    resolved[id] = composition;
  }
  return resolved;
}

function validateNarrativeBindings(
  beat: CompiledStoryPassage["beats"][number],
  composition: Composition,
  nextBeat: CompiledStoryPassage["beats"][number] | undefined,
  sounds: Pick<
    NonNullable<CompiledStoryPassage["audio"]>["sounds"][number],
    "id" | "anchor"
  >[],
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
  // Template event timing never reaches a native picture implicitly; sounds need its own markers.
  const soundEvents = new Set<string>();
  for (const sound of sounds) {
    if (sound.anchor.type !== "event") continue;
    const id = sound.anchor.id;
    soundEvents.add(id);
    const event = beat.events?.find((candidate) => candidate.id === id);
    const marker = markers.get(bindings.eventMarkers[id]!);
    if (
      !event ||
      !marker ||
      marker.frame !== event.start ||
      (marker.duration ?? 0) !== event.end - event.start
    )
      passageError(
        "comp-passage-binding",
        `Sound ${sound.id} requires a mapped native marker matching event ${id}`,
        {
          beat: beat.id,
          event: id,
          path: `compositions.${beat.id}.metadata.passage.eventMarkers`,
        },
      );
  }
  const incoming = "handoff" in beat ? beat.handoff.subjects : [];
  const outgoing =
    nextBeat && "handoff" in nextBeat ? nextBeat.handoff.subjects : [];
  const subjects = new Set([
    ...(beat.focus ?? []),
    ...(beat.evidence ? [beat.evidence.node] : []),
    ...incoming.flatMap((subject) => (subject.to ? [subject.to] : [])),
    ...outgoing.flatMap((subject) => (subject.from ? [subject.from] : [])),
  ]);
  for (const subject of subjects) {
    const path = bindings.subjectLayers[subject];
    const target = path
      ? resolvePropertyPath(composition, `${path}.opacity`)
      : undefined;
    const layer =
      target && isResolvedProperty(target) ? target.layer : undefined;
    if (!layer)
      fail(
        `Subject ${subject} requires a mapped native layer or precomp instance path`,
      );
    if (
      subject === beat.evidence?.node &&
      (layer?.type !== "text" ||
        layer.text !== beat.evidence.qualification ||
        layer.states?.some((text) => text !== beat.evidence!.qualification) ||
        layer.corrections?.some(
          (correction) =>
            correction.span !== undefined ||
            correction.replacement !== beat.evidence!.qualification,
        ))
    )
      fail(
        `Evidence ${subject} requires native text matching its qualification`,
      );
  }
  for (const key of Object.keys(bindings.cueMarkers))
    if (!beat.cues?.some((cue) => cue.id === key))
      fail(`Unknown narrative cue ${key}`);
  const events = new Set([
    ...(beat.events?.map((event) => event.id) ?? []),
    ...(beat.cues?.flatMap((cue) => cue.windows.map((event) => event.cue)) ??
      []),
    ...soundEvents,
  ]);
  for (const key of Object.keys(bindings.eventMarkers))
    if (!events.has(key)) fail(`Unknown narrative event ${key}`);
  for (const key of Object.keys(bindings.subjectLayers))
    if (!subjects.has(key)) fail(`Unknown narrative subject ${key}`);
  validateNativeBoundaries(
    composition,
    bindings.subjectLayers,
    [
      ...incoming
        .filter((subject) => subject.mode === "enter")
        .map((subject) => ({
          subject: subject.to!,
          frame: 0,
          mode: "enter" as const,
        })),
      ...outgoing
        .filter((subject) => subject.mode === "exit")
        .map((subject) => ({
          subject: subject.from!,
          frame: beat.frameCount - 1,
          mode: "exit" as const,
        })),
    ],
    beat.id,
  );
}

function nativeSubjectVisible(tree: EvaluatedLayerTree, path: string): boolean {
  const [id, ...nested] = path.split("/");
  const state = tree.layers.find((layer) => layer.id === id);
  if (!state?.visible || state.opacity === 0) return false;
  return nested.length
    ? !!state.precomp && nativeSubjectVisible(state.precomp, nested.join("/"))
    : true;
}

function validateNativeBoundaries(
  composition: Composition,
  subjects: Record<string, string>,
  boundaries: { subject: string; frame: number; mode: "enter" | "exit" }[],
  beat: string,
) {
  const frames = new Map<number, EvaluatedLayerTree>();
  for (const boundary of boundaries) {
    let tree = frames.get(boundary.frame);
    if (!tree) {
      tree = evaluateComp(composition, boundary.frame);
      frames.set(boundary.frame, tree);
    }
    const path = subjects[boundary.subject]!;
    if (nativeSubjectVisible(tree, path))
      passageError(
        boundary.mode === "enter" ? "invalid-entry" : "invalid-exit",
        boundary.mode === "enter"
          ? "An entering native subject must begin invisible"
          : "An exiting native subject must finish invisible",
        {
          beat,
          node: boundary.subject,
          frame: boundary.frame,
          path: `compositions.${beat}.metadata.passage.subjectLayers.${boundary.subject}`,
        },
      );
  }
}
