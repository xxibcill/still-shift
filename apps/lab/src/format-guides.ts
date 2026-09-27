type Rectangle = { x: number; y: number; width: number; height: number };

export type GuideScene = {
  width: number;
  height: number;
  safeInset?: number | undefined;
  safeZones?: unknown;
};

const rectangle = (value: unknown): Rectangle | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const area = value as Record<string, unknown>;
  if (
    typeof area.x !== "number" ||
    typeof area.y !== "number" ||
    typeof area.width !== "number" ||
    typeof area.height !== "number"
  )
    return undefined;
  return area as Rectangle;
};

export function setPreviewAspect(stage: HTMLElement, scene: GuideScene) {
  stage.style.aspectRatio = `${scene.width} / ${scene.height}`;
  stage.classList.toggle("portrait", scene.height > scene.width);
}

export function drawFormatGuides(
  overlay: HTMLCanvasElement,
  scene: GuideScene,
  visible: boolean,
) {
  if (overlay.width !== scene.width) overlay.width = scene.width;
  if (overlay.height !== scene.height) overlay.height = scene.height;
  const context = overlay.getContext("2d")!;
  context.clearRect(0, 0, scene.width, scene.height);
  if (!visible) return;

  context.save();
  context.lineWidth = Math.max(2, Math.min(scene.width, scene.height) / 360);
  context.font = `${Math.max(20, Math.round(scene.width / 42))}px sans-serif`;
  context.textBaseline = "top";
  if (scene.safeInset !== undefined) {
    context.strokeStyle = "#d4b777";
    context.setLineDash([12, 8]);
    context.strokeRect(
      scene.safeInset,
      scene.safeInset,
      scene.width - scene.safeInset * 2,
      scene.height - scene.safeInset * 2,
    );
    context.setLineDash([]);
  }

  if (scene.safeZones && typeof scene.safeZones === "object") {
    for (const [name, value] of Object.entries(scene.safeZones)) {
      const zone = rectangle(value);
      if (!zone) continue;
      context.fillStyle = "#e2725540";
      context.fillRect(zone.x, zone.y, zone.width, zone.height);
      context.strokeStyle = "#e27255";
      context.strokeRect(zone.x, zone.y, zone.width, zone.height);
      context.fillStyle = "#fff4e7";
      context.fillText(name, zone.x + 8, zone.y + 8);
    }
  }

  if (scene.height > scene.width) {
    const footprintHeight = scene.width * (9 / 16);
    const top = (scene.height - footprintHeight) / 2;
    context.strokeStyle = "#8cbdc7";
    context.setLineDash([18, 10]);
    context.strokeRect(0, top, scene.width, footprintHeight);
    context.setLineDash([]);
    context.fillStyle = "#d7f1f3";
    context.fillText("16:9 footprint", 12, top + 12);
  }
  context.restore();
}
