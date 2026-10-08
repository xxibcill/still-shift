/// <reference types="vite/client" />
import { analyzeRenderedCompositionQuality } from "../../../packages/renderer-core/src/composition/quality-render.ts";
import {
  analyzeCompositionQuality,
  type MotionLintDiagnostic,
} from "../../../packages/renderer-core/src/story-quality.ts";
import {
  validateComposition,
  type Composition,
  type CompositionPreparedMedia,
  type CompositionPreparedAudio,
} from "../../../packages/scene-contract/src/index.ts";
import {
  createCompositionPreview,
  loadCompositionResources,
  type CompositionBackend,
  type CompositionPreview,
  type CompositionFrameReport,
} from "../../../packages/renderer-core/src/composition/render/index.ts";
import {
  CompositionDocument,
  type DocumentProposal,
} from "./composition-document.ts";
import { createCompositionInspector } from "./composition-inspector.ts";
import { createCompositionOverlay } from "./composition-overlay.ts";
import { CompositionAudioPreviewLoader } from "./composition-audio-player.ts";
import {
  presentCompositionAudioWaveforms,
  positionCompositionAudioWaveforms,
} from "./composition-audio-waveforms.ts";
import { createPreviewSession } from "./preview-session.ts";
import { retainFixtureOwner } from "./composition-fixture-assets.ts";
import {
  retainProgramSnapshot,
  releaseProgramSnapshot,
  type OwnedProgramSnapshot,
} from "./composition-program-assets.ts";
import { passageDiagnostics } from "../../../packages/renderer-core/src/passage-diagnostics.ts";
import type { ProgramSnapshot } from "../../../tools/still-shift-cli/src/composition/preview.ts";

const programMode = new URLSearchParams(location.search).has("program");
type ProgramResponse = {
  snapshot?: ProgramSnapshot & { lease?: string };
  diagnostics: { code: string; path: string; message: string }[];
};

type Fixture = { path: string; id: string; name: string };
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const select = el<HTMLSelectElement>("scene"),
  backendSelect = el<HTMLSelectElement>("backend"),
  slider = el<HTMLInputElement>("frame"),
  play = el<HTMLButtonElement>("play"),
  status = el("status"),
  error = el("error"),
  list = el("diagnostics");
let canvas = el<HTMLCanvasElement>("preview");

/**
 * GPU determinism policy, rule 4: say which renderer the preview uses and label
 * hardware previews as approximate; export always renders on SwiftShader.
 */
function describeRenderer(backend: CompositionBackend) {
  const probe =
    backend === "webgl2" ? canvas : document.createElement("canvas");
  const gl = probe.getContext("webgl2");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  const name = gl
    ? String(
        info
          ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
      )
    : "unknown";
  const badge = el("renderer");
  const software = name.includes("SwiftShader");
  badge.dataset.kind = software ? "software" : "hardware";
  badge.title = name;
  const label = backend === "webgl2" ? "WebGL2" : "Canvas 2D";
  badge.textContent = software
    ? `${label} · software preview matches export`
    : `${label} · hardware preview is approximate; export is reproducible`;
  if (probe !== canvas) gl?.getExtension("WEBGL_lose_context")?.loseContext();
}

const lintButton = el<HTMLButtonElement>("lint");
let lintFindings: MotionLintDiagnostic[] = [];
let lintAbort: AbortController | undefined;
let lintAvailable = false;
function showLint(report: ReturnType<typeof analyzeCompositionQuality>) {
  lintFindings = report.diagnostics;
  const errors = lintFindings.filter((d) => d.severity === "error").length;
  el("lint-summary").textContent =
    `${errors} errors · ${lintFindings.length - errors} warnings · ${report.measured.pixels ? "pixels and state checked" : "state checked; pixels pending"}`;
  const jump = (frame: number) => {
    stop();
    show(frame);
  };
  el("lint-findings").replaceChildren(
    ...lintFindings.map((finding) => {
      const button = document.createElement("button");
      button.textContent = `${finding.severity} · ${finding.code} · frames ${finding.frames.join("–")}: ${finding.message}`;
      button.onclick = () => jump(finding.frames[0]);
      const item = document.createElement("li");
      item.append(button);
      return item;
    }),
  );
  el("lint-timeline").replaceChildren(
    ...lintFindings.map((finding) => {
      const button = document.createElement("button");
      button.title = `${finding.code}: ${finding.message}`;
      button.setAttribute(
        "aria-label",
        `${finding.severity}, ${finding.code}, frames ${finding.frames.join(" to ")}`,
      );
      button.dataset.severity = finding.severity;
      button.dataset.start = String(finding.frames[0]);
      button.dataset.end = String(finding.frames[1]);
      button.style.left = `${(100 * finding.frames[0]) / report.frameCount}%`;
      button.style.width = `${(100 * (finding.frames[1] - finding.frames[0] + 1)) / report.frameCount}%`;
      button.style.top = finding.severity === "error" ? "2px" : "28px";
      button.onclick = () => jump(finding.frames[0]);
      return button;
    }),
  );
}

