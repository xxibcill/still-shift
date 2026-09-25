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

type RatingField = {
  key: string;
  label: string;
  choices: ReadonlyArray<readonly [string, string]>;
  kind: "artifact" | "usability" | "repair";
};

export const RATING_FIELDS = [
  {
    key: "edgeArtifacts",
    label: "Edge artifacts",
    choices: severityChoices,
    kind: "artifact",
  },
  {
    key: "subjectDeformation",
    label: "Subject deformation",
    choices: severityChoices,
    kind: "artifact",
  },
  {
    key: "exposedBorders",
    label: "Exposed borders",
    choices: severityChoices,
    kind: "artifact",
  },
  {
    key: "depthOrder",
    label: "Depth order",
    choices: severityChoices,
    kind: "artifact",
  },
  {
    key: "motionFit",
    label: "Motion fit",
    choices: usabilityChoices,
    kind: "usability",
  },
  {
    key: "editorialUsability",
    label: "Editorial usability",
    choices: usabilityChoices,
    kind: "usability",
  },
  {
    key: "manualRepair",
    label: "Manual repair needed",
    kind: "repair",
    choices: [
      ["", "Unrated"],
      ["0", "No"],
      ["1", "Yes"],
    ],
  },
] as const satisfies ReadonlyArray<RatingField>;

type RatingKey = (typeof RATING_FIELDS)[number]["key"];

const ratingValueSchema = (field: RatingField) =>
  z.custom<number | null>((value) => {
    if (value === null) return true;
    return (
      typeof value === "number" &&
      field.choices.some(
        ([choice]) => choice !== "" && Number(choice) === value,
      )
    );
  });

export const ClipRatingsSchema = z
  .object(
    Object.fromEntries(
      RATING_FIELDS.map((field) => [
        field.key,
        ratingValueSchema(field).optional(),
      ]),
    ) as unknown as Record<RatingKey, z.ZodOptional<z.ZodType<number | null>>>,
  )
  .strict();

export const RatingsExportSchema = z.object({
  schemaVersion: z.literal("0.2"),
  corpusId: z.string().min(1),
  corpusSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  artifactSetSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  corpusStatus: z.enum(["incomplete", "frozen"]),
  reviewer: z.string(),
  exportedAt: z.string().datetime(),
  clips: z.record(z.string(), ClipRatingsSchema),
});

type RatingsExport = z.infer<typeof RatingsExportSchema>;

export const assertRatingsIdentity = (
  ratings: RatingsExport | null,
  corpus: { id: string; sha256: string },
  artifactSetSha256: string,
): void => {
  if (!ratings) return;
  if (ratings.corpusId !== corpus.id || ratings.corpusSha256 !== corpus.sha256)
    throw new Error("Ratings were exported for a different corpus revision");
  if (ratings.artifactSetSha256 !== artifactSetSha256)
    throw new Error("Ratings were exported for a different clip revision");
};

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
      RATING_FIELDS.some(
        (field) => field.kind === "artifact" && score[field.key] === 2,
      ),
    ).length,
    repaired: scores.filter((score) => score.manualRepair === 1).length,
  };
};
