import {
  PropTrackSchema,
  type PropHold,
} from "../../../packages/scene-contract/src/character-actions.ts";
import { group, anchorValue, parseAnchor } from "./passage-acting-controls.ts";
import type { ActingControls } from "./character-action-controls.ts";

const holdValue = (hold: PropHold | null) =>
  hold ? `${hold.actor}:${hold.anchor}` : "unattached";
function parseHold(value: string): PropHold | null {
  if (value === "unattached") return null;
  const [actor, anchor] = value.split(":");
  return { actor: actor!, anchor: anchor!, offset: [0, 0] };
}
function holdChoices(ui: ActingControls) {
  return [
    "unattached",
    ...ui.scene.nodes.flatMap((n) =>
      n.type === "image" && n.states.every((s) => s.pose)
        ? [
            ...new Set(n.states.flatMap((s) => Object.keys(s.anchors ?? {}))),
          ].map((a) => `${n.id}:${a}`)
        : [],
    ),
  ];
}

export function renderPropAttachmentControls(
  host: HTMLElement,
  ui: ActingControls,
) {
  host.replaceChildren();
  const { beat, field, select, button, edit } = ui,
    holds = holdChoices(ui);
  for (const [id, track] of Object.entries(beat.propTracks ?? {})) {
    const row = group(host, id);
    select(row, id + " initial holder", holds, holdValue(track.initial), (v) =>
      edit((b) => {
        b.propTracks![id]!.initial = parseHold(v);
      }),
    );
    for (const [i, axis] of [
      [0, "x"],
      [1, "y"],
    ] as const)
      field(
        row,
        `${id} grip ${axis}`,
        track.grip[i],
        (v) =>
          edit((b) => {
            b.propTracks![id]!.grip[i] = Number(v);
          }),
        "number",
      ).step = "0.01";
    for (const change of track.changes) {
      const child = group(row, change.id);
      const update = (fn: (c: typeof change) => void) =>
        edit((b) =>
          fn(b.propTracks![id]!.changes.find((c) => c.id === change.id)!),
        );
      const anchors = [
        ...beat.cues.map((c) => "cue:" + c.id),
        ...ui.events
          .filter((e) => e.id !== change.id)
          .flatMap((e) => ["start:" + e.id, "end:" + e.id]),
      ];
      select(
        child,
        change.id + " prop anchor",
        anchors,
        anchorValue(change.anchor),
        (v) =>
          update((c) => {
            c.anchor = parseAnchor(v);
          }),
      );
      field(
        child,
        change.id + " prop offset",
        change.offset,
        (v) =>
          update((c) => {
            c.offset = Number(v);
          }),
        "number",
      );
      select(child, change.id + " holder", holds, holdValue(change.hold), (v) =>
        update((c) => {
          c.hold = parseHold(v);
          if (!c.hold) c.transitionFrames = 0;
        }),
      );
      if (change.hold)
        field(
          child,
          change.id + " transfer frames",
          change.transitionFrames,
          (v) =>
            update((c) => {
              c.transitionFrames = Number(v);
            }),
          "number",
        );
      button(child, "Remove prop change " + change.id, () =>
        edit((b) => {
          b.propTracks![id]!.changes = b.propTracks![id]!.changes.filter(
            (c) => c.id !== change.id,
          );
        }),
      );
    }
    if (beat.cues.length) {
      const add = group(row, "Pickup, transfer or release"),
        cue = select(
          add,
          `New ${id} prop cue`,
          beat.cues.map((c) => c.id),
          beat.cues[0]!.id,
          () => {},
        ),
        holder = select(add, `New ${id} holder`, holds, "unattached", () => {}),
        offset = field(add, `New ${id} prop offset`, 0, () => {}, "number"),
        frames = field(add, `New ${id} transfer frames`, 0, () => {}, "number");
      button(add, "Add prop change for " + id, () => {
        const hold = parseHold(holder.value),
          anchor = { type: "cue" as const, id: cue.value },
          shift = Number(offset.value),
          duration = hold ? Number(frames.value) : 0;
        let i = 1;
        while (ui.events.some((e) => e.id === `${id}-hold-${i}`)) i++;
        edit((b) => {
          b.propTracks![id]!.changes.push({
            id: `${id}-hold-${i}`,
            anchor,
            offset: shift,
            hold,
            transitionFrames: duration,
          });
        });
      });
    }
    button(row, "Remove attachment track for " + id, () =>
      edit((b) => {
        delete b.propTracks![id];
      }),
    );
  }
  const props = ui.scene.nodes.filter(
    (n) =>
      n.type === "image" &&
      !n.states.some((s) => s.pose) &&
      !beat.propTracks?.[n.id],
  );
  if (holds.length === 1) {
    host.append(
      "Add named hand anchors to the character's pose artwork before attaching a prop.",
    );
    return;
  }
  if (!props.length) return;
  const add = group(host, "New prop attachment"),
    target = select(
      add,
      "New prop",
      props.map((p) => p.id),
      props.find((p) => p.id === "parcel")?.id ?? props[0]!.id,
      () => {},
    ),
    holder = select(
      add,
      "New prop initial holder",
      holds,
      "unattached",
      () => {},
    );
  button(add, "Add prop attachment", () => {
    const id = target.value,
      initial = parseHold(holder.value);
    edit((b) => {
      b.propTracks ??= {};
      b.propTracks[id] = PropTrackSchema.parse({ initial });
    });
  });
}