type CompositionSnapshot = {
  scene: Composition;
  composition: Composition;
  document: Composition;
  preview: CompositionPreview;
  report: CompositionFrameReport;
  path: string;
  backend: CompositionBackend;
  warnings: string[];
  program: ProgramResponse["snapshot"];
  accept: () => void;
  audio?: CompositionPreparedAudio;
};
const audioLoader = new CompositionAudioPreviewLoader();
let comp: Composition | undefined;
let preview: CompositionPreview | undefined;
let generation = 0;
let documentHistory: CompositionDocument | undefined;
let pendingSave: string | undefined;
let currentProgram: ProgramResponse["snapshot"];
const inspector = createCompositionInspector({
  evaluation() {
    const bounds = session.snapshot?.preview.textBounds;
    return bounds ? { textBounds: bounds } : {};
  },
  async propose(proposal) {
    if (!documentHistory?.accepts(proposal)) return false;
    return load(select.value, {
      document: inspector.viewDocument(proposal.document),
      proposal,
      preserveHistory: true,
    });
  },
  view(document) {
    return load(select.value, { document, preserveHistory: true });
  },
  seek(frame) {
    stop();
    show(frame);
  },
  selected(selection) {
    overlay.select(selection);
    const snapshot = session.snapshot;
    if (snapshot)
      overlay.draw(
        snapshot.composition,
        session.frame,
        snapshot.preview.textBounds,
      );
  },
});
const overlay = createCompositionOverlay();
const saveButton = el<HTMLButtonElement>("save-document"),
  exportButton = el<HTMLButtonElement>("export-composition");

const listDiagnostics = (
  lines: (string | { label: string; frame: number })[],
) => {
  list.replaceChildren(
    ...lines.map((line) => {
      const item = document.createElement("li");
      if (typeof line === "string") item.textContent = line;
      else {
        const button = document.createElement("button");
        button.textContent = `${line.label} · root frame ${line.frame}`;
        button.onclick = () => {
          stop();
          show(line.frame);
        };
        item.append(button);
      }
      return item;
    }),
  );
};

