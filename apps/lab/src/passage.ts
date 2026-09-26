import { MotionEasingSchema } from "../../../packages/scene-contract/src/motion-easing.ts";
import { evaluateStoryPath } from "../../../packages/renderer-core/src/story-geometry.ts";
import {
  StoryAuthoringPlanSchema,
  parsePassagePlan,
  type PassagePlan,
} from "../../../packages/scene-contract/src/story-authoring.ts";
import { createPassageEditor } from "../../../packages/renderer-core/src/passage-editor.ts";
import {
  compileStoryPassage,
  locatePassageFrame,
  type CompiledStoryPassage,
} from "../../../packages/renderer-core/src/story-passage.ts";
import {
  parsePassageTemplate,
  type PassageTemplate,
} from "../../../packages/renderer-core/src/story-template.ts";
import {
  passageDiagnostics,
  type PassageDiagnostic,
} from "../../../packages/renderer-core/src/passage-diagnostics.ts";
import { compileStoryScene } from "../../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNode } from "../../../packages/renderer-core/src/prepared-scene.ts";
import {
  createIllustratedPreview,
  loadIllustratedImages,
} from "../../../packages/renderer-core/src/illustrated-renderer.ts";
import { storyCameraTransform } from "../../../packages/renderer-core/src/story-camera.ts";
import { sha256Hex } from "../../../packages/renderer-core/src/browser-checksum.ts";

const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>("preview"),
  overlay = el<HTMLCanvasElement>("overlay"),
  slider = el<HTMLInputElement>("scrub");
const beatSelect = el<HTMLSelectElement>("beat"),
  nodeSelect = el<HTMLSelectElement>("node");
let editor: ReturnType<typeof createPassageEditor> | undefined;
let templates = new Map<string, PassageTemplate>();
type ReadyBeat = {
  scene: ReturnType<typeof compileStoryScene>;
  preview: ReturnType<typeof createIllustratedPreview>;
  canvas: HTMLCanvasElement;
};
let previews: ReadyBeat[] = [],
  frame = 0,
  animation = 0,
  playing = false,
  started = 0,
  generation = 0;
