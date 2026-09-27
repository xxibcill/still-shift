import "./motion-tools.css";
import type { StoryScene } from "../../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../../packages/renderer-core/src/story-scene.ts";
import {
  motionGraph,
  motionPath,
  withoutMotionLayer,
  MOTION_LAYER_COLORS,
  layerOrder,
} from "../../../packages/renderer-core/src/motion-inspector.ts";
import {
  createIllustratedPreview,
  type Images,
} from "../../../packages/renderer-core/src/illustrated-renderer.ts";
import { measureLayerPixelEnergy } from "../../../packages/renderer-core/src/story-continuous-quality.ts";

export function createMotionTools(
  input: StoryScene,
  seek: (frame: number) => void,
  images?: Images,
) {
  const scene = compileStoryScene(input),
    host = document.createElement("section");
  host.id = "motion-tools";
  host.className = "motion-tools";
  host.setAttribute("aria-label", "Motion inspector");
  const heading = document.createElement("h3");
  heading.textContent = "Motion inspector";
  const description = document.createElement("p");
  description.textContent =
    "Inspect values and speed, then select a key to jump to its frame.";
  const controls = document.createElement("div");
  controls.className = "controls";
  const select = (label: string, items: string[]) => {
    const wrapper = document.createElement("label");
    wrapper.textContent = label + " ";
    const field = document.createElement("select");
    field.setAttribute("aria-label", label);
    items.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      field.append(option);
    });
    wrapper.append(field);
    controls.append(wrapper);
    return field;
  };
  const nodes = select(
    "Motion node",
    scene.nodes.map((n) => n.id),
  );
  nodes.value = scene.compiledMotion?.layers[0]?.node ?? scene.nodes[0]!.id;
  const properties = select("Motion property", [
    "x",
    "y",
    "scaleX",
    "scaleY",
    "rotation",
    "opacity",
    "reveal",
    "blur",
    "skewX",
    "skewY",
    "strokeWidth",
    "trimStart",
    "trimEnd",
  ]);
  const mode = select("Graph", ["value", "speed"]),
    onion = select("Onion skin", ["off", "3", "6", "12"]);
  const graph = document.createElement("canvas");
  graph.width = 800;
  graph.height = 210;
  graph.setAttribute("role", "img");
  graph.setAttribute("aria-label", "Motion value and speed curves");
  graph.style.width = "100%";
  const legend = document.createElement("p");
  legend.className = "motion-legend";
  legend.textContent = "Final value";
  for (const layer of layerOrder) {
    const label = document.createElement("span");
    label.textContent = layer;
    label.style.color = MOTION_LAYER_COLORS[layer];
    legend.append(label);
  }
  const readout = document.createElement("output");
  readout.setAttribute("aria-live", "polite");
  const keys = document.createElement("div");
  keys.className = "controls";
  const path = document.createElement("canvas");
  path.width = 800;
  path.height = 450;
  path.style.width = "100%";
  path.setAttribute("aria-label", "Motion path and onion skin preview");
  path.setAttribute("role", "img");
  const energy = document.createElement("canvas");
  energy.width = 800;
  energy.height = 100;
  energy.style.width = "100%";
  energy.hidden = true;
  energy.setAttribute("role", "img");
  energy.setAttribute("aria-label", "Pixel energy by motion layer");
  const measure = document.createElement("button");
  measure.type = "button";
  measure.textContent = "Measure pixel energy";
  measure.disabled = !images;
  const status = document.createElement("p");
  status.setAttribute("aria-live", "polite");
  let frame = 0;
  const buffer = document.createElement("canvas");
  const preview = images
    ? createIllustratedPreview(buffer, scene, images)
    : undefined;
  let data = motionGraph(scene, nodes.value, properties.value);
  function drawPath() {
    const ctx = path.getContext("2d")!;
    ctx.clearRect(0, 0, path.width, path.height);
    const n = Number(onion.value) || 0;
    if (preview) {
      preview.renderFrame(frame);
      ctx.globalAlpha = 1;
      ctx.drawImage(buffer, 0, 0, path.width, path.height);
      if (n)
        for (const offset of [-n, n]) {
          preview.renderFrame(
            Math.max(0, Math.min(scene.frameCount - 1, frame + offset)),
          );
          ctx.globalAlpha = 0.22;
          ctx.drawImage(buffer, 0, 0, path.width, path.height);
        }
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.scale(path.width / scene.width, path.height / scene.height);
    ctx.strokeStyle = "#cc8056";
    ctx.lineWidth = 3;
    const step = Math.max(1, Math.floor(scene.frameCount / 160)),
      frames = Array.from(
        { length: Math.ceil(scene.frameCount / step) },
        (_, i) => Math.min(scene.frameCount - 1, i * step),
      );
    const points = motionPath(scene, nodes.value, frames);
    ctx.beginPath();
    points.forEach(({ point }, i) => {
      if (i) ctx.lineTo(...point);
      else ctx.moveTo(...point);
    });
    ctx.stroke();
    for (const pose of motionPath(scene, nodes.value, [
      Math.max(0, frame - n),
      frame,
      Math.min(scene.frameCount - 1, frame + n),
    ])) {
      ctx.globalAlpha = pose.frame === frame ? 1 : 0.4;
      ctx.beginPath();
      pose.bounds.forEach((point, i) => {
        if (i) ctx.lineTo(...point);
        else ctx.moveTo(...point);
      });
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  function drawGraph() {
    const ctx = graph.getContext("2d")!;
    ctx.clearRect(0, 0, 800, 210);
    const series = [
      {
        values: data.samples.map((s) => s[mode.value as "value" | "speed"]),
        color: "#ddd6c5",
      },
      ...data.layers.map((layer) => ({
        values: layer.samples.map((s, i, all) =>
          mode.value === "speed"
            ? i
              ? s.value - all[i - 1]!.value
              : 0
            : s.value,
        ),
        color: MOTION_LAYER_COLORS[layer.layer],
      })),
    ];
    const values = series.flatMap((s) => s.values),
      minimum = Math.min(0, ...values),
      maximum = Math.max(1, ...values),
      range = maximum - minimum;
    ctx.font = `${Math.max(12, (12 * 800) / (graph.clientWidth || 800))}px sans-serif`;
    ctx.fillStyle = "#b7ab92";
    ctx.textBaseline = "top";
    ctx.fillText(maximum.toFixed(2), 4, 2);
    ctx.textBaseline = "alphabetic";
    ctx.fillText(minimum.toFixed(2), 4, 204);
    series.forEach((s) => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      s.values.forEach((v, i) => {
        const x = 55 + (i / (scene.frameCount - 1)) * 735,
          y = 190 - ((v - minimum) / range) * 170;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    });
    ctx.strokeStyle = "#b7ab92";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x = 55 + (frame / (scene.frameCount - 1)) * 735;
    ctx.moveTo(x, 15);
    ctx.lineTo(x, 195);
    ctx.stroke();
    const sample = data.samples[frame]!;
    readout.textContent = `Frame ${frame} · value ${sample.value.toFixed(4)} · speed ${sample.speed.toFixed(4)} / frame`;
  }
  const update = () => {
    data = motionGraph(scene, nodes.value, properties.value);
    keys.replaceChildren();
    data.layers.forEach((layer) =>
      layer.keys.forEach((key) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `${layer.layer} · ${key.time}`;
        button.onclick = () => {
          seek(Math.round(key.time));
          readout.textContent = JSON.stringify({
            frame: key.time,
            value: key.value,
            smooth: key.smooth,
            in: key.in,
            out: key.out,
            easing: key.easing,
          });
        };
        keys.append(button);
      }),
    );
    drawGraph();
    drawPath();
  };
  for (const select of [nodes, properties, mode, onion])
    select.onchange = update;
  graph.onclick = (event) => {
    const rect = graph.getBoundingClientRect();
    seek(
      Math.max(
        0,
        Math.min(
          scene.frameCount - 1,
          Math.round(
            ((((event.clientX - rect.left) / rect.width) * 800 - 55) / 735) *
              (scene.frameCount - 1),
          ),
        ),
      ),
    );
  };
  host.addEventListener("story-frame", (event) => {
    frame = Math.max(
      0,
      Math.min(scene.frameCount - 1, (event as CustomEvent<number>).detail),
    );
    drawGraph();
    if (onion.value !== "off") drawPath();
  });
  measure.onclick = async () => {
    if (!images) return;
    measure.disabled = true;
    status.textContent = "Measuring frame changes for each layer…";
    const small = document.createElement("canvas");
    small.width = 320;
    small.height = 180;
    const ctx = small.getContext("2d", { willReadFrequently: true })!;
    const variants = [
      { layer: undefined, scene },
      ...layerOrder.map((layer) => ({
        layer,
        scene: withoutMotionLayer(scene, layer),
      })),
    ].map((v) => {
      const canvas = document.createElement("canvas");
      return {
        ...v,
        canvas,
        preview: createIllustratedPreview(canvas, v.scene, images),
      };
    });
    try {
      const report = await measureLayerPixelEnergy(
        scene.frameCount,
        async (frame, disabled) => {
          if (!host.isConnected) throw new Error("Inspector closed");
          const variant = variants.find((v) => v.layer === disabled)!;
          variant.preview.renderFrame(frame);
          ctx.drawImage(variant.canvas, 0, 0, 320, 180);
          if (frame % 12 === 0)
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            );
          return ctx.getImageData(0, 0, 320, 180).data;
        },
      );
      energy.hidden = false;
      const plot = energy.getContext("2d")!,
        peak = Math.max(1, ...report.total);
      plot.clearRect(0, 0, 800, 100);
      layerOrder.forEach((layer) => {
        plot.strokeStyle = MOTION_LAYER_COLORS[layer];
        plot.beginPath();
        report.layers[layer].forEach((value, i) => {
          const x = (i / (scene.frameCount - 1)) * 800,
            y = 98 - Math.min(1, value / peak) * 94;
          if (i) plot.lineTo(x, y);
          else plot.moveTo(x, y);
        });
        plot.stroke();
      });
      status.textContent =
        "Pixel energy measured at 320 × 180. Curves show each layer’s marginal contribution; overlapping contributions may add to more than the total.";
    } catch (error) {
      status.textContent = String(error);
    } finally {
      variants.forEach((v) => v.preview.dispose());
      measure.disabled = false;
    }
  };
  host.append(
    heading,
    description,
    controls,
    graph,
    legend,
    readout,
    keys,
    path,
    measure,
    energy,
    status,
  );
  update();
  return host;
}
