import type { CommerceRenderScene } from "./commerce-scene.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import type { ShapedLayout } from "./shaped-text.ts";
import type { TextNode } from "./typography-style.ts";
import { evaluatePreparedNodeAtTime } from "./prepared-scene.ts";
import { componentText } from "./component-values.ts";
import {
  activeTextTransition,
  resolveDisplayedText,
  retypedClusters,
} from "./typography-transition.ts";

type VisibilityScene = StoryRenderScene | CommerceRenderScene;

/**
 * Texts the renderer draws for a node at one frame: the settled or counted text, the one retype
 * layout, or both sides of a blended transition. Without layouts a retype reports both sides.
 */
export function displayedTexts(
  node: TextNode,
  frame: number,
  state: number,
  layouts?: ReadonlyMap<string, ShapedLayout>,
): string[] {
  const displayed = resolveDisplayedText(node, frame, state);
  if (displayed.kind === "single") return [displayed.text];
  if (displayed.transition.kind === "retype") {
    const from = layouts?.get(displayed.fromText),
      to = layouts?.get(displayed.toText);
    if (from && to)
      return [retypedClusters(from, to, displayed.progress).layout.text];
  }
  return [displayed.fromText, displayed.toText];
}

export type TextFrameVisibility = {
  frame: number;
  /** Node opacity multiplied through its parents. */
  opacity: number;
  reveal: number;
  state: number;
  /** A source text transition window (including cuts and counts) or a counting bound value covers this frame. */
  changing: boolean;
  texts: string[];
};

/** Per-frame visibility and displayed text for one node; the single source every consumer reads. */
export function textVisibility(
  scene: VisibilityScene,
  node: TextNode,
  layouts?: ReadonlyMap<string, ShapedLayout>,
  sampleTimes?: readonly number[],
): TextFrameVisibility[] {
  const frames: TextFrameVisibility[] = [];
  const boundText = (frame: number) =>
    frame < 0 || frame >= scene.frameCount
      ? undefined
      : componentText(scene, node, frame);
  for (const frame of sampleTimes ??
    Array.from({ length: scene.frameCount }, (_, frame) => frame)) {
    const evaluated = evaluatePreparedNodeAtTime(scene, node, frame);
    let opacity = evaluated.opacity;
    let parent = node.parent;
    while (parent) {
      const ancestor = scene.nodes.find((n) => n.id === parent)!;
      opacity *= evaluatePreparedNodeAtTime(scene, ancestor, frame).opacity;
      parent = ancestor.parent;
    }
    // Mirror the renderer: component data replaces the text, and a state blend also draws stateFrom.
    const bound = boundText(frame);
    const shown = bound === undefined ? node : { ...node, text: bound };
    const texts = displayedTexts(shown, frame, evaluated.state, layouts);
    if (evaluated.stateFrom !== undefined && evaluated.stateMix !== undefined)
      texts.push(...displayedTexts(shown, frame, evaluated.stateFrom, layouts));
    frames.push({
      frame,
      opacity,
      reveal: evaluated.reveal,
      state: evaluated.state,
      // A bound value that is still counting changes like a count transition does.
      changing:
        !!activeTextTransition(node, frame) ||
        (bound !== undefined &&
          ((frame > 0 && boundText(frame - 1) !== bound) ||
            (frame + 1 < scene.frameCount && boundText(frame + 1) !== bound))),
      texts: [...new Set(texts)],
    });
  }
  return frames;
}

/** Frames on which each text is drawn, restricted to texts that have a layout. */
export function framesByDisplayedText(
  visibility: TextFrameVisibility[],
  layouts: ReadonlyMap<string, ShapedLayout>,
) {
  const result = new Map<string, Set<number>>();
  for (const { frame, texts } of visibility)
    for (const text of texts) {
      if (!layouts.has(text)) continue;
      const frames = result.get(text) ?? new Set<number>();
      frames.add(frame);
      result.set(text, frames);
    }
  return result;
}