const audio = new Audio();
let audioUrl: string | undefined;
type FailedEdit = { beat: string; draft: PassagePlan | undefined };
const errors = (error: unknown, failedEdit?: FailedEdit) => {
  const host = el("errors");
  host.replaceChildren();
  for (const diagnostic of passageDiagnostics(error)) {
    const label = [
      diagnostic.beat,
      diagnostic.node,
      diagnostic.event,
      diagnostic.message,
    ]
      .filter(Boolean)
      .join(" · ");
    if (failedEdit && diagnosticBeat(diagnostic, failedEdit.beat))
      button(host, label, () =>
        jumpToDiagnostic(diagnostic, failedEdit),
      ).className = "note";
    else {
      const line = document.createElement("div");
      line.textContent = label;
      host.append(line);
    }
  }
};
const stop = () => {
  playing = false;
  cancelAnimationFrame(animation);
  audio.pause();
  el("play").textContent = "Play";
};
const assetUrl = (path: string) =>
  "/passage-api/asset?path=" + encodeURIComponent(path);
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
async function preparePreviews(passage: CompiledStoryPassage) {
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
function installPreviews(ready: ReadyBeat[]) {
  previews.forEach((p) => p.preview.dispose());
  previews = ready;
  slider.max = String(editor!.passage.frameCount - 1);
  frame = Math.min(frame, editor!.passage.frameCount - 1);
  renderControls();
  show(frame);
  el("status").textContent =
    `${editor!.passage.plan.title} · ${editor!.passage.beats.length} beats · ${editor!.passage.frameCount} frames · ${editor!.passage.plan.fps} fps`;
  el("errors").textContent = "";
}
let edits = Promise.resolve();
function apply(change: (draft: PassagePlan) => void) {
  const owner = editor;
  const editBeat = owner?.passage.beats[Number(beatSelect.value)]?.id;
  const task = async () => {
    if (editor !== owner) return;
    if (!editor) return;
    stop();
    const ticket = ++generation;
    let draft: PassagePlan | undefined;
    try {
      draft = structuredClone(editor.passage.plan);
      change(draft);
      const candidate = compileStoryPassage(draft, templates);
      const ready = await preparePreviews(candidate);
      if (ticket !== generation) {
        ready.forEach((p) => p.preview.dispose());
        return;
      }
      editor.edit(change);
      installPreviews(ready);
    } catch (error) {
      if (ticket === generation)
        errors(error, editBeat ? { beat: editBeat, draft } : undefined);
    }
  };
  edits = edits.then(task, task);
  return edits;
}
const editBeat = (
  change: (
    beat: Extract<
      PassagePlan,
      { schemaVersion: "story-passage-2" }
    >["beats"][number],
  ) => void,
) => {
  const index = Number(beatSelect.value);
  void apply((plan) => {
    if (plan.schemaVersion !== "story-passage-2")
      throw new Error("Enable linked authoring first");
    change(plan.beats[index]!);
  });
};
function show(next: number) {
  if (!editor || !previews.length) return;
  frame = next;
  slider.value = String(frame);
  el("timeline").style.setProperty(
    "--playhead",
    `${(frame / editor.passage.frameCount) * 100}%`,
  );
  const at = locatePassageFrame(editor.passage, frame),
    index = editor.passage.beats.indexOf(at.beat),
    ready = previews[index]!;
  ready.preview.renderFrame(at.frame);
  canvas.getContext("2d")!.drawImage(ready.canvas, 0, 0);
  el("frame-label").textContent =
    `Frame ${frame} · Beat ${at.frame} · Source ${at.sourceFrame} · ${(frame / editor.passage.plan.fps).toFixed(2)} s`;
  if (beatSelect.value !== String(index)) {
    beatSelect.value = String(index);
    renderInspector();
  }
  const node = ready.scene.nodes.find((n) => n.id === nodeSelect.value);
  el("node-state").textContent = node
    ? JSON.stringify(
        {
          id: node.id,
          frame: at.frame,
          ...evaluatePreparedNode(ready.scene, node, at.frame),
        },
        null,
        2,
      )
    : "Choose a node";
  drawOverlays(ready.scene, at.frame);
  for (const mark of document.querySelectorAll<HTMLElement>(".track-mark"))
    mark.classList.toggle(
      "active",
      frame >= Number(mark.dataset.start) && frame <= Number(mark.dataset.end),
    );
}
function diagnosticBeat(diagnostic: PassageDiagnostic, fallbackBeat?: string) {
  if (!editor || !previews.length) return undefined;
  const beats = editor.passage.beats;
  const pathIndex = /^beats\.(\d+)(?:\.|$)/.exec(diagnostic.path ?? "");
  return (
    beats.find((beat) => beat.id === diagnostic.beat) ??
    (pathIndex ? beats[Number(pathIndex[1])] : undefined) ??
    beats.find((beat) => beat.id === fallbackBeat)
  );
}
function attemptedCueFrame(
  diagnostic: PassageDiagnostic,
  beatIndex: number,
  draft?: PassagePlan,
) {
  const path = /^beats\.(\d+)\.cues(?:\.(\d+))?/.exec(diagnostic.path ?? "");
  if (!path || Number(path[1]) !== beatIndex || !draft || !editor)
    return undefined;
  const candidate = draft.beats[beatIndex];
  const current = editor.passage.plan.beats[beatIndex];
  const cueIndex = path[2]
    ? Number(path[2])
    : candidate?.cues.findIndex(
        (cue, index) => cue.frame !== current?.cues[index]?.frame,
      );
  return cueIndex === undefined || cueIndex < 0
    ? undefined
    : candidate?.cues[cueIndex]?.frame;
}
function jumpToDiagnostic(
  diagnostic: PassageDiagnostic,
  failedEdit?: FailedEdit,
) {
  const beat = diagnosticBeat(diagnostic, failedEdit?.beat);
  if (!beat || !editor) return;
  const beatIndex = editor.passage.beats.indexOf(beat);
  const event = beat.events.find((event) => event.id === diagnostic.event);
  const localFrame =
    diagnostic.frame ??
    attemptedCueFrame(diagnostic, beatIndex, failedEdit?.draft) ??
    event?.start ??
    0;
  const boundedFrame = Number.isFinite(localFrame)
    ? Math.max(0, Math.min(Math.trunc(localFrame), beat.end - beat.start - 1))
    : 0;
  const node = [diagnostic.node, ...(event?.nodes ?? [])].find(
    (id) => id && beat.scene.nodes.some((candidate) => candidate.id === id),
  );
  stop();
  beatSelect.value = String(beatIndex);
  renderInspector();
  if (node) nodeSelect.value = node;
  show(beat.start + boundedFrame);
}
function drawOverlays(scene: ReadyBeat["scene"], localFrame: number) {
  const ctx = overlay.getContext("2d")!;
  ctx.clearRect(0, 0, 1920, 1080);
  if (el<HTMLInputElement>("show-safe").checked) {
    const inset = scene.safeInset ?? 0;
    ctx.strokeStyle = "#d4b777";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(inset, inset, 1920 - inset * 2, 1080 - inset * 2);
    ctx.setLineDash([]);
  }
  const bounds = el<HTMLInputElement>("show-bounds").checked,
    diagnostics = el<HTMLInputElement>("show-diagnostics").checked;
  if (!bounds && !diagnostics) return;
  const beat = editor!.passage.beats[Number(beatSelect.value)]!;
  const targets = new Set(
    editor!.passage.diagnostics
      .filter((d) => d.beat === beat.id && "node" in d)
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
          : node.id === nodeSelect.value
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
function renderControls() {
  const passage = editor!.passage,
    selected = beatSelect.value;
  beatSelect.replaceChildren(
    ...passage.beats.map((b, i) => option(String(i), b.id)),
  );
  beatSelect.value = selected || "0";
  el<HTMLButtonElement>("undo").disabled = !editor!.canUndo;
  el<HTMLButtonElement>("redo").disabled = !editor!.canRedo;
  renderInspector();
  renderTimeline();
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
function renderInspector() {
  const passage = editor!.passage,
    index = Number(beatSelect.value) || 0,
    beat = passage.plan.beats[index]!,
    compiled = passage.beats[index]!;
  el("takeaway").textContent = beat.takeaway;
  const node = nodeSelect.value;
  nodeSelect.replaceChildren(...compiled.scene.nodes.map((n) => option(n.id)));
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
    style.safeInset,
    (value) => {
      void apply((p) => {
        if (p.schemaVersion === "story-passage-2")
          p.styleProfile.safeInset = Number(value);
      });
    },
    "number",
  );
  const lineHeight = field(
    el("style"),
    "Text line height",
    style.lineHeight,
    (value) => {
      void apply((p) => {
        if (p.schemaVersion === "story-passage-2")
          p.styleProfile.lineHeight = Number(value);
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
function renderTimeline() {
  const passage = editor!.passage,
    host = el("timeline");
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
        stop();
        show(item.start);
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
    passage.beats.map((b) => ({ start: b.start, end: b.end - 1, title: b.id })),
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
async function loadPacket(packet: {
  plan: unknown;
  templates: Record<string, unknown>;
}) {
  stop();
  const ticket = ++generation;
  const nextTemplates = new Map(
    Object.entries(packet.templates).map(([key, value]) => [
      key,
      parsePassageTemplate(value),
    ]),
  );
  const nextEditor = createPassageEditor(
    parsePassagePlan(packet.plan),
    nextTemplates,
  );
  const ready = await preparePreviews(nextEditor.passage);
  if (ticket !== generation) {
    ready.forEach((p) => p.preview.dispose());
    return;
  }
  templates = nextTemplates;
  editor = nextEditor;
  frame = 0;
  beatSelect.value = "0";
  audio.removeAttribute("src");
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = undefined;
  installPreviews(ready);
}
async function loadPath() {
  try {
    const response = await fetch(
      "/passage-api/load?path=" +
        encodeURIComponent(el<HTMLInputElement>("plan-path").value),
    );
    const packet = await response.json();
    if (!response.ok)
      throw new Error(
        packet.diagnostics
          .map((d: { message: string }) => d.message)
          .join("\n"),
      );
    await loadPacket(packet);
  } catch (error) {
    errors(error);
    el("status").textContent =
      "Passage could not load; the previous preview is retained.";
  }
}
function download(filename: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
el<HTMLFormElement>("load-form").onsubmit = (event) => {
  event.preventDefault();
  void loadPath();
};
el<HTMLInputElement>("open-workspace").onchange = async (event) => {
  try {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const input = JSON.parse(await file.text());
    if (input.schemaVersion === "story-workspace-1") await loadPacket(input);
    else {
      const response = await fetch("/passage-api/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: parsePassagePlan(input),
          basePath: el<HTMLInputElement>("plan-path").value,
        }),
      });
      const prepared = await response.json();
      if (!response.ok)
        throw new Error(
          prepared.diagnostics
            .map((d: { message: string }) => d.message)
            .join("\n"),
        );
      await loadPacket(prepared);
    }
  } catch (error) {
    errors(error);
  }
};
el("save-plan").onclick = () => {
  if (editor) download(editor.passage.plan.id + ".json", editor.passage.plan);
};
el("save-workspace").onclick = () => {
  if (editor)
    download(editor.passage.plan.id + ".workspace.json", {
      schemaVersion: "story-workspace-1",
      plan: editor.passage.plan,
      templates: Object.fromEntries(templates),
    });
};
for (const name of ["undo", "redo"] as const)
  el(name).onclick = () => {
    const owner = editor;
    const task = async () => {
      if (!editor || editor !== owner) return;
      stop();
      const ticket = ++generation;
      try {
        editor[name]();
        const ready = await preparePreviews(editor.passage);
        if (ticket === generation) installPreviews(ready);
        else ready.forEach((p) => p.preview.dispose());
      } catch (error) {
        errors(error);
      }
    };
    edits = edits.then(task, task);
  };
beatSelect.onchange = () => {
  stop();
  renderInspector();
  show(editor!.passage.beats[Number(beatSelect.value)]!.start);
};
nodeSelect.onchange = () => show(frame);
slider.oninput = () => {
  stop();
  show(Number(slider.value));
};
el("restart").onclick = () => {
  stop();
  show(0);
};
for (const name of ["show-bounds", "show-safe", "show-diagnostics"])
  el<HTMLInputElement>(name).onchange = () => show(frame);
const tick = (now: number) => {
  if (!playing || !editor) return;
  const fps = editor.passage.plan.fps;
  const next = audio.src
    ? Math.floor(
        audio.currentTime * fps -
          editor.passage.plan.sourceStartFrame +
          0.00001,
      )
    : Math.floor(((now - started) * fps) / 1000);
  if (next >= editor.passage.frameCount) {
    show(editor.passage.frameCount - 1);
    stop();
    return;
  }
  show(Math.max(0, next));
  animation = requestAnimationFrame(tick);
};
el("play").onclick = async () => {
  if (!editor) return;
  if (playing) {
    stop();
    return;
  }
  if (frame === editor.passage.frameCount - 1) show(0);
  started = performance.now() - (frame / editor.passage.plan.fps) * 1000;
  try {
    if (audio.src) {
      audio.currentTime =
        (editor.passage.plan.sourceStartFrame + frame) /
        editor.passage.plan.fps;
      await audio.play();
    }
    playing = true;
    el("play").textContent = "Pause";
    animation = requestAnimationFrame(tick);
  } catch (error) {
    errors(error);
  }
};
audio.onended = stop;
el<HTMLInputElement>("narration").onchange = async (event) => {
  stop();
  try {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !editor) return;
    const identity = editor.passage.plan.narration;
    if (!identity)
      throw new Error(
        "This plan has no narration identity. Add one before previewing narration.",
      );
    const digest = await sha256Hex(await file.arrayBuffer());
    if (digest !== identity.sha256)
      throw new Error("Narration checksum differs from the plan");
    const url = URL.createObjectURL(file);
    audio.src = url;
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error("Cannot decode narration"));
    });
    if (
      audio.duration <
      editor.passage.endFrameExclusive / editor.passage.plan.fps
    ) {
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
      throw new Error("Narration does not cover the passage");
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = url;
    el("status").textContent = "Narration verified and ready.";
  } catch (error) {
    errors(error);
  }
};
declare global {
  interface Window {
    passageLab?: { snapshot(): unknown; seek(frame: number): void };
  }
}
window.passageLab = {
  snapshot: () =>
    editor
      ? {
          plan: editor.passage.plan,
          beats: editor.passage.beats.map((b) => ({
            id: b.id,
            events: b.events,
            scene: b.scene,
          })),
          frame,
          diagnostics: editor.passage.diagnostics,
        }
      : null,
  seek: (value) => {
    stop();
    show(value);
  },
};
await loadPath();
