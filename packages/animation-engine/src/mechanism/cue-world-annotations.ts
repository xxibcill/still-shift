import type {
  CompositionLayer,
  MechanismNarratedCycle,
} from "@still-shift/scene-contract";
type WorldAnnotation = NonNullable<
  MechanismNarratedCycle["cues"][number]["worldAnnotations"]
>[number];
type Annotation = Extract<WorldAnnotation, { kind: "world-text" }>;
type Context = {
  controller: string;
  cue: string;
  id: string;
  startFrame: number;
  endFrameExclusive: number;
  sourceSamples: [number, number];
  font: string;
  locale: "en" | "th";
};
/** A measured pixel box becomes an explicit part-local plane in the shared depth pass. */
export function compileCueWorldText(
  annotation: Annotation,
  context: Context,
): Extract<CompositionLayer, { type: "text" }> {
  const [width, height] = annotation.sizePixels;
  return {
    id: context.id,
    type: "text",
    text: annotation.text,
    fontAsset: context.font,
    style: context.font,
    fontSize: annotation.fontSizePixels,
    color: annotation.ink,
    align: "center",
    anchor: "top",
    inPoint: context.startFrame,
    outPoint: context.endFrameExclusive,
    transform: { anchor: [0, 0], position: [0, 0] },
    size: annotation.sizePixels,
    textBox: { locale: context.locale, maxLines: 8, lineHeight: 1.2 },
    textLayout: { width, height, lineHeight: 1.2, overflow: "error" },
    native3D: {
      role: "world-graphic",
      sceneLayer: context.controller,
      part: annotation.part,
      transform: annotation.transform,
      pixelsPerUnit: annotation.pixelsPerUnit,
      originPixels: [width / 2, height / 2],
      side: annotation.side,
      alphaMode: "mask",
      alphaCutoff: 0.5,
    },
    metadata: {
      cue: context.cue,
      track: "world-annotation",
      sourceSamples: context.sourceSamples,
    },
  };
}
