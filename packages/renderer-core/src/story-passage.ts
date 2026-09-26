import {
  StoryPassagePlanSchema,
  type StoryBeat,
  type StoryPurpose,
} from "../../scene-contract/src/story-passage.ts";
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

function applyBeat(beat: StoryBeat, template: StoryScene, start: number) {
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
  const qualifier = nodes.get(beat.evidence.node);
  if (
    qualifier?.type !== "text" ||
    qualifier.text !== beat.evidence.qualification ||
    qualifier.states?.some((text) => text !== beat.evidence.qualification)
  )
    throw new Error(
      beat.id + ": visible evidence qualification must match the plan",
    );
  scene.review ??= { essentialText: [] };
  if (!scene.review.essentialText.includes(beat.evidence.node))
    scene.review.essentialText.push(beat.evidence.node);
  const windows = eventWindows(scene.recipe);
  for (const [id, timing] of Object.entries(beat.timing)) {
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
  return { scene: StorySceneSchema.parse(scene), windows };
}

export function compileStoryPassage(
  input: unknown,
  templates: ReadonlyMap<string, StoryScene>,
) {
  const plan = StoryPassagePlanSchema.parse(input);
  let localStart = 0;
  const beats = plan.beats.map((beat) => {
    const template = templates.get(beat.template);
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
    const cueWarnings = cues.flatMap((cue) => {
      const distance = Math.min(
        ...cue.windows.map((window) => Math.abs(window.start - cue.frame)),
      );
      return distance > 6
        ? [
            {
              cue: cue.id,
              message:
                "Nearest bound event starts " +
                distance +
                " frames from the narration cue. Review the intended anticipation or delay.",
            },
          ]
        : [];
    });
    const quality = analyzeStoryQuality(compileStoryScene(scene));
    const result = {
      ...beat,
      start: localStart,
      end: localStart + beat.frameCount,
      preset: scene.recipe.preset,
      scene,
      cues,
      cueWarnings,
      quality,
    };
    localStart += beat.frameCount;
    return result;
  });
  return {
    plan,
    beats,
    frameCount: localStart,
    endFrameExclusive: plan.sourceStartFrame + localStart,
  };
}

export type CompiledStoryPassage = ReturnType<typeof compileStoryPassage>;
