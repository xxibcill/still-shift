import type { StoryScene } from "../../scene-contract/src/story.ts";
import type { TimingBinding } from "../../scene-contract/src/story-authoring.ts";
import { passageError } from "./passage-diagnostics.ts";
import { componentCapabilities } from "./component-capabilities.ts";

export type StoryEvent = {
  id: string;
  kind:
    | "recipe"
    | "choreography"
    | "camera"
    | "text-reveal"
    | "flow"
    | "cut"
    | "value"
    | "travel"
    | "visibility";
  layer?: string;
  nodes: string[];
  path: string;
  start: number;
  end: number;
  endExclusive: boolean;
};
type EditableEvent = StoryEvent & { set(start: number, end: number): void };
type RecordValue = Record<string, unknown>;

function editableEvents(scene: StoryScene) {
  const events = new Map<string, EditableEvent>();
  const add = (event: EditableEvent) => {
    if (events.has(event.id))
      passageError("ambiguous-event", "Ambiguous event cue: " + event.id, {
        event: event.id,
        path: event.path,
      });
    events.set(event.id, event);
  };
  const visit = (value: unknown, path: string, owner?: RecordValue) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => visit(v, path + "/" + i, owner));
      return;
    }
    const record = value as RecordValue;
    const labelWindow = /^recipe\/labelWindows\/(\d+)$/.exec(path);
    const labelNode =
      labelWindow && scene.recipe.preset === "unequal_margins"
        ? scene.recipe.labels[Number(labelWindow[1])]
        : undefined;
    const valueTargets = path.startsWith("componentData/values/")
      ? (scene.componentData?.bindings
          .filter((b) => b.value === owner?.id)
          .map((b) => b.target) ?? [])
      : [];
    const nodes = [
      ...valueTargets,
      record.node,
      record.path,
      owner?.node,
      owner?.target,
      owner?.path,
      owner?.destination,
      labelNode,
    ].filter((v): v is string => typeof v === "string");
    const textNode = nodes.some((id) =>
      scene.nodes.some((n) => n.id === id && n.type === "text"),
    );
    const kind: StoryEvent["kind"] = path.startsWith("componentData/visibility")
      ? "visibility"
      : path.startsWith("componentData/states")
        ? "cut"
        : path.startsWith("componentData/travels")
          ? "travel"
          : path.startsWith("componentData")
            ? "value"
            : path.startsWith("camera")
              ? "camera"
              : path.startsWith("flows")
                ? "flow"
                : textNode
                  ? "text-reveal"
                  : /moves|entrances|exits|emphasis/.test(path)
                    ? "choreography"
                    : "recipe";
    if (typeof record.start === "number" && typeof record.end === "number") {
      add({
        id: typeof record.cue === "string" ? record.cue : "@/" + path,
        kind,
        ...(typeof (record.layer ?? owner?.layer ?? owner?.role) === "string"
          ? { layer: String(record.layer ?? owner?.layer ?? owner?.role) }
          : {}),
        nodes,
        path,
        start: record.start,
        end: record.end,
        endExclusive:
          /^flows\/\d+\/window$/.test(path) || kind === "visibility",
        set(start, end) {
          if (end <= start)
            passageError(
              "invalid-duration",
              "Window requires positive duration",
              { event: this.id, frame: start },
            );
          const weight = record.weight ?? owner?.weight;
          if (Array.isArray(weight))
            for (const key of weight as { frame: number }[])
              key.frame = Math.round(
                start +
                  ((key.frame - this.start) * (end - start)) /
                    (this.end - this.start),
              );
          record.start = start;
          record.end = end;
          this.start = start;
          this.end = end;
        },
      });
      return;
    }
    if (typeof record.frame === "number") {
      add({
        id:
          (path.startsWith("componentData/states") ||
            path.startsWith("propAttachments")) &&
          typeof record.id === "string"
            ? record.id
            : "@/" + path,
        kind,
        ...(typeof (record.layer ?? owner?.layer ?? owner?.role) === "string"
          ? { layer: String(record.layer ?? owner?.layer ?? owner?.role) }
          : {}),
        nodes,
        path,
        start: record.frame,
        end: record.frame,
        endExclusive: false,
        set(start, end) {
          if (end !== start)
            passageError(
              "invalid-duration",
              "A key or cut requires zero duration",
              { event: this.id },
            );
          record.frame = start;
          this.start = this.end = start;
        },
      });
    }
    for (const [key, child] of Object.entries(record))
      visit(child, path + "/" + key, record);
  };
  for (const [i, signal] of (scene.signals ?? []).entries()) {
    const start = signal.keys[0]!.frame,
      end = signal.keys.at(-1)!.frame;
    add({
      id: signal.cue ?? "@/signals/" + i,
      kind: "value",
      nodes: (scene.drivers ?? [])
        .filter((d) => d.signal === signal.id || d.sum?.includes(signal.id))
        .map((d) => d.target.split(".")[0]!),
      path: `signals/${i}`,
      start,
      end,
      endExclusive: false,
      set(nextStart, nextEnd) {
        if (nextEnd <= nextStart)
          passageError("invalid-duration", "Signal needs positive duration", {
            event: this.id,
          });
        const remap = (frame: number) =>
          Math.round(
            nextStart +
              ((frame - this.start) * (nextEnd - nextStart)) /
                (this.end - this.start),
          );
        for (const key of signal.keys) key.frame = remap(key.frame);
        for (const addition of signal.add ?? [])
          if ("pulse" in addition) {
            addition.pulse.half = Math.max(
              1,
              Math.round(
                (addition.pulse.half * (nextEnd - nextStart)) /
                  (this.end - this.start),
              ),
            );
            addition.pulse.at = remap(addition.pulse.at);
          }
        this.start = nextStart;
        this.end = nextEnd;
      },
    });
  }
  visit(scene.intentPresets?.motions, "intentPresets/motions");
  visit(scene.periodic, "periodic");
  visit(scene.recipe, "recipe");
  visit(scene.camera, "camera");
  visit(scene.flows, "flows");
  visit(scene.characterActions, "characterActions");
  visit(scene.propAttachments, "propAttachments");
  const features = componentCapabilities(scene.componentData);
  visit(features.values, "componentData/values");
  visit(features.travels, "componentData/travels");
  features.states.forEach((s, i) =>
    visit(s.cuts, `componentData/states/${i}/cuts`, s),
  );
  visit(features.visibility, "componentData/visibility");
  const point = (
    record: RecordValue,
    key: string,
    id: string,
    path: string,
  ) => {
    if (typeof record[key] !== "number") return;
    add({
      id,
      kind: "cut",
      nodes: [],
      path,
      start: record[key],
      end: record[key],
      endExclusive: false,
      set(start, end) {
        if (start !== end)
          passageError("invalid-duration", "A cut requires zero duration", {
            event: id,
          });
        record[key] = start;
        this.start = this.end = start;
      },
    });
  };
  const recipe = scene.recipe as unknown as RecordValue;
  point(recipe, "swapFrame", "@swap", "recipe/swapFrame");
  point(recipe, "contextReadyFrame", "@context", "recipe/contextReadyFrame");
  if (recipe.reset)
    point(
      recipe.reset as RecordValue,
      "atFrame",
      "@reset",
      "recipe/reset/atFrame",
    );
  return events;
}

