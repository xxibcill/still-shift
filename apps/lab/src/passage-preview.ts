import { evaluateStoryPath } from "../../../packages/renderer-core/src/story-geometry.ts";
import type { CompiledStoryPassage } from "../../../packages/renderer-core/src/story-passage.ts";
import { compileStoryScene } from "../../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNode } from "../../../packages/renderer-core/src/prepared-scene.ts";
import {
  createIllustratedPreview,
  loadIllustratedImages,
} from "../../../packages/renderer-core/src/illustrated-renderer.ts";
import { storyCameraTransform } from "../../../packages/renderer-core/src/story-camera.ts";

export type ReadyBeat = {
  scene: ReturnType<typeof compileStoryScene>;
  preview: ReturnType<typeof createIllustratedPreview>;
  canvas: HTMLCanvasElement;
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
export async function preparePreviews(passage: CompiledStoryPassage) {
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
    target.width = 1920;
    target.height = 1080;
    prepared.push({
      scene,
      preview: createIllustratedPreview(target, scene, images),
      canvas: target,
    });
  }
  return prepared;
}
export function drawOverlays(
  overlay: HTMLCanvasElement,
  scene: ReadyBeat["scene"],
  localFrame: number,
  options: OverlayOptions,
) {
  const ctx = overlay.getContext("2d")!;
  ctx.clearRect(0, 0, 1920, 1080);
  if (options.showSafe) {
    const inset = scene.safeInset ?? 0;
    ctx.strokeStyle = "#d4b777";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(inset, inset, 1920 - inset * 2, 1080 - inset * 2);
    ctx.setLineDash([]);
  }
  const bounds = options.showBounds,
    diagnostics = options.showDiagnostics;
  if (!bounds && !diagnostics) return;
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
      ctx.translate(state.x + ox, state.y + oy);
      ctx.rotate((state.rotation * Math.PI) / 180);
      ctx.scale(state.scaleX, state.scaleY);
      ctx.translate(-ox, -oy);
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
