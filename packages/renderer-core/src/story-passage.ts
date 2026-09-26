import {
  parsePassagePlan,
  type PassageBeat,
} from "../../scene-contract/src/story-authoring.ts";
import {
  instantiateStoryTemplate,
  type PassageTemplate,
} from "./story-template.ts";
import { indexStoryEvents, retimeStoryEvents } from "./story-event-index.ts";
import { applyStoryHandoff } from "./story-handoff.ts";
import {
  PassageError,
  passageDiagnostics,
  passageError,
} from "./passage-diagnostics.ts";
import { type StoryPurpose } from "../../scene-contract/src/story-passage.ts";
import {
  StorySceneSchema,
  type StoryScene,
} from "../../scene-contract/src/story.ts";
import { compileStoryScene } from "./story-scene.ts";
import { analyzeStoryQuality } from "./story-quality.ts";

export const PURPOSE_RECIPES = {
  compare: ["unequal_margins", "category_swap"],
  "explain-relationships": ["relationship_build"],
  "explain-access": ["access_constraint"],
  "qualify-evidence": ["evidence_boundary"],
  "show-change": ["dated_system_break", "category_swap"],
  resolve: ["motif_resolve"],
} as const satisfies Record<
  StoryPurpose,
  readonly StoryScene["recipe"]["preset"][]
>;

type CueWindow = { cue: string; start: number; end: number };

function eventWindows(value: unknown, windows = new Map<string, CueWindow>()) {
  if (!value || typeof value !== "object") return windows;
  if (
    "cue" in value &&
    "start" in value &&
    "end" in value &&
    typeof value.cue === "string"
  ) {
    if (windows.has(value.cue))
      throw new Error("Ambiguous event cue: " + value.cue);
    windows.set(value.cue, value as CueWindow);
  }
  for (const child of Object.values(value)) eventWindows(child, windows);
  return windows;
}

function applyBeat(beat: PassageBeat, template: StoryScene, start: number) {
  const scene = structuredClone(template);
  const supported: readonly string[] = PURPOSE_RECIPES[beat.purpose];
  if (!supported.includes(scene.recipe.preset))
    throw new Error(
      beat.id +
        ": recipe " +
        scene.recipe.preset +
        " cannot serve purpose " +
        beat.purpose,
    );
  scene.frameCount = beat.frameCount;
  scene.episodeStartFrame = start;
  const nodes = new Map(scene.nodes.map((node) => [node.id, node]));
  for (const [id, copy] of Object.entries(beat.copy)) {
    const node = nodes.get(id);
    if (node?.type !== "text")
      throw new Error(beat.id + ": copy must reference a text node: " + id);
    if (node.states)
      throw new Error(
        beat.id + ": edit stateful captions in the template: " + id,
      );
    node.text = copy;
  }
  for (const id of beat.focus)
    if (!nodes.has(id))
      throw new Error(beat.id + ": unknown focal subject " + id);
  if (beat.evidence) {
    const evidence = beat.evidence;
    const qualifier = nodes.get(beat.evidence.node);
    if (
      qualifier?.type !== "text" ||
      qualifier.text !== beat.evidence.qualification ||
      qualifier.states?.some((text) => text !== evidence.qualification)
    )
      throw new Error(
        beat.id + ": visible evidence qualification must match the plan",
      );
    scene.review ??= { essentialText: [] };
    if (!scene.review.essentialText.includes(beat.evidence.node))
      scene.review.essentialText.push(beat.evidence.node);
  }
  const windows = eventWindows(scene.recipe);
  for (const [id, timing] of Object.entries(
    "bindings" in beat ? {} : beat.timing,
  )) {
    const event = windows.get(id);
    if (!event) throw new Error(beat.id + ": unknown timing event " + id);
    Object.assign(event, timing);
  }
  if (scene.recipe.preset === "category_swap")
    windows.set("@swap", {
      cue: "@swap",
      start: scene.recipe.swapFrame,
      end: scene.recipe.swapFrame,
    });
  if (scene.recipe.preset === "dated_system_break" && scene.recipe.reset)
    windows.set("@reset", {
      cue: "@reset",
      start: scene.recipe.reset.atFrame,
      end: scene.recipe.reset.atFrame,
    });
  if ("bindings" in beat) {
    retimeStoryEvents(scene, beat.cues, beat.bindings, beat.timing);
    windows.clear();
    for (const event of indexStoryEvents(scene))
      windows.set(event.id, {
        cue: event.id,
        start: event.start,
        end: event.end,
      });
  }
  return { scene: StorySceneSchema.parse(scene), windows };
}