const session = createPreviewSession<CompositionSnapshot>({
  controls: {
    play,
    scrub: slider,
    export: lintButton,
    downloads: [],
    edit: programMode
      ? [backendSelect, inspector.fieldset]
      : [select, backendSelect, inspector.fieldset],
  },
  retainValidOnFailure: true,
  disableWhileExporting: true,
  disableEditsWhileLoading: true,
  status(message, failed) {
    if (failed) showLoadError(message);
    else status.textContent = message;
  },
  ready(snapshot) {
    snapshot.accept();
    presentCompositionAudioWaveforms(snapshot.audio);
    comp = snapshot.composition;
    preview = snapshot.preview;
    error.textContent = "";
    describeRenderer(snapshot.backend);
    const program = snapshot.program;
    document.documentElement.dataset.sourceKind = program?.source ?? "json";
    document.documentElement.dataset.readonly = String(
      program?.source === "builder",
    );
    el("command").textContent =
      `pnpm --silent still-shift comp render --input ${program ? JSON.stringify(program.input) : `benchmarks/fixtures/composition/${snapshot.path}`} --output ${comp.id}.mp4 --backend ${snapshot.backend}`;
    // Lint is advisory: a lint failure must not stop the composition previewing.
    lintAvailable = false;
    try {
      showLint(
        analyzeCompositionQuality(comp, {
          evaluation: { textBounds: preview.textBounds },
        }),
      );
      lintAvailable = true;
    } catch (cause) {
      lintFindings = [];
      el("lint-timeline").replaceChildren();
      el("lint-findings").replaceChildren();
      const diagnostics = passageDiagnostics(cause);
      el("lint-summary").textContent = `Motion checks unavailable: ${
        diagnostics.length
          ? diagnostics.map((d) => `${d.code}: ${d.message}`).join("; ")
          : String(cause instanceof Error ? cause.message : cause)
      }`;
    }
    status.textContent = `Ready: ${comp.name ?? comp.id} · ${comp.width} × ${comp.height} · ${comp.fps} fps${program?.source === "builder" ? " · edit the source to change motion" : ""}`;
    status.dataset.ready = snapshot.path;
    status.dataset.backend = snapshot.backend;
    if (program) status.dataset.revision = String(program.revision);
    select.disabled = programMode;
    saveButton.textContent =
      program?.source === "builder"
        ? "Builder source · copy keys"
        : programMode
          ? "Save JSON source"
          : "Download edited JSON";
    saveButton.disabled = program?.source === "builder";
    exportButton.disabled = false;
    el("source-policy").textContent =
      program?.source === "builder"
        ? "Builder source is read-only. Tune a preview and copy edited keys into the owning builder layer; source reload replaces the preview draft."
        : programMode
          ? "Save writes this preview’s JSON source. Save includes current view visibility. External edits require reload before saving."
          : "Download preserves native source fields. Place JSON beside the original fixture to retain relative asset paths.";
  },
  frameChanged(frame, snapshot) {
    positionCompositionAudioWaveforms(frame, snapshot.scene.frameCount);
    for (const marker of el(
      "lint-timeline",
    ).querySelectorAll<HTMLButtonElement>("button"))
      marker.dataset.active = String(
        frame >= Number(marker.dataset.start) &&
          frame <= Number(marker.dataset.end),
      );
    el("time").textContent =
      `${(frame / snapshot.scene.fps).toFixed(2)} s · ${frame + 1} / ${snapshot.scene.frameCount}`;
    overlay.draw(snapshot.composition, frame, snapshot.preview.textBounds);
    inspector.frame(frame, snapshot.composition, {
      textBounds: snapshot.preview.textBounds,
    });
    listDiagnostics([
      ...snapshot.warnings,
      ...snapshot.report.diagnostics.map((d) => ({
        label: `${d.code} ${d.path ?? ""}: ${d.message}`,
        frame,
      })),
      ...(snapshot.report.culled.length
        ? [`Culled outside the frame: ${snapshot.report.culled.join(", ")}`]
        : []),
    ]);
  },
});
const stop = () => session.pause();
const show = (frame: number) => session.show(frame);

