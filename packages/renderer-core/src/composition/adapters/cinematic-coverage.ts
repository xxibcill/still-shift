import { z } from "zod";
import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import {
  prepareAlphaCoverage,
  type AlphaPixels,
} from "../../alpha-coverage.ts";
import { passageError, PassageError } from "../../passage-diagnostics.ts";
import {
  inspectProjectedRevealFrames,
  RevealValidationError,
  type RevealAlphaSampler,
  type RevealImageNode,
} from "../../reveal-validation.ts";
import { evaluateComp } from "../evaluate/evaluate.ts";
import { evaluateCompositionExposure } from "../evaluate/exposure.ts";
import type { EvaluatedLayerTree } from "../evaluate/types.ts";
import { projectLocalPoint } from "../evaluate/spatial-geometry.ts";

const id = z.string().regex(/^[a-zA-Z][\w-]*$/);
const point = z.tuple([z.number().finite(), z.number().finite()]);
const declarationSchema = z.object({
  background: id,
  paintedBounds: z.tuple([
    z.number().finite(),
    z.number().finite(),
    z.number().positive().finite(),
    z.number().positive().finite(),
  ]),
  reveal: z
    .object({
      subject: id,
      occluders: z.array(id).max(20),
      region: z.array(point).min(3).max(32),
      settleFrame: z.number().int().nonnegative(),
    })
    .optional(),
});

function hasAlphaTreatment(
  layers: ReadonlyMap<string, CompositionLayer>,
  id: string,
) {
  for (
    let layer = layers.get(id);
    layer;
    layer = layer.parent ? layers.get(layer.parent) : undefined
  ) {
    if (
      layer.masks?.length ||
      layer.trackMatte ||
      layer.effects?.some((effect) => effect.enabled !== false) ||
      (layer.type === "group" && layer.clip)
    )
      return true;
  }
  return false;
}

/** Only treated reveal planes need backend alpha capture; ordinary recipes retain source sampling. */
export function cinematicRenderedRevealRequirements(composition: Composition) {
  const parsed = declarationSchema.safeParse(
    composition.metadata?.cinematicCoverage,
  );
  if (!parsed.success || !parsed.data.reveal) return;
  const { subject, occluders } = parsed.data.reveal;
  const layers = new Map(composition.layers.map((layer) => [layer.id, layer]));
  const focus = composition.layers.some(
    (layer) => layer.type === "camera" && layer.depthOfField,
  );
  const shutter =
    composition.motionBlur?.enabled && !!composition.motionBlur.shutterAngle;
  return {
    subject,
    occluders,
    layers: new Set(
      [subject, ...occluders].filter(
        (id) => focus || shutter || hasAlphaTreatment(layers, id),
      ),
    ),
  };
}

/** Untreated planes are covered geometrically; alpha treatments require the rendered layer. */
export function cinematicRenderedCoverageRequirements(
  composition: Composition,
): ReadonlyMap<string, string> {
  const parsed = declarationSchema.safeParse(
    composition.metadata?.cinematicCoverage,
  );
  const requirements = new Map<string, string>();
  if (!parsed.success) return requirements;
  const layers = new Map(composition.layers.map((layer) => [layer.id, layer]));
  if (hasAlphaTreatment(layers, parsed.data.background))
    requirements.set(parsed.data.background, "metadata.cinematicCoverage");
  return requirements;
}

