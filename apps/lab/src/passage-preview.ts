import type { Composition } from "@still-shift/scene-contract";
import { evaluateStoryPath } from "../../../packages/renderer-core/src/story-geometry.ts";
import type { CompiledStoryPassage } from "../../../packages/renderer-core/src/story-passage.ts";
import { compileStoryScene } from "../../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNode } from "../../../packages/renderer-core/src/prepared-scene.ts";
import {
  createIllustratedPreview,
  loadIllustratedImages,
} from "../../../packages/renderer-core/src/illustrated-renderer.ts";
import {
  prepareStoryComposition,
  createCompositionPreview,
  loadCompositionResources,
  type CompositionBackend,
  validatePassageCompositions,
  type PassageCompositions,
  evaluateComp,
} from "../../../packages/renderer-core/src/index.ts";
import { storyCameraTransform } from "../../../packages/renderer-core/src/story-camera.ts";
import { nodeMatrix } from "../../../packages/renderer-core/src/node-transform.ts";
import { drawFormatGuides } from "./format-guides.ts";

export type ReadyBeat = {
  nativeComposition?: Composition;
  scene: ReturnType<typeof compileStoryScene>;
  preview:
    | ReturnType<typeof createIllustratedPreview>
    | ReturnType<typeof createCompositionPreview>;
  canvas: HTMLCanvasElement;
  images: Awaited<ReturnType<typeof loadIllustratedImages>>;
};

type OverlayOptions = {
  showSafe: boolean;
  showBounds: boolean;
  showDiagnostics: boolean;
  selectedNode: string;
  selectedBeat: string;
  diagnostics: CompiledStoryPassage["diagnostics"];
};

const assetUrl = (path: string) =>
  "/passage-api/asset?path=" + encodeURIComponent(path);
export async function preparePreviews(
  passage: CompiledStoryPassage,
  overrides: PassageCompositions = {},
) {
  const native = validatePassageCompositions(passage, overrides);
  const parameters = new URLSearchParams(location.search);
  const renderer = parameters.get("renderer") ?? "legacy";
  const backend = parameters.get("backend") ?? "canvas2d";
  if (!["legacy", "composition"].includes(renderer))
    throw new Error("Unknown passage renderer");
  if (!["canvas2d", "webgl2"].includes(backend))
    throw new Error("Unknown composition backend");
  if (Object.keys(native).length && renderer !== "composition")
    throw new Error("Native beat files require renderer=composition");
  const prepared: ReadyBeat[] = [];
  for (const beat of passage.beats) {
    const scene = compileStoryScene(beat.scene);
    const images = await loadIllustratedImages(scene, (id) =>
      assetUrl(
        [...scene.assets, ...(scene.fonts ?? [])].find((a) => a.id === id)!
          .path,
      ),
    );
    const target = document.createElement("canvas");
    target.width = scene.width;
    target.height = scene.height;
    const composition =
      native[beat.id] ??
      (renderer === "composition"
        ? await prepareStoryComposition(beat.scene, (id) =>
            assetUrl(
              [...beat.scene.assets, ...(beat.scene.fonts ?? [])].find(
                (asset) => asset.id === id,
              )!.path,
            ),
          )
        : undefined);
    prepared.push({
      ...(native[beat.id] ? { nativeComposition: native[beat.id] } : {}),
      scene,
      preview: composition
        ? createCompositionPreview(
            target,
            composition,
            await loadCompositionResources(composition, (id) =>
              assetUrl(
                composition.assets.find((asset) => asset.id === id)!.path,
              ),
            ),
            { backend: backend as CompositionBackend },
          )
        : createIllustratedPreview(target, scene, images),
      canvas: target,
      images,
    });
  }
  return prepared;
}
export function drawOverlays(
  overlay: HTMLCanvasElement,
  scene: ReadyBeat["scene"],
  localFrame: number,
  options: OverlayOptions,
  native?: Composition,
) {
  const ctx = overlay.getContext("2d")!;
  drawFormatGuides(overlay, scene, options.showSafe);
  const bounds = options.showBounds,
    diagnostics = options.showDiagnostics;
  if (!bounds && !diagnostics) return;
  if (native) {
    for (const layer of evaluateComp(native, localFrame).layers) {
      if (!layer.visible || !layer.bounds) continue;
      ctx.strokeStyle =
        layer.id === options.selectedNode ? "#f8c35e" : "#7cacb8";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        layer.bounds.left,
        layer.bounds.top,
        layer.bounds.right - layer.bounds.left,
        layer.bounds.bottom - layer.bounds.top,
      );
    }
    return;
  }
  const targets = new Set(
    options.diagnostics
      .filter((d) => d.beat === options.selectedBeat && "node" in d)
      .map((d) => ("node" in d ? d.node : undefined)),
  );
  const paint = (parent?: string) => {
    for (const node of scene.nodes.filter((n) => n.parent === parent)) {
      const state = evaluatePreparedNode(scene, node, localFrame);
      ctx.save();
      if (!parent) {
        const camera = storyCameraTransform(scene, node.id, localFrame);
        ctx.translate(camera.x, camera.y);
        ctx.scale(camera.scale, camera.scale);
      }
      const ox = node.width * node.origin[0],
        oy = node.height * node.origin[1];
      if (scene.motionModel) ctx.transform(...nodeMatrix(node, state));
      else {
        ctx.translate(state.x + ox, state.y + oy);
        ctx.rotate((state.rotation * Math.PI) / 180);
        ctx.scale(state.scaleX, state.scaleY);
        ctx.translate(-ox, -oy);
      }
      ctx.strokeStyle =
        diagnostics && targets.has(node.id)
          ? "#ec9878"
          : node.id === options.selectedNode
            ? "#f8c35e"
            : "#7cacb8";
      ctx.lineWidth = 2;
      if (bounds || targets.has(node.id)) {
        if (node.type === "path") {
          const path = evaluateStoryPath(scene, node, localFrame);
          ctx.beginPath();
          path.points.forEach(([x, y], i) => {
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          });
          ctx.stroke();
          for (const point of [path.points[0]!, path.points.at(-1)!]) {
            ctx.beginPath();
            ctx.arc(point[0], point[1], 5, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else if (node.type === "text" && node.textLayout) {
          const left =
            node.align === "center"
              ? -node.textLayout.width / 2
              : node.align === "right"
                ? -node.textLayout.width
                : 0;
          ctx.strokeRect(
            left,
            0,
            node.textLayout.width,
            node.textLayout.height,
          );
        } else ctx.strokeRect(0, 0, node.width, node.height);
        ctx.beginPath();
        ctx.arc(ox, oy, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      paint(node.id);
      ctx.restore();
    }
  };
  paint();
}
