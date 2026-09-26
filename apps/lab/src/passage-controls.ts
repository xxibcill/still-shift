import { MotionEasingSchema } from "../../../packages/scene-contract/src/motion-easing.ts";
import {
  StoryAuthoringPlanSchema,
  type PassagePlan,
} from "../../../packages/scene-contract/src/story-authoring.ts";
import type { createPassageEditor } from "../../../packages/renderer-core/src/passage-editor.ts";
import type { PassageTemplate } from "../../../packages/renderer-core/src/story-template.ts";
import type { PassageDiagnostic } from "../../../packages/renderer-core/src/passage-diagnostics.ts";

type PassageEditor = ReturnType<typeof createPassageEditor>;
type LinkedBeat = Extract<
  PassagePlan,
  { schemaVersion: "story-passage-2" }
>["beats"][number];
type PassageControlActions = {
  apply(change: (draft: PassagePlan) => void): Promise<void>;
  editBeat(change: (beat: LinkedBeat) => void): void;
  seek(frame: number): void;
  jumpToDiagnostic(diagnostic: PassageDiagnostic): void;
};

export function createPassageControls({
  apply,
  editBeat,
  seek,
  jumpToDiagnostic,
}: PassageControlActions) {
  const el = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const beatSelect = el<HTMLSelectElement>("beat");
  const nodeSelect = el<HTMLSelectElement>("node");

  const option = (value: string, label = value) => {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = label;
    return node;
  };
  function field(
    host: HTMLElement,
    label: string,
    value: string | number,
    change: (value: string) => void,
    type = "text",
  ) {
    const row = document.createElement("label");
    row.className = "field";
    row.append(document.createTextNode(label));
    const input = document.createElement("input");
    input.type = type;
    input.value = String(value);
    input.setAttribute("aria-label", label);
    if (type === "number") input.step = "1";
    input.onchange = () => change(input.value);
    row.append(input);
    host.append(row);
    return input;
  }
  function select(
    host: HTMLElement,
    label: string,
    values: string[],
    value: string,
    change: (value: string) => void,
  ) {
    const row = document.createElement("label");
    row.className = "field";
    row.append(document.createTextNode(label));
    const input = document.createElement("select");
    input.setAttribute("aria-label", label);
    input.append(...values.map((v) => option(v)));
    input.value = value;
    input.onchange = () => change(input.value);
    row.append(input);
    host.append(row);
    return input;
  }
  function button(host: HTMLElement, title: string, action: () => void) {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = title;
    node.onclick = action;
    host.append(node);
    return node;
  }
  function renderControls(
    editor: PassageEditor,
    templates: ReadonlyMap<string, PassageTemplate>,
  ) {
    const passage = editor.passage,
      selected = beatSelect.value;
    beatSelect.replaceChildren(
      ...passage.beats.map((b, i) => option(String(i), b.id)),
    );
    beatSelect.value = selected || "0";
    el<HTMLButtonElement>("undo").disabled = !editor.canUndo;
    el<HTMLButtonElement>("redo").disabled = !editor.canRedo;
    renderInspector(editor, templates);
    renderTimeline(passage);
    const host = el("diagnostics");
    host.replaceChildren();
    if (!passage.diagnostics.length)
      host.textContent = "No compiler diagnostics.";
    for (const diagnostic of passage.diagnostics)
      button(
        host,
        `${diagnostic.beat} · ${diagnostic.code}: ${diagnostic.message}`,
        () => jumpToDiagnostic(diagnostic),
      ).className = "note";
  }
  function renderInspector(
    editor: PassageEditor,
    templates: ReadonlyMap<string, PassageTemplate>,
  ) {
    const passage = editor.passage,
      index = Number(beatSelect.value) || 0,
      beat = passage.plan.beats[index]!,
      compiled = passage.beats[index]!;
    el("takeaway").textContent = beat.takeaway;
    const node = nodeSelect.value;
    nodeSelect.replaceChildren(
      ...compiled.scene.nodes.map((n) => option(n.id)),
    );
    if ([...nodeSelect.options].some((o) => o.value === node))
      nodeSelect.value = node;
    for (const id of ["cues", "bindings", "parameters", "style", "handoff"])
      el(id).replaceChildren();
    if (
      passage.plan.schemaVersion !== "story-passage-2" ||
      !("bindings" in beat)
    ) {
      button(el("cues"), "Enable linked authoring", () => {
        void apply((plan) => {
          const next = StoryAuthoringPlanSchema.parse({
            ...plan,
            schemaVersion: "story-passage-2",
            contentPolicy: "historical",
            styleProfile: {
              schemaVersion: "story-style-1",
              id: "layered-chronicle-1",
            },
          });
          Object.assign(plan, next);
        });
      });
      return;
    }
    for (const cue of beat.cues)
      field(
        el("cues"),
        cue.id + " frame",
        cue.frame,
        (value) =>
          editBeat((b) => {
            b.cues.find((c) => c.id === cue.id)!.frame = Number(value);
          }),
        "number",
      );
    for (const event of compiled.events) {
      const group = document.createElement("div");
      group.className = "event";
      el("bindings").append(group);
      const title = document.createElement("div");
      title.className = "event-title";
      title.textContent = `${event.id} · ${event.start}–${event.end}`;
      group.append(title);
      const binding = beat.bindings[event.id];
      if (!binding) {
        if (beat.cues.length)
          button(group, "Link " + event.id + " to cue", () =>
            editBeat((b) => {
              delete b.timing[event.id];
              b.bindings[event.id] = {
                anchor: { type: "cue", id: b.cues[0]!.id },
                offset: event.start - b.cues[0]!.frame,
                duration: event.end - event.start,
              };
            }),
          );
        continue;
      }
      const choices = [
        ...beat.cues.map((c) => "cue:" + c.id),
        ...compiled.events
          .filter((e) => e.id !== event.id)
          .flatMap((e) => ["start:" + e.id, "end:" + e.id]),
      ];
      const current =
        binding.anchor.type === "cue"
          ? "cue:" + binding.anchor.id
          : binding.anchor.edge + ":" + binding.anchor.id;
      select(group, event.id + " anchor", choices, current, (value) =>
        editBeat((b) => {
          const split = value.indexOf(":"),
            kind = value.slice(0, split),
            id = value.slice(split + 1);
          b.bindings[event.id]!.anchor =
            kind === "cue"
              ? { type: "cue", id }
              : { type: "event", id, edge: kind as "start" | "end" };
        }),
      );
      for (const key of ["offset", "duration"] as const)
        field(
          group,
          event.id + " " + key,
          binding[key],
          (value) =>
            editBeat((b) => {
              b.bindings[event.id]![key] = Number(value);
            }),
          "number",
        );
      button(group, "Unlink " + event.id, () =>
        editBeat((b) => {
          delete b.bindings[event.id];
          if (event.end > event.start)
            b.timing[event.id] = { start: event.start, end: event.end };
        }),
      );
    }
    const template = templates.get(beat.template)!;
    if (template.schemaVersion === "story-template-1")
      for (const [id, slot] of Object.entries(template.slots)) {
        const value = beat.parameters[id];
        const put = (next: unknown) =>
          editBeat((b) => {
            b.parameters[id] = next;
          });
        if (slot.kind === "text")
          field(
            el("parameters"),
            id,
            typeof value === "string" ? value : "",
            put,
          );
        if (slot.kind === "subject" || slot.kind === "timing") {
          const keys =
            slot.kind === "subject"
              ? ["x", "y", "width", "height"]
              : ["start", "end"];
          const original =
            slot.kind === "subject"
              ? template.scene.nodes.find((n) => n.id === slot.node)
              : compiled.events.find((e) => e.id === slot.event);
          const record = {
            ...original,
            ...(value && typeof value === "object" ? value : {}),
          } as Record<string, unknown>;
          for (const key of keys)
            field(
              el("parameters"),
              id + " " + key,
              Number(record[key] ?? 0),
              (v) =>
                put({
                  ...Object.fromEntries(keys.map((k) => [k, record[k]])),
                  [key]: Number(v),
                }),
              "number",
            );
        }
        if (slot.kind === "asset")
          select(
            el("parameters"),
            id,
            template.scene.assets.map((a) => a.id),
            value && typeof value === "object" && "id" in value
              ? String(value.id)
              : slot.asset,
            (v) => put(template.scene.assets.find((a) => a.id === v)!),
          );
        if (slot.kind === "relationship") {
          const connector = template.scene.connectors.find(
            (c) => c.path === slot.path,
          )!;
          const current = value as typeof connector | undefined;
          for (const end of ["from", "to"] as const)
            select(
              el("parameters"),
              id + " " + end,
              template.scene.nodes.map((n) => n.id),
              current?.[end].node ?? connector[end].node,
              (v) =>
                put({
                  ...(current ?? connector),
                  [end]: { ...(current?.[end] ?? connector[end]), node: v },
                }),
            );
        }
      }
    const style = passage.plan.styleProfile;
    field(el("style"), "Profile name", style.id, (value) => {
      void apply((p) => {
        if (p.schemaVersion === "story-passage-2") p.styleProfile.id = value;
      });
    });
    field(
      el("style"),
      "Background",
      style.background ?? compiled.scene.background,
      (value) => {
        void apply((p) => {
          if (p.schemaVersion === "story-passage-2")
            p.styleProfile.background = value;
        });
      },
      "color",
    );
    field(
      el("style"),
      "Safe inset",
      style.safeInset ?? "",
      (value) => {
        void apply((p) => {
          if (p.schemaVersion === "story-passage-2") {
            if (value) p.styleProfile.safeInset = Number(value);
            else delete p.styleProfile.safeInset;
          }
        });
      },
      "number",
    );
    const lineHeight = field(
      el("style"),
      "Text line height",
      style.lineHeight ?? "",
      (value) => {
        void apply((p) => {
          if (p.schemaVersion === "story-passage-2") {
            if (value) p.styleProfile.lineHeight = Number(value);
            else delete p.styleProfile.lineHeight;
          }
        });
      },
      "number",
    );
    lineHeight.step = "0.1";
    field(
      el("style"),
      "Path stroke width",
      style.lineWidth ?? "",
      (value) => {
        void apply((p) => {
          if (p.schemaVersion === "story-passage-2") {
            if (value) p.styleProfile.lineWidth = Number(value);
            else delete p.styleProfile.lineWidth;
          }
        });
      },
      "number",
    );
    for (const role of ["heading", "label", "qualification", "body"] as const) {
      const representative = compiled.scene.nodes.find(
        (n) => n.type === "text" && n.textRole === role,
      );
      if (representative?.type !== "text") continue;
      field(
        el("style"),
        role + " size",
        style.text?.[role]?.fontSize ?? representative.fontSize,
        (value) => {
          void apply((p) => {
            if (p.schemaVersion === "story-passage-2") {
              p.styleProfile.text ??= {};
              p.styleProfile.text[role] = {
                ...p.styleProfile.text[role],
                fontSize: Number(value),
              };
            }
          });
        },
        "number",
      );
      field(
        el("style"),
        role + " color",
        style.text?.[role]?.color ?? representative.color,
        (value) => {
          void apply((p) => {
            if (p.schemaVersion === "story-passage-2") {
              p.styleProfile.text ??= {};
              p.styleProfile.text[role] = {
                ...p.styleProfile.text[role],
                color: value,
              };
            }
          });
        },
        "color",
      );
      if (compiled.scene.fonts?.length)
        select(
          el("style"),
          role + " font",
          compiled.scene.fonts.map((f) => f.id),
          style.text?.[role]?.fontAsset ?? representative.fontAsset ?? "",
          (value) => {
            void apply((p) => {
              if (p.schemaVersion === "story-passage-2") {
                p.styleProfile.text ??= {};
                p.styleProfile.text[role] = {
                  ...p.styleProfile.text[role],
                  fontAsset: value,
                };
              }
            });
          },
        );
    }
    select(
      el("style"),
      "Default easing",
      ["template default", ...MotionEasingSchema.options],
      style.easing ?? "template default",
      (value) => {
        void apply((p) => {
          if (p.schemaVersion === "story-passage-2") {
            if (value === "template default") delete p.styleProfile.easing;
            else p.styleProfile.easing = MotionEasingSchema.parse(value);
          }
        });
      },
    );
    select(
      el("handoff"),
      "Join mode",
      ["cut", "continue", "reset"],
      beat.handoff.mode,
      (value) =>
        editBeat((b) => {
          b.handoff.mode = value as typeof b.handoff.mode;
        }),
    );
    select(
      el("handoff"),
      "Camera handoff",
      ["reset", "carry"],
      beat.handoff.camera,
      (value) =>
        editBeat((b) => {
          b.handoff.camera = value as typeof b.handoff.camera;
        }),
    );
    for (const [i, mapping] of beat.handoff.subjects.entries()) {
      select(
        el("handoff"),
        mapping.id + " mode",
        ["carry", "reset", "enter", "exit"],
        mapping.mode,
        (value) =>
          editBeat((b) => {
            b.handoff.subjects[i]!.mode = value as typeof mapping.mode;
          }),
      );
      const previous = passage.beats[index - 1];
      if (previous)
        select(
          el("handoff"),
          mapping.id + " from",
          previous.scene.nodes.filter((n) => !n.parent).map((n) => n.id),
          mapping.from ?? "",
          (value) =>
            editBeat((b) => {
              b.handoff.subjects[i]!.from = value;
            }),
        );
      select(
        el("handoff"),
        mapping.id + " to",
        compiled.scene.nodes.filter((n) => !n.parent).map((n) => n.id),
        mapping.to ?? "",
        (value) =>
          editBeat((b) => {
            b.handoff.subjects[i]!.to = value;
          }),
      );
      button(el("handoff"), "Remove " + mapping.id, () =>
        editBeat((b) => {
          b.handoff.subjects.splice(i, 1);
        }),
      );
    }
    button(el("handoff"), "Add subject mapping", () =>
      editBeat((b) => {
        const target = compiled.scene.nodes.find((n) => !n.parent)!;
        b.handoff.subjects.push({
          id: "subject-" + (b.handoff.subjects.length + 1),
          mode: "reset",
          to: target.id,
          properties: ["x", "y", "scaleX", "scaleY", "rotation", "opacity"],
        });
      }),
    );
  }
  function renderTimeline(passage: PassageEditor["passage"]) {
    const host = el("timeline");
    host.replaceChildren();
    const track = (
      label: string,
      items: { start: number; end: number; title: string; kind?: string }[],
    ) => {
      const row = document.createElement("div");
      row.className = "track";
      const name = document.createElement("span");
      name.textContent = label;
      name.title = label;
      row.append(name);
      const body = document.createElement("div");
      body.className = "track-body";
      row.append(body);
      host.append(row);
      for (const item of items) {
        const mark = button(body, item.title, () => {
          seek(item.start);
        });
        mark.className = "track-mark " + (item.kind ?? "");
        mark.title = `${item.title}: ${item.start}–${item.end}`;
        mark.dataset.start = String(item.start);
        mark.dataset.end = String(item.end);
        mark.style.left = `${(item.start / passage.frameCount) * 100}%`;
        mark.style.width = `${(Math.max(1, item.end - item.start) / passage.frameCount) * 100}%`;
      }
    };
    track(
      "Beats",
      passage.beats.map((b) => ({
        start: b.start,
        end: b.end - 1,
        title: b.id,
      })),
    );
    track(
      "Narration cues",
      passage.beats.flatMap((b) =>
        b.cues.map((c) => ({
          start: c.localFrame,
          end: c.localFrame,
          title: c.id,
          kind: "cue",
        })),
      ),
    );
    for (const kind of [
      "recipe",
      "choreography",
      "text-reveal",
      "camera",
      "flow",
      "cut",
    ]) {
      const events = passage.beats.flatMap((b) =>
        b.events
          .filter((e) => e.kind === kind)
          .map((e) => ({
            start: b.start + e.start,
            end: b.start + e.end,
            title: e.id,
            kind,
          })),
      );
      for (const id of new Set(events.map((event) => event.title)))
        track(
          id,
          events.filter((event) => event.title === id),
        );
    }
  }
  return { renderControls, renderInspector };
}
