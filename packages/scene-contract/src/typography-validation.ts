import type { z } from "zod";
import type { StoryScene } from "./story.ts";
import type { CommerceScene } from "./commerce.ts";
import {
  tabularFigures,
  typographyNodeFields,
  type TextStyle,
} from "./typography.ts";

export function validateTypography(
  scene: StoryScene | CommerceScene,
  ctx: z.RefinementCtx,
) {
  const fail = (
    code: string,
    message: string,
    path: (string | number)[] = [],
  ) => ctx.addIssue({ code: "custom", path, message: `${code}: ${message}` });
  const enabled = scene.typography === "type-1";
  if (
    !enabled &&
    (scene.textStyles || scene.textEvents || scene.narrationTiming)
  )
    fail("typography-opt-in", "requires typography type-1");
  if (
    !enabled &&
    scene.intentPresets?.motions.some((m) => m.preset.startsWith("text-"))
  )
    fail("typography-opt-in", "Text intents require typography type-1");
  if (enabled && !scene.motionModel)
    fail("typography-opt-in", "requires motionModel curves-1");
  if (
    !enabled &&
    scene.fonts?.some(
      (f) =>
        f.style !== undefined ||
        f.variable ||
        !["400", "500", "600", "700"].includes(f.weight),
    )
  )
    fail("typography-opt-in", "Extended font styles require typography type-1");
  const styles = scene.textStyles ?? {};
  const fonts = new Map(scene.fonts?.map((f) => [f.id, f]));
  const validateAxes = (id: string, style: TextStyle) => {
    for (const [axis, value] of Object.entries(style.axes ?? {})) {
      const range = fonts.get(style.fontAsset ?? "")?.variable?.[axis];
      if (!range || value < range.min || value > range.max)
        fail(
          "font-axis-range",
          `${id}.${axis} is outside the pinned font's fvar range`,
        );
    }
  };
  for (const [id, style] of Object.entries(styles)) {
    if (style.fontAsset && !fonts.has(style.fontAsset))
      fail("missing-font", id);
    if (style.fontAsset) validateAxes(id, style);
  }
  for (const [index, node] of scene.nodes.entries()) {
    if (node.type !== "text") continue;
    const path = ["nodes", index];
    const hasNewFields = Object.keys(typographyNodeFields).some(
      (k) => node[k as keyof typeof node] !== undefined,
    );
    if (!enabled && (hasNewFields || node.fontSize > 180))
      fail(
        "typography-opt-in",
        `Text ${node.id} requires typography type-1`,
        path,
      );
    if (!enabled) continue;
    if (!node.textRole)
      fail("text-role-required", `Text ${node.id} needs textRole`, [
        ...path,
        "textRole",
      ]);
    const style = node.style ? styles[node.style] : undefined;
    if (node.style && !style) fail("missing-text-style", node.style, path);
    if (!fonts.has(style?.fontAsset ?? node.fontAsset ?? ""))
      fail(
        "missing-layout-font",
        `Text ${node.id} requires a pinned font`,
        path,
      );
    validateAxes(node.id, { fontAsset: node.fontAsset, ...style });
    try {
      new Intl.Segmenter(node.locale ?? node.textBox?.locale ?? "en");
    } catch {
      fail("text-locale", node.id, path);
    }
    const lengths = [node.text, ...(node.states ?? [])].map(
      (t) =>
        [
          ...new Intl.Segmenter(node.locale ?? "en", {
            granularity: "grapheme",
          }).segment(t),
        ].length,
    );
    const spans = [...(node.spans ?? [])].sort((a, b) => a.start - b.start);
    const ids = new Set<string>();
    spans.forEach((span, i) => {
      if (
        lengths.some((n) => span.end > n) ||
        (i && spans[i - 1]!.end > span.start)
      )
        fail(
          "text-span-range",
          `Overlapping or out-of-state span on ${node.id}`,
          path,
        );
      if (span.id && ids.has(span.id))
        fail("text-span-id", `Duplicate span ${span.id}`, path);
      if (span.id) ids.add(span.id);
      if (span.style && !styles[span.style])
        fail("missing-text-style", span.style, path);
      if (span.style)
        validateAxes(`${node.id}.${span.id ?? i}`, {
          fontAsset: node.fontAsset,
          ...style,
          ...styles[span.style],
        });
    });
    for (const decoration of node.decorations ?? [])
      if (decoration.span && !ids.has(decoration.span))
        fail("missing-text-span", decoration.span, path);
    if (node.transition && node.transitions)
      fail("text-transition-conflict", "Use transition or transitions", path);
    let end = -1;
    for (const transition of node.transitions ??
      (node.transition ? [node.transition] : [])) {
      if (
        transition.window.start < end ||
        transition.window.end >= scene.frameCount
      )
        fail("text-transition-window", node.id, path);
      end = transition.window.end;
      const from = transition.fromState ?? 0,
        to = transition.toState ?? 1;
      if (!node.states?.[from] || !node.states?.[to])
        fail("text-transition-state", node.id, path);
      if (
        transition.kind === "count" &&
        (!tabularFigures(style) ||
          [node.states?.[from], node.states?.[to]].some(
            (s) => !s || !/^-?\d+(?:,\d{3})*(?:\.\d+)?$/.test(s),
          ))
      )
        fail(
          "text-count-figures",
          "Count requires numeric states and tabular figures",
          path,
        );
    }
  }
  for (const [i, animator] of (scene.textAnimators ?? []).entries()) {
    const v2 =
      animator.to ||
      animator.selectors ||
      animator.anchor ||
      animator.mask ||
      animator.span ||
      animator.excludeSpaces !== undefined ||
      animator.from.tracking !== undefined ||
      animator.from.leading !== undefined ||
      animator.from.axes ||
      animator.from.fill ||
      animator.from.stroke ||
      animator.from.strokeWidth !== undefined ||
      animator.anchorAlign ||
      animator.from.skew !== undefined ||
      animator.from.baselineShift !== undefined;
    const selectorV2 = [animator.selector, ...(animator.selectors ?? [])].some(
      (s) =>
        typeof s.start !== "number" ||
        typeof s.end !== "number" ||
        (s.offset !== undefined && typeof s.offset !== "number") ||
        s.order ||
        s.mode ||
        s.basedOn ||
        s.easeHigh !== undefined ||
        s.easeLow !== undefined ||
        ["round", "smooth", "ramp-up", "ramp-down"].includes(s.shape ?? ""),
    );
    if (
      !enabled &&
      (v2 ||
        selectorV2 ||
        animator.feather !== undefined ||
        animator.lineOverlap !== undefined ||
        animator.signal)
    )
      fail("typography-opt-in", "Animator v2 requires typography type-1", [
        "textAnimators",
        i,
      ]);
    if (
      !enabled &&
      ((typeof animator.selector.start === "number" &&
        (animator.selector.start < 0 || animator.selector.start > 1)) ||
        (typeof animator.selector.end === "number" &&
          (animator.selector.end < 0 || animator.selector.end > 1)) ||
        (typeof animator.selector.offset === "number" &&
          Math.abs(animator.selector.offset) > 1))
    )
      fail(
        "text-selector-range",
        "Legacy selector range is 0–1 with offset −1–1",
      );
    if (
      animator.signal &&
      !scene.signals?.some((s) => s.id === animator.signal)
    )
      fail("motion-missing-signal", animator.signal);
    const node = scene.nodes.find((n) => n.id === animator.node);
    if (
      animator.span &&
      (node?.type !== "text" ||
        !node.spans?.some((s) => s.id === animator.span))
    )
      fail("missing-text-span", animator.span);
    for (const selector of [animator.selector, ...(animator.selectors ?? [])]) {
      for (const value of [selector.start, selector.end, selector.offset]) {
        if (
          typeof value === "object" &&
          !Array.isArray(value) &&
          !scene.signals?.some((s) => s.id === value.signal)
        )
          fail("motion-missing-signal", value.signal);
        if (
          Array.isArray(value) &&
          value.some((k) => k.frame >= scene.frameCount)
        )
          fail("motion-frame-range", "Text selector track outside scene");
      }
    }
  }
  for (const event of scene.textEvents ?? []) {
    const node = scene.nodes.find((n) => n.id === event.node);
    if (node?.type !== "text") fail("text-event-target", event.node);
    if (
      event.span &&
      (node?.type !== "text" || !node.spans?.some((s) => s.id === event.span))
    )
      fail("missing-text-span", event.span);
    if (event.signal && !scene.signals?.some((s) => s.id === event.signal))
      fail("motion-missing-signal", event.signal);
    if (typeof event.at === "object" && !scene.narrationTiming)
      fail("narration-word-missing", "Word anchors require narrationTiming");
    if (
      event.verb === "count" &&
      node?.type === "text" &&
      (!tabularFigures(node.style ? styles[node.style] : undefined) ||
        !node.states ||
        node.states.length < 2 ||
        node.states
          .slice(0, 2)
          .some((s) => !/^-?\d+(?:,\d{3})*(?:\.\d+)?$/.test(s)))
    )
      fail(
        "text-count-figures",
        "Count requires numeric states and tabular figures",
      );
    if (
      typeof event.at === "number" &&
      event.at + event.duration >= scene.frameCount
    )
      fail("text-event-window", `${event.node} is outside the scene`);
    if (event.verb === "correct" && !event.replacement)
      fail("text-correction", "correct needs replacement");
    if (
      event.verb === "qualify" &&
      !scene.nodes.some((n) => n.id === event.target && n.type === "text")
    )
      fail("text-qualifier", "qualify needs a text target");
  }
}
