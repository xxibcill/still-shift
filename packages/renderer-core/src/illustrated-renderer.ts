import type { Images } from "./composition/adapters/illustrated-assets.ts";
export {
  loadIllustratedImages,
  type Images,
} from "./composition/adapters/illustrated-assets.ts";
import { validateTypographySafeArea } from "./typography-safe-area.ts";
import {
  prepareTypography,
  drawTypography,
  resolveTypographyNodes,
} from "./typography-renderer.ts";
import { evaluateMotionAppearance } from "./motion-appearance.ts";
import { drawAnimatedText } from "./motion-text.ts";
import type { TextAnimator } from "../../scene-contract/src/motion-craft.ts";
import { componentVisible } from "./component-visibility.ts";
import { prepareComponentTextFits } from "./component-text-fit.ts";
import {
  componentMasks,
  createComponentMaskRenderer,
} from "./component-mask.ts";
import { prepareCommerceTextFits } from "./commerce-layout.ts";
import { nodeMatrix, imagePlacement } from "./node-transform.ts";
import {
  evaluateAttachedPath,
  validateAttachedPaths,
} from "./commerce-geometry.ts";
import { createCommerceEffectsRenderer } from "./commerce-effects-renderer.ts";
import { componentText, prepareMeasuredText } from "./component-values.ts";
import {
  evaluateComponentAnnotation,
  validateComponentAnnotations,
} from "./component-annotations.ts";
import type {
  PreparedImage,
  PreparedNode,
} from "../../scene-contract/src/prepared.ts";
import {
  evaluatePreparedNodeAtTime,
  type IllustratedScene,
} from "./prepared-scene.ts";

import { sampleCinematicBlur } from "./cinematic-scene.ts";
import { drawStoryFlow } from "./story-flows.ts";
import { drawStoryText } from "./story-text.ts";
import { validateStoryTextLayout } from "./story-text-layout.ts";
import { storyCameraTransform } from "./story-camera.ts";
import { evaluateStoryPath } from "./story-geometry.ts";
import { drawPreparedPath } from "./prepared-path-renderer.ts";
import { drawTextContainer } from "./text-container.ts";
import { drawPreparedRect } from "./prepared-rect-renderer.ts";

type State = ReturnType<typeof evaluatePreparedNodeAtTime>;

const drawImage = (
  ctx: CanvasRenderingContext2D,
  node: PreparedImage,
  state: State,
  images: Images,
  clip = true,
) => {
  const variant = node.states[Math.round(state.state)];
  if (!variant) throw new Error(`Missing state ${state.state} on ${node.id}`);
  const image = images.get(variant.asset);
  if (!image) throw new Error(`Missing decoded image ${variant.asset}`);
  const [sx, sy, sw, sh] = variant.crop ?? [
    0,
    0,
    image.naturalWidth,
    image.naturalHeight,
  ];
  const { width, height, x, y } = imagePlacement(
    node,
    [sx, sy, sw, sh],
    variant.registration?.anchor,
  );
  ctx.save();
  if (clip) {
    ctx.beginPath();
    ctx.rect(0, 0, node.width, node.height);
    ctx.clip();
  }
  ctx.drawImage(
    images.rasters?.get(variant.asset) ?? image,
    sx,
    sy,
    sw,
    sh,
    x,
    y,
    width,
    height,
  );
  ctx.restore();
};

const drawShape = (
  ctx: CanvasRenderingContext2D,
  node: PreparedNode,
  state: State,
  images: Images,
  clipImages = true,
  animator?: { definition: TextAnimator; frame: number },
  frame = 0,
) => {
  switch (node.type) {
    case "image":
      drawImage(ctx, node, state, images, clipImages);
      break;
    case "path":
      drawPreparedPath(ctx, node, state);
      break;
    case "text": {
      const probe =
        images.textProbe?.node === node.id ? images.textProbe.mode : undefined;
      if (images.typography) {
        drawTypography(ctx, node, state, images.typography, frame, probe);
        break;
      }
      const font = node.fontAsset
        ? images.fonts?.get(node.fontAsset)
        : undefined;
      if (node.fontAsset && !font)
        throw new Error(`Font not prepared: ${node.fontAsset}`);
      ctx.fillStyle = node.color;
      ctx.font = font
        ? `${font.weight} ${node.fontSize}px "${font.family}"`
        : `${node.weight} ${node.fontSize}px ${node.font}`;
      ctx.textAlign = node.align;
      ctx.textBaseline = "top";
      const text = node.states
        ? node.states[Math.round(state.state)]
        : node.text;
      if (text === undefined)
        throw new Error(`Missing text state on ${node.id}`);
      if (node.container && state.reveal > 0 && probe !== "ink-only")
        drawTextContainer(ctx, node, text);
      if (probe === "container-only") break;
      if (
        animator &&
        drawAnimatedText(
          ctx,
          node,
          text,
          animator.frame,
          animator.definition,
          images.textLayouts?.get(node.id)?.get(text),
        )
      )
        break;
      if (node.textBox) {
        const layout = images.textLayouts?.get(node.id)?.get(text);
        if (!layout)
          throw new Error("Text layout was not prepared: " + node.id);
        ctx.textBaseline = "alphabetic";
        const x =
          node.align === "center"
            ? node.width / 2
            : node.align === "right"
              ? node.width
              : 0;
        layout.lines.forEach((line, index) =>
          ctx.fillText(line, x, layout.baseline + index * layout.lineHeight),
        );
      } else drawStoryText(ctx, node, text, state.reveal);
      break;
    }
    case "rect":
      drawPreparedRect(ctx, node, state.reveal);
      break;
    case "group":
      if (node.clip) {
        ctx.beginPath();
        ctx.rect(0, 0, node.width, node.height);
        ctx.clip();
      }
      break;
  }
};

