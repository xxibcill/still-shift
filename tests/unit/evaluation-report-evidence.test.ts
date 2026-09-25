import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  formatGateEvidence,
  resolveSuppliedEvidence,
} from "../../scripts/evaluation/report-evidence.ts";

describe("evaluation report evidence links", () => {
  it("links local artifacts relative to the report and encodes path spaces", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-links-"));
    try {
      const source = join(directory, "source data", "ratings #1.json");
      const report = join(directory, "reports", "evaluation.md");
      expect(
        formatGateEvidence(report, [
          { label: "ratings export", target: source },
        ]),
      ).toBe("[ratings export](<../source%20data/ratings%20%231.json>)");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("accepts existing files and URLs, but leaves missing local evidence pending", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-links-"));
    try {
      const source = join(directory, "review.md");
      await writeFile(source, "review");
      expect(await resolveSuppliedEvidence(source)).toBe(source);
      expect(
        await resolveSuppliedEvidence(join(directory, "missing.md")),
      ).toBeNull();
      expect(await resolveSuppliedEvidence(directory)).toBeNull();
      expect(await resolveSuppliedEvidence("https://example.com/review")).toBe(
        "https://example.com/review",
      );
      expect(await resolveSuppliedEvidence(undefined)).toBeNull();
      expect(
        formatGateEvidence(join(directory, "report.md"), [
          { label: "review", target: "https://example.com/review" },
        ]),
      ).toBe("[review](<https://example.com/review>)");
      expect(() => formatGateEvidence(source, [])).toThrow(
        "Every exit gate needs an evidence reference",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
