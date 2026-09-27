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
] as const;
const ReusableDemoV1Schema = z
  .object({
    schemaVersion: z.literal("reusable-demo-1"),
    mode: z.enum(["commerce", "story", "isolated"]).default("commerce"),
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
    fps: z.union([z.literal(24), z.literal(30)]).default(24),
    count: z.number().int().min(2).max(5).default(3),
    gap: z.number().finite().min(0).max(200).default(32),
    stagger: z.number().int().min(0).max(100).default(12),
    middleDelay: z.number().int().min(0).max(150).default(0),
    middleText: z.string().min(1).max(120).default("Second marker"),
    from: z.number().finite().min(-100).max(100).default(20),
    to: z.number().finite().min(-100).max(100).default(80),
    decimals: z.number().int().min(0).max(2).default(0),
  })
  .strict();
export const ReusableDemoV2Schema = ReusableDemoV1Schema.extend({
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
export const ReusableDemoSchema = z.discriminatedUnion("schemaVersion", [
  ReusableDemoV1Schema,
  ReusableDemoV2Schema,
]);
export const reusableDemoVersion = (example: string) =>
  ["transform", "state", "travel", "tour", "supply"].includes(example)
    ? "reusable-demo-2"
    : "reusable-demo-1";
export type ReusableDemo = z.infer<typeof ReusableDemoSchema>;