function showLoadError(message: string) {
  error.textContent = message;
  if (preview) {
    status.textContent =
      "Operation failed. Showing the last valid composition.";
    play.disabled = false;
    lintButton.disabled = false;
    slider.disabled = false;
  } else {
    status.textContent = "Could not load the composition.";
    status.dataset.ready = "error";
  }
}
async function load(
  path: string,
  edit: {
    document?: Composition;
    program?: OwnedProgramSnapshot;
    proposal?: DocumentProposal;
    preserveHistory?: boolean;
    frame?: number;
  } = {},
): Promise<boolean> {
  ++generation;
  const backend = backendSelect.value as CompositionBackend;
  const retainedFrame =
    edit.frame ?? (programMode || edit.preserveHistory ? session.frame : 0);
  lintAbort?.abort();
  error.textContent = "";
  status.textContent = `Loading ${path}…`;
  let retainedProgram = edit.program;
  const accepted = await session.load(async (ownership) => {
    const query = `scene=${encodeURIComponent(path)}`;
    const response =
      edit.document || edit.program
        ? undefined
        : await fetch(
            programMode
              ? "/composition/program"
              : `/composition/scene?${query}`,
            { signal: ownership.signal },
          );
    let value: unknown;
    let program: ProgramResponse["snapshot"] = edit.program ?? currentProgram;
    if (edit.document) value = edit.document;
    else if (edit.program)
      value = edit.program.document ?? edit.program.composition;
    else if (programMode) {
      const payload = (await response!.json()) as ProgramResponse;
      if (payload.diagnostics.length)
        throw new Error(
          payload.diagnostics
            .map((d) => `${d.code} ${d.path}: ${d.message}`)
            .join("\n"),
        );
      if (!payload.snapshot)
        throw new Error("No valid composition is available yet.");
      retainedProgram = await retainProgramSnapshot(payload.snapshot);
      program = retainedProgram;
      value = program.document ?? program.composition;
    } else {
      if (!response!.ok) throw new Error(`Cannot load ${path}`);
      value = await response!.json();
    }
    const result = validateComposition(value);
    if (!result.ok)
      throw new Error(
        result.diagnostics
          .map((d) => `${d.code} ${d.path}: ${d.message}`)
          .join("\n"),
      );
    const nextHistory =
      edit.preserveHistory && documentHistory
        ? documentHistory
        : new CompositionDocument(structuredClone(value) as Composition);
    if (edit.proposal && !nextHistory.accepts(edit.proposal))
      throw new Error("A newer document superseded this edit");
    let capture: {
      preparedMedia?: CompositionPreparedMedia;
      preparedAudio?: CompositionPreparedAudio;
      assets: Record<string, string>;
    } = {
      ...(program?.preparedAudio
        ? { preparedAudio: program.preparedAudio }
        : {}),
      ...(program?.preparedMedia
        ? { preparedMedia: program.preparedMedia }
        : {}),
      assets: program?.assets ?? {},
    };
    if (
      (result.composition.assets.some((asset) => asset.type === "audio") &&
        (!capture.preparedAudio || edit.document)) ||
      (result.composition.assets.some(
        (asset) => asset.type === "video" || asset.type === "sequence",
      ) &&
        (!capture.preparedMedia || edit.document))
    ) {
      const owner = programMode ? undefined : await retainFixtureOwner();
      ownership.signal.throwIfAborted();
      const captureId = crypto.randomUUID();
      const binding = programMode
        ? { revision: program!.revision, lease: program!.lease }
        : { owner };
      ownership.onDispose(() => {
        void fetch(
          programMode
            ? "/composition/program-capture-release"
            : `/composition/capture-release?${query}`,
          {
            method: "POST",
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
              "x-still-shift-composition": "1",
            },
            body: JSON.stringify({ ...binding, capture: captureId }),
          },
        ).catch(() => {});
      });
      const response = await fetch(
        programMode
          ? "/composition/program-prepare"
          : `/composition/prepare?${query}`,
        {
          method: "POST",
          signal: ownership.signal,
          headers: {
            "Content-Type": "application/json",
            "x-still-shift-composition": "1",
          },
          body: JSON.stringify({
            ...binding,
            capture: captureId,
            document: value,
          }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      capture = (await response.json()) as typeof capture;
    }
    ownership.signal.throwIfAborted();
    if (capture.preparedAudio) {
      const url = capture.assets[capture.preparedAudio.resource.id];
      if (!url) throw new Error("Native audio master is unavailable");
      ownership.audio(
        await audioLoader.prepare(
          result.composition,
          capture.preparedAudio,
          url,
          ownership.signal,
        ),
      );
    } else if (
      result.composition.assets.some((asset) => asset.type === "audio")
    ) {
      throw new Error(
        "Native audio preview requires a prepared complete master",
      );
    }
    const resources = await loadCompositionResources(
      result.composition,
      (id) =>
        capture.assets[id] ??
        `/composition/asset?${query}&id=${encodeURIComponent(id)}`,
      {
        ...(capture.preparedMedia
          ? { preparedMedia: capture.preparedMedia }
          : {}),
        signal: ownership.signal,
      },
    );
    const nextCanvas = canvas.cloneNode(false) as HTMLCanvasElement;
    const renderer = createCompositionPreview(
      nextCanvas,
      result.composition,
      resources,
      { backend },
    );
    const snapshot: CompositionSnapshot = {
      scene: result.composition,
      composition: result.composition,
      document: structuredClone(value) as Composition,
      preview: renderer,
      report: { diagnostics: [], culled: [], samples: 0 },
      path,
      backend,
      program,
      ...(capture.preparedAudio ? { audio: capture.preparedAudio } : {}),
      accept() {
        if (currentProgram?.lease !== program?.lease)
          releaseProgramSnapshot(currentProgram);
        currentProgram = program;
        if (edit.proposal) nextHistory.commit(edit.proposal);
        documentHistory = nextHistory;
        if (!edit.preserveHistory) inspector.reset(documentHistory);
        else inspector.refresh(documentHistory);
      },
      warnings: result.diagnostics.map(
        (d) => `${d.code} ${d.path}: ${d.message}`,
      ),
    };
    ownership.renderer(
      {
        ...(resources.media
          ? { prepareFrame: (frame: number) => renderer.prepareFrame(frame) }
          : {}),
        renderFrame(frame: number) {
          return (snapshot.report = renderer.renderFrame(frame));
        },
        dispose() {
          renderer.dispose();
        },
      },
      () => {
        if (canvas !== nextCanvas) {
          canvas.replaceWith(nextCanvas);
          canvas = nextCanvas;
        }
      },
    );
    return { snapshot, initialFrame: retainedFrame };
  });
  if (!accepted) releaseProgramSnapshot(retainedProgram);
  select.disabled = programMode;
  saveButton.disabled =
    currentProgram?.source === "builder" || !documentHistory;
  lintButton.disabled ||= !lintAvailable;
  return accepted;
}

lintButton.onclick = async () => {
  if (!lintAvailable) return;
  const run = generation,
    at = session.frame;
  await session.export(async (snapshot) => {
    lintAbort = new AbortController();
    try {
      const report = await analyzeRenderedCompositionQuality(
        snapshot.composition,
        snapshot.preview,
        {},
        {
          signal: lintAbort.signal,
          onFrame: (frame) => {
            el("lint-summary").textContent =
              `Checking rendered frame ${frame + 1} / ${snapshot.scene.frameCount}…`;
          },
        },
      );
      if (run === generation) showLint(report);
    } catch (cause) {
      if (run === generation)
        el("lint-summary").textContent =
          `Motion check failed: ${String(cause)}`;
      throw cause;
    } finally {
      if (run === generation) show(at);
    }
    return `Motion checks complete: ${snapshot.composition.name ?? snapshot.composition.id}`;
  });
};

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
el<HTMLButtonElement>("reload-source").onclick = () => {
  void load(select.value);
};
saveButton.onclick = async () => {
  if (documentHistory && currentProgram?.source !== "builder") {
    const viewed = inspector.viewDocument();
    const proposal = documentHistory.propose("Save view visibility", (draft) =>
      Object.assign(draft, viewed),
    );
    if (
      proposal &&
      !(await load(select.value, {
        document: proposal.document,
        proposal,
        preserveHistory: true,
      }))
    )
      return;
    inspector.appliedView();
  }
  void session
    .export(async () => {
      if (!documentHistory || currentProgram?.source === "builder")
        throw new Error(
          "Builder source is read-only; copy edited keys as code.",
        );
      const document = documentHistory.document;
      if (!programMode) {
        download(
          new Blob([JSON.stringify(document, null, 2) + "\n"], {
            type: "application/json",
          }),
          `${document.id}.json`,
        );
        documentHistory.markSaved();
        inspector.refresh(documentHistory);
        return "Edited JSON downloaded. Keep it beside the original source for relative assets.";
      }
      pendingSave = JSON.stringify(document);
      try {
        const response = await fetch("/composition/program-save", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-still-shift-composition": "1",
          },
          body: JSON.stringify({
            revision: currentProgram!.revision,
            sourceSha256: currentProgram!.sourceSha256,
            document,
          }),
        });
        const payload = (await response.json()) as ProgramResponse;
        if (!response.ok || payload.diagnostics.length || !payload.snapshot)
          throw new Error(
            payload.diagnostics
              .map((d) => `${d.code}: ${d.message}`)
              .join("\n") || "Save failed",
          );
        const savedProgram = await retainProgramSnapshot(payload.snapshot);
        if (savedProgram.preparedMedia || savedProgram.preparedAudio) {
          if (
            !(await load("program", {
              program: savedProgram,
              preserveHistory: true,
              frame: session.frame,
            }))
          ) {
            showLoadError(
              "Source saved, but its native preview could not reload.",
            );
            return "Source saved; reload to inspect the native preview.";
          }
        } else {
          releaseProgramSnapshot(currentProgram);
          currentProgram = savedProgram;
        }
        const snapshot = session.snapshot;
        if (snapshot) snapshot.program = currentProgram;
        documentHistory.markSaved();
        inspector.refresh(documentHistory);
        status.dataset.revision = String(savedProgram.revision);
        return "JSON source saved.";
      } finally {
        pendingSave = undefined;
      }
    })
    .finally(() => {
      saveButton.disabled = currentProgram?.source === "builder";
      lintButton.disabled ||= !lintAvailable;
    });
};
exportButton.onclick = () => {
  void session
    .export(async (snapshot) => {
      const response = await fetch(
        programMode
          ? "/composition/program-export"
          : `/composition/export?scene=${encodeURIComponent(snapshot.path)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-still-shift-composition": "1",
          },
          body: JSON.stringify({
            revision: snapshot.program?.revision,
            lease: snapshot.program?.lease,
            document: snapshot.document,
            backend: snapshot.backend,
          }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json()) as ProgramResponse;
        throw new Error(
          payload.diagnostics
            .map((d) => `${d.code} ${d.path}: ${d.message}`)
            .join("\n"),
        );
      }
      download(await response.blob(), `${snapshot.composition.id}.mp4`);
      return "MP4 exported with the pinned software renderer.";
    })
    .finally(() => {
      saveButton.disabled = currentProgram?.source === "builder";
      lintButton.disabled ||= !lintAvailable;
    });
};

const query = new URLSearchParams(location.search);
backendSelect.value = query.get("backend") === "webgl2" ? "webgl2" : "canvas2d";
if (programMode) {
  select.replaceChildren(
    Object.assign(document.createElement("option"), {
      value: "program",
      textContent: "Authored composition",
    }),
  );
  select.disabled = true;
  backendSelect.onchange = () => {
    void load(
      "program",
      documentHistory
        ? { document: inspector.viewDocument(), preserveHistory: true }
        : {},
    );
  };
  import.meta.hot?.on("composition-program:update", () => {
    if (pendingSave) return;
    if (currentProgram?.source === "json" && documentHistory?.dirty) {
      el("edit-message").textContent =
        "Source changed externally. Your draft is retained; reload before saving.";
      return;
    }
    void load("program");
  });
  import.meta.hot?.on(
    "composition-program:error",
    (payload: {
      diagnostics: { code: string; path: string; message: string }[];
    }) => {
      ++generation;
      stop();
      lintAbort?.abort();
      void session
        .load(async () => {
          throw new Error(
            payload.diagnostics
              .map((d) => `${d.code} ${d.path}: ${d.message}`)
              .join("\n"),
          );
        })
        .finally(() => {
          select.disabled = programMode;
          lintButton.disabled ||= !lintAvailable;
        });
    },
  );
  void load("program");
} else {
  const fixtures = (await (
    await fetch("/composition/fixtures")
  ).json()) as Fixture[];
  select.replaceChildren(
    ...fixtures.map((f) =>
      Object.assign(document.createElement("option"), {
        value: f.path,
        textContent: `${f.name} · ${f.path}`,
      }),
    ),
  );
  const requested = query.get("scene");
  select.value =
    fixtures.find((f) => f.path === requested)?.path ?? fixtures[0]?.path ?? "";
  select.onchange = () => {
    const query = new URLSearchParams({
      scene: select.value,
      backend: backendSelect.value,
    });
    history.replaceState(null, "", `?${query}`);
    void load(select.value);
  };
  backendSelect.onchange = () => {
    void load(
      select.value,
      documentHistory
        ? { document: inspector.viewDocument(), preserveHistory: true }
        : {},
    );
  };
  if (select.value) void load(select.value);
  else status.textContent = "No compositions found.";
}
