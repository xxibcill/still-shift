import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CorpusEntrySchema,
  CorpusManifestSchema,
  findCorpusFreezeBlockers,
} from "@still-shift/scene-contract";
import { afterEach, describe, expect, it } from "vitest";

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8"));

const temporaryDirectories: string[] = [];
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nH0AAAAASUVORK5CYII=",
  "base64",
);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

const requiredCategories = [
  "portrait_person",
  "landscape_environment",
  "architecture_interior",
  "product_object",
  "illustration_anime",
  "text_heavy_diagram",
  "difficult_edges",
] as const;

const createFrozenManifest = () =>
  CorpusManifestSchema.parse({
    $schema: "./corpus-manifest.schema.json",
    schemaVersion: "0.1",
    corpusId: "integrity-test",
    status: "frozen",
    frozenAt: "2026-09-04T00:00:00.000Z",
    targetSize: { minimum: 30, maximum: 50 },
    sourcePolicy: {
      realExplainerWorkflowImagesRequired: true,
      privateImagesMayRemainUntracked: true,
    },
    evaluationGatesDocument: "./ROADMAP.md",
    outstandingRequirements: [],
    entries: Array.from({ length: 30 }, (_, index) => ({
      id: `missing-${index}`,
      source: {
        path: `missing-${index}.png`,
        tracked: false,
        sha256: `sha256:${index.toString(16).padStart(64, "0")}`,
      },
      categories: [requiredCategories[index % requiredCategories.length]],
      dimensions: { width: 1920, height: 1080 },
      rights: {
        status: "private_internal",
        usageNotes: "Integrity test fixture",
        attribution: null,
      },
      expectedShotDurationMs: 5000,
      notes: "",
    })),
  });

describe("corpus manifest", () => {
  it("accepts the metadata-only entry fixture without claiming the image exists", async () => {
    const value = await readJson("tests/fixtures/corpus-entry.valid.json");
    const entry = CorpusEntrySchema.parse(value);

    expect(entry.source.tracked).toBe(false);
    expect(entry.rights.status).toBe("private_internal");
  });

  it("keeps the checked-in manifest structurally valid and explicitly incomplete", async () => {
    const value = await readJson("benchmarks/corpus-manifest.json");
    const manifest = CorpusManifestSchema.parse(value);

    expect(manifest.status).toBe("incomplete");
    expect(manifest.entries).toHaveLength(0);
    expect(findCorpusFreezeBlockers(manifest)).toContain(
      "corpus requires at least 30 real images",
    );
  });

  it("rejects fields outside the canonical corpus contract", async () => {
    const value = await readJson("benchmarks/corpus-manifest.json");

    expect(
      CorpusManifestSchema.safeParse({
        ...(value as object),
        unexpectedField: true,
      }).success,
    ).toBe(false);
  });

  it("rejects a false frozen-corpus claim", async () => {
    const value = await readJson("benchmarks/corpus-manifest.json");
    const manifest = CorpusManifestSchema.parse({
      ...(value as object),
      status: "frozen",
      frozenAt: "2026-09-04T00:00:00.000Z",
    });

    expect(findCorpusFreezeBlockers(manifest)).not.toHaveLength(0);
  });

  it("rejects a frozen manifest whose declared source files do not exist", () => {
    const manifest = createFrozenManifest();

    expect(
      findCorpusFreezeBlockers(manifest, { sourceRoot: "/does-not-exist" }),
    ).toContain("corpus source is unreadable: missing-0");
  });

  it("rejects source metadata that does not match the image", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "still-shift-corpus-"));
    temporaryDirectories.push(sourceRoot);
    await writeFile(join(sourceRoot, "actual.png"), onePixelPng);
    const manifest = createFrozenManifest();
    manifest.entries[0] = {
      ...manifest.entries[0]!,
      source: {
        ...manifest.entries[0]!.source,
        path: "actual.png",
      },
    };

    const blockers = findCorpusFreezeBlockers(manifest, { sourceRoot });

    expect(blockers).toContain(
      "corpus source checksum does not match: missing-0",
    );
    expect(blockers).toContain(
      "corpus source dimensions do not match: missing-0",
    );
  });

  it("accepts source metadata that matches the image", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "still-shift-corpus-"));
    temporaryDirectories.push(sourceRoot);
    await writeFile(join(sourceRoot, "actual.png"), onePixelPng);
    const manifest = createFrozenManifest();
    manifest.entries[0] = {
      ...manifest.entries[0]!,
      source: {
        ...manifest.entries[0]!.source,
        path: "actual.png",
        sha256: `sha256:${createHash("sha256").update(onePixelPng).digest("hex")}`,
      },
      dimensions: { width: 1, height: 1 },
    };

    const sourceBlockers = findCorpusFreezeBlockers(manifest, {
      sourceRoot,
    }).filter((blocker) => blocker.endsWith(": missing-0"));

    expect(sourceBlockers).toEqual([]);
  });
});
