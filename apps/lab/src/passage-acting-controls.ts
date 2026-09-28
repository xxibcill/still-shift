import type { StoryScene } from "../../../packages/scene-contract/src/story.ts";
import type { PassagePlan } from "../../../packages/scene-contract/src/story-authoring.ts";
import { TextContainerSchema } from "../../../packages/scene-contract/src/story-acting.ts";
import { characterPoseBrief } from "../../../packages/renderer-core/src/story-acting.ts";
import { containerTail } from "../../../packages/renderer-core/src/text-container-layout.ts";
import type { StoryEvent } from "../../../packages/renderer-core/src/story-event-index.ts";

type Beat = Extract<
  PassagePlan,
  { schemaVersion: "story-passage-2" }
>["beats"][number];
export type Controls = {
  textHost: HTMLElement;
  poseHost: HTMLElement;
  scene: StoryScene;
  beat: Beat;
  events: StoryEvent[];
  edit(change: (beat: Beat) => void): void;
  field(
    host: HTMLElement,
    label: string,
    value: string | number,
    change: (value: string) => void,
    type?: string,
  ): HTMLInputElement;
  select(
    host: HTMLElement,
    label: string,
    choices: string[],
    value: string,
    change: (value: string) => void,
  ): HTMLSelectElement;
  button(
    host: HTMLElement,
    title: string,
    action: () => void,
  ): HTMLButtonElement;
};
export function group(host: HTMLElement, title: string) {
  const group = document.createElement("fieldset"),
    legend = document.createElement("legend");
  group.className = "acting-group";
  legend.textContent = title;
  group.append(legend);
  host.append(group);
  return group;
}
function downloadBrief(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name + "-pose-brief.md";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function anchorValue(
  anchor: NonNullable<Beat["poseTracks"]>[string]["changes"][number]["anchor"],
) {
  return anchor.type === "cue"
    ? "cue:" + anchor.id
    : anchor.edge + ":" + anchor.id;
}
export function parseAnchor(value: string) {
  const split = value.indexOf(":"),
    type = value.slice(0, split),
    id = value.slice(split + 1);
  return type === "cue"
    ? { type: "cue" as const, id }
    : { type: "event" as const, id, edge: type as "start" | "end" };
}

export function renderStoryActingControls(ui: Controls) {
  const { beat, scene, edit, field, select, button } = ui;
  ui.textHost.replaceChildren();
  ui.poseHost.replaceChildren();
  for (const node of scene.nodes) {
    if (node.type !== "text" || (!node.textLayout && !node.textBox)) continue;
    const host = group(ui.textHost, node.id),
      container = node.container;
    select(
      host,
      node.id + " container",
      ["none", "caption", "speech", "thought"],
      container?.kind ?? "none",
      (value) =>
        edit((b) => {
          b.textContainers ??= {};
          b.textContainers[node.id] =
            value === "none"
              ? null
              : TextContainerSchema.parse({ ...container, kind: value });
        }),
    );
    if (!node.states)
      field(host, node.id + " text", node.text, (value) =>
        edit((b) => {
          b.copy[node.id] = value;
        }),
      );
    if (!container) continue;
    const set = (patch: Partial<typeof container>) =>
      edit((b) => {
        b.textContainers ??= {};
        b.textContainers[node.id] = { ...container, ...patch };
      });
    for (const key of ["padding", "radius", "strokeWidth"] as const)
      field(
        host,
        `${node.id} ${key}`,
        container[key],
        (value) => set({ [key]: Number(value) }),
        "number",
      );
    for (const key of ["fill", "stroke"] as const)
      field(
        host,
        `${node.id} ${key}`,
        container[key],
        (value) => set({ [key]: value }),
        "color",
      );
    const tail = containerTail(container);
    if (tail) {
      select(
        host,
        node.id + " tail side",
        ["top", "bottom", "left", "right"],
        tail.side,
        (value) => set({ tail: { ...tail, side: value as typeof tail.side } }),
      );
      field(
        host,
        node.id + " tail position",
        tail.position,
        (value) => set({ tail: { ...tail, position: Number(value) } }),
        "number",
      ).step = "0.05";
      field(
        host,
        node.id + " tail length",
        tail.length,
        (value) => set({ tail: { ...tail, length: Number(value) } }),
        "number",
      );
    }
  }
  const characters = scene.nodes.filter(
    (node) => node.type === "image" && node.states.every((state) => state.pose),
  );
  if (!characters.length)
    ui.poseHost.textContent =
      "Load a template with named image poses to author character acting. Each pose uses its own supplied artwork; generate them from one identity reference.";
  for (const node of characters) {
    if (node.type !== "image") continue;
    const host = group(ui.poseHost, node.id),
      poses = node.states.map((state) => state.pose!),
      track = beat.poseTracks?.[node.id];
    button(host, node.id + " · Download pose generation brief", () =>
      downloadBrief(node.id, characterPoseBrief(node, scene.assets)),
    );
    if (!track) {
      button(host, "Enable poses for " + node.id, () =>
        edit((b) => {
          b.poseTracks ??= {};
          b.poseTracks[node.id] = { initial: poses[0]!, changes: [] };
        }),
      );
      continue;
    }
    select(host, node.id + " initial pose", poses, track.initial, (value) =>
      edit((b) => {
        b.poseTracks![node.id]!.initial = value;
      }),
    );
    for (const change of track.changes) {
      const row = group(host, change.id);
      const update = (fn: (item: typeof change) => void) =>
        edit((b) =>
          fn(
            b.poseTracks![node.id]!.changes.find(
              (item) => item.id === change.id,
            )!,
          ),
        );
      select(row, change.id + " pose", poses, change.pose, (value) =>
        update((item) => {
          item.pose = value;
        }),
      );
      const anchors = [
        ...beat.cues.map((c) => "cue:" + c.id),
        ...ui.events
          .filter((e) => e.id !== change.id)
          .flatMap((e) => ["start:" + e.id, "end:" + e.id]),
      ];
      select(
        row,
        change.id + " anchor",
        anchors,
        anchorValue(change.anchor),
        (value) =>
          update((item) => {
            item.anchor = parseAnchor(value);
          }),
      );
      field(
        row,
        change.id + " offset",
        change.offset,
        (value) =>
          update((item) => {
            item.offset = Number(value);
          }),
        "number",
      );
      select(
        row,
        change.id + " blend frames",
        ["0", "1", "2", "3"],
        String(change.blendFrames),
        (value) =>
          update((item) => {
            item.blendFrames = Number(value);
          }),
      );
      const resolved = ui.events.find((event) => event.id === change.id);
      const time = document.createElement("p");
      time.className = "hint";
      time.textContent = `Changes at beat frame ${resolved?.start ?? "—"}.`;
      row.append(time);
      button(row, "Remove " + change.id, () =>
        edit((b) => {
          b.poseTracks![node.id]!.changes = b.poseTracks![
            node.id
          ]!.changes.filter((item) => item.id !== change.id);
        }),
      );
    }
    if (!beat.cues.length) continue;
    const add = group(host, "Add pose change");
    const occupied = new Set(
      track.changes.map((c) => ui.events.find((e) => e.id === c.id)?.start),
    );
    const cue = select(
      add,
      "New " + node.id + " cue",
      beat.cues.map((c) => c.id),
      (beat.cues.find((c) => !occupied.has(c.frame)) ?? beat.cues[0])!.id,
      () => {},
    );
    const pose = select(
      add,
      "New " + node.id + " pose",
      poses,
      poses[0]!,
      () => {},
    );
    const offset = field(
      add,
      "New " + node.id + " offset",
      0,
      () => {},
      "number",
    );
    button(add, "Add " + node.id + " pose change", () => {
      const selectedCue = cue.value,
        selectedPose = pose.value,
        selectedOffset = Number(offset.value);
      edit((b) => {
        const ids = new Set(ui.events.map((e) => e.id));
        let suffix = 1;
        while (ids.has(`${node.id}-pose-${suffix}`)) suffix++;
        b.poseTracks![node.id]!.changes.push({
          id: `${node.id}-pose-${suffix}`,
          pose: selectedPose,
          anchor: { type: "cue", id: selectedCue },
          offset: selectedOffset,
          blendFrames: 0,
        });
      });
    });
  }
}
