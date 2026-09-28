import {
  CharacterActionSchema,
  type CharacterAction,
} from "../../../packages/scene-contract/src/character-actions.ts";
import { characterActionEventIds } from "../../../packages/renderer-core/src/character-actions.ts";
import {
  group,
  anchorValue,
  parseAnchor,
  type Controls,
} from "./passage-acting-controls.ts";
export type ActingControls = Omit<Controls, "textHost" | "poseHost">;
const keepPose = "keep current pose";

function renderAction(
  host: HTMLElement,
  action: CharacterAction,
  ui: ActingControls,
) {
  const { beat, scene, field, select, button, edit } = ui;
  const actor = scene.nodes.find((n) => n.id === action.actor);
  if (actor?.type !== "image") return;
  const poses = actor.states.map((s) => s.pose!);
  const row = group(host, `${action.id} · ${action.kind} · ${action.actor}`);
  const update = (change: (a: CharacterAction) => void) =>
    edit((b) => change(b.actions!.find((a) => a.id === action.id)!));
  const owned = new Set(characterActionEventIds(action));
  const anchors = [
    ...beat.cues.map((c) => "cue:" + c.id),
    ...ui.events
      .filter((e) => !owned.has(e.id))
      .flatMap((e) => ["start:" + e.id, "end:" + e.id]),
  ];
  select(
    row,
    action.id + " action anchor",
    anchors,
    anchorValue(action.anchor),
    (v) =>
      update((a) => {
        a.anchor = parseAnchor(v);
      }),
  );
  field(
    row,
    action.id + " action offset",
    action.offset,
    (v) =>
      update((a) => {
        a.offset = Number(v);
      }),
    "number",
  );
  field(
    row,
    action.id + " duration",
    action.durationFrames,
    (v) =>
      update((a) => {
        a.durationFrames = Number(v);
      }),
    "number",
  );
  if (action.kind === "walk") {
    for (const i of [0, 1] as const)
      select(
        row,
        `${action.id} walking pose ${i + 1}`,
        poses,
        action.poses[i],
        (v) =>
          update((a) => {
            if (a.kind === "walk") a.poses[i] = v;
          }),
      );
    field(
      row,
      action.id + " step frames",
      action.stepFrames,
      (v) =>
        update((a) => {
          if (a.kind === "walk") a.stepFrames = Number(v);
        }),
      "number",
    );
  } else
    select(row, action.id + " action pose", poses, action.pose, (v) =>
      update((a) => {
        if (a.kind !== "walk") a.pose = v;
      }),
    );
  select(
    row,
    action.id + " finish pose",
    [keepPose, ...poses],
    action.finishPose ?? keepPose,
    (v) =>
      update((a) => {
        if (v === keepPose) delete a.finishPose;
        else a.finishPose = v;
      }),
  );
  if (action.to) {
    for (const [i, axis] of [
      [0, "x"],
      [1, "y"],
    ] as const)
      field(
        row,
        `${action.id} destination ${axis}`,
        action.to[i],
        (v) =>
          update((a) => {
            a.to![i] = Number(v);
          }),
        "number",
      );
    if (action.kind !== "walk")
      button(row, "Remove movement from " + action.id, () =>
        update((a) => {
          if (a.kind !== "walk") delete a.to;
        }),
      );
  } else
    button(row, "Add movement to " + action.id, () =>
      update((a) => {
        a.to = [actor.x, actor.y];
      }),
    );
  const resolved = ui.events.find((e) => e.id === action.id),
    hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = `Beat frames ${resolved?.start ?? "—"}–${resolved?.end ?? "—"}. Sound cues can follow this action's start or end.`;
  row.append(hint);
  button(row, "Remove action " + action.id, () =>
    edit((b) => {
      b.actions = b.actions!.filter((a) => a.id !== action.id);
    }),
  );
}

export function renderCharacterActionControls(
  host: HTMLElement,
  ui: ActingControls,
) {
  host.replaceChildren();
  for (const action of ui.beat.actions ?? []) renderAction(host, action, ui);
  const characters = ui.scene.nodes.filter(
    (n) => n.type === "image" && n.states.every((s) => s.pose),
  );
  if (!characters.length || !ui.beat.cues.length) {
    host.append(
      "Load named character poses and a narration cue to add actions.",
    );
    return;
  }
  const add = group(host, "New character action"),
    { select, field, button } = ui;
  const options = document.createElement("div");
  const actor = select(
    add,
    "New action character",
    characters.map((n) => n.id),
    characters[0]!.id,
    () => renderOptions(),
  );
  const kind = select(
    add,
    "New action type",
    ["walk", "knock", "offer", "receive", "react"],
    "react",
    () => renderOptions(),
  );
  const cue = select(
    add,
    "New action cue",
    ui.beat.cues.map((c) => c.id),
    ui.beat.cues[0]!.id,
    () => {},
  );
  const offset = field(add, "New action offset", 0, () => {}, "number");
  const duration = field(add, "New action duration", 24, () => {}, "number");
  add.append(options);
  let first: HTMLSelectElement,
    second: HTMLSelectElement,
    finish: HTMLSelectElement,
    x: HTMLInputElement,
    y: HTMLInputElement;
  function renderOptions() {
    options.replaceChildren();
    const node = characters.find((n) => n.id === actor.value)!;
    if (node.type !== "image") return;
    const poses = node.states.map((s) => s.pose!);
    first = select(
      options,
      "New action pose",
      poses,
      poses.includes(kind.value) ? kind.value : poses[0]!,
      () => {},
    );
    second = select(
      options,
      "New action alternate pose",
      poses,
      poses[1] ?? poses[0]!,
      () => {},
    );
    second.parentElement!.hidden = kind.value !== "walk";
    finish = select(
      options,
      "New action finish pose",
      [keepPose, ...poses],
      keepPose,
      () => {},
    );
    x = field(options, "New action destination x", node.x, () => {}, "number");
    y = field(options, "New action destination y", node.y, () => {}, "number");
    x.parentElement!.hidden = y.parentElement!.hidden = kind.value !== "walk";
  }
  renderOptions();
  button(add, "Add character action", () => {
    const occupied = new Set(ui.events.map((e) => e.id));
    let i = 1;
    while (occupied.has(`${actor.value}-${kind.value}-${i}`)) i++;
    const action = {
      id: `${actor.value}-${kind.value}-${i}`,
      actor: actor.value,
      kind: kind.value,
      anchor: { type: "cue", id: cue.value },
      offset: Number(offset.value),
      durationFrames: Number(duration.value),
      ...(finish.value !== keepPose ? { finishPose: finish.value } : {}),
      ...(kind.value === "walk"
        ? {
            poses: [first.value, second.value],
            to: [Number(x.value), Number(y.value)],
            stepFrames: 8,
          }
        : { pose: first.value }),
    };
    ui.edit((b) => {
      (b.actions ??= []).push(CharacterActionSchema.parse(action));
    });
  });
}
