import { z } from "zod";
import {
  StorySceneSchema,
  type StoryScene,
} from "../../scene-contract/src/story.ts";
import { PreparedSceneFieldsSchema } from "../../scene-contract/src/prepared.ts";
import {
  StoryTemplateSchema,
  SlotPoseSchema,
  SlotRelationshipSchema,
  SlotTimingSchema,
  type StoryTemplate,
  type StoryStyle,
} from "../../scene-contract/src/story-authoring.ts";
import { retimeStoryEvents, indexStoryEvents } from "./story-event-index.ts";
import { passageError } from "./passage-diagnostics.ts";

export type PassageTemplate = StoryScene | StoryTemplate;
export function parsePassageTemplate(input: unknown): PassageTemplate {
  return input &&
    typeof input === "object" &&
    "schemaVersion" in input &&
    input.schemaVersion === "story-template-1"
    ? StoryTemplateSchema.parse(input)
    : StorySceneSchema.parse(input);
}
export const templateScene = (input: PassageTemplate) =>
  input.schemaVersion === "story-template-1" ? input.scene : input;

function resolveTemplateSlot(
  scene: StoryScene,
  id: string,
  slot: StoryTemplate["slots"][string],
  events: Set<string>,
): (value: unknown) => void {
  const invalidTarget = (): never =>
    passageError(
      "invalid-slot",
      "Template slot has an incompatible target: " + id,
      { path: "slots." + id },
    );

  switch (slot.kind) {
    case "text": {
      const node = scene.nodes.find((node) => node.id === slot.node);
      if (node?.type !== "text" || node.states) return invalidTarget();
      return (value) => {
        node.text = z.string().trim().min(1).parse(value);
      };
    }
    case "subject": {
      const node = scene.nodes.find((node) => node.id === slot.node);
      if (!node) return invalidTarget();
      return (value) => {
        Object.assign(node, SlotPoseSchema.parse(value));
      };
    }
    case "asset": {
      const asset = scene.assets.find((asset) => asset.id === slot.asset);
      if (!asset) return invalidTarget();
      return (value) => {
        const replacement =
          PreparedSceneFieldsSchema.shape.assets.element.parse(value);
        Object.assign(asset, replacement, { id: slot.asset });
      };
    }
    case "relationship": {
      const connector = scene.connectors.find(
        (connector) => connector.path === slot.path,
      );
      if (!connector) return invalidTarget();
      return (value) => {
        Object.assign(connector, SlotRelationshipSchema.parse(value));
      };
    }
    case "timing": {
      if (!events.has(slot.event)) return invalidTarget();
      return (value) => {
        retimeStoryEvents(
          scene,
          [],
          {},
          { [slot.event]: SlotTimingSchema.parse(value) },
        );
      };
    }
  }
}

export function instantiateStoryTemplate(
  input: PassageTemplate,
  parameters: Record<string, unknown>,
  style?: StoryStyle,
) {
  const scene = structuredClone(templateScene(input));
  if (
    !style &&
    !Object.keys(parameters).length &&
    input.schemaVersion !== "story-template-1"
  )
    return scene;
  scene.authoringVersion = "1";
  const slotApplications = new Map<string, (value: unknown) => void>();
  if (input.schemaVersion === "story-template-1") {
    const events = new Set(indexStoryEvents(scene).map((event) => event.id));
    for (const [id, slot] of Object.entries(input.slots)) {
      slotApplications.set(id, resolveTemplateSlot(scene, id, slot, events));
      if (slot.required && !(id in parameters))
        passageError("missing-parameter", "Missing template parameter: " + id, {
          path: "parameters." + id,
        });
    }
    for (const [id, role] of Object.entries(input.textRoles)) {
      const node = scene.nodes.find((n) => n.id === id);
      if (node?.type !== "text")
        passageError(
          "invalid-text-role",
          "Text role must reference a text node: " + id,
          { node: id },
        );
      node.textRole = role;
    }
    for (const [id, layout] of Object.entries(input.textLayout)) {
      const node = scene.nodes.find((n) => n.id === id);
      if (node?.type !== "text")
        passageError(
          "invalid-text-layout",
          "Text layout must reference a text node: " + id,
          { node: id },
        );
      node.textLayout = { ...layout };
    }
  }
  if (style) {
    if (style.background) scene.background = style.background;
    if (style.safeInset !== undefined) scene.safeInset = style.safeInset;
    for (const node of scene.nodes) {
      for (const key of ["color", "fill", "stroke"] as const) {
        if (key in node) {
          const values = node as unknown as Record<string, unknown>;
          const value = values[key];
          if (typeof value === "string" && style.colors[value])
            values[key] = style.colors[value];
        }
      }
      if (node.type === "path" && style.lineWidth !== undefined)
        node.lineWidth = style.lineWidth;
      if (node.type === "text") {
        if (node.textRole) Object.assign(node, style.text?.[node.textRole]);
        if (node.textLayout && style.lineHeight !== undefined)
          node.textLayout.lineHeight = style.lineHeight;
      }
    }
    if (style.easing) {
      const setDefault = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        const record = value as Record<string, unknown>;
        if (
          typeof record.start === "number" &&
          typeof record.end === "number" &&
          !record.easing
        )
          record.easing = style.easing;
        Object.values(record).forEach(setDefault);
      };
      setDefault(scene.recipe);
      setDefault(scene.flows);
    }
  }
  for (const [id, value] of Object.entries(parameters)) {
    const apply = slotApplications.get(id);
    if (!apply)
      passageError("unknown-parameter", "Unknown template parameter: " + id, {
        path: "parameters." + id,
      });
    apply(value);
  }
  for (const node of scene.nodes) {
    if (node.type !== "text") continue;
    if (node.textLayout && !node.fontAsset)
      passageError(
        "unpinned-layout-font",
        "Measured text layout requires a pinned font",
        { node: node.id },
      );
    if (node.fontAsset && !scene.fonts?.some((f) => f.id === node.fontAsset))
      passageError("missing-font", "Unknown font: " + node.fontAsset, {
        node: node.id,
      });
    if (node.textLayout && node.parent)
      passageError(
        "nested-text-layout",
        "Safe-area text layout currently requires a root text node",
        { node: node.id },
      );
  }
  indexStoryEvents(scene);
  return scene;
}