export function createIllustratedPreview(
  canvas: HTMLCanvasElement,
  scene: IllustratedScene,
  images: Images,
) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const hasTypography =
    (scene.schemaVersion === "story-scene-1" ||
      scene.schemaVersion === "commerce-scene-1") &&
    scene.typography;
  if (hasTypography)
    scene = resolveTypographyNodes(
      scene as Extract<
        IllustratedScene,
        { schemaVersion: "story-scene-1" | "commerce-scene-1" }
      >,
    );
  if (
    scene.schemaVersion === "story-scene-1" &&
    scene.authoringVersion === "1" &&
    !hasTypography
  )
    validateStoryTextLayout(scene, images.fonts ?? new Map());
  const focus =
    scene.schemaVersion === "illustrated-scene-2" &&
    scene.recipe.preset === "focus_handoff";
  if (focus && !("filter" in ctx))
    throw new Error("Focus handoff requires Canvas 2D filter support");
  canvas.width = scene.width;
  canvas.height = scene.height;
  if (scene.schemaVersion === "commerce-scene-1")
    scene = prepareCommerceTextFits(scene, ctx, images.fonts ?? new Map());
  if (
    scene.schemaVersion === "commerce-scene-1" ||
    scene.schemaVersion === "story-scene-1"
  )
    scene = prepareComponentTextFits(scene, ctx, images.fonts ?? new Map());
  images = Object.assign(new Map(images), {
    ...(images.fonts ? { fonts: images.fonts } : {}),
    ...(images.rasters ? { rasters: images.rasters } : {}),
    ...(images.textProbe ? { textProbe: images.textProbe } : {}),
    ...(images.revealValidation
      ? { revealValidation: images.revealValidation }
      : {}),
    textLayouts: new Map(),
  });
  images.textLayouts = hasTypography
    ? new Map()
    : prepareMeasuredText(scene, ctx, images.fonts ?? new Map());

  if (
    hasTypography &&
    (scene.schemaVersion === "story-scene-1" ||
      scene.schemaVersion === "commerce-scene-1")
  ) {
    images.typography = prepareTypography(scene, images.fonts ?? new Map());
    if (scene.schemaVersion === "story-scene-1")
      validateTypographySafeArea(scene, images.typography);
  }
  if (scene.schemaVersion === "commerce-scene-1") validateAttachedPaths(scene);
  if (
    scene.schemaVersion === "commerce-scene-1" ||
    scene.schemaVersion === "story-scene-1"
  )
    validateComponentAnnotations(scene);
  const children = new Map<string | undefined, PreparedNode[]>();
  for (const node of scene.nodes) {
    const siblings = children.get(node.parent) ?? [];
    siblings.push(node);
    children.set(node.parent, siblings);
  }
  let stateBlend: HTMLCanvasElement | undefined;
  const paint = (
    ctx: CanvasRenderingContext2D,
    node: PreparedNode,
    frame: number,
  ) => {
    if (
      (scene.schemaVersion === "commerce-scene-1" ||
        scene.schemaVersion === "story-scene-1") &&
      !componentVisible(scene, node.id, frame)
    )
      return;
    const state = evaluatePreparedNodeAtTime(scene, node, frame);
    const flows =
      scene.schemaVersion === "story-scene-1"
        ? (scene.compiledFlows?.filter((flow) => flow.path === node.id) ?? [])
        : [];
    if (state.opacity <= 0 && !flows.length) return;
    ctx.save();
    const parentOpacity = ctx.globalAlpha;
    ctx.globalAlpha *= state.opacity;
    if (
      scene.schemaVersion === "story-scene-1" &&
      scene.camera &&
      !node.parent
    ) {
      const camera = storyCameraTransform(scene, node.id, frame);
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.scale, camera.scale);
    }
    ctx.transform(...nodeMatrix(node, state));
    if (state.blur) ctx.filter = `blur(${state.blur}px)`;
    if (focus && scene.schemaVersion === "illustrated-scene-2") {
      const blur = sampleCinematicBlur(scene, node.id, frame);
      ctx.filter = blur > 0 ? `blur(${blur}px)` : "none";
    }
    let drawable =
      scene.schemaVersion === "story-scene-1" && node.type === "path"
        ? evaluateStoryPath(scene, node, frame)
        : scene.schemaVersion === "commerce-scene-1" && node.type === "path"
          ? evaluateAttachedPath(scene, node, frame)
          : node;
    if (
      scene.schemaVersion === "commerce-scene-1" ||
      scene.schemaVersion === "story-scene-1"
    ) {
      if (drawable.type === "path")
        drawable = evaluateComponentAnnotation(scene, drawable, frame);
      const text = componentText(scene, node, frame);
      if (text !== undefined && drawable.type === "text")
        drawable = { ...drawable, text };
    }
    const craftScene =
      scene.schemaVersion === "story-scene-1" ||
      scene.schemaVersion === "commerce-scene-1"
        ? scene
        : undefined;
    if (craftScene?.motionModel) {
      drawable = evaluateMotionAppearance(craftScene, drawable, frame);
      if (state.strokeWidth !== undefined && "lineWidth" in drawable)
        drawable = Object.assign({}, drawable, {
          lineWidth: state.strokeWidth,
          textureWidth: drawable.lineWidth,
        });
    }
    const animator = craftScene?.textAnimators?.find((a) => a.node === node.id);
    if (state.stateFrom !== undefined && state.stateMix !== undefined) {
      stateBlend ??= document.createElement("canvas");
      if (
        stateBlend.width !== scene.width ||
        stateBlend.height !== scene.height
      ) {
        stateBlend.width = scene.width;
        stateBlend.height = scene.height;
      }
      const blend = stateBlend.getContext("2d")!;
      blend.resetTransform();
      blend.clearRect(0, 0, scene.width, scene.height);
      blend.setTransform(ctx.getTransform());
      blend.globalCompositeOperation = "source-over";
      blend.globalAlpha = 1 - state.stateMix;
      drawShape(
        blend,
        drawable,
        { ...state, state: state.stateFrom },
        images,
        !focus,
        undefined,
        frame,
      );
      blend.globalCompositeOperation = "lighter";
      blend.globalAlpha = state.stateMix;
      drawShape(blend, drawable, state, images, !focus, undefined, frame);
      ctx.save();
      ctx.resetTransform();
      ctx.drawImage(stateBlend, 0, 0);
      ctx.restore();
    } else
      drawShape(
        ctx,
        drawable,
        state,
        images,
        !focus,
        animator ? { definition: animator, frame } : undefined,
        frame,
      );
    if (drawable.type === "path") {
      ctx.globalAlpha = parentOpacity;
      for (const flow of flows)
        drawStoryFlow(
          ctx,
          flow,
          drawable,
          state,
          frame,
          scene.timeline.frameCount,
          !!craftScene?.motionModel,
        );
      ctx.globalAlpha = parentOpacity * state.opacity;
    }
    for (const child of children.get(node.id) ?? []) paint(ctx, child, frame);
    ctx.restore();
  };
  const effectsRenderer =
    (scene.schemaVersion === "commerce-scene-1" ||
      scene.schemaVersion === "story-scene-1" ||
      scene.schemaVersion === "illustrated-scene-2") &&
    (scene.effects?.length ||
      (scene.schemaVersion === "commerce-scene-1" && scene.mattes?.length) ||
      (scene.schemaVersion !== "illustrated-scene-2" &&
        componentMasks(scene).length))
      ? createCommerceEffectsRenderer(scene, paint)
      : undefined;
  const maskRenderer =
    scene.schemaVersion === "story-scene-1" && componentMasks(scene).length
      ? createComponentMaskRenderer(scene, paint)
      : undefined;
  return {
    typography: images.typography,
    resolvedTextSizes: Object.fromEntries(
      scene.nodes.flatMap((n) =>
        n.type === "text" ? [[n.id, n.fontSize]] : [],
      ),
    ),
    renderFrame(frame: number) {
      if (
        !Number.isInteger(frame) ||
        frame < 0 ||
        frame >= scene.timeline.frameCount
      )
        throw new Error("Frame index outside illustrated timeline");
      if (effectsRenderer) {
        effectsRenderer.render(ctx, frame);
        return;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = scene.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const node of children.get(undefined) ?? [])
        (maskRenderer?.paint ?? paint)(ctx, node, frame);
    },
    dispose() {
      effectsRenderer?.dispose();
      maskRenderer?.dispose();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
