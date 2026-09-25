import { z } from "zod";

const severityChoices = [
  ["", "Unrated"],
  ["0", "None"],
  ["1", "Minor"],
  ["2", "Severe"],
] as const;
const usabilityChoices = [
  ["", "Unrated"],
  ["0", "Poor"],
  ["1", "Needs work"],
  ["2", "Usable"],
] as const;

export const RATING_FIELDS = [
  { key: "edgeArtifacts", label: "Edge artifacts", choices: severityChoices },
  {
    key: "subjectDeformation",
    label: "Subject deformation",
    choices: severityChoices,
  },
  { key: "exposedBorders", label: "Exposed borders", choices: severityChoices },
  { key: "depthOrder", label: "Depth order", choices: severityChoices },
  { key: "motionFit", label: "Motion fit", choices: usabilityChoices },
  {
    key: "editorialUsability",
    label: "Editorial usability",
    choices: usabilityChoices,
  },
  {
    key: "manualRepair",
    label: "Manual repair needed",
    choices: [
      ["", "Unrated"],
      ["0", "No"],
      ["1", "Yes"],
    ],
  },
] as const;

const ScoreSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.null(),
]);
const RepairSchema = z.union([z.literal(0), z.literal(1), z.null()]);

export const ClipRatingsSchema = z
  .object({
    edgeArtifacts: ScoreSchema.optional(),
    subjectDeformation: ScoreSchema.optional(),
    exposedBorders: ScoreSchema.optional(),
    depthOrder: ScoreSchema.optional(),
    motionFit: ScoreSchema.optional(),
    editorialUsability: ScoreSchema.optional(),
    manualRepair: RepairSchema.optional(),
  })
  .strict();

export const RatingsExportSchema = z.object({
  schemaVersion: z.literal("0.1"),
  corpusId: z.string().min(1),
  corpusSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  corpusStatus: z.enum(["incomplete", "frozen"]),
  reviewer: z.string(),
  exportedAt: z.string().datetime(),
  clips: z.record(z.string(), ClipRatingsSchema),
});

type RatingsExport = z.infer<typeof RatingsExportSchema>;

export const summarizeEvaluationRatings = (
  records: ReadonlyArray<{ id: string; result?: unknown }>,
  ratings: RatingsExport | null,
) => {
  const rendered = records.filter((record) => record.result !== undefined);
  const requiredFields = RATING_FIELDS.map((field) => field.key);
  const rated = rendered.filter((record) =>
    requiredFields.every(
      (field) => typeof ratings?.clips[record.id]?.[field] === "number",
    ),
  );
  const scores = rated.map((record) => ratings!.clips[record.id]!);
  return {
    rated: rated.length,
    rendered: rendered.length,
    failed: records.length - rendered.length,
    allRenderedRated:
      rated.length === rendered.length && Boolean(ratings?.reviewer.trim()),
    accepted: scores.filter(
      (score) => score.editorialUsability === 2 && score.manualRepair === 0,
    ).length,
    severe: scores.filter((score) =>
      [
        score.edgeArtifacts,
        score.subjectDeformation,
        score.exposedBorders,
        score.depthOrder,
      ].some((value) => value === 2),
    ).length,
    repaired: scores.filter((score) => score.manualRepair === 1).length,
  };
};
