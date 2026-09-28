import {
  drawStoryTransition,
  isStoryTransition,
} from "../../../packages/renderer-core/src/story-transition.ts";
import {
  parsePassagePlan,
  type PassagePlan,
} from "../../../packages/scene-contract/src/story-authoring.ts";
import { createPassageEditor } from "../../../packages/renderer-core/src/passage-editor.ts";
import {
  compileStoryPassage,
  locatePassageFrame,
} from "../../../packages/renderer-core/src/story-passage.ts";
import {
  parsePassageTemplate,
  instantiateStoryTemplate,
  resolveStoryFormat,
  templateScene,
  type PassageTemplate,
} from "../../../packages/renderer-core/src/story-template.ts";
import {
  StoryFormatOverrideSchema,
  type StoryFormatOverride,
} from "../../../packages/scene-contract/src/story.ts";
import type { OutputFormat } from "../../../packages/scene-contract/src/output-format.ts";
import {
  lintVertical,
  proposeVerticalLayout,
} from "../../../packages/renderer-core/src/story-vertical.ts";
import {
  passageDiagnostics,
  type PassageDiagnostic,
} from "../../../packages/renderer-core/src/passage-diagnostics.ts";
import { evaluatePreparedNode } from "../../../packages/renderer-core/src/prepared-scene.ts";
import { sha256Hex } from "../../../packages/renderer-core/src/browser-checksum.ts";
import { createPassageControls } from "./passage-controls.ts";
import { createMotionTools } from "./motion-tools.ts";
import {
  preparePreviews,
  drawOverlays,
  type ReadyBeat,
} from "./passage-preview.ts";
import { setPreviewAspect } from "./format-guides.ts";

const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>("preview"),
  overlay = el<HTMLCanvasElement>("overlay"),
  slider = el<HTMLInputElement>("scrub");
const formatSelect = el<HTMLSelectElement>("output-format");
const beatSelect = el<HTMLSelectElement>("beat"),
  nodeSelect = el<HTMLSelectElement>("node");
let editor: ReturnType<typeof createPassageEditor> | undefined;
let templates = new Map<string, PassageTemplate>();
let verticalDiagnostics: PassageDiagnostic[] = [];
let previews: ReadyBeat[] = [],
  frame = 0,
  animation = 0,
  playing = false,
  started = 0,
  generation = 0;
