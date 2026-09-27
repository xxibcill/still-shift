import { z } from "zod";
export const REUSABLE_EXAMPLES = [
  {
    id: "instances",
    title: "Independent markers",
    kind: "Operator",
    description:
      "Three copies share one definition. Change the middle label and its timing independently.",
  },
  {
    id: "layout",
    title: "Measured feature row",
    kind: "Operator",
    description:
      "Align and distribute authored boxes inside one region. Content that cannot fit is rejected.",
  },
  {
    id: "stagger",
    title: "Staggered markers",
    kind: "Operator",
    description:
      "Repeat a marker with explicit frame offsets. Every copy keeps its own exported handles.",
  },
  {
    id: "leader",
    title: "Following label",
    kind: "Preset",
    description:
      "A text box follows its target. An attached leader joins the label to an authored point.",
  },
  {
    id: "outline",
    title: "Focus outline",
    kind: "Relationship",
    description:
      "An outline follows the target’s authored box through movement and camera transforms.",
  },
  {
    id: "underline",
    title: "Underline",
    kind: "Relationship",
    description:
      "Highlight an authored edge with a line attached to the target’s local coordinates.",
  },
  {
    id: "bracket",
    title: "Range bracket",
    kind: "Preset",
    description:
      "A four-point bracket joins two moving targets with explicit screen-space clearance.",
  },
  {
    id: "value",
    title: "Counter and bar",
    kind: "Behavior",
    description:
      "One bounded value drives both the number and the bar. Formatting and frame endpoints are explicit.",
  },
  {
    id: "transform",
    title: "Scale, turn and draw",
    kind: "Behavior",
    description:
      "A shared origin keeps the subject steady as it grows and turns. The line draws between explicit endpoints.",
  },
  {
    id: "state",
    title: "Exact state cuts",
    kind: "Behavior",
    description:
      "An image and caption change at named frames. Each state holds until the next cut.",
  },
  {
    id: "travel",
    title: "Follow a route",
    kind: "Behavior",
    description:
      "A marker follows an authored route through parent and camera transforms. Reverse the progress to travel back.",
  },
  {
    id: "tour",
    title: "Product detail tour",
    kind: "Composition",
    description:
      "A separate detail inset, caption cuts and a travelling focus marker share one timed tour.",
  },
  {
    id: "supply",
    title: "Supply-route change",
    kind: "Composition",
    description:
      "A symbolic route connects a travelling resource marker with exact image and caption changes. An engineering example, not a historical claim.",
  },
  {
    id: "visibility",
    title: "Visible for a moment",
    kind: "Behavior",
    description:
      "A detail appears at one exact frame and disappears at another. Authored fades remain independent.",
  },
  {
    id: "sequence",
    title: "One detail after another",
    kind: "Operator",
    description:
      "Complete instances share a local clock, then take their places in the scene. Gaps and overlaps are explicit.",
  },
  {
    id: "pin",
    title: "An attached badge",
    kind: "Relationship",
    description:
      "The badge follows an authored anchor while retaining its own readable size and angle.",
  },
  {
    id: "text-fit",
    title: "Words that fit",
    kind: "Behavior",
    description:
      "Every supplied caption is measured with the pinned font. One stable size fits the whole set.",
  },
  {
    id: "mask",
    title: "Through an aperture",
    kind: "Relationship",
    description:
      "An animated shape controls the visible part of a supplied image. Its color never appears in the picture.",
  },
  {
    id: "detail-sequence",
    title: "Three detail moments",
    kind: "Composition",
    description:
      "Timed detail windows combine attached badges, fitted captions and moving apertures.",
  },
  {
    id: "supply-sequence",
    title: "Three supply phases",
    kind: "Composition",
    description:
      "A symbolic route unfolds in three independently cued phases with pinned labels and shaped reveals.",
  },
] as const;
const SharedDemoFields = z.object({
  mode: z.enum(["commerce", "story", "isolated"]).default("commerce"),
  fps: z.union([z.literal(24), z.literal(30)]).default(24),
  middleText: z.string().min(1).max(120).default("Second marker"),
});
const ReusableDemoV1Schema = SharedDemoFields.extend({
  schemaVersion: z.literal("reusable-demo-1"),
  example: z
    .enum([
      "instances",
      "layout",
      "stagger",
      "leader",
      "outline",
      "underline",
      "bracket",
      "value",
    ])
    .default("instances"),
  count: z.number().int().min(2).max(5).default(3),
  gap: z.number().finite().min(0).max(200).default(32),
  stagger: z.number().int().min(0).max(100).default(12),
  middleDelay: z.number().int().min(0).max(150).default(0),
  from: z.number().finite().min(-100).max(100).default(20),
  to: z.number().finite().min(-100).max(100).default(80),
  decimals: z.number().int().min(0).max(2).default(0),
}).strict();
export const ReusableDemoV2Schema = SharedDemoFields.extend({
  schemaVersion: z.literal("reusable-demo-2"),
  example: z.enum(["transform", "state", "travel", "tour", "supply"]),
  scale: z.number().positive().max(4).default(1.15),
  rotation: z.number().finite().min(-720).max(720).default(12),
  drawFrom: z.number().min(0).max(1).default(0),
  drawTo: z.number().min(0).max(1).default(1),
  cutFrame: z.number().int().nonnegative().max(239).default(72),
  travelFrom: z.number().min(0).max(1).default(0),
  travelTo: z.number().min(0).max(1).default(1),
}).strict();
export const TIMING_EXAMPLES = [
  "visibility",
  "sequence",
  "pin",
  "text-fit",
  "mask",
  "detail-sequence",
  "supply-sequence",
] as const;
export const ReusableDemoV3Schema = SharedDemoFields.extend({
  schemaVersion: z.literal("reusable-demo-3"),
  example: z.enum(TIMING_EXAMPLES),
  middleDelay: z.number().int().min(0).max(150).default(0),
  clipStart: z.number().int().nonnegative().max(239).default(12),
  clipDuration: z.number().int().positive().max(240).default(48),
  anchorX: z.number().finite().min(-200).max(300).default(24),
  anchorY: z.number().finite().min(-150).max(150).default(0),
  minSize: z.number().int().min(16).max(180).default(32),
  maxSize: z.number().int().min(16).max(180).default(54),
  invert: z.boolean().default(false),
}).strict();
const currentDemoSchema = z.discriminatedUnion("schemaVersion", [
  ReusableDemoV1Schema,
  ReusableDemoV2Schema,
  ReusableDemoV3Schema,
]);
const legacyDefaults = ReusableDemoV1Schema.parse({
  schemaVersion: "reusable-demo-1",
});
const legacyFields = [
  "count",
  "gap",
  "stagger",
  "from",
  "to",
  "decimals",
] as const;
/** Older saved V2/V3 settings contain unused V1 defaults; canonical output omits them. */
export const ReusableDemoSchema = z.preprocess((input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const record = input as Record<string, unknown>;
  if (
    record.schemaVersion !== "reusable-demo-2" &&
    record.schemaVersion !== "reusable-demo-3"
  )
    return input;
  const clean = { ...record };
  for (const field of legacyFields)
    if (clean[field] === legacyDefaults[field]) delete clean[field];
  if (
    record.schemaVersion === "reusable-demo-2" &&
    clean.middleDelay === legacyDefaults.middleDelay
  )
    delete clean.middleDelay;
  return clean;
}, currentDemoSchema);
export const reusableDemoVersion = (example: string) =>
  (TIMING_EXAMPLES as readonly string[]).includes(example)
    ? "reusable-demo-3"
    : ["transform", "state", "travel", "tour", "supply"].includes(example)
      ? "reusable-demo-2"
      : "reusable-demo-1";
export type ReusableDemo = z.infer<typeof ReusableDemoSchema>;
