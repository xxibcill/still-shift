import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import {
  MechanismHashSchema,
  MechanismIdSchema,
  MechanismPixelSchema,
} from "@still-shift/scene-contract";

export const MECHANISM_RESPONSE_LIMITS = {
  bytes: 32768,
  items: 100,
  patchBytes: 16384,
  patchOperations: 32,
} as const;
export const MECHANISM_COMMANDS = [
  "discover",
  "schema",
  "inspect",
  "validate",
  "deps",
  "save",
  "patch",
  "prepare",
  "compile",
  "preview",
  "render",
  "check",
  "package",
  "init-tape-hook",
  "summary",
] as const;
export const MechanismCommandSchema = z.enum(MECHANISM_COMMANDS);
const scalar = z.union([
  z.string().max(2048),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const row = z
  .record(z.string().min(1).max(128), scalar)
  .refine((value) => Object.keys(value).length <= 32, {
    message: "Receipt row field budget exceeded",
  });
const artifact = z
  .object({
    kind: z.string().min(1).max(128),
    path: z.string().min(1).max(2048),
    sha256: MechanismHashSchema.optional(),
  })
  .strict();
export const MechanismCommandReceiptSchema = z
  .object({
    schemaVersion: z.literal("mechanism-command-result-1"),
    command: MechanismCommandSchema,
    status: z.enum(["passed", "failed", "cancelled"]),
    summary: row,
    items: z.array(row).max(MECHANISM_RESPONSE_LIMITS.items),
    artifacts: z.array(artifact).max(MECHANISM_RESPONSE_LIMITS.items),
    pagination: z
      .object({
        offset: z.number().int().nonnegative(),
        returned: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
        nextOffset: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    truncated: z.boolean(),
    nextAction: z.string().max(2048),
  })
  .strict()
  .superRefine((receipt, context) => {
    if (
      receipt.items.length + receipt.artifacts.length >
      MECHANISM_RESPONSE_LIMITS.items
    )
      context.addIssue({
        code: "custom",
        message: "Receipt item budget exceeded",
      });
    if (
      Buffer.byteLength(JSON.stringify(receipt)) >
      MECHANISM_RESPONSE_LIMITS.bytes
    )
      context.addIssue({
        code: "custom",
        message: "Receipt byte budget exceeded",
      });
    if (
      receipt.pagination.returned !== receipt.items.length ||
      receipt.pagination.offset + receipt.pagination.returned >
        receipt.pagination.total
    )
      context.addIssue({
        code: "custom",
        message: "Receipt pagination does not match returned rows",
      });
  });
const patchTarget = { shot: MechanismIdSchema, label: MechanismIdSchema };
export const MechanismPatchRequestSchema = z
  .object({
    schemaVersion: z.literal("mechanism-patch-1"),
    baseRevision: z.number().int().min(0).max(2_147_483_647),
    baseHash: MechanismHashSchema,
    operations: z
      .array(
        z.discriminatedUnion("property", [
          z
            .object({
              ...patchTarget,
              property: z.literal("text"),
              value: z.string().min(1).max(400),
            })
            .strict(),
          z
            .object({
              ...patchTarget,
              property: z.literal("position"),
              value: MechanismPixelSchema,
            })
            .strict(),
          z
            .object({
              ...patchTarget,
              property: z.literal("fontSize"),
              value: z.number().finite().min(16).max(400),
            })
            .strict(),
          z
            .object({
              ...patchTarget,
              property: z.literal("qualification"),
              value: z.string().min(1).max(400),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(MECHANISM_RESPONSE_LIMITS.patchOperations),
  })
  .strict()
  .refine(
    (patch) =>
      Buffer.byteLength(JSON.stringify(patch)) <=
      MECHANISM_RESPONSE_LIMITS.patchBytes,
    { message: "Patch exceeds 16 KiB" },
  );
export type MechanismCommand = z.infer<typeof MechanismCommandSchema>;
export type MechanismCommandReceipt = z.infer<
  typeof MechanismCommandReceiptSchema
>;
export type MechanismReceiptRow = z.infer<typeof row>;
export type MechanismReceiptArtifact = z.infer<typeof artifact>;
export type MechanismPatchRequest = z.infer<typeof MechanismPatchRequestSchema>;

export interface MechanismReceiptInput {
  command: MechanismCommand;
  status?: MechanismCommandReceipt["status"];
  summary: MechanismReceiptRow;
  items?: MechanismReceiptRow[];
  artifacts?: MechanismReceiptArtifact[];
  fullResult?: unknown;
  nextAction?: string;
}
export interface MechanismReceiptOptions {
  reportPath?: string;
  offset?: number;
  limit?: number;
  retainFullResult?: boolean;
}

/** Bound terminal output and retain the complete result whenever anything is omitted. */
export async function createMechanismCommandReceipt(
  input: MechanismReceiptInput,
  options: MechanismReceiptOptions = {},
): Promise<MechanismCommandReceipt> {
  const allItems = input.items ?? [],
    allArtifacts = input.artifacts ?? [];
  const offset = options.offset ?? 0,
    limit = options.limit ?? MECHANISM_RESPONSE_LIMITS.items;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MECHANISM_RESPONSE_LIMITS.items
  )
    throw new TypeError(
      "Receipt offset must be nonnegative and limit must be 1..100",
    );
  if (offset > allItems.length)
    throw new TypeError("Receipt offset exceeds available rows");
  let clipped = false;
  function boundedRow(value: MechanismReceiptRow): MechanismReceiptRow {
    const entries = Object.entries(value);
    if (entries.length > 32) clipped = true;
    const bounded = Object.fromEntries(
      entries.slice(0, 32).map(([key, item]) => {
        if (typeof item === "string" && item.length > 2048) {
          clipped = true;
          return [key, item.slice(0, 2048)];
        }
        return [key, item];
      }),
    );
    while (Buffer.byteLength(JSON.stringify(bounded)) > 8192) {
      const keys = Object.keys(bounded);
      const key = keys[keys.length - 1]!;
      const value = bounded[key];
      if (typeof value === "string" && value.length > 512)
        bounded[key] = value.slice(0, 512);
      else delete bounded[key];
      clipped = true;
    }
    return bounded;
  }
  const artifacts = allArtifacts.slice(
    0,
    MECHANISM_RESPONSE_LIMITS.items - (offset < allItems.length ? 2 : 1),
  );
  const available = Math.min(
    limit,
    MECHANISM_RESPONSE_LIMITS.items - artifacts.length,
  );
  const items = allItems.slice(offset, offset + available).map(boundedRow);
  const receipt: MechanismCommandReceipt = {
    schemaVersion: "mechanism-command-result-1",
    command: input.command,
    status: input.status ?? "passed",
    summary: boundedRow(input.summary),
    items,
    artifacts,
    pagination: {
      offset,
      returned: items.length,
      total: allItems.length,
      nextOffset:
        offset + items.length < allItems.length ? offset + items.length : null,
    },
    truncated:
      clipped ||
      offset > 0 ||
      offset + items.length < allItems.length ||
      artifacts.length < allArtifacts.length,
    nextAction: (
      input.nextAction ??
      "Inspect the named artifacts and continue with episode check."
    ).slice(0, 2048),
  };
  // Reserve room for the full-report path before choosing the final page size.
  while (
    Buffer.byteLength(JSON.stringify(receipt)) >
    MECHANISM_RESPONSE_LIMITS.bytes - 8192
  ) {
    if (receipt.artifacts.length > 0) receipt.artifacts.pop();
    else if (receipt.items.length > 1) receipt.items.pop();
    else break;
    receipt.truncated = true;
  }
  let fullReport: MechanismReceiptArtifact | undefined;
  if (
    receipt.truncated ||
    options.reportPath !== undefined ||
    options.retainFullResult
  ) {
    const path =
      options.reportPath === undefined
        ? join(
            await mkdtemp(join(tmpdir(), "still-shift-episode-report-")),
            "report.json",
          )
        : resolve(options.reportPath);
    const bytes = `${JSON.stringify(input.fullResult ?? { summary: input.summary, items: allItems, artifacts: allArtifacts }, null, 2)}\n`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: "wx" });
    fullReport = {
      kind: "full-report",
      path,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    };
    receipt.artifacts.push(fullReport);
  }
  while (
    (receipt.items.length + receipt.artifacts.length >
      MECHANISM_RESPONSE_LIMITS.items ||
      Buffer.byteLength(JSON.stringify(receipt)) >
        MECHANISM_RESPONSE_LIMITS.bytes) &&
    receipt.items.length > 0
  ) {
    receipt.items.pop();
    receipt.truncated = true;
  }
  receipt.pagination.returned = receipt.items.length;
  receipt.pagination.nextOffset =
    offset + receipt.items.length < allItems.length
      ? offset + receipt.items.length
      : null;
  if (fullReport) {
    const reportAction =
      receipt.pagination.nextOffset === null ||
      !["inspect", "validate", "deps", "check", "discover", "summary"].includes(
        input.command,
      )
        ? "Read the full-report artifact for the complete result."
        : `Read the full-report artifact, or rerun ${input.command} with --offset ${receipt.pagination.nextOffset} --limit ${limit}`;
    receipt.nextAction = input.nextAction
      ? `${input.nextAction} ${reportAction}`.slice(0, 2048)
      : reportAction;
  }
  return MechanismCommandReceiptSchema.parse(receipt);
}