/** Persisted alpha declarations are checked against decoded assets and native camera states. */
export function* cinematicCompositionCoverageFrames(
  composition: Composition,
  readPixels: (assetId: string) => AlphaPixels,
  sampleAlpha?: RevealAlphaSampler,
) {
  const declaration = composition.metadata?.cinematicCoverage;
  if (declaration === undefined) return;
  const parsed = declarationSchema.safeParse(declaration);
  const fail: (message: string, node?: string, frame?: number) => never = (
    message,
    node,
    frame,
  ) =>
    passageError("comp-camera-coverage", message, {
      path: "metadata.cinematicCoverage",
      ...(node ? { node } : {}),
      ...(frame === undefined ? {} : { frame }),
    });
  if (!parsed.success) fail("Invalid cinematic coverage declaration");
  const { background, paintedBounds, reveal } = parsed.data;
  const node = (id: string): RevealImageNode => {
    const layer = composition.layers.find((layer) => layer.id === id);
    if (
      layer?.type !== "image" ||
      layer.fit !== "stretch" ||
      layer.sources.length !== 1
    )
      fail(
        `Cinematic coverage ${id} requires a single-state stretch image`,
        id,
      );
    return {
      id,
      width: layer.size[0],
      height: layer.size[1],
      states: layer.sources,
    };
  };
  const images = new Map<string, AlphaPixels>();
  const pixels = (asset: string) => {
    let result = images.get(asset);
    if (!result) {
      result = readPixels(asset);
      images.set(asset, result);
    }
    return result;
  };
  const cover = node(background);
  const layers = new Map(composition.layers.map((layer) => [layer.id, layer]));
  const matteSources = new Set(
    composition.layers.flatMap((layer) =>
      layer.trackMatte ? [layer.trackMatte.layer] : [],
    ),
  );
  for (
    let layer = layers.get(background);
    layer;
    layer = layer.parent ? layers.get(layer.parent) : undefined
  ) {
    if (layer.type === "group" && matteSources.has(layer.id))
      fail("Cinematic background must remain drawable", background, 0);
  }
  const [left, top, width, height] = paintedBounds;
  if (
    left < 0 ||
    top < 0 ||
    left + width > cover.width + 1e-6 ||
    top + height > cover.height + 1e-6
  )
    fail("Painted bounds exceed the background image layer", background);
  for (const source of cover.states) {
    const image = pixels(source.asset);
    const [sx, sy, sw, sh] = source.crop ?? [0, 0, image.width, image.height];
    if (
      prepareAlphaCoverage(image)(
        sx + (left / cover.width) * sw,
        sy + (top / cover.height) * sh,
        sx + ((left + width) / cover.width) * sw,
        sy + ((top + height) / cover.height) * sh,
      )
    )
      fail(
        "Declared painted background coverage contains transparent pixels",
        background,
      );
  }
  const planeState = (
    tree: EvaluatedLayerTree,
    node: RevealImageNode,
    frame: number,
  ) => {
    const state = tree.layers.find((state) => state.id === node.id);
    const matrix = state?.projection?.affineMatrix;
    if (
      !state?.visible ||
      !matrix ||
      Math.abs(matrix[1]) > 1e-8 ||
      Math.abs(matrix[2]) > 1e-8 ||
      matrix[0] <= 0 ||
      Math.abs(matrix[0] - matrix[3]) > 1e-8
    )
      fail(
        "Cinematic coverage requires visible axis-aligned native planes",
        node.id,
        frame,
      );
    return state;
  };
  const checkBackground = (tree: EvaluatedLayerTree, frame: number) => {
    const state = planeState(tree, cover, frame);
    if (!state.drawable)
      fail("Cinematic background must remain drawable", background, frame);
    const a = projectLocalPoint(state.projection!, [left, top])!;
    const b = projectLocalPoint(state.projection!, [
      left + width,
      top + height,
    ])!;
    const padding = 3 * (state.focusBlur ?? 0);
    if (
      state.opacity !== 1 ||
      a[0] > -padding + 0.001 ||
      a[1] > -padding + 0.001 ||
      b[0] < composition.width + padding - 0.001 ||
      b[1] < composition.height + padding - 0.001
    )
      fail("Cinematic camera exposes uncovered background", background, frame);
  };
  for (let frame = 0; frame < composition.frameCount; frame++) {
    checkBackground(evaluateComp(composition, frame), frame);
    if (composition.motionBlur?.enabled && composition.motionBlur.shutterAngle)
      for (const exposure of evaluateCompositionExposure(composition, frame))
        checkBackground(exposure, frame);
  }
  if (!reveal) return;
  if (reveal.settleFrame >= composition.frameCount)
    fail("Reveal settle frame exceeds the composition timeline");
  const subject = node(reveal.subject);
  const occluders = reveal.occluders.map(node);
  for (const image of [subject, ...occluders]) {
    for (
      let layer = layers.get(image.id);
      layer;
      layer = layer.parent ? layers.get(layer.parent) : undefined
    ) {
      if (
        matteSources.has(layer.id) &&
        (layer.id === image.id || layer.type === "group")
      )
        fail("Cinematic reveal planes must remain drawable", image.id, 0);
    }
  }
  const rendered = cinematicRenderedRevealRequirements(composition)!.layers;
  if (rendered.size && !sampleAlpha)
    fail(
      "Cinematic reveal treatments require rendered alpha validation",
      rendered.values().next().value,
      0,
    );
  for (const image of [subject, ...occluders])
    for (const source of image.states) pixels(source.asset);
  let previousFrame = NaN;
  let tree: EvaluatedLayerTree;
  const project = (node: RevealImageNode, frame: number) => {
    if (frame !== previousFrame) {
      tree = evaluateComp(composition, frame);
      previousFrame = frame;
    }
    const state = planeState(tree!, node, frame);
    if (!state.drawable)
      fail("Cinematic reveal planes must remain drawable", node.id, frame);
    if (state.opacity !== 1)
      fail(
        "Cinematic reveal requires full-opacity native planes",
        node.id,
        frame,
      );
    const matrix = state.projection!.affineMatrix!;
    return { left: matrix[4], top: matrix[5], scale: matrix[0] };
  };
  try {
    return yield* inspectProjectedRevealFrames(
      {
        ...reveal,
        subject,
        occluders,
        frameCount: composition.frameCount,
      },
      images,
      project,
      sampleAlpha,
    );
  } catch (error) {
    if (error instanceof PassageError) throw error;
    if (error instanceof RevealValidationError)
      fail(error.message, error.node, error.frame);
    fail(error instanceof Error ? error.message : String(error), subject.id);
  }
}

/** Persisted still coverage remains synchronous; media can prepare each yielded frame. */
export function validateCinematicCompositionCoverage(
  ...args: Parameters<typeof cinematicCompositionCoverageFrames>
) {
  const frames = cinematicCompositionCoverageFrames(...args);
  for (;;) {
    const step = frames.next();
    if (step.done) return step.value;
  }
}