let loadRequest = 0;
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
function button(host: HTMLElement, title: string, action: () => void) {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = title;
  node.onclick = action;
  host.append(node);
  return node;
}
function installPreviews(ready: ReadyBeat[]) {
  previews.forEach((p) => p.preview.dispose());
  previews = ready;
  const first = ready[0]?.scene;
  if (first)
    formatSelect.value = first.height > first.width ? "vertical" : "landscape";
  slider.max = String(editor!.passage.frameCount - 1);
  frame = Math.min(frame, editor!.passage.frameCount - 1);
  renderControls();
  renderVerticalOverrideEditor();
  renderMotionInspector();
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
      const candidate = compileStoryPassage(draft, templates, {
        format: editor.format,
      });
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
const controls = createPassageControls({
  apply,
  editBeat,
  seek: (next) => {
    stop();
    show(next);
  },
  jumpToDiagnostic,
});
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
  if (canvas.width !== ready.scene.width) canvas.width = ready.scene.width;
  if (canvas.height !== ready.scene.height) canvas.height = ready.scene.height;
  setPreviewAspect(el("canvas-wrap"), ready.scene);
  ready.preview.renderFrame(at.frame);
  const planned = editor.passage.plan.beats[index]!;
  const handoff = "handoff" in planned ? planned.handoff : undefined;
  if (index && isStoryTransition(handoff) && at.frame < handoff!.frames!) {
    const outgoing = previews[index - 1]!;
    outgoing.preview.renderFrame(
      outgoing.scene.frameCount - handoff!.frames! + at.frame,
    );
    drawStoryTransition(
      canvas.getContext("2d")!,
      outgoing.canvas,
      ready.canvas,
      handoff!,
      at.frame,
      canvas.width,
      canvas.height,
      ready.scene.fps,
    );
  } else canvas.getContext("2d")!.drawImage(ready.canvas, 0, 0);
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
  drawOverlays(overlay, ready.scene, at.frame, {
    showSafe: el<HTMLInputElement>("show-safe").checked,
    showBounds: el<HTMLInputElement>("show-bounds").checked,
    showDiagnostics: el<HTMLInputElement>("show-diagnostics").checked,
    selectedNode: nodeSelect.value,
    selectedBeat: editor.passage.beats[Number(beatSelect.value)]!.id,
    diagnostics: editor.passage.diagnostics,
  });
  for (const mark of document.querySelectorAll<HTMLElement>(".track-mark"))
    mark.classList.toggle(
      "active",
      frame >= Number(mark.dataset.start) && frame <= Number(mark.dataset.end),
    );
  document
    .getElementById("motion-tools")
    ?.dispatchEvent(new CustomEvent("story-frame", { detail: at.frame }));
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
function renderControls() {
  refreshVerticalDiagnostics();
  controls.renderControls(editor!, templates, verticalDiagnostics);
}
function renderInspector() {
  controls.renderInspector(editor!, templates);
  renderVerticalOverrideEditor();
  renderMotionInspector();
}
function selectedTemplateKey() {
  return editor?.passage.plan.beats[Number(beatSelect.value)]?.template;
}
function templateOverride(template: PassageTemplate) {
  return (
    template.formats?.vertical ?? templateScene(template).formats?.vertical
  );
}
function withVerticalOverride(
  source: PassageTemplate,
  override?: StoryFormatOverride,
) {
  const draft = structuredClone(source);
  if (draft.schemaVersion === "story-template-1") {
    if (draft.scene.formats) {
      delete draft.scene.formats.vertical;
      if (!Object.keys(draft.scene.formats).length) delete draft.scene.formats;
    }
    if (override) draft.formats = { vertical: override };
    else delete draft.formats;
  } else {
    if (override) draft.formats = { vertical: override };
    else delete draft.formats;
  }
  return parsePassageTemplate(draft);
}
function updateTemplates(replacements: ReadonlyMap<string, PassageTemplate>) {
  const owner = editor;
  const task = async (): Promise<boolean> => {
    if (editor !== owner || !owner) return false;
    stop();
    const ticket = ++generation;
    try {
      const candidateTemplates = new Map(templates);
      for (const [key, value] of replacements) {
        candidateTemplates.set(key, value);
        const override = templateOverride(value);
        if (override) {
          const scene = structuredClone(templateScene(value));
          scene.formats = { vertical: override };
          resolveStoryFormat(scene, "vertical");
        }
      }
      const candidate = compileStoryPassage(
        owner.passage.plan,
        candidateTemplates,
        { format: owner.format },
      );
      const ready = await preparePreviews(candidate);
      if (ticket !== generation || editor !== owner) {
        ready.forEach((preview) => preview.preview.dispose());
        return false;
      }
      const previousTemplates = new Map(templates);
      try {
        for (const [key, value] of replacements) templates.set(key, value);
        owner.setFormat(owner.format);
      } catch (error) {
        templates.clear();
        for (const [key, value] of previousTemplates) templates.set(key, value);
        ready.forEach((preview) => preview.preview.dispose());
        throw error;
      }
      installPreviews(ready);
      return true;
    } catch (error) {
      if (ticket === generation) errors(error);
      return false;
    }
  };
  const result = edits.then(task, task);
  edits = result.then(() => undefined);
  return result;
}
function renderVerticalOverrideEditor() {
  const key = selectedTemplateKey();
  const template = key && templates.get(key);
  const override = template && templateOverride(template);
  el<HTMLTextAreaElement>("vertical-override").value = override
    ? JSON.stringify(override, null, 2)
    : "";
}
function refreshVerticalDiagnostics() {
  verticalDiagnostics = [];
  if (!editor) return;
  if (editor.format === "vertical") {
    verticalDiagnostics = editor.passage.beats.flatMap((beat) =>
      lintVertical(beat.scene, { focusIds: beat.focus }).map((diagnostic) => ({
        ...diagnostic,
        beat: beat.id,
      })),
    );
    return;
  }
  if (![...templates.values()].some((template) => templateOverride(template)))
    return;
  verticalDiagnostics = editor.passage.plan.beats.flatMap((beat) => {
    const source = templates.get(beat.template);
    if (!source) return [];
    try {
      const scene = instantiateStoryTemplate(
        source,
        "parameters" in beat ? beat.parameters : {},
        editor!.passage.plan.schemaVersion === "story-passage-2"
          ? editor!.passage.plan.styleProfile
          : undefined,
        "vertical",
      );
      return lintVertical(scene, { focusIds: beat.focus }).map(
        (diagnostic) => ({
          ...diagnostic,
          beat: beat.id,
        }),
      );
    } catch (error) {
      return passageDiagnostics(error, beat.id);
    }
  });
}
function renderMotionInspector() {
  document.getElementById("motion-tools")?.remove();
  const index = Number(beatSelect.value),
    ready = previews[index],
    beat = editor?.passage.beats[index];
  if (!ready || !beat) return;
  const tools = createMotionTools(
    beat.scene,
    (local) => {
      stop();
      show(beat.start + local);
    },
    ready.images,
  );
  el("timeline").after(tools);
}
async function loadPacket(
  packet: {
    plan: unknown;
    templates: Record<string, unknown>;
  },
  request: number,
) {
  if (request !== loadRequest) return;
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
    { format: "landscape" },
  );
  const ready = await preparePreviews(nextEditor.passage);
  if (ticket !== generation || request !== loadRequest) {
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
  const request = ++loadRequest;
  try {
    const response = await fetch(
      "/passage-api/load?path=" +
        encodeURIComponent(el<HTMLInputElement>("plan-path").value),
    );
    const packet = await response.json();
    if (request !== loadRequest) return;
    if (!response.ok)
      throw new Error(
        packet.diagnostics
          .map((d: { message: string }) => d.message)
          .join("\n"),
      );
    await loadPacket(packet, request);
  } catch (error) {
    if (request !== loadRequest) return;
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
const openWorkspace = el<HTMLInputElement>("open-workspace");
const absolutePath = (path: string) => /^(?:\/|\\\\|[A-Za-z]:[\\/])/.test(path);
openWorkspace.onchange = async () => {
  const file = openWorkspace.files?.[0];
  if (!file) return;
  openWorkspace.value = "";
  const request = ++loadRequest;
  try {
    const input = JSON.parse(await file.text());
    if (request !== loadRequest) return;
    if (input.schemaVersion === "story-workspace-1")
      await loadPacket(input, request);
    else {
      const plan = parsePassagePlan(input);
      const directory = el<HTMLInputElement>(
        "import-base-directory",
      ).value.trim();
      if (
        !directory &&
        (plan.beats.some((beat) => !absolutePath(beat.template)) ||
          (plan.schemaVersion === "story-passage-2" &&
            plan.beats.some((beat) =>
              Object.values(beat.parameters).some(
                (value) =>
                  value !== null &&
                  typeof value === "object" &&
                  "path" in value &&
                  typeof value.path === "string" &&
                  !absolutePath(value.path),
              ),
            )))
      )
        throw new Error(
          "Enter an Import base directory in the workspace to resolve this plan's relative template or asset paths.",
        );
      const response = await fetch("/passage-api/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          basePath: directory ? `${directory}/${file.name}` : file.name,
        }),
      });
      const prepared = await response.json();
      if (request !== loadRequest) return;
      if (!response.ok)
        throw new Error(
          prepared.diagnostics
            .map((d: { message: string }) => d.message)
            .join("\n"),
        );
      await loadPacket(prepared, request);
    }
  } catch (error) {
    if (request === loadRequest) errors(error);
  }
};
el("save-plan").onclick = async () => {
  const owner = editor;
  await edits;
  if (owner && editor === owner)
    download(owner.passage.plan.id + ".json", owner.passage.plan);
};
el("save-workspace").onclick = async () => {
  const owner = editor;
  await edits;
  if (owner && editor === owner)
    download(owner.passage.plan.id + ".workspace.json", {
      schemaVersion: "story-workspace-1",
      plan: owner.passage.plan,
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
formatSelect.onchange = () => {
  const owner = editor;
  if (!owner) return;
  const requested = formatSelect.value as OutputFormat;
  formatSelect.value = owner.format;
  const task = async () => {
    if (editor !== owner || requested === owner.format) return;
    stop();
    const ticket = ++generation;
    try {
      const candidate = compileStoryPassage(owner.passage.plan, templates, {
        format: requested,
      });
      const ready = await preparePreviews(candidate);
      if (ticket !== generation) {
        ready.forEach((p) => p.preview.dispose());
        return;
      }
      owner.setFormat(requested);
      installPreviews(ready);
    } catch (error) {
      if (ticket === generation) errors(error);
    }
  };
  edits = edits.then(task, task);
};
el("propose-vertical").onclick = () => {
  if (!editor) return;
  try {
    const replacements = new Map<string, PassageTemplate>();
    for (const beat of editor.passage.plan.beats) {
      const source = templates.get(beat.template);
      if (
        !source ||
        templateOverride(source) ||
        replacements.has(beat.template)
      )
        continue;
      replacements.set(
        beat.template,
        withVerticalOverride(
          source,
          proposeVerticalLayout(templateScene(source)),
        ),
      );
    }
    if (!replacements.size) {
      el("status").textContent =
        "Every template already has a vertical override.";
      return;
    }
    void updateTemplates(replacements).then((committed) => {
      if (committed)
        el("status").textContent =
          `${replacements.size} vertical template override${replacements.size === 1 ? "" : "s"} added to the workspace. Review diagnostics and save the workspace.`;
    });
  } catch (error) {
    errors(error);
  }
};
el("apply-vertical-override").onclick = () => {
  const key = selectedTemplateKey();
  const source = key && templates.get(key);
  if (!key || !source) return;
  try {
    const raw = el<HTMLTextAreaElement>("vertical-override").value.trim();
    const override = raw
      ? StoryFormatOverrideSchema.parse(JSON.parse(raw))
      : undefined;
    void updateTemplates(
      new Map([[key, withVerticalOverride(source, override)]]),
    );
  } catch (error) {
    errors(error);
  }
};
el("clear-vertical-override").onclick = () => {
  const key = selectedTemplateKey();
  const source = key && templates.get(key);
  if (!key || !source) return;
  void updateTemplates(new Map([[key, withVerticalOverride(source)]]));
};
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
