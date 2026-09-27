import {
  ComponentDataSchema,
  type ComponentData,
} from "../../scene-contract/src/component-data.ts";

const rank: Record<ComponentData["schemaVersion"], number> = {
  "scene-components-1": 1,
  "scene-components-2": 2,
  "scene-components-3": 3,
};

/** Expose supported fields without making every consumer decode the schema version. */
export function componentCapabilities(data?: ComponentData) {
  const behaviors =
    data?.schemaVersion !== "scene-components-1" ? data : undefined;
  const relationships =
    data?.schemaVersion === "scene-components-3" ? data : undefined;
  return {
    supportsBehaviors: Boolean(behaviors),
    supportsRelationships: Boolean(relationships),
    annotations: data?.annotations ?? [],
    values: data?.values ?? [],
    bindings: data?.bindings ?? [],
    states: behaviors?.states ?? [],
    travels: behaviors?.travels ?? [],
    visibility: relationships?.visibility ?? [],
    pins: relationships?.pins ?? [],
    textFits: relationships?.textFits ?? [],
    masks: relationships?.masks ?? [],
  };
}

export type ComponentCapabilities = ReturnType<typeof componentCapabilities>;
type ComponentFields = Omit<
  ComponentCapabilities,
  "supportsBehaviors" | "supportsRelationships"
>;

/** Serialize only fields declared by this version; strict readers remain unchanged. */
export function assembleComponentData(
  version: ComponentData["schemaVersion"],
  fields: ComponentFields,
): ComponentData {
  return ComponentDataSchema.parse({
    schemaVersion: version,
    annotations: fields.annotations,
    values: fields.values,
    bindings: fields.bindings,
    ...(rank[version] >= 2
      ? { states: fields.states, travels: fields.travels }
      : {}),
    ...(rank[version] >= 3
      ? {
          visibility: fields.visibility,
          pins: fields.pins,
          textFits: fields.textFits,
          masks: fields.masks,
        }
      : {}),
  });
}

export function mergeComponentData(parts: ComponentData[]): ComponentData {
  const version = parts.reduce<ComponentData["schemaVersion"]>(
    (latest, part) =>
      rank[part.schemaVersion] > rank[latest] ? part.schemaVersion : latest,
    "scene-components-1",
  );
  const views = parts.map(componentCapabilities);
  return assembleComponentData(version, {
    annotations: views.flatMap((view) => view.annotations),
    values: views.flatMap((view) => view.values),
    bindings: views.flatMap((view) => view.bindings),
    states: views.flatMap((view) => view.states),
    travels: views.flatMap((view) => view.travels),
    visibility: views.flatMap((view) => view.visibility),
    pins: views.flatMap((view) => view.pins),
    textFits: views.flatMap((view) => view.textFits),
    masks: views.flatMap((view) => view.masks),
  });
}

const rendererVersions = {
  "scene-components-1": {
    commerce: "commerce-canvas-0.17.0",
    story: "story-canvas-0.16.0",
  },
  "scene-components-2": {
    commerce: "commerce-canvas-0.18.0",
    story: "story-canvas-0.17.0",
  },
  "scene-components-3": {
    commerce: "commerce-canvas-0.19.0",
    story: "story-canvas-0.18.0",
  },
} as const satisfies Record<
  ComponentData["schemaVersion"],
  { commerce: string; story: string }
>;

export function componentRendererVersions(data?: ComponentData) {
  return data ? rendererVersions[data.schemaVersion] : undefined;
}
