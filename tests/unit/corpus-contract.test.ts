import { readFile } from "node:fs/promises";

import {
  CorpusEntrySchema,
  CorpusManifestSchema,
  findCorpusFreezeBlockers,
} from "@still-shift/scene-contract";
import { describe, expect, it } from "vitest";

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8"));

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

  it("rejects a false frozen-corpus claim", async () => {
    const value = await readJson("benchmarks/corpus-manifest.json");
    const manifest = CorpusManifestSchema.parse({
      ...(value as object),
      status: "frozen",
      frozenAt: "2026-09-04T00:00:00.000Z",
    });

    expect(findCorpusFreezeBlockers(manifest)).not.toHaveLength(0);
  });
});