export function compileStoryPassage(
  input: unknown,
  templates: ReadonlyMap<string, PassageTemplate>,
) {
  const plan = parsePassagePlan(input);
  let previous: StoryScene | undefined;
  let localStart = 0;
  const beats = plan.beats.map((beat) => {
    try {
      const source = templates.get(beat.template);
      if (!source)
        passageError(
          "missing-template",
          beat.id + ": missing template " + beat.template,
        );
      const template = instantiateStoryTemplate(
        source,
        "parameters" in beat ? beat.parameters : {},
        plan.schemaVersion === "story-passage-2"
          ? plan.styleProfile
          : undefined,
      );
      if (!template)
        throw new Error(beat.id + ": missing template " + beat.template);
      if (template.fps !== plan.fps)
        throw new Error(
          beat.id + ": template fps must match the passage; retime explicitly",
        );
      const { scene, windows } = applyBeat(
        beat,
        template,
        plan.sourceStartFrame + localStart,
      );
      if ("handoff" in beat) applyStoryHandoff(scene, previous, beat.handoff);
      const validated = StorySceneSchema.parse(scene);
      Object.assign(scene, validated);
      previous = scene;
      const cues = beat.cues.map((cue) => ({
        ...cue,
        localFrame: localStart + cue.frame,
        masterFrame: plan.sourceStartFrame + localStart + cue.frame,
        windows: cue.events.map((id) => {
          const window = windows.get(id);
          if (!window)
            throw new Error(beat.id + ": unknown narration event " + id);
          return { ...window };
        }),
      }));
      const rendered = compileStoryScene(scene);
      const events = indexStoryEvents(scene).map((event) => ({
        ...event,
        nodes: [
          ...new Set([
            ...event.nodes,
            ...rendered.motionEvents
              .filter((motion) => motion.window.cue === event.id)
              .map((motion) => motion.node),
          ]),
        ],
      }));
      const nodeIds = new Set(scene.nodes.map((node) => node.id));
      const cueWarnings = cues.flatMap((cue) => {
        const nearest = cue.windows.reduce<
          (typeof cue.windows)[number] | undefined
        >(
          (best, window) =>
            !best ||
            Math.abs(window.start - cue.frame) <
              Math.abs(best.start - cue.frame)
              ? window
              : best,
          undefined,
        );
        if (!nearest) return [];
        const distance = Math.abs(nearest.start - cue.frame);
        return distance > 6
          ? [
              {
                event: nearest.cue,
                node: events
                  .find((event) => event.id === nearest.cue)
                  ?.nodes.find((id) => nodeIds.has(id)),
                frame: cue.frame,
                message:
                  "Cue " +
                  cue.id +
                  ": nearest bound event starts " +
                  distance +
                  " frames from the narration cue. Review the intended anticipation or delay.",
              },
            ]
          : [];
      });
      const quality = analyzeStoryQuality(rendered);
      const result = {
        ...beat,
        start: localStart,
        end: localStart + beat.frameCount,
        preset: scene.recipe.preset,
        scene,
        cues,
        cueWarnings,
        quality,
        events,
      };
      localStart += beat.frameCount;
      return result;
    } catch (error) {
      throw new PassageError(passageDiagnostics(error, beat.id));
    }
  });
  return {
    plan,
    beats,
    frameCount: localStart,
    endFrameExclusive: plan.sourceStartFrame + localStart,
    diagnostics: beats.flatMap((beat) => [
      ...beat.cueWarnings.map((note) => ({
        code: "cue-distance",
        severity: "warning" as const,
        beat: beat.id,
        event: note.event,
        ...(note.node ? { node: note.node } : {}),
        frame: note.frame,
        message: note.message,
      })),
      ...beat.quality.diagnostics.map((note) => ({
        code: note.code,
        severity: "warning" as const,
        beat: beat.id,
        ...(note.nodes[0] ? { node: note.nodes[0] } : {}),
        frame: note.frames[0],
        message: note.message,
      })),
    ]),
  };
}

export type CompiledStoryPassage = ReturnType<typeof compileStoryPassage>;

export function inspectStoryPassage(
  input: unknown,
  templates: ReadonlyMap<string, PassageTemplate>,
) {
  try {
    const passage = compileStoryPassage(input, templates);
    return { ok: true as const, passage, diagnostics: passage.diagnostics };
  } catch (error) {
    return { ok: false as const, diagnostics: passageDiagnostics(error) };
  }
}

export function locatePassageFrame(
  passage: CompiledStoryPassage,
  frame: number,
) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= passage.frameCount)
    throw new Error("Frame outside passage");
  const beat = passage.beats.find(
    (beat) => frame >= beat.start && frame < beat.end,
  )!;
  return {
    beat,
    frame: frame - beat.start,
    sourceFrame: passage.plan.sourceStartFrame + frame,
  };
}
