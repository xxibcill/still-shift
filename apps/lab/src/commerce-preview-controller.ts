type SceneTiming = { fps: number; frameCount: number };

type PreviewControls = {
  play: HTMLButtonElement;
  restart: HTMLButtonElement;
  scrub: HTMLInputElement;
  download: HTMLButtonElement;
  export: HTMLButtonElement;
  timecode: HTMLElement;
  update?: HTMLButtonElement;
};

type PreviewOptions = {
  controls: PreviewControls;
  scene: () => SceneTiming | undefined;
  renderFrame: (frame: number) => void;
  canUpdate?: () => boolean;
  disableWhileExporting?: boolean;
  restartOnFirstPlay?: boolean;
};

export function createCommercePreviewController(options: PreviewOptions) {
  const { controls, scene, renderFrame } = options;
  let frame = 0;
  let generation = 0;
  let dirty = true;
  let exporting = false;
  let playing = false;
  let hasPlayed = false;
  let animation = 0;

  function syncControls() {
    const available =
      !dirty && Boolean(scene()) && (options.canUpdate?.() ?? true);
    const disabled =
      !available || Boolean(options.disableWhileExporting && exporting);
    for (const control of [
      controls.play,
      controls.restart,
      controls.scrub,
      controls.download,
    ])
      control.disabled = disabled;
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
    const current = scene();
    if (!current) return;
    frame = Math.max(0, Math.min(index, current.frameCount - 1));
    renderFrame(frame);
    controls.scrub.value = String(frame);
    controls.timecode.textContent = `${(frame / current.fps).toFixed(2)} / ${(current.frameCount / current.fps).toFixed(2)} s`;
  }

  function invalidate() {
    generation++;
    dirty = true;
    pause();
    syncControls();
    return generation;
  }

  function activate(initialFrame: number) {
    const current = scene();
    if (!current) return;
    dirty = false;
    hasPlayed = false;
    controls.scrub.max = String(current.frameCount - 1);
    show(initialFrame);
    syncControls();
  }

  function setExporting(next: boolean) {
    exporting = next;
    syncControls();
  }

  controls.scrub.addEventListener("input", () => {
    hasPlayed = true;
    pause();
    show(Number(controls.scrub.value));
  });
  controls.restart.addEventListener("click", () => {
    pause();
    show(0);
  });
  controls.play.addEventListener("click", () => {
    const current = scene();
    if (!current || dirty) return;
    if (playing) {
      pause();
      return;
    }
    if (
      (options.restartOnFirstPlay && !hasPlayed) ||
      frame >= current.frameCount - 1
    )
      show(0);
    hasPlayed = true;
    playing = true;
    controls.play.textContent = "Pause";
    const startFrame = frame;
    const start = performance.now();
    const tick = (now: number) => {
      const timing = scene();
      if (!timing || !playing) return;
      show(startFrame + Math.floor(((now - start) * timing.fps) / 1000));
      if (frame >= timing.frameCount - 1) pause();
      else animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
  });

  return {
    activate,
    invalidate,
    isCurrent: (run: number) => run === generation,
    setExporting,
    show,
    syncControls,
    get frame() {
      return frame;
    },
    get dirty() {
      return dirty;
    },
    get exporting() {
      return exporting;
    },
    get generation() {
      return generation;
    },
  };
}
