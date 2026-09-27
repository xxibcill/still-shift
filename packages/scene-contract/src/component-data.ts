import { z } from "zod";
import type { PreparedNode } from "./prepared.ts";
import { MotionEasingSchema } from "./motion-easing.ts";

export const ComponentIdSchema = z.string().regex(/^[a-zA-Z][\w-]*$/);
const finite = z.number().finite();
export const ComponentWindowSchema = z
  .object({
    start: finite.int().nonnegative(),
    end: finite.int().positive(),
    easing: MotionEasingSchema.default("linear"),
    cue: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (w) => w.end > w.start,
    "Component window must have positive duration",
  );
export const ComponentAnchorSchema = z
  .object({
    node: ComponentIdSchema,
    point: z.tuple([finite, finite]),
    space: z.enum(["node", "source"]).default("node"),
    offset: z.tuple([finite, finite]).default([0, 0]),
  })
  .strict();
export const ComponentAnnotationSchema = z
  .object({
    path: ComponentIdSchema,
    points: z.array(ComponentAnchorSchema).min(2).max(128),
    protect: z.array(ComponentIdSchema).max(16).default([]),
  })
  .strict();
export const ComponentValueSchema = z
  .object({
    id: ComponentIdSchema,
    range: z.tuple([finite.min(-1e9), finite.max(1e9)]),
    from: finite,
    to: finite,
    window: ComponentWindowSchema,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.range[0] >= v.range[1] ||
      [v.from, v.to].some((n) => n < v.range[0] || n > v.range[1])
    )
      ctx.addIssue({
        code: "custom",
        message: "Value endpoints must fit an increasing declared range",
      });
    if (v.window.easing === "out-back-soft")
      ctx.addIssue({
        code: "custom",
        message: "Numeric values require bounded easing",
      });
  });
export const ComponentNumberFormatSchema = z
  .object({
    decimals: finite.int().min(0).max(4).default(0),
    rounding: z
      .enum(["half-away-from-zero", "truncate"])
      .default("half-away-from-zero"),
    decimalSeparator: z.enum([".", ","]).default("."),
    groupSeparator: z.enum(["", ".", ",", " "]).default(""),
    prefix: z.string().max(32).default(""),
    suffix: z.string().max(32).default(""),
  })
  .strict()
  .refine(
    (f) => !f.groupSeparator || f.groupSeparator !== f.decimalSeparator,
    "Number separators must differ",
  );
export const ComponentValueBindingSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("text"),
      value: ComponentIdSchema,
      target: ComponentIdSchema,
      format: ComponentNumberFormatSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("property"),
      value: ComponentIdSchema,
      target: ComponentIdSchema,
      property: z.enum(["x", "y", "scaleX", "scaleY", "opacity", "reveal"]),
      output: z.tuple([finite, finite]),
    })
    .strict(),
]);
export const ComponentDataV1Schema = z
  .object({
    schemaVersion: z.literal("scene-components-1"),
    annotations: z.array(ComponentAnnotationSchema).max(40).default([]),
    values: z.array(ComponentValueSchema).max(40).default([]),
    bindings: z.array(ComponentValueBindingSchema).max(80).default([]),
  })
  .strict();
