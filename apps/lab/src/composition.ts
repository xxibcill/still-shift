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
} from "../../../packages/renderer-core/src/composition/render/index.ts";
import { passageDiagnostics } from "../../../packages/renderer-core/src/passage-diagnostics.ts";

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

let comp: Composition | undefined;
let preview: CompositionPreview | undefined;
let warnings: string[] = [];
let playing = false,
  start = 0,
  animation = 0,
  generation = 0;

const listDiagnostics = (lines: string[]) =>
  list.replaceChildren(
    ...lines.map((line) =>
      Object.assign(document.createElement("li"), { textContent: line }),
    ),
  );

function show(frame: number) {
  if (!comp || !preview) return;
  const report = preview.renderFrame(frame);
  for (const marker of el("lint-timeline").querySelectorAll<HTMLButtonElement>(
    "button",
  ))
    marker.dataset.active = String(
      frame >= Number(marker.dataset.start) &&
        frame <= Number(marker.dataset.end),
    );
  slider.value = String(frame);
  el("time").textContent =
    `${(frame / comp.fps).toFixed(2)} s · ${frame + 1} / ${comp.frameCount}`;
  listDiagnostics([
    ...warnings,
    ...report.diagnostics.map((d) => `${d.code} ${d.path ?? ""}: ${d.message}`),
    ...(report.culled.length
      ? [`Culled outside the frame: ${report.culled.join(", ")}`]
      : []),
  ]);
}
const stop = () => {
  playing = false;
  cancelAnimationFrame(animation);
  play.textContent = "Play";
};
const tick = (now: number) => {
  if (!playing || !comp) return;
  const frame = Math.floor(((now - start) * comp.fps) / 1000);
  if (frame >= comp.frameCount) {
    show(comp.frameCount - 1);
    stop();
    return;
  }
  show(frame);
  animation = requestAnimationFrame(tick);
};
play.onclick = () => {
  if (playing || !comp) return stop();
  const from =
    Number(slider.value) >= comp.frameCount - 1 ? 0 : Number(slider.value);
  start = performance.now() - (from / comp.fps) * 1000;
  playing = true;
  play.textContent = "Pause";
  animation = requestAnimationFrame(tick);
};
slider.oninput = () => {
  stop();
  show(Number(slider.value));
};

async function load(path: string) {
  const run = ++generation;
  const backend = backendSelect.value as CompositionBackend;
  stop();
  lintAbort?.abort();
  lintButton.disabled = true;
  el("lint-timeline").replaceChildren();
  el("lint-findings").replaceChildren();
  preview?.dispose();
  preview = undefined;
  comp = undefined;
  play.disabled = true;
  slider.disabled = false;
  error.textContent = "";
  status.textContent = `Loading ${path}…`;
  delete status.dataset.ready;
  delete status.dataset.backend;
  try {
    const query = `scene=${encodeURIComponent(path)}`;
    const response = await fetch(`/composition/scene?${query}`);
    if (!response.ok) throw new Error(`Cannot load ${path}`);
    const result = validateComposition(await response.json());
    if (!result.ok)
      throw new Error(
        result.diagnostics
          .map((d) => `${d.code} ${d.path}: ${d.message}`)
          .join("\n"),
      );
    const resources = await loadCompositionResources(
      result.composition,
      (id) => `/composition/asset?${query}&id=${encodeURIComponent(id)}`,
    );
    if (run !== generation) return;
    comp = result.composition;
    warnings = result.diagnostics.map(
      (d) => `${d.code} ${d.path}: ${d.message}`,
    );
    // A canvas cannot change between 2D and WebGL contexts after creation.
    const nextCanvas = canvas.cloneNode(false) as HTMLCanvasElement;
    canvas.replaceWith(nextCanvas);
    canvas = nextCanvas;
    preview = createCompositionPreview(canvas, comp, resources, { backend });
    describeRenderer(backend);
    slider.max = String(comp.frameCount - 1);
    el("command").textContent =
      `pnpm --silent still-shift comp render --input benchmarks/fixtures/composition/${path} --output ${comp.id}.mp4 --backend ${backend}`;
    showLint(
      analyzeCompositionQuality(comp, {
        evaluation: { textBounds: preview.textBounds },
      }),
    );
    show(0);
    lintButton.disabled = false;
    play.disabled = false;
    status.textContent = `Ready: ${comp.name ?? comp.id} · ${comp.width} × ${comp.height} · ${comp.fps} fps`;
    status.dataset.ready = path;
    status.dataset.backend = backend;
  } catch (cause) {
    if (run !== generation) return;
    const diagnostics = passageDiagnostics(cause);
    error.textContent = diagnostics.length
      ? diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n")
      : String(cause instanceof Error ? cause.message : cause);
    status.textContent = "Could not load the composition.";
    status.dataset.ready = "error";
  }
}

lintButton.onclick = async () => {
  if (!comp || !preview) return;
  const run = generation,
    at = Number(slider.value);
  stop();
  play.disabled = true;
  slider.disabled = true;
  lintButton.disabled = true;
  lintAbort = new AbortController();
  try {
    const report = await analyzeRenderedCompositionQuality(
      comp,
      preview,
      {},
      {
        signal: lintAbort.signal,
        onFrame: (frame) => {
          el("lint-summary").textContent =
            `Checking rendered frame ${frame + 1} / ${comp!.frameCount}…`;
        },
      },
    );
    if (run === generation) showLint(report);
  } catch (cause) {
    if (run === generation)
      el("lint-summary").textContent = `Motion check failed: ${String(cause)}`;
  } finally {
    if (run === generation) {
      show(at);
      play.disabled = false;
      slider.disabled = false;
      lintButton.disabled = false;
    }
  }
};

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
const query = new URLSearchParams(location.search);
const requested = query.get("scene");
backendSelect.value = query.get("backend") === "webgl2" ? "webgl2" : "canvas2d";
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
