import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createMechanismCommandReceipt,
  MECHANISM_RESPONSE_LIMITS,
  MechanismCommandReceiptSchema,
  MechanismPatchRequestSchema,
} from "../../packages/animation-engine/src/mechanism/protocol.ts";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function reportPath() {
  const directory = await mkdtemp(join(tmpdir(), "mechanism-protocol-test-"));
  directories.push(directory);
  return join(directory, "report.json");
}
describe("versioned bounded episode command protocol", () => {
  it("retains every large finding while returning a bounded first and subsequent page", async () => {
    const items = Array.from({ length: 500 }, (_, index) => ({
      index,
      message: "เหตุผล".repeat(200),
      path: `shots.shot${index}.label.text`,
    }));
    const path = await reportPath();
    const receipt = await createMechanismCommandReceipt(
      {
        command: "check",
        status: "failed",
        summary: { findings: 500 },
        items,
        fullResult: { findings: items },
      },
      { reportPath: path },
    );
    expect(receipt.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(receipt))).toBeLessThanOrEqual(
      MECHANISM_RESPONSE_LIMITS.bytes,
    );
    expect(receipt.items.length + receipt.artifacts.length).toBeLessThanOrEqual(
      100,
    );
    expect(JSON.parse(await readFile(path, "utf8")).findings).toEqual(items);
    expect(receipt.pagination.nextOffset).toBeGreaterThan(0);
    const next = await createMechanismCommandReceipt(
      { command: "check", summary: { findings: 500 }, items },
      {
        offset: receipt.pagination.nextOffset!,
        limit: 20,
        reportPath: await reportPath(),
      },
    );
    expect(next.items[0]!.index).toBe(receipt.pagination.returned);
    expect(MechanismCommandReceiptSchema.safeParse(receipt).success).toBe(true);
  });
  it("bounds oversized summaries and artifact lists without silently dropping data", async () => {
    const summary = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [
        `field${index}`,
        "漢".repeat(4000),
      ]),
    );
    const artifacts = Array.from({ length: 140 }, (_, index) => ({
      kind: "proof",
      path: `/tmp/${index}-${"x".repeat(1800)}`,
    }));
    const path = await reportPath();
    const receipt = await createMechanismCommandReceipt(
      { command: "inspect", summary, items: [{ id: "shot0" }], artifacts },
      { reportPath: path },
    );
    expect(receipt.truncated).toBe(true);
    expect(receipt.items[0]!.id).toBe("shot0");
    expect(Buffer.byteLength(JSON.stringify(receipt))).toBeLessThanOrEqual(
      32768,
    );
    expect(JSON.parse(await readFile(path, "utf8")).artifacts).toHaveLength(
      140,
    );
  });
  it("rejects unknown patch versions, unscoped fields and excess operations", () => {
    const patch = {
      schemaVersion: "mechanism-patch-1",
      baseRevision: 0,
      baseHash: "sha256:" + "a".repeat(64),
      operations: [
        { shot: "contact", label: "pull", property: "text", value: "PULL" },
      ],
    };
    expect(MechanismPatchRequestSchema.safeParse(patch).success).toBe(true);
    expect(
      MechanismPatchRequestSchema.safeParse({
        ...patch,
        schemaVersion: "mechanism-patch-2",
      }).success,
    ).toBe(false);
    expect(
      MechanismPatchRequestSchema.safeParse({
        ...patch,
        operations: [{ ...patch.operations[0]!, property: "geometry" }],
      }).success,
    ).toBe(false);
    expect(
      MechanismPatchRequestSchema.safeParse({
        ...patch,
        operations: Array.from({ length: 33 }, () => patch.operations[0]),
      }).success,
    ).toBe(false);
  });
  it("keeps pagination moving when a report reserves one slot among many artifacts", async () => {
    const items = Array.from({ length: 200 }, (_, index) => ({ index })),
      artifacts = Array.from({ length: 99 }, (_, index) => ({
        kind: "proof",
        path: `/tmp/${index}.json`,
      }));
    const receipt = await createMechanismCommandReceipt(
      { command: "inspect", summary: {}, items, artifacts },
      { reportPath: await reportPath() },
    );
    expect(receipt.pagination.returned).toBeGreaterThan(0);
    expect(receipt.pagination.nextOffset).toBeGreaterThan(0);
    expect(receipt.items.length + receipt.artifacts.length).toBeLessThanOrEqual(
      100,
    );
  });
});
