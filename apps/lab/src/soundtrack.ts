import type { SoundtrackProject } from "../../../packages/scene-contract/src/soundtrack-project.ts";
import type { SoundtrackEdit } from "../../../packages/renderer-core/src/soundtrack-edits.ts";
import {
  soundtrackHeadroom,
  soundtrackNumberField,
  soundtrackTimelineModel,
  type SoundtrackRenderedOutput,
} from "./soundtrack-timeline-model.ts";
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const path = el<HTMLInputElement>("path"),
  player = el<HTMLAudioElement>("preview"),
  clipSelect = el<HTMLSelectElement>("clip");
let loadedPath = "";
let project: SoundtrackProject | undefined,
  busy = false;
async function api(endpoint: string, body?: unknown) {
  const response = await fetch(
    "/soundtrack-api/" + endpoint,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message ?? "Soundtrack request failed");
  return result;
}
async function task(action: () => Promise<void>) {
  if (busy) return;
  busy = true;
  el("error").textContent = "";
  document
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((button) => (button.disabled = true));
  try {
    await action();
  } catch (error) {
    el("error").textContent =
      error instanceof Error ? error.message : String(error);
  } finally {
    busy = false;
    if (project) view();
    else
      document
        .querySelectorAll<HTMLButtonElement>("#load button")
        .forEach((b) => (b.disabled = false));
  }
}
async function edit(operations: SoundtrackEdit[]) {
  if (!project) return;
  const result = await api("edit", {
    project: loadedPath,
    revision: project.revision,
    operations,
  });
  project = result.project;
  player.pause();
  player.removeAttribute("src");
  player.hidden = true;
  el("download").hidden = true;
}
function clipFields() {
  const clip = project?.clips.find((c) => c.id === clipSelect.value);
  if (!clip) return;
  el<HTMLInputElement>("start").value = String(clip.startSample);
  el<HTMLInputElement>("gain").value = String(clip.gainDb);
  el<HTMLInputElement>("pan").value = String(clip.pan ?? 0);
  el<HTMLInputElement>("source-start").value = String(clip.sourceStartSample);
  el<HTMLInputElement>("source-end").value = String(clip.sourceEndSample);
  el<HTMLInputElement>("offset").value = String(
    clip.anchor?.offsetSamples ?? 0,
  );
  el<HTMLInputElement>("offset").disabled = !clip.anchor;
  el<HTMLInputElement>("start").oninput = () => {
    if (clip.anchor)
      el<HTMLInputElement>("offset").value = String(
        clip.anchor.offsetSamples +
          Number(el<HTMLInputElement>("start").value) -
          clip.startSample,
      );
  };
  el<HTMLTextAreaElement>("automation").value = JSON.stringify(
    clip.automation,
    null,
    2,
  );
}
let waveforms: Record<string, SoundtrackRenderedOutput> = {},
  waveformRevision = -1;
