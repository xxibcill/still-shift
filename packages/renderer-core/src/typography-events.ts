import type { NarrationTiming } from "../../scene-contract/src/narration-timing.ts";
import type {
  NarrationWordAnchor,
  TextEvent,
  TextStyle,
} from "../../scene-contract/src/typography.ts";
import type {
  IntentPresets,
  TextAnimator,
} from "../../scene-contract/src/motion-craft.ts";
import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import { tabularFigures } from "../../scene-contract/src/typography.ts";
import { resolvedTextStyle } from "./typography-style.ts";

export function resolveNarrationWord(
  anchor: NarrationWordAnchor,
  timing: NarrationTiming | undefined,
  fps: number,
) {
  if (!timing || timing.granularity !== "word")
    throw new Error("narration-word-missing: word-level alignment is required");
  const ref = anchor.narrationWord;
  const normalized = (s: string) =>
    s
      .normalize("NFKC")
      .toLocaleLowerCase("en")
      .replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, "");
  const matches =
    typeof ref === "string"
      ? timing.segments.filter((w) => normalized(w.text) === normalized(ref))
      : timing.segments.filter(
          (w, i) =>
            (w.segmentIndex ?? 0) === ref.segment &&
            (w.wordIndex ?? i) === ref.index,
        );
  if (!matches.length || (anchor.occurrence && !matches[anchor.occurrence - 1]))
    throw new Error(`narration-word-missing: ${JSON.stringify(ref)}`);
  if (matches.length > 1 && !anchor.occurrence)
    throw new Error(
      `narration-word-ambiguous: ${JSON.stringify(ref)} needs occurrence`,
    );
  return (
    Math.round(matches[(anchor.occurrence ?? 1) - 1]!.start * fps) +
    (anchor.offset ?? 0)
  );
}
export type TextEventScene = {
  intentPresets?: IntentPresets | undefined;
  nodes: PreparedNode[];
  fps: number;
  frameCount: number;
  typography?: "type-1" | undefined;
  textStyles?: Record<string, TextStyle> | undefined;
  textEvents?: TextEvent[] | undefined;
  textAnimators?: TextAnimator[] | undefined;
  narrationTiming?: NarrationTiming | undefined;
};
export type ResolvedTextEvent = TextEvent & { start: number; end: number };
export function resolveTextEvents(scene: TextEventScene): ResolvedTextEvent[] {
  return (scene.textEvents ?? [])
    .map((event) => {
      // Word-anchored emphasis peaks on the spoken onset; arrivals start there.
      const at =
        typeof event.at === "number"
          ? event.at
          : resolveNarrationWord(event.at, scene.narrationTiming, scene.fps);
      const peak = typeof event.at === "object" && event.verb === "emphasize";
      const end = peak ? Math.max(1, at) : at + event.duration,
        start = peak ? Math.max(0, end - event.duration) : at;
      if (at < 0 || start < 0 || end >= scene.frameCount)
        throw new Error(
          `text-event-window: ${event.node} is outside the scene`,
        );
      return { ...event, start, end };
    })
    .sort((a, b) => a.start - b.start);
}
export function compileTextEvents<T extends TextEventScene>(source: T): T {
  if (!source.typography) return source;
  const scene = structuredClone(source);
  const intents: TextEvent[] = (scene.intentPresets?.motions ?? []).flatMap(
    (m) => {
      if (!m.preset.startsWith("text-")) return [];
      const { preset, window, at } = m;
      const fields = {
        node: m.node,
        span: m.span,
        target: m.target,
        replacement: m.replacement,
        manner: m.manner,
        color: m.color,
        amount: m.amount,
      };
      return [
        {
          ...fields,
          verb: preset.slice(5) as TextEvent["verb"],
          at: at ?? window.start,
          duration: window.end - window.start,
        },
      ];
    },
  );
  if (intents.length)
    scene.textEvents = [...(scene.textEvents ?? []), ...intents];
  const events = resolveTextEvents(scene);
  const active = new Map<string, TextAnimator>();
  for (const event of events) {
    const node = scene.nodes.find((n) => n.id === event.node);
    if (node?.type !== "text")
      throw new Error(`text-event-target: ${event.node}`);
    const style = resolvedTextStyle(node, scene.textStyles ?? {}),
      size = style.size!;
    const animator: TextAnimator = {
      node: node.id,
      unit: "word",
      start: event.start,
      end: event.end,
      stagger: 0,
      selector: { start: 0, end: 1, easing: "in-out-cubic" },
      from: {},
      layer: event.layer ?? "action",
      ...(event.blend ? { blend: event.blend } : {}),
      ...(event.span ? { span: event.span } : {}),
      ...(event.id ? { cue: event.id } : {}),
      ...(event.signal ? { signal: event.signal } : {}),
    };
    const key = `${node.id}:${event.span ?? "*"}`;
    const decorate = (
      kind: "underline" | "strike" | "highlight" | "box",
      thickness?: number,
    ) => {
      node.decorations ??= [];
      node.decorations.push({
        kind,
        color: event.color ?? node.color,
        ...(event.span ? { span: event.span } : {}),
        ...(thickness ? { thickness } : {}),
        reveal: [
          { frame: event.start, value: 0 },
          { frame: event.end, value: 1 },
        ],
      });
    };
    switch (event.verb) {
      case "reveal":
      case "qualify": {
        animator.unit = node.textRole === "heading" ? "line" : "word";
        animator.mask = "line";
        animator.from = { offset: [0, size * 1.1], opacity: 0 };
        animator.stagger = animator.unit === "line" ? 4 : 2;
        if (event.verb === "qualify") {
          const claim = scene.nodes.find((n) => n.id === event.target);
          if (claim?.type !== "text")
            throw new Error("text-qualifier: missing claim");
          const claimSize = resolvedTextStyle(
            claim,
            scene.textStyles ?? {},
          ).size!;
          if (size >= claimSize)
            throw new Error(
              "text-qualifier-hierarchy: qualification must be smaller than its claim",
            );
          // Make room by moving the whole claim away from its qualifier. A leading
          // change only moves later lines, so a single-line claim would not move.
          const away = node.y >= claim.y ? -1 : 1;
          (scene.textAnimators ??= []).push({
            ...animator,
            node: claim.id,
            unit: "line",
            stagger: 0,
            anchor: "all",
            // Spaces travel with the claim so marks and masks keep their extent.
            excludeSpaces: false,
            mask: "none",
            from: {},
            to: { offset: [0, away * (event.amount ?? 0.15) * claimSize] },
          });
        }
        break;
      }
      case "emphasize": {
        const manner = event.manner ?? "underline";
        if (manner === "underline" || manner === "highlight") {
          decorate(manner);
          continue;
        }
        if (manner === "color")
          animator.to = { fill: event.color ?? "#b64032" };
        if (manner === "weight")
          animator.to = {
            stroke: event.color ?? node.color,
            strokeWidth: event.amount ?? size * 0.014,
          };
        if (manner === "compress" || manner === "expand") {
          const amount = event.amount ?? (manner === "compress" ? -45 : 45);
          animator.to = {
            tracking: amount,
            ...(style.axes?.wdth !== undefined
              ? { axes: { wdth: amount / 5 } }
              : {}),
          };
        }
        active.set(key, animator);
        break;
      }
      case "release": {
        // Fade the emphasis layer out from whatever value it currently has. A
        // signal-bound emphasis may already be near rest, so restarting from its
        // full target would jump.
        const emphasis = active.get(key);
        active.delete(key);
        if (emphasis) {
          const fade = [
            { frame: event.start, value: emphasis.weight?.at(-1)?.value ?? 1 },
            { frame: event.end, value: 0, easing: "in-out-cubic" as const },
          ];
          if (emphasis.weight?.some((k) => k.frame >= event.start))
            throw new Error(
              "text-release-weight: release overlaps the emphasis weight curve",
            );
          emphasis.weight = [...(emphasis.weight ?? []), ...fade];
        }
        for (const decoration of node.decorations ?? [])
          if (decoration.span === event.span && decoration.reveal)
            decoration.reveal.push(
              { frame: event.start, value: 1 },
              { frame: event.end, value: 0 },
            );
        continue;
      }
      case "redact":
        decorate("strike", size * 1.1);
        continue;
      case "correct": {
        decorate("strike");
        // The replacement is prepared above its struck span by the text evaluator.
        // Keeping it in text space makes it follow all parent and node transforms.
        continue;
      }
      case "retype":
      case "count": {
        if (!node.states || node.states.length < 2)
          throw new Error(`text-transition-state: ${node.id} needs two states`);
        if (
          event.verb === "count" &&
          (!tabularFigures(style) ||
            node.states
              .slice(0, 2)
              .some((s) => !/^-?\d+(?:,\d{3})*(?:\.\d+)?$/.test(s)))
        )
          throw new Error(
            "text-count-figures: Count requires numeric states and tabular figures",
          );
        if (
          node.transition ||
          node.transitions?.some(
            (t) => event.start < t.window.end && event.end > t.window.start,
          )
        )
          throw new Error(
            "text-transition-conflict: text event overlaps another transition",
          );
        (node.transitions ??= []).push({
          kind: event.verb,
          window: { start: event.start, end: event.end },
          caret: event.verb === "retype",
        });
        continue;
      }
    }
    (scene.textAnimators ??= []).push(animator);
  }
  return scene;
}