export function indexStoryEvents(scene: StoryScene): StoryEvent[] {
  return [...editableEvents(scene).values()].map(
    ({ id, kind, nodes, path, start, end, endExclusive, layer }) => ({
      id,
      kind,
      nodes,
      path,
      start,
      end,
      endExclusive,
      ...(layer ? { layer } : {}),
    }),
  );
}

export function retimeStoryEvents(
  scene: StoryScene,
  cues: { id: string; frame: number }[],
  bindings: Record<string, TimingBinding>,
  absolute: Record<string, { start: number; end: number }> = {},
) {
  const events = editableEvents(scene);
  const set = (id: string, start: number, end: number) => {
    const event = events.get(id);
    if (!event)
      passageError("missing-event", "Unknown timing event: " + id, {
        event: id,
      });
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      start >= scene.frameCount ||
      end > scene.frameCount - (event.endExclusive ? 0 : 1)
    )
      passageError("event-out-of-range", "Event outside locked beat: " + id, {
        event: id,
        frame: start,
      });
    event.set(start, end);
  };
  for (const [id, window] of Object.entries(absolute))
    set(id, window.start, window.end);
  const active = new Set<string>(),
    resolved = new Set<string>();
  const resolve = (id: string) => {
    if (resolved.has(id)) return;
    if (active.has(id))
      passageError(
        "timing-cycle",
        "Timing dependency cycle: " + [...active, id].join(" → "),
        { event: id },
      );
    const binding = bindings[id];
    if (!binding) {
      if (!events.has(id))
        passageError("missing-event", "Unknown dependency: " + id, {
          event: id,
        });
      return;
    }
    if (absolute[id])
      passageError(
        "timing-conflict",
        "Event has both absolute and linked timing: " + id,
        { event: id },
      );
    active.add(id);
    let origin: number;
    if (binding.anchor.type === "cue") {
      const cue = cues.find((c) => c.id === binding.anchor.id);
      if (!cue)
        passageError("missing-cue", "Unknown cue: " + binding.anchor.id, {
          event: id,
        });
      origin = cue.frame;
    } else {
      resolve(binding.anchor.id);
      const event = events.get(binding.anchor.id)!;
      origin = event[binding.anchor.edge];
    }
    const start = origin + binding.offset;
    set(id, start, start + binding.duration);
    active.delete(id);
    resolved.add(id);
  };
  Object.keys(bindings).forEach(resolve);
  return indexStoryEvents(scene);
}

/** Explicit conversion: nearest integer frame, ties away from zero. Never changes a plan implicitly. */
export function convertStoryFrame(value: number, from: 24 | 30, to: 24 | 30) {
  if (!Number.isSafeInteger(value))
    throw new Error("Frame must be a safe integer");
  return Math.sign(value) * Math.floor((Math.abs(value) * to) / from + 0.5);
}