function view() {
  if (!project) return;
  const rendered = waveformRevision === project.revision ? waveforms : {};
  const model = soundtrackTimelineModel(project, rendered);
  el("status").textContent =
    `Revision ${model.revision} · ${model.durationSeconds} seconds · 48 kHz stereo` +
    (rendered.master ? " · " + soundtrackHeadroom(rendered.master) : "");
  document
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((b) => (b.disabled = false));
  el<HTMLButtonElement>("undo").disabled = !model.undo;
  el<HTMLButtonElement>("redo").disabled = !model.redo;
  const host = el("timeline");
  host.replaceChildren();
  for (const track of model.tracks) {
    const row = document.createElement("section");
    row.className = "track";
    const controls = document.createElement("div");
    controls.className = "track-controls";
    const title = document.createElement("strong");
    title.textContent = track.id + " · " + track.role;
    controls.append(title);
    for (const kind of ["mute", "solo"] as const) {
      const label = document.createElement("label"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.checked = track[kind];
      input.onchange = () =>
        void task(() =>
          edit([{ type: kind, track: track.id, value: input.checked }]),
        );
      label.append(input, kind);
      controls.append(label);
    }
    const label = document.createElement("label"),
      gain = document.createElement("input");
    gain.type = "number";
    gain.value = String(track.gainDb);
    gain.min = "-120";
    gain.max = "12";
    gain.step = "0.1";
    gain.onchange = () =>
      void task(() =>
        edit([
          {
            type: "gain",
            target: track.id,
            kind: "track",
            gainDb: soundtrackNumberField(gain.value, track.id + " gain"),
          },
        ]),
      );
    label.append("Gain dB", gain);
    controls.append(label);
    const lane = document.createElement("div");
    lane.className = "lane";
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 110;
    lane.append(canvas);
    const context = canvas.getContext("2d");
    if (context) {
      context.strokeStyle = "#bdb596";
      context.beginPath();
      track.peaks.forEach((peak, i) => {
        const x = (i / track.peaks.length) * 1200;
        const size = Math.min(1, peak) * 45;
        context.moveTo(x, 55 - size);
        context.lineTo(x, 55 + size);
      });
      context.stroke();
    }
    for (const clip of track.clips) {
      const box = document.createElement("div");
      box.className = "clip";
      box.style.left = clip.leftPercent + "%";
      box.style.width = clip.widthPercent + "%";
      const text = document.createElement("span");
      text.textContent = clip.pan
        ? `${clip.id} · ${clip.pan < 0 ? "L" : "R"}${Math.round(Math.abs(clip.pan) * 100)}`
        : clip.id;
      box.append(text);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("automation");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("preserveAspectRatio", "none");
      const poly = document.createElementNS(svg.namespaceURI, "polyline");
      poly.setAttribute("fill", "none");
      poly.setAttribute("stroke", "#e8c977");
      poly.setAttribute("stroke-width", "1");
      poly.setAttribute(
        "points",
        clip.automation
          .map(
            (p) =>
              `${((p.sample - clip.startSample) / (clip.sourceEndSample - clip.sourceStartSample)) * 100},${100 - Math.min(4, p.gain) * 25}`,
          )
          .join(" "),
      );
      svg.append(poly);
      box.append(svg);
      lane.append(box);
    }
    row.append(controls, lane);
    host.append(row);
  }
  const selected = clipSelect.value;
  clipSelect.replaceChildren();
  for (const c of project.clips) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.id;
    clipSelect.append(o);
  }
  if (project.clips.some((c) => c.id === selected)) clipSelect.value = selected;
  el("clip-edit").hidden = !project.clips.length;
  clipFields();
}
el<HTMLFormElement>("load").onsubmit = (e) => {
  e.preventDefault();
  void task(async () => {
    player.pause();
    player.hidden = true;
    el("download").hidden = true;
    const requestedPath = path.value;
    project = (await api("project?path=" + encodeURIComponent(requestedPath)))
      .project;
    loadedPath = requestedPath;
    waveforms = {};
    waveformRevision = -1;
  });
};
el("undo").onclick = () => void task(() => edit([{ type: "undo" }]));
el("redo").onclick = () => void task(() => edit([{ type: "redo" }]));
clipSelect.onchange = clipFields;
el<HTMLFormElement>("clip-edit").onsubmit = (e) => {
  e.preventDefault();
  void task(async () => {
    const id = clipSelect.value;
    const field = (name: string, label: string) =>
      soundtrackNumberField(el<HTMLInputElement>(name).value, label);
    // One request, one undo step; anchored offsets are derived by the edit API.
    await edit([
      {
        type: "move",
        clip: id,
        startSample: field("start", "Start sample"),
      },
      {
        type: "gain",
        target: id,
        kind: "clip",
        gainDb: field("gain", "Clip gain"),
      },
      {
        type: "trim",
        clip: id,
        sourceStartSample: field("source-start", "Source start sample"),
        sourceEndSample: field("source-end", "Source end sample"),
      },
      {
        type: "automation",
        clip: id,
        automation: JSON.parse(el<HTMLTextAreaElement>("automation").value),
      },
      {
        type: "pan",
        clip: id,
        pan: field("pan", "Pan"),
      },
    ]);
  });
};
el("render").onclick = () =>
  void task(async () => {
    const result = await api("render", {
      project: loadedPath,
      revision: project!.revision,
    });
    waveforms = result.manifest.files;
    waveformRevision = project!.revision;
    const url =
      "/soundtrack-api/audio?project=" +
      encodeURIComponent(loadedPath) +
      "&output=" +
      encodeURIComponent(result.output);
    player.src = url;
    player.hidden = false;
    const link = el<HTMLAnchorElement>("download");
    link.href = url;
    link.download = "mix.wav";
    link.hidden = false;
  });
