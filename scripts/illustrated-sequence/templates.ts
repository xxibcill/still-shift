import {
  StoryTemplateSchema,
  StoryAuthoringPlanSchema,
} from "../../packages/scene-contract/src/story-authoring.ts";
import {
  StorySceneSchema,
  type StoryScene,
} from "../../packages/scene-contract/src/story.ts";
import type { PreparedNode } from "../../packages/scene-contract/src/prepared.ts";

type Dependencies = Pick<StoryScene, "assets" | "fonts">;
type Image = Extract<PreparedNode, { type: "image" }>;
const image = (
  id: string,
  asset: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Image => ({
  id,
  type: "image",
  parent: "world",
  x,
  y,
  width,
  height,
  opacity: 1,
  rotation: 0,
  origin: [0.5, 0.5],
  fit: "contain",
  states: [{ asset }],
});

function worldNodes(restricted: boolean): PreparedNode[] {
  return [
    {
      id: "world",
      type: "group",
      width: 1920,
      height: 1080,
      x: 0,
      y: 0,
      opacity: 1,
      rotation: 0,
      origin: [0, 0],
      clip: false,
    },
    image("household", "house", 100, 390, 540, 396),
    image("resource", "store", 1320, 360, 500, 433),
    {
      ...image("access", "access-open", 610, 555, 760, 228),
      states: [{ asset: "access-open" }, { asset: "access-restricted" }],
    },
    {
      ...image(
        "pressure-top",
        "pressure",
        875,
        restricted ? 518 : 280,
        228,
        152,
      ),
      opacity: restricted ? 1 : 0,
    },
    {
      ...image(
        "pressure-bottom",
        "pressure",
        875,
        restricted ? 668 : 910,
        228,
        152,
      ),
      rotation: 180,
      opacity: restricted ? 1 : 0,
    },
  ];
}

function caption(
  text: string,
  x: number,
  y: number,
  width: number,
): PreparedNode {
  return {
    id: "caption",
    type: "text",
    text,
    x,
    y,
    width: 0,
    height: 0,
    opacity: 1,
    rotation: 0,
    origin: [0, 0],
    font: "serif",
    fontAsset: "display",
    fontSize: 72,
    color: "#211F1B",
    weight: "normal",
    align: "left",
    textLayout: { width, height: 200, lineHeight: 1.18, overflow: "error" },
  };
}

function baseScene(
  dependencies: Dependencies,
  frameCount: number,
  title: string,
): StoryScene {
  return StorySceneSchema.parse({
    ...dependencies,
    schemaVersion: "story-scene-1",
    title,
    fps: 24,
    frameCount,
    width: 1920,
    height: 1080,
    background: "#E8DFC9",
    motionGrammar: "v2",
    motionModel: "curves-1",
    authoringVersion: "1",
    nodes: worldNodes(false),
    recipe: { preset: "generic", moves: [], emphasis: [] },
    provenance:
      "Original symbolic dependency demonstration. No measured quantities or documented historical event. Artwork lineage: assets/illustrated-sequence/README.md.",
  });
}

function camera(
  scene: StoryScene,
  start: [number, number, number],
  end: [number, number, number],
) {
  scene.camera = {
    keys: [
      { frame: 0, x: start[0], y: start[1], zoom: start[2] },
      { frame: scene.frameCount - 1, x: end[0], y: end[1], zoom: end[2] },
    ],
    depth: { world: 1, caption: 0 },
    easeIn: false,
    easeOut: false,
  };
}

function template(id: string, scene: StoryScene) {
  return StoryTemplateSchema.parse({
    schemaVersion: "story-template-1",
    id,
    scene,
    slots: {
      caption: { kind: "text", node: "caption" },
      householdArt: { kind: "asset", asset: "house" },
      resourceArt: { kind: "asset", asset: "store" },
      beforeArt: { kind: "asset", asset: "access-open" },
      afterArt: { kind: "asset", asset: "access-restricted" },
      pressureArt: { kind: "asset", asset: "pressure" },
    },
  });
}

export function detailReveal(dependencies: Dependencies) {
  const scene = baseScene(dependencies, 192, "Detail reveal");
  scene.nodes.push(caption("A household depends\non access.", 160, 120, 1000));
  camera(scene, [880, 520, 1], [1070, 625, 1.14]);
  scene.nodes.find((node) => node.id === "access")!.x = 562;
  scene.recipe.entrances = [
    {
      node: "access",
      verb: "fade",
      window: { start: 24, end: 60, cue: "route-visible" },
    },
  ];
  scene.recipe.moves = [
    {
      node: "access",
      window: { start: 24, end: 96, cue: "route-reveals", easing: "out-cubic" },
      to: { x: 610 },
    },
  ];
  const result = template("detail-reveal", scene);
  result.slots.revealTiming = {
    kind: "timing",
    event: "route-reveals",
    required: false,
  };
  return result;
}

export function actionStateChange(dependencies: Dependencies) {
  const scene = baseScene(dependencies, 240, "Action and state change");
  scene.nodes.push(caption("Access narrows.", 150, 140, 1180));
  for (const node of scene.nodes)
    if (node.id === "pressure-top" || node.id === "pressure-bottom")
      node.opacity = 1;
  camera(scene, [990, 665, 1.85], [960, 642, 2.01]);
  scene.recipe.entrances = [
    {
      node: "pressure-top",
      verb: "fade",
      window: { start: 24, end: 48, cue: "pressure-visible" },
    },
    {
      node: "pressure-bottom",
      verb: "fade",
      window: { start: 24, end: 48, cue: "opposition-visible" },
    },
    {
      node: "caption",
      verb: "fade",
      window: {
        start: 108,
        end: 132,
        cue: "consequence-appears",
        role: "response",
      },
    },
  ];
  scene.recipe.moves = [
    {
      node: "pressure-top",
      window: {
        start: 48,
        end: 96,
        cue: "pressure-arrives",
        easing: "in-out-cubic",
      },
      to: { y: 518 },
    },
    {
      node: "pressure-bottom",
      window: {
        start: 48,
        end: 96,
        cue: "opposition-arrives",
        easing: "in-out-cubic",
      },
      to: { y: 668 },
    },
  ];
  scene.componentData = {
    schemaVersion: "scene-components-2",
    annotations: [],
    values: [],
    bindings: [],
    travels: [],
    states: [
      {
        id: "access-condition",
        target: "access",
        initial: 0,
        cuts: [{ id: "access-changes", frame: 96, state: 1 }],
      },
    ],
  };
  const result = template("action-state-change", scene);
  result.slots.changeTiming = {
    kind: "timing",
    event: "access-changes",
    required: false,
  };
  return result;
}

export function reactionConsequence(dependencies: Dependencies) {
  const scene = baseScene(dependencies, 288, "Reaction and consequence");
  scene.nodes = worldNodes(true);
  scene.nodes.push(
    caption("The grain remains.\nAccess has changed.", 1080, 115, 760),
  );
  camera(scene, [1180, 590, 1.18], [910, 565, 1.02]);
  scene.recipe.entrances = [
    {
      node: "caption",
      verb: "fade",
      window: {
        start: 24,
        end: 48,
        cue: "consequence-appears",
        role: "response",
      },
    },
  ];
  scene.componentData = {
    schemaVersion: "scene-components-2",
    annotations: [],
    values: [],
    bindings: [],
    travels: [],
    states: [
      {
        id: "access-condition",
        target: "access",
        initial: 1,
        cuts: [{ id: "changed-context", frame: 0, state: 1 }],
      },
    ],
  };
  return template("reaction-consequence", scene);
}

export function accessStory() {
  return StoryAuthoringPlanSchema.parse({
    schemaVersion: "story-passage-2",
    id: "illustrated-access-story",
    title: "Access changes · an illustrated sequence",
    styleProfile: {
      schemaVersion: "story-style-1",
      id: "layered-chronicle-sequence",
      safeInset: 80,
    },
    contentPolicy: "general",
    fps: 24,
    sourceStartFrame: 0,
    beats: [
      {
        id: "detail",
        template: "detail-reveal.json",
        purpose: "explain-relationships",
        frameCount: 192,
        takeaway: "The household depends on a connection to the grain.",
        focus: ["household", "access", "resource"],
        intensity: "develop",
        cues: [
          {
            id: "connection",
            phrase: "Access links household and resource.",
            frame: 24,
            events: ["route-reveals"],
          },
        ],
        bindings: {
          "route-reveals": {
            anchor: { type: "cue", id: "connection" },
            duration: 72,
          },
          "route-visible": {
            anchor: { type: "event", id: "route-reveals", edge: "start" },
            duration: 36,
          },
        },
      },
      {
        id: "action",
        template: "action-state-change.json",
        purpose: "show-change",
        frameCount: 240,
        takeaway:
          "Pressure constrains the route while leaving a connection open.",
        focus: ["access", "pressure-top", "pressure-bottom"],
        intensity: "peak",
        cues: [
          {
            id: "restriction",
            phrase: "Access becomes restricted.",
            frame: 96,
            events: ["access-changes"],
          },
        ],
        bindings: {
          "access-changes": {
            anchor: { type: "cue", id: "restriction" },
            duration: 0,
          },
          "pressure-arrives": {
            anchor: { type: "cue", id: "restriction" },
            offset: -48,
            duration: 48,
          },
          "opposition-arrives": {
            anchor: { type: "event", id: "pressure-arrives", edge: "start" },
            duration: 48,
          },
          "pressure-visible": {
            anchor: { type: "event", id: "pressure-arrives", edge: "start" },
            offset: -24,
            duration: 24,
          },
          "opposition-visible": {
            anchor: { type: "event", id: "pressure-visible", edge: "start" },
            duration: 24,
          },
          "consequence-appears": {
            anchor: { type: "event", id: "access-changes", edge: "end" },
            offset: 12,
            duration: 24,
          },
        },
        handoff: { mode: "cut", camera: "reset", subjects: [] },
      },
      {
        id: "consequence",
        template: "reaction-consequence.json",
        purpose: "resolve",
        frameCount: 288,
        takeaway:
          "The resource is unchanged; the household's access is different.",
        focus: ["resource", "access", "household"],
        intensity: "quiet",
        cues: [
          {
            id: "consequence",
            phrase: "The grain remains; reaching it has changed.",
            frame: 24,
            events: ["consequence-appears"],
          },
        ],
        bindings: {
          "consequence-appears": {
            anchor: { type: "cue", id: "consequence" },
            duration: 24,
          },
        },
        handoff: { mode: "cut", camera: "reset", subjects: [] },
      },
    ],
  });
}
