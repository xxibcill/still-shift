import { createIllustratedPreview } from "../../../packages/renderer-core/src/illustrated-renderer.ts";

type SceneTiming = { fps: number; frameCount: number };
type PreviewSnapshot = { scene: SceneTiming };
type DisabledControl =
  | HTMLButtonElement
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLFieldSetElement;
type PreviewRenderer = {
  prepareFrame?(frame: number): Promise<void> | void;
  renderFrame(frame: number): unknown;
  dispose(): void;
};
type PreviewAudio = {
  readonly frame: number | undefined;
  play(frame: number): Promise<boolean>;
  stop(): void;
  dispose(): void;
};
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
  disableEditsWhileLoading?: boolean;
  restartOnFirstPlay?: boolean;
  retainValidOnFailure?: boolean;
  frameChanged?: (frame: number, snapshot: T) => void;
};

/** Resources belong to a candidate until its first frame can replace the active preview. */
function previewResources() {
  const controller = new AbortController();
  let disposed = false;
  const urls: string[] = [];
  const releases: (() => void)[] = [];
  let audio: PreviewAudio | undefined;
  const surfaces: {
    renderer: PreviewRenderer;
    present: () => void;
    visible: () => boolean;
  }[] = [];
  return {
    signal: controller.signal,
    onDispose(release: () => void) {
      if (disposed) release();
      else releases.push(release);
    },
    audio(player: PreviewAudio) {
      if (disposed) player.dispose();
      else if (audio) {
        player.dispose();
        throw new Error("A preview already owns an audio master");
      } else audio = player;
    },
    startAudio(frame: number) {
      return audio?.play(frame);
    },
    stopAudio() {
      audio?.stop();
    },
    audioFrame() {
      return audio?.frame;
    },
    renderer<R extends PreviewRenderer>(
      renderer: R,
      present: () => void,
      visible = () => true,
    ): R {
      if (disposed) renderer.dispose();
      else surfaces.push({ renderer, present, visible });
      return renderer;
    },
    url(blob: Blob) {
      const url = URL.createObjectURL(blob);
      if (disposed) URL.revokeObjectURL(url);
      else urls.push(url);
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
      if (disposed) {
        renderer.dispose();
        return renderer;
      }
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
    prepare(frame: number, validateAll = false) {
      controller.signal.throwIfAborted();
      const pending: Promise<void>[] = [];
      for (const surface of surfaces)
        if (validateAll || surface.visible()) {
          const readiness = surface.renderer.prepareFrame?.(frame);
          if (readiness) pending.push(readiness);
        }
      return pending.length ? Promise.all(pending).then(() => {}) : undefined;
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
      if (disposed) return;
      disposed = true;
      const errors: unknown[] = [];
      const release = (dispose: () => void) => {
        try {
          dispose();
        } catch (error) {
          errors.push(error);
        }
      };
      release(() => controller.abort());
      if (audio) release(() => audio!.dispose());
      audio = undefined;
      for (const { renderer } of surfaces) release(() => renderer.dispose());
      for (const url of urls) release(() => URL.revokeObjectURL(url));
      for (const callback of releases.splice(0)) release(callback);
      if (errors.length)
        throw new AggregateError(errors, "Preview resources could not dispose");
    },
  };
}
type PreviewResources = Pick<
  ReturnType<typeof previewResources>,
  "url" | "preview" | "renderer" | "signal" | "audio" | "onDispose"
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
  let frameGeneration = 0;
  let playbackGeneration = 0;
  const candidates = new Set<ReturnType<typeof previewResources>>();
  let dirty = true;
  let exporting = false;
  let playing = false;
  let hasPlayed = false;
  let animation = 0;

  function syncControls() {
    const available =
      !dirty && Boolean(active) && (options.canUpdate?.() ?? true);
    const locked = Boolean(options.disableWhileExporting && exporting);
    for (const control of controls.edit ?? [])
      control.disabled =
        exporting || Boolean(options.disableEditsWhileLoading && dirty);
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
    frameGeneration++;
    playbackGeneration++;
    playing = false;
    active?.resources.stopAudio();
    cancelAnimationFrame(animation);
    controls.play.textContent = "Play";
  }
  function show(index: number) {
    if (!active) return;
    const selected = active;
    const run = ++frameGeneration;
    const { scene } = selected.snapshot;
    const requested = Math.max(
      0,
      Math.min(Math.round(index), scene.frameCount - 1),
    );
    const present = () => {
      if (selected !== active || run !== frameGeneration) return;
      selected.resources.render(requested);
      frame = requested;
      selected.resources.present();
      syncPosition();
      options.frameChanged?.(frame, selected.snapshot);
    };
    const rejected = (error: unknown) => {
      if (selected !== active || run !== frameGeneration) return;
      pause();
      syncPosition();
      failed(error);
    };
    try {
      const readiness = selected.resources.prepare(requested);
      if (readiness) return readiness.then(present).catch(rejected);
      present();
    } catch (error) {
      rejected(error);
    }
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
    for (const resources of candidates) resources.dispose();
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
    candidates.add(resources);
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
      const readiness = resources.prepare(initialFrame, true);
      if (readiness) await readiness;
      if (run !== generation) return false;
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
      candidates.delete(resources);
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
    const run = ++playbackGeneration;
    const restarting =
      (options.restartOnFirstPlay && !hasPlayed) ||
      frame >= active.snapshot.scene.frameCount - 1;
    hasPlayed = true;
    playing = true;
    controls.play.textContent = "Pause";
    const startPlayback = async () => {
      if (!active || !playing || dirty || run !== playbackGeneration) return;
      const selected = active;
      const startFrame = frame;
      const start = performance.now();
      const pendingAudio = selected.resources.startAudio(startFrame);
      if (pendingAudio) {
        try {
          if (!(await pendingAudio)) return;
        } catch (error) {
          if (run === playbackGeneration) {
            pause();
            failed(error);
          }
          return;
        }
      }
      if (
        selected !== active ||
        !playing ||
        dirty ||
        run !== playbackGeneration
      )
        return;
      const next = () => {
        if (!active || !playing || dirty || run !== playbackGeneration) return;
        const audioFrame = selected.resources.audioFrame();
        if (
          audioFrame === undefined
            ? frame >= active.snapshot.scene.frameCount - 1
            : audioFrame >= active.snapshot.scene.frameCount
        )
          pause();
        else animation = requestAnimationFrame(tick);
      };
      const tick = (now: number) => {
        if (!active || !playing || dirty || run !== playbackGeneration) return;
        const readiness = show(
          selected.resources.audioFrame() ??
            startFrame +
              Math.floor(((now - start) * active.snapshot.scene.fps) / 1000),
        );
        if (readiness) void readiness.then(next);
        else next();
      };
      animation = requestAnimationFrame(tick);
    };
    const readiness = restarting ? show(0) : undefined;
    if (readiness) void readiness.then(startPlayback);
    else void startPlayback();
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
