/// <reference types="vite/client" />
import { analyzeRenderedCompositionQuality } from "../../../packages/renderer-core/src/composition/quality-render.ts";
import {
  analyzeCompositionQuality,
  type MotionLintDiagnostic,
} from "../../../packages/renderer-core/src/story-quality.ts";
import {
  validateComposition,
  type Composition,
} from "../../../packages/scene-contract/src/index.ts";
import {
  createCompositionPreview,
  loadCompositionResources,
  type CompositionBackend,
  type CompositionPreview,
  type CompositionFrameReport,
} from "../../../packages/renderer-core/src/composition/render/index.ts";
import { createPreviewSession } from "./preview-session.ts";

const programMode = new URLSearchParams(location.search).has("program");
type ProgramResponse = {
  snapshot?: {
    revision: number;
    composition: Composition;
    source: "json" | "builder";
    input: string;
    assets: Record<string, string>;
  };
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
};
let comp: Composition | undefined;
let preview: CompositionPreview | undefined;
let generation = 0;

const listDiagnostics = (lines: string[]) =>
  list.replaceChildren(
    ...lines.map((line) =>
      Object.assign(document.createElement("li"), { textContent: line }),
    ),
  );
const session = createPreviewSession<CompositionSnapshot>({
  controls: {
    play,
    scrub: slider,
    export: lintButton,
    downloads: [],
    edit: programMode ? [backendSelect] : [select, backendSelect],
  },
  retainValidOnFailure: true,
  disableWhileExporting: true,
  status(message, failed) {
    if (failed) showLoadError(message);
    else status.textContent = message;
  },
  ready(snapshot) {
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
    showLint(
      analyzeCompositionQuality(comp, {
        evaluation: { textBounds: preview.textBounds },
      }),
    );
    status.textContent = `Ready: ${comp.name ?? comp.id} · ${comp.width} × ${comp.height} · ${comp.fps} fps${program?.source === "builder" ? " · edit the source to change motion" : ""}`;
    status.dataset.ready = snapshot.path;
    status.dataset.backend = snapshot.backend;
    if (program) status.dataset.revision = String(program.revision);
    select.disabled = programMode;
  },
  frameChanged(frame, snapshot) {
    for (const marker of el(
      "lint-timeline",
    ).querySelectorAll<HTMLButtonElement>("button"))
      marker.dataset.active = String(
        frame >= Number(marker.dataset.start) &&
          frame <= Number(marker.dataset.end),
      );
    el("time").textContent =
      `${(frame / snapshot.scene.fps).toFixed(2)} s · ${frame + 1} / ${snapshot.scene.frameCount}`;
    listDiagnostics([
      ...snapshot.warnings,
      ...snapshot.report.diagnostics.map(
        (d) => `${d.code} ${d.path ?? ""}: ${d.message}`,
      ),
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
async function load(path: string) {
  ++generation;
  const backend = backendSelect.value as CompositionBackend;
  const retainedFrame = programMode ? session.frame : 0;
  lintAbort?.abort();
  error.textContent = "";
  status.textContent = `Loading ${path}…`;
  await session.load(async (ownership) => {
    const query = `scene=${encodeURIComponent(path)}`;
    const response = await fetch(
      programMode ? "/composition/program" : `/composition/scene?${query}`,
    );
    let value: unknown;
    let program: ProgramResponse["snapshot"];
    if (programMode) {
      const payload = (await response.json()) as ProgramResponse;
      if (payload.diagnostics.length)
        throw new Error(
          payload.diagnostics
            .map((d) => `${d.code} ${d.path}: ${d.message}`)
            .join("\n"),
        );
      program = payload.snapshot;
      if (!program) throw new Error("No valid composition is available yet.");
      value = program.composition;
    } else {
      if (!response.ok) throw new Error(`Cannot load ${path}`);
      value = await response.json();
    }
    const result = validateComposition(value);
    if (!result.ok)
      throw new Error(
        result.diagnostics
          .map((d) => `${d.code} ${d.path}: ${d.message}`)
          .join("\n"),
      );
    const resources = await loadCompositionResources(
      result.composition,
      (id) =>
        program?.assets[id] ??
        `/composition/asset?${query}&id=${encodeURIComponent(id)}`,
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
      warnings: result.diagnostics.map(
        (d) => `${d.code} ${d.path}: ${d.message}`,
      ),
    };
    ownership.renderer(
      {
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
  select.disabled = programMode;
}

lintButton.onclick = async () => {
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
    void load("program");
  };
  import.meta.hot?.on("composition-program:update", () => {
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
  select.onchange = backendSelect.onchange = () => {
    const query = new URLSearchParams({
      scene: select.value,
      backend: backendSelect.value,
    });
    history.replaceState(null, "", `?${query}`);
    void load(select.value);
  };
  if (select.value) void load(select.value);
  else status.textContent = "No compositions found.";
}
