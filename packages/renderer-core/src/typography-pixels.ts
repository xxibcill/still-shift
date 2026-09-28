import { drawAnimatedText } from "./motion-text.ts";
import { drawStoryText } from "./story-text.ts";
import { measureTextLayout } from "./text-layout.ts";
import type { TypographyReviewScene } from "./typography-quality.ts";
import {
  createIllustratedPreview,
  type Images,
} from "./illustrated-renderer.ts";
import { contrastRatio, type TypePixelEvidence } from "./typography-quality.ts";
import { textAnimatorSettleFrame } from "./typography-animation.ts";

const pixelHex = (data: Uint8ClampedArray, at: number) =>
  "#" +
  [...data.slice(at, at + 3)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
export function changedPixels(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let changed = 0;
  for (let i = 0; i < a.length; i += 4)
    if (
      a[i] !== b[i] ||
      a[i + 1] !== b[i + 1] ||
      a[i + 2] !== b[i + 2] ||
      a[i + 3] !== b[i + 3]
    )
      changed++;
  return changed;
}
export function measureTypographyPixels(
  scene: TypographyReviewScene,
  images: Images,
): TypePixelEvidence[] {
  const evidence: TypePixelEvidence[] = [];
  const canvas = document.createElement("canvas"),
    backdrop = document.createElement("canvas"),
    visible = createIllustratedPreview(canvas, scene, images);
  const read = (c: HTMLCanvasElement) =>
    c
      .getContext("2d", { willReadFrequently: true })!
      .getImageData(0, 0, c.width, c.height).data;
  const frames = [
    ...new Set([
      0,
      Math.floor(scene.frameCount / 4),
      Math.floor(scene.frameCount / 2),
      Math.floor((scene.frameCount * 3) / 4),
      scene.frameCount - 1,
    ]),
  ];
  try {
    for (const node of scene.nodes) {
      if (node.type !== "text") continue;
      const hidden = structuredClone(scene);
      // Use a blank prepared raster while retaining layout, motion, effects and occlusion.
      const target = hidden.nodes.find((n) => n.id === node.id)!;
      target.opacity = 0;
      hidden.tracks[node.id] = {
        ...hidden.tracks[node.id],
        opacity: [{ time: 0, value: 0 }],
      };
      if (hidden.compiledMotion)
        hidden.compiledMotion.layers = hidden.compiledMotion.layers.filter(
          (l) => l.node !== node.id || l.property !== "opacity",
        );
      hidden.drivers = hidden.drivers?.filter(
        (d) => d.target !== `${node.id}.opacity`,
      );
      const inkScene = structuredClone(scene);
      inkScene.background = "#000000";
      inkScene.effects = [];
      inkScene.textEvents = [];
      const parents = new Set<string>();
      let parent = node.parent;
      while (parent) {
        parents.add(parent);
        parent = scene.nodes.find((n) => n.id === parent)?.parent;
      }
      for (const inkNode of inkScene.nodes) {
        if (inkNode.id === node.id && inkNode.type === "text") {
          inkNode.color = "#ffffff";
          inkNode.spans = inkNode.spans?.map((span) => ({
            ...span,
            color: "#ffffff",
          }));
          inkNode.decorations = undefined;
        } else if (!parents.has(inkNode.id)) {
          inkNode.opacity = 0;
          inkScene.tracks[inkNode.id] = {
            ...inkScene.tracks[inkNode.id],
            opacity: [{ time: 0, value: 0 }],
          };
        }
      }
      if (inkScene.compiledMotion)
        inkScene.compiledMotion.layers = inkScene.compiledMotion.layers.filter(
          (l) =>
            l.property !== "opacity" ||
            l.node === node.id ||
            parents.has(l.node),
        );
      inkScene.drivers = inkScene.drivers?.filter(
        (d) =>
          !d.target.endsWith(".opacity") ||
          d.target === `${node.id}.opacity` ||
          parents.has(d.target.split(".")[0]!),
      );
      inkScene.textAnimators = inkScene.textAnimators?.map((a) =>
        a.node === node.id
          ? {
              ...a,
              from: {
                ...a.from,
                color: "#ffffff",
                fill: "#ffffff",
                stroke: "#ffffff",
              },
              ...(a.to
                ? {
                    to: {
                      ...a.to,
                      color: "#ffffff",
                      fill: "#ffffff",
                      stroke: "#ffffff",
                    },
                  }
                : {}),
            }
          : a,
      );
      const inkCanvas = document.createElement("canvas"),
        ink = createIllustratedPreview(inkCanvas, inkScene, images);
      const background = createIllustratedPreview(backdrop, hidden, images);
      for (const frame of frames) {
        visible.renderFrame(frame);
        background.renderFrame(frame);
        ink.renderFrame(frame);
        const mask = read(inkCanvas);
        const front = read(canvas),
          back = read(backdrop),
          ratios: number[] = [];
        for (let at = 0; at < front.length; at += 4) {
          // The white-on-black probe identifies opaque glyph interiors even when the
          // actual ink matches its background. It also excludes antialiasing and fades.
          if (Math.min(mask[at]!, mask[at + 1]!, mask[at + 2]!) > 240)
            ratios.push(contrastRatio(pixelHex(front, at), pixelHex(back, at)));
        }
        if (ratios.length) {
          ratios.sort((a, b) => a - b);
          evidence.push({
            node: node.id,
            frame,
            contrast: ratios[Math.floor(ratios.length * 0.05)]!,
          });
        }
      }
      background.dispose();
      ink.dispose();
      for (const animator of scene.textAnimators?.filter(
        (a) => a.node === node.id,
      ) ?? []) {
        const settleFrame = textAnimatorSettleFrame(animator);
        if (settleFrame + 1 >= scene.frameCount) continue;
        const isolated = {
          ...scene,
          nodes: [
            {
              ...node,
              parent: undefined,
              x: scene.width * 0.1,
              y: scene.height * 0.2,
            },
          ],
          tracks: {},
          effects: [],
          connectors: [],
          compiledFlows: [],
          flows: [],
          motionEvents: [],
          textAnimators: [animator],
          drivers: [],
          constraints: [],
          periodic: [],
          camera: undefined,
          componentData: undefined,
          compiledMotion: { layers: [] },
          textEvents: [],
        };
        const probe = document.createElement("canvas"),
          renderer = createIllustratedPreview(probe, isolated, images);
        renderer.renderFrame(settleFrame);
        const end = read(probe);
        renderer.renderFrame(settleFrame + 1);
        let handoffPixels = changedPixels(end, read(probe));
        renderer.dispose();
        if (!scene.typography) {
          const font = images.fonts?.get(node.fontAsset ?? "");
          const draw = (split: boolean) => {
            const c = document.createElement("canvas");
            c.width = scene.width;
            c.height = scene.height;
            const context = c.getContext("2d")!;
            context.fillStyle = scene.background;
            context.fillRect(0, 0, c.width, c.height);
            context.translate(scene.width / 4, scene.height / 3);
            context.fillStyle = node.color;
            context.font = font
              ? `${font.weight} ${node.fontSize}px "${font.family}"`
              : `${node.weight} ${node.fontSize}px ${node.font}`;
            context.textBaseline = "top";
            context.textAlign = node.align;
            const measured = node.textBox
              ? measureTextLayout(context, node)
              : undefined;
            if (split)
              drawAnimatedText(
                context,
                node,
                node.text,
                0,
                { ...animator, start: 0, end: 1, stagger: 0, from: {} },
                measured,
              );
            else if (measured) {
              context.textBaseline = "alphabetic";
              measured.lines.forEach((line, i) =>
                context.fillText(
                  line,
                  0,
                  measured.baseline + i * measured.lineHeight,
                ),
              );
            } else drawStoryText(context, node, node.text, 1);
            return read(c);
          };
          // Compare a fully settled split draw with its static successor. The legacy early return
          // otherwise hides the pre-handoff spacing defect at exactly end and end+1.
          handoffPixels = Math.max(
            handoffPixels,
            changedPixels(draw(true), draw(false)),
          );
        }
        evidence.push({ node: node.id, frame: settleFrame, handoffPixels });
      }
    }
  } finally {
    visible.dispose();
  }
  return evidence;
}
