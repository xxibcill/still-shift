import { validateStateOwnership } from "./component-state.ts";
import { validateTravelOwnership } from "./component-travel.ts";
import type {
  ComponentNumberFormat,
  ComponentSceneData,
  ComponentValue,
} from "../../scene-contract/src/component-data.ts";
import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import { easeMotion } from "./motion-easing.ts";
import type { LoadedFont } from "./prepared-fonts.ts";
import { measureTextLayout, type TextLayout } from "./text-layout.ts";

export function sampleComponentValue(value: ComponentValue, frame: number) {
  if (!Number.isFinite(frame))
    throw new Error("Numeric sample requires a finite frame");
  if (frame <= value.window.start) return value.from;
  if (frame >= value.window.end) return value.to;
  const t = Math.max(
    0,
    Math.min(
      1,
      (frame - value.window.start) / (value.window.end - value.window.start),
    ),
  );
  return (
    value.from + (value.to - value.from) * easeMotion(t, value.window.easing)
  );
}
export function formatComponentValue(
  value: number,
  format: ComponentNumberFormat,
) {
  if (!Number.isFinite(value))
    throw new Error("Numeric text requires a finite value");
  const factor = 10 ** format.decimals,
    scaled = Math.abs(value) * factor;
  const units =
    format.rounding === "truncate"
      ? Math.floor(scaled + 1e-8)
      : Math.floor(scaled + 0.5 + 1e-8);
  const [whole, decimal] = (units / factor).toFixed(format.decimals).split(".");
  const digits = format.groupSeparator
    ? whole!.replace(/\B(?=(\d{3})+(?!\d))/g, format.groupSeparator)
    : whole!;
  return (
    format.prefix +
    (value < 0 && units ? "-" : "") +
    digits +
    (decimal ? format.decimalSeparator + decimal : "") +
    format.suffix
  );
}
export function componentText(
  scene: { componentData?: ComponentSceneData["componentData"] },
  node: PreparedNode,
  frame: number,
) {
  if (node.type !== "text") return undefined;
  const binding = scene.componentData?.bindings.find(
    (b) => b.kind === "text" && b.target === node.id,
  );
  if (!binding || binding.kind !== "text") return undefined;
  const value = scene.componentData!.values.find(
    (v) => v.id === binding.value,
  )!;
  return formatComponentValue(
    sampleComponentValue(value, frame),
    binding.format,
  );
}
export function componentTextVariants(
  scene: { componentData?: ComponentSceneData["componentData"] },
  node: Extract<PreparedNode, { type: "text" }>,
) {
  const binding = scene.componentData?.bindings.find(
    (b) => b.kind === "text" && b.target === node.id,
  );
  if (!binding || binding.kind !== "text") return node.states ?? [node.text];
  const value = scene.componentData!.values.find(
    (v) => v.id === binding.value,
  )!;
  const factor = 10 ** binding.format.decimals;
  const lower = Math.floor(Math.min(value.from, value.to) * factor),
    upper = Math.ceil(Math.max(value.from, value.to) * factor);
  if (upper - lower + 1 > 10000)
    throw new Error("Numeric text exceeds 10000 formatted values");
  return [
    ...new Set(
      Array.from({ length: upper - lower + 1 }, (_, i) =>
        formatComponentValue((lower + i) / factor, binding.format),
      ),
    ),
  ];
}
export function applyComponentValues(
  scene: { componentData?: ComponentSceneData["componentData"] },
  id: string,
  frame: number,
  state: Record<string, number>,
) {
  for (const binding of scene.componentData?.bindings ?? []) {
    if (binding.kind !== "property" || binding.target !== id) continue;
    const value = scene.componentData!.values.find(
      (v) => v.id === binding.value,
    )!;
    const t =
      (sampleComponentValue(value, frame) - value.range[0]) /
      (value.range[1] - value.range[0]);
    state[binding.property] =
      t === 0
        ? binding.output[0]
        : t === 1
          ? binding.output[1]
          : binding.output[0] + (binding.output[1] - binding.output[0]) * t;
  }
}
export function prepareMeasuredText(
  scene: {
    nodes: PreparedNode[];
    componentData?: ComponentSceneData["componentData"];
  },
  ctx: CanvasRenderingContext2D,
  fonts: Map<string, LoadedFont>,
) {
  const layouts = new Map<string, Map<string, TextLayout>>();
  for (const node of scene.nodes) {
    if (node.type !== "text" || !node.textBox) continue;
    const font = node.fontAsset ? fonts.get(node.fontAsset) : undefined;
    if (!font)
      throw new Error("Text layout requires a prepared font: " + node.id);
    ctx.font = font.weight + " " + node.fontSize + 'px "' + font.family + '"';
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    layouts.set(
      node.id,
      new Map(
        componentTextVariants(scene, node).map((text) => [
          text,
          measureTextLayout(ctx, { ...node, text }),
        ]),
      ),
    );
  }
  return layouts;
}
export function validateComponentOwnership(
  scene: ComponentSceneData & {
    tracks: Record<string, Partial<Record<string, unknown[]>>>;
    followers?: Record<string, unknown>;
    effects?: { type: string; target?: string | undefined }[] | undefined;
    textFits?: { target: string }[] | undefined;
    attachments?: { path: string }[] | undefined;
    connectors?: { path: string }[] | undefined;
    geometry?: { node: string }[] | undefined;
  },
) {
  validateStateOwnership(scene);
  validateTravelOwnership(scene);
  for (const binding of scene.componentData?.bindings ?? []) {
    const property = binding.kind === "text" ? "state" : binding.property;
    if (
      scene.tracks[binding.target]?.[property]?.length ||
      (["x", "y"].includes(property) &&
        Object.hasOwn(scene.followers ?? {}, binding.target)) ||
      scene.effects?.some((e) => e.target === binding.target) ||
      scene.textFits?.some((f) => f.target === binding.target)
    )
      throw new Error(
        "Conflicting component property ownership: " +
          binding.target +
          "." +
          property,
      );
  }
  for (const annotation of scene.componentData?.annotations ?? []) {
    if (
      [...(scene.attachments ?? []), ...(scene.connectors ?? [])].some(
        (a) => a.path === annotation.path,
      )
    )
      throw new Error(
        "Conflicting annotation path ownership: " + annotation.path,
      );
    if (
      ["x", "y", "scaleX", "scaleY", "rotation"].some(
        (property) =>
          scene.tracks[annotation.path]?.[property]?.length ||
          scene.componentData?.bindings.some(
            (b) =>
              b.target === annotation.path &&
              b.kind === "property" &&
              b.property === property,
          ),
      ) ||
      scene.effects?.some((e) => e.target === annotation.path)
    )
      throw new Error("Annotation owns path geometry: " + annotation.path);
    for (const source of annotation.protect)
      if (!scene.geometry?.some((g) => g.node === source))
        throw new Error(
          "Protected annotation needs commerce source geometry: " + source,
        );
  }
}
