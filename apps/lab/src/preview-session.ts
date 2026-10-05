import { createIllustratedPreview } from "../../../packages/renderer-core/src/illustrated-renderer.ts";

type SceneTiming = { fps: number; frameCount: number };
type PreviewSnapshot = { scene: SceneTiming };
type DisabledControl =
  | HTMLButtonElement
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLFieldSetElement;
type PreviewRenderer = { renderFrame(frame: number): unknown; dispose(): void };
type PreviewControls = {
  play: HTMLButtonElement;
  scrub: HTMLInputElement;
  export: HTMLButtonElement;
  downloads: HTMLButtonElement[];
  restart?: HTMLButtonElement;
  timecode?: HTMLElement;
  frame?: HTMLElement;
  update?: HTMLButtonElement;
  edit?: DisabledControl[];
};
type SessionOptions<T> = {
  controls: PreviewControls;
  status: (message: string, error?: boolean) => void;
  ready: (snapshot: T) => void;
  canUpdate?: () => boolean;
  disableWhileExporting?: boolean;
  restartOnFirstPlay?: boolean;
  retainValidOnFailure?: boolean;
  frameChanged?: (frame: number, snapshot: T) => void;
};

/** Resources belong to a candidate until its first frame can replace the active preview. */
function previewResources() {
  const urls: string[] = [];
  const surfaces: {
    renderer: PreviewRenderer;
    present: () => void;
    visible: () => boolean;
  }[] = [];
  return {
    renderer<R extends PreviewRenderer>(
      renderer: R,
      present: () => void,
      visible = () => true,
    ): R {
      surfaces.push({ renderer, present, visible });
      return renderer;
    },
    url(blob: Blob) {
      const url = URL.createObjectURL(blob);
      urls.push(url);
      return url;
    },
    preview(
      target: HTMLCanvasElement,
      scene: Parameters<typeof createIllustratedPreview>[1],
      images: Parameters<typeof createIllustratedPreview>[2],
      visible = () => true,
    ) {
      const staging = document.createElement("canvas");
      const renderer = createIllustratedPreview(staging, scene, images);
      surfaces.push({
        renderer,
        visible,
        present() {
          if (target.width !== staging.width) target.width = staging.width;
          if (target.height !== staging.height) target.height = staging.height;
          target.getContext("2d")!.drawImage(staging, 0, 0);
        },
      });
      return renderer;
    },
    render(frame: number, validateAll = false) {
      for (const surface of surfaces)
        if (validateAll || surface.visible())
          surface.renderer.renderFrame(frame);
    },
    present() {
      for (const surface of surfaces) if (surface.visible()) surface.present();
    },
    dispose() {
      for (const { renderer } of surfaces) renderer.dispose();
      for (const url of urls) URL.revokeObjectURL(url);
    },
  };
}
type PreviewResources = Pick<
  ReturnType<typeof previewResources>,
  "url" | "preview" | "renderer"
>;

