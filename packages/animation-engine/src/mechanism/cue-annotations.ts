import type {
  CompositionLayer,
  MechanismNarratedCycle,
  NativeScreenBinding,
} from "@still-shift/scene-contract";
type Annotation = MechanismNarratedCycle["cues"][number]["annotations"][number];
type Shape = Extract<CompositionLayer, { type: "shape" }>;
type Context = {
  controller: string;
  cue: string;
  startFrame: number;
  endFrameExclusive: number;
  sourceSamples: [number, number];
  width: number;
  height: number;
  font: string;
  fontSize: number;
  ids: {
    label: string;
    backing: string;
    leader: string;
    highlight: string;
    visibility: string;
  };
  locale: "en" | "th";
};
function binding(
  annotation: Annotation,
  context: Context,
): NativeScreenBinding {
  return {
    role: "screen-anchor",
    sceneLayer: context.controller,
    anchor: annotation.anchor,
    visibilityPolicy: annotation.visibility?.policy ?? "hide-occluded",
    insetPixels: annotation.visibility?.insetPixels ?? 12,
    ...(annotation.visibility?.visibleWhen
      ? { visibleWhen: annotation.visibility.visibleWhen }
      : {}),
    target: { kind: "visibility" },
  };
}
function annotationInk(annotation: Annotation) {
  return annotation.style && "ink" in annotation.style
    ? annotation.style.ink
    : "#eeeeee";
}
function leader(annotation: Annotation, context: Context): Shape {
  const start: [number, number] = [
    annotation.position[0] + context.width * 0.16,
    annotation.position[1] + context.fontSize * 1.3,
  ];
  const result: Shape = {
    id: context.ids.leader,
    type: "shape",
    inPoint: context.startFrame,
    outPoint: context.endFrameExclusive,
    overlayAfter: context.controller,
    native3D: {
      ...binding(annotation, context),
      target: { kind: "path-endpoint", contentId: "line", endpoint: "last" },
    },
    contents: [
      {
        id: "line",
        type: "path",
        path: { closed: false, vertices: [start, start] },
      },
      {
        id: "stroke",
        type: "stroke",
        color: annotationInk(annotation),
        width: 1.5,
      },
    ],
    metadata: { cue: context.cue },
  };
  const style = annotation.style;
  if (style?.kind === "arrow") {
    result.native3D = {
      ...binding(annotation, context),
      target: {
        kind: "path-arrow",
        contentId: "line",
        headContentId: "head",
        headLengthPixels: style.headLengthPixels,
        headWidthPixels: style.headWidthPixels,
      },
    };
    result.contents.push(
      {
        id: "head",
        type: "path",
        path: {
          closed: true,
          vertices: [
            [0, 0],
            [0, 0],
            [0, 0],
          ],
        },
      },
      { id: "fill", type: "fill", color: annotationInk(annotation) },
    );
  }
  if (style?.kind === "bracket") {
    const [x, y] = style.offsetPixels;
    result.native3D = {
      ...binding(annotation, context),
      target: {
        kind: "path-vertices",
        contentId: "line",
        vertices: [
          {
            index: 0,
            anchor: annotation.anchor,
            offsetPixels: [x, y - style.tickPixels],
          },
          { index: 1, anchor: annotation.anchor, offsetPixels: [x, y] },
          { index: 2, anchor: style.toAnchor, offsetPixels: [x, y] },
          {
            index: 3,
            anchor: style.toAnchor,
            offsetPixels: [x, y - style.tickPixels],
          },
        ],
      },
    };
    result.contents[0] = {
      id: "line",
      type: "path",
      path: {
        closed: false,
        vertices: [
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
        ],
      },
    };
  }
  return result;
}
function backing(annotation: Annotation, context: Context): Shape {
  const size: [number, number] = [context.width * 0.34, context.height * 0.17];
  return {
    id: context.ids.backing,
    type: "shape",
    inPoint: context.startFrame,
    outPoint: context.endFrameExclusive,
    transform: {
      position: [
        annotation.position[0] + context.width * 0.16,
        annotation.position[1] + context.height * 0.08,
      ],
    },
    overlayAfter: context.controller,
    native3D: binding(annotation, context),
    contents:
      annotation.style?.kind === "open-callout"
        ? [
            {
              id: "panel",
              type: "path",
              path: {
                closed: false,
                vertices: [
                  [-size[0] / 2, -size[1] / 2],
                  [size[0] / 2, -size[1] / 2],
                  [size[0] / 2, size[1] / 2],
                  [-size[0] / 2, size[1] / 2],
                ],
              },
            },
            {
              id: "stroke",
              type: "stroke",
              color: annotationInk(annotation),
              width: 1.5,
            },
          ]
        : [
            { id: "panel", type: "rect", size, roundness: 4 },
            { id: "fill", type: "fill", color: "#101820eb" },
          ],
    metadata: { cue: context.cue, track: "annotation-panel" },
  };
}
function highlight(
  annotation: Annotation,
  context: Context,
): Shape | undefined {
  const style = annotation.style;
  if (style?.kind !== "highlight") return;
  return {
    id: context.ids.highlight,
    type: "shape",
    inPoint: context.startFrame,
    outPoint: context.endFrameExclusive,
    transform: { opacity: style.opacity },
    overlayAfter: context.controller,
    native3D: { ...binding(annotation, context), target: { kind: "position" } },
    contents: [
      { id: "outline", type: "rect", size: style.sizePixels, roundness: 4 },
      {
        id: "stroke",
        type: "stroke",
        color: annotationInk(annotation),
        width: 1.5,
      },
    ],
    metadata: { cue: context.cue, track: "annotation-highlight" },
  };
}
/** Recipes emit ordinary editable layers; all dynamic geometry belongs to composition. */
export function compileCueAnnotation(
  annotation: Annotation,
  context: Context,
): CompositionLayer[] {
  const label: Extract<CompositionLayer, { type: "text" }> = {
    id: context.ids.label,
    type: "text",
    text: annotation.text,
    fontAsset: context.font,
    style: context.font,
    fontSize: context.fontSize,
    color:
      annotation.style?.kind === "open-callout"
        ? annotation.style.ink
        : "#ffffff",
    align: "center",
    anchor: "top",
    inPoint: context.startFrame,
    outPoint: context.endFrameExclusive,
    transform: { anchor: [0, 0], position: annotation.position },
    size: [context.width * 0.32, context.height * 0.16],
    textBox: { locale: context.locale, maxLines: 3, lineHeight: 1.2 },
    overlayAfter: context.controller,
    native3D: binding(annotation, context),
    metadata: { cue: context.cue, sourceSamples: context.sourceSamples },
  };
  const panel = backing(annotation, context),
    line = leader(annotation, context);
  const groups: CompositionLayer[] = [];
  if (annotation.style?.kind === "bracket") {
    const group: CompositionLayer = {
      id: context.ids.visibility,
      type: "group",
      size: [context.width, context.height],
      transform: { anchor: [0, 0], position: [0, 0] },
      inPoint: context.startFrame,
      outPoint: context.endFrameExclusive,
      overlayAfter: context.controller,
      native3D: {
        ...binding(annotation, context),
        target: { kind: "visibility", anchors: [annotation.style.toAnchor] },
      },
      metadata: { cue: context.cue, track: "annotation-visibility" },
    };
    label.parent = group.id;
    panel.parent = group.id;
    line.parent = group.id;
    delete label.native3D;
    delete panel.native3D;
    groups.push(group);
  }
  const outline = highlight(annotation, context);
  return [label, panel, line, ...groups, ...(outline ? [outline] : [])];
}