export const ComponentStateSchema = z
  .object({
    id: ComponentIdSchema,
    target: ComponentIdSchema,
    initial: finite.int().nonnegative(),
    cuts: z
      .array(
        z
          .object({
            id: ComponentIdSchema,
            frame: finite.int().nonnegative(),
            state: finite.int().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict();
export const ComponentTravelSchema = z
  .object({
    id: ComponentIdSchema,
    target: ComponentIdSchema,
    path: ComponentIdSchema,
    from: finite.min(0).max(1),
    to: finite.min(0).max(1),
    window: ComponentWindowSchema,
  })
  .strict()
  .refine(
    (t) => t.window.easing !== "out-back-soft",
    "Path travel requires bounded easing",
  );
export const ComponentDataV2Schema = ComponentDataV1Schema.extend({
  schemaVersion: z.literal("scene-components-2"),
  states: z.array(ComponentStateSchema).max(100).default([]),
  travels: z.array(ComponentTravelSchema).max(32).default([]),
}).strict();
export const ComponentDataSchema = z.discriminatedUnion("schemaVersion", [
  ComponentDataV1Schema,
  ComponentDataV2Schema,
]);
export type ComponentState = z.infer<typeof ComponentStateSchema>;
export type ComponentTravel = z.infer<typeof ComponentTravelSchema>;
export type ComponentData = z.infer<typeof ComponentDataSchema>;
export type ComponentAnchor = z.infer<typeof ComponentAnchorSchema>;
export type ComponentValue = z.infer<typeof ComponentValueSchema>;
export type ComponentNumberFormat = z.infer<typeof ComponentNumberFormatSchema>;
export type ComponentSceneData = {
  nodes: PreparedNode[];
  frameCount: number;
  componentData?: ComponentData | undefined;
};

export function validateComponentData(
  scene: ComponentSceneData,
  fail: (message: string) => void,
) {
  const data = scene.componentData;
  if (!data) return;
  validateBehaviorData(scene, fail);
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const values = new Map(data.values.map((v) => [v.id, v]));
  const paths = new Set(data.annotations.map((a) => a.path));
  if (values.size !== data.values.length) fail("Duplicate component value");
  if (paths.size !== data.annotations.length)
    fail("Duplicate component annotation");
  for (const value of data.values)
    if (value.window.end >= scene.frameCount)
      fail("Component value exceeds timeline: " + value.id);
  for (const annotation of data.annotations) {
    const path = nodes.get(annotation.path);
    if (path?.type !== "path" || path.parent)
      fail("Annotation needs a root path: " + annotation.path);
    for (const anchor of annotation.points) {
      const node = nodes.get(anchor.node);
      if (!node || node.type === "path")
        fail(
          "Annotation anchor needs an independent visual node: " + anchor.node,
        );
      if (
        anchor.space === "source" &&
        (node?.type !== "image" || node.states.length !== 1)
      )
        fail("Source anchor needs one image state: " + anchor.node);
    }
    for (const id of annotation.protect)
      if (nodes.get(id)?.type !== "image")
        fail("Protected annotation source must be an image: " + id);
  }
  const owned = new Set<string>();
  for (const binding of data.bindings) {
    const value = values.get(binding.value),
      node = nodes.get(binding.target);
    if (!value || !node) {
      fail("Missing component value or target: " + binding.target);
      continue;
    }
    const key =
      binding.target +
      "." +
      (binding.kind === "text" ? "text" : binding.property);
    if (owned.has(key)) fail("Duplicate component binding: " + key);
    owned.add(key);
    if (binding.kind === "text") {
      if (
        node.type !== "text" ||
        !node.fontAsset ||
        !node.textBox ||
        node.states ||
        node.textLayout
      )
        fail("Numeric text requires one pinned, measured text box: " + node.id);
      if (
        Math.ceil(
          Math.abs(value.to - value.from) * 10 ** binding.format.decimals,
        ) +
          3 >
        10000
      )
        fail(
          "Numeric text exceeds 10000 formatted values; reduce precision or range: " +
            node.id,
        );
    } else {
      if (!Number.isFinite(binding.output[1] - binding.output[0]))
        fail("Numeric output span must be finite: " + node.id);
      if (
        binding.property === "reveal" &&
        node.type !== "rect" &&
        node.type !== "path"
      )
        fail("Numeric reveal requires a rectangle or path: " + node.id);
      if (
        ["opacity", "reveal"].includes(binding.property) &&
        binding.output.some((v) => v < 0 || v > 1)
      )
        fail("Numeric opacity/reveal must stay in [0,1]");
      if (
        ["scaleX", "scaleY"].includes(binding.property) &&
        binding.output.some((v) => v <= 0 || v > 4)
      )
        fail("Numeric scale must stay in (0,4]");
    }
  }
}

function validateBehaviorData(
  scene: ComponentSceneData,
  fail: (message: string) => void,
) {
  const data = scene.componentData;
  if (data?.schemaVersion !== "scene-components-2") return;
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const ids = new Set<string>();
  const cue = (id: string) => {
    if (ids.has(id)) fail("Duplicate component cue ID: " + id);
    ids.add(id);
  };
  data.values.forEach((v) => cue(v.window.cue ?? v.id));
  if (
    new Set(data.states.map((s) => s.id)).size !== data.states.length ||
    new Set(data.travels.map((t) => t.id)).size !== data.travels.length
  )
    fail("Duplicate component behavior ID");
  const stateTargets = new Set<string>();
  if (data.states.reduce((count, s) => count + s.cuts.length, 0) > 100)
    fail("Component state cuts exceed 100 per scene");
  for (const schedule of data.states) {
    const node = nodes.get(schedule.target);
    if (stateTargets.has(schedule.target))
      fail("Duplicate component state ownership: " + schedule.target);
    stateTargets.add(schedule.target);
    if (
      !node ||
      (node.type !== "text" && node.type !== "image") ||
      !node.states?.length
    ) {
      fail(
        "State step requires authored image or text states: " + schedule.target,
      );
      continue;
    }
    if (
      node.type === "text" &&
      (!node.fontAsset || !node.textBox || node.textLayout)
    )
      fail("State text requires a pinned, measured text box: " + node.id);
    if (
      [schedule.initial, ...schedule.cuts.map((c) => c.state)].some(
        (i) => i >= node.states!.length,
      )
    )
      fail("Missing component state index: " + node.id);
    let previous = -1;
    for (const cut of schedule.cuts) {
      cue(cut.id);
      if (cut.frame <= previous)
        fail(
          "Component state cuts must be strictly increasing: " + schedule.id,
        );
      if (cut.frame >= scene.frameCount)
        fail("Component state cut exceeds timeline: " + cut.id);
      previous = cut.frame;
    }
  }
  const travellers = new Set<string>();
  for (const travel of data.travels) {
    cue(travel.window.cue ?? travel.id);
    if (travellers.has(travel.target))
      fail("Duplicate component travel ownership: " + travel.target);
    travellers.add(travel.target);
    if (!nodes.has(travel.target))
      fail("Missing component travel target: " + travel.target);
    const path = nodes.get(travel.path);
    if (path?.type !== "path")
      fail("Component travel requires a path: " + travel.path);
    else if (
      !path.points.some(
        (p) => p[0] !== path.points[0]![0] || p[1] !== path.points[0]![1],
      )
    )
      fail("Component travel requires nonzero path length: " + travel.path);
    if (
      path?.type === "path" &&
      !Number.isFinite(
        path.points
          .slice(1)
          .reduce(
            (sum, point, i) =>
              sum +
              Math.hypot(
                point[0] - path.points[i]![0],
                point[1] - path.points[i]![1],
              ),
            0,
          ),
      )
    )
      fail("Component travel requires finite path length: " + travel.path);
    if (travel.window.end >= scene.frameCount)
      fail("Component travel exceeds timeline: " + travel.id);
  }
  // A route cannot depend on any traveller, including through its ancestors.
  for (const travel of data.travels) {
    let node = nodes.get(travel.path);
    const seen = new Set<string>();
    while (node) {
      if (seen.has(node.id) || travellers.has(node.id)) {
        fail("Component travel route dependency: " + travel.path);
        break;
      }
      seen.add(node.id);
      node = node.parent ? nodes.get(node.parent) : undefined;
    }
  }
}