export function createPreviewSession<T extends PreviewSnapshot>(
  options: SessionOptions<T>,
) {
  const { controls } = options;
  let active:
    | { snapshot: T; resources: ReturnType<typeof previewResources> }
    | undefined;
  let frame = 0;
  let generation = 0;
  let dirty = true;
  let exporting = false;
  let playing = false;
  let hasPlayed = false;
  let animation = 0;

  function syncControls() {
    const available =
      !dirty && Boolean(active) && (options.canUpdate?.() ?? true);
    const locked = Boolean(options.disableWhileExporting && exporting);
    for (const control of controls.edit ?? []) control.disabled = exporting;
    for (const control of [
      controls.play,
      controls.restart,
      controls.scrub,
      ...controls.downloads,
    ])
      if (control) control.disabled = !available || locked;
    controls.export.disabled = !available || exporting;
    if (controls.update)
      controls.update.disabled = !(options.canUpdate?.() ?? true);
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(animation);
    controls.play.textContent = "Play";
  }
  function show(index: number) {
    if (!active) return;
    const { scene } = active.snapshot;
    frame = Math.max(0, Math.min(Math.round(index), scene.frameCount - 1));
    active.resources.render(frame);
    active.resources.present();
    syncPosition();
    options.frameChanged?.(frame, active.snapshot);
  }
  function syncPosition() {
    if (!active) return;
    const { scene } = active.snapshot;
    controls.scrub.value = String(frame);
    if (controls.frame) controls.frame.textContent = String(frame);
    if (controls.timecode)
      controls.timecode.textContent = `${(frame / scene.fps).toFixed(2)} / ${(scene.frameCount / scene.fps).toFixed(2)} s`;
  }
  function invalidate() {
    generation++;
    dirty = true;
    pause();
    syncControls();
    return generation;
  }
  function failed(error: unknown) {
    options.status(
      (error instanceof Error ? error.message : String(error)) +
        (active ? " Previous valid preview is preserved." : ""),
      true,
    );
  }
  async function load(
    prepare: (
      resources: PreviewResources,
    ) => Promise<{ snapshot: T; initialFrame: number }>,
  ) {
    const run = invalidate();
    const resources = previewResources();
    let committed = false;
    try {
      const candidate = await prepare(resources);
      if (run !== generation) return false;
      const initialFrame = Math.max(
        0,
        Math.min(
          Math.round(candidate.initialFrame),
          candidate.snapshot.scene.frameCount - 1,
        ),
      );
      // Validate every staged surface before touching the last valid preview.
      resources.render(initialFrame, true);
      const previous = active;
      active = { snapshot: candidate.snapshot, resources };
      committed = true;
      previous?.resources.dispose();
      dirty = false;
      hasPlayed = false;
      controls.scrub.max = String(candidate.snapshot.scene.frameCount - 1);
      frame = initialFrame;
      resources.present();
      syncPosition();
      options.ready(candidate.snapshot);
      options.frameChanged?.(frame, candidate.snapshot);
    } catch (error) {
      if (run === generation) {
        if (active && options.retainValidOnFailure) dirty = false;
        failed(error);
      }
    } finally {
      if (!committed) resources.dispose();
      syncControls();
    }
    return committed;
  }
  async function edit<D>(
    read: () => Promise<D>,
    apply: (draft: D) => void | Promise<void>,
  ) {
    const run = invalidate();
    try {
      const draft = await read();
      if (run === generation) await apply(draft);
    } catch (error) {
      if (run === generation) failed(error);
    } finally {
      syncControls();
    }
  }
  async function exportSnapshot(render: (snapshot: T) => Promise<string>) {
    if (!active || dirty || exporting) return;
    const snapshot = active.snapshot;
    const run = generation;
    exporting = true;
    if (options.disableWhileExporting) pause();
    syncControls();
    try {
      const message = await render(snapshot);
      if (run === generation) options.status(message);
    } catch (error) {
      if (run === generation)
        options.status(
          error instanceof Error ? error.message : String(error),
          true,
        );
    } finally {
      exporting = false;
      syncControls();
    }
  }
  function clear() {
    invalidate();
    active?.resources.dispose();
    active = undefined;
    syncControls();
  }
  controls.scrub.addEventListener("input", () => {
    hasPlayed = true;
    pause();
    show(Number(controls.scrub.value));
  });
  controls.restart?.addEventListener("click", () => {
    pause();
    show(0);
  });
  controls.play.addEventListener("click", () => {
    if (!active || dirty) return;
    if (playing) return pause();
    if (
      (options.restartOnFirstPlay && !hasPlayed) ||
      frame >= active.snapshot.scene.frameCount - 1
    )
      show(0);
    hasPlayed = true;
    playing = true;
    controls.play.textContent = "Pause";
    const startFrame = frame;
    const start = performance.now();
    const tick = (now: number) => {
      if (!active || !playing) return;
      show(
        startFrame +
          Math.floor(((now - start) * active.snapshot.scene.fps) / 1000),
      );
      if (frame >= active.snapshot.scene.frameCount - 1) pause();
      else animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
  });
  window.addEventListener("pagehide", (event) => {
    pause();
    if (!event.persisted) clear();
  });
  syncControls();
  return {
    load,
    edit,
    invalidate,
    export: exportSnapshot,
    clear,
    show,
    pause,
    get snapshot() {
      return dirty ? undefined : active?.snapshot;
    },
    get frame() {
      return frame;
    },
    get exporting() {
      return exporting;
    },
  };
}
