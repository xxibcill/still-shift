import { loadTextAnimationFonts } from "./typography-axes.ts";
import { validateTypographySafeArea } from "./typography-safe-area.ts";
import {
  prepareTypography,
  drawTypography,
  resolveTypographyNodes,
  type PreparedTypography,
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
import { type TextLayout } from "./text-layout.ts";
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

import { inspectForegroundReveal } from "./reveal-validation.ts";
import { sampleCinematicBlur } from "./cinematic-scene.ts";
import { drawStoryFlow } from "./story-flows.ts";
import { drawStoryText } from "./story-text.ts";
import { sha256Hex } from "./browser-checksum.ts";
import { validateStoryTextLayout } from "./story-text-layout.ts";
import {
  storyCameraTransform,
  validateStoryCameraAlphaCoverage,
} from "./story-camera.ts";
import { evaluateStoryPath } from "./story-geometry.ts";
import { loadPreparedFonts, type LoadedFont } from "./prepared-fonts.ts";
import { drawPreparedPath } from "./prepared-path-renderer.ts";
import { drawTextContainer } from "./text-container.ts";

export type Images = Map<string, HTMLImageElement> & {
  revealValidation?: ReturnType<typeof inspectForegroundReveal>;
  fonts?: Map<string, LoadedFont>;
  textLayouts?: Map<string, Map<string, TextLayout>>;
  typography?: PreparedTypography;
  rasters?: Map<string, HTMLCanvasElement>;
  textProbe?: {
    node: string;
    mode: "ink-only" | "container-only";
  };
};
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
      if (state.reveal < 1) {
        ctx.beginPath();
        ctx.rect(0, 0, node.width * state.reveal, node.height);
        ctx.clip();
      }
      ctx.fillStyle = node.fill;
      ctx.beginPath();
      ctx.roundRect(0, 0, node.width, node.height, node.radius);
      ctx.fill();
      if (node.stroke && node.lineWidth) {
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = node.lineWidth;
        ctx.stroke();
      }
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

export async function loadIllustratedImages(
  scene: IllustratedScene,
  assetUrl: (id: string) => string,
) {
  const entries = await Promise.all(
    scene.assets.map(async (asset) => {
      const image = new Image();
      let localUrl: string | undefined;
      if (
        scene.schemaVersion === "story-scene-1" &&
        scene.authoringVersion === "1"
      ) {
        const response = await fetch(assetUrl(asset.id));
        if (!response.ok) throw new Error("Asset unavailable: " + asset.id);
        const bytes = await response.arrayBuffer();
        const digest = await sha256Hex(bytes);
        if ("sha256:" + digest !== asset.sha256)
          throw new Error("Asset checksum differs: " + asset.id);
        localUrl = URL.createObjectURL(
          new Blob([bytes], {
            type:
              response.headers.get("Content-Type") ??
              "application/octet-stream",
          }),
        );
      }
      image.src = localUrl ?? assetUrl(asset.id);
      try {
        await image.decode();
      } finally {
        if (localUrl) URL.revokeObjectURL(localUrl);
      }
      if (
        image.naturalWidth !== asset.width ||
        image.naturalHeight !== asset.height
      )
        throw new Error(`Dimensions differ for ${asset.id}`);
      return [asset.id, image] as const;
    }),
  );
  const images: Images = new Map(entries);
  if (scene.schemaVersion === "story-scene-1" && scene.camera?.cover?.length) {
    validateStoryCameraAlphaCoverage(scene, (id) => {
      const image = images.get(id)!;
      const probe = document.createElement("canvas");
      probe.width = image.naturalWidth;
      probe.height = image.naturalHeight;
      const context = probe.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, probe.width, probe.height);
    });
  }
  images.fonts = await loadPreparedFonts(scene, assetUrl);
  if (
    (scene.schemaVersion === "story-scene-1" ||
      scene.schemaVersion === "commerce-scene-1") &&
    scene.typography
  )
    await loadTextAnimationFonts(scene, images.fonts);
  if (scene.schemaVersion === "story-scene-1" && scene.motionGrammar === "v2") {
    // SVG rasterization can depend on the active clip. Cache the complete image
    // once so adjacent assembly strips share exactly the same deposited pixels.
    images.rasters = new Map(
      entries.map(([id, image]) => {
        const raster = document.createElement("canvas");
        raster.width = image.naturalWidth;
        raster.height = image.naturalHeight;
        raster.getContext("2d")!.drawImage(image, 0, 0);
        return [id, raster];
      }),
    );
  }
  if (scene.schemaVersion === "illustrated-scene-2") {
    const node = scene.nodes.find(
      (item) => item.id === scene.recipe.background,
    )!;
    const bounds = scene.layers.find(
      (item) => item.node === node.id,
    )!.paintedBounds!;
    const source = node.states[0]!;
    const image = images.get(source.asset)!;
    const [sx, sy, sw, sh] = source.crop ?? [
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
    ];
    const left = Math.floor(sx + (bounds[0] / node.width) * sw);
    const top = Math.floor(sy + (bounds[1] / node.height) * sh);
    const right = Math.ceil(sx + ((bounds[0] + bounds[2]) / node.width) * sw);
    const bottom = Math.ceil(sy + ((bounds[1] + bounds[3]) / node.height) * sh);
    const probe = document.createElement("canvas");
    probe.width = image.naturalWidth;
    probe.height = image.naturalHeight;
    const context = probe.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(
      left,
      top,
      right - left,
      bottom - top,
    ).data;
    for (let i = 3; i < pixels.length; i += 4)
      if (pixels[i]! < 254)
        throw new Error(
          "Declared painted background coverage contains transparent pixels",
        );
  }
  if (
    scene.schemaVersion === "illustrated-scene-2" &&
    scene.recipe.preset === "foreground_reveal"
  ) {
    const alphaImages = new Map(
      entries.map(([id, image]) => {
        const probe = document.createElement("canvas");
        probe.width = image.naturalWidth;
        probe.height = image.naturalHeight;
        const ctx = probe.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(image, 0, 0);
        return [id, ctx.getImageData(0, 0, probe.width, probe.height)] as const;
      }),
    );
    images.revealValidation = inspectForegroundReveal(scene, alphaImages);
  }
  return images;
}
