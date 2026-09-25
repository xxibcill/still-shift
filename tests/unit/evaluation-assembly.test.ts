import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  AssemblyEvidenceSchema,
  fileSha256,
  verifyAssemblyEvidence,
} from "../../scripts/evaluation/assembly-evidence.ts";

const execFileAsync = promisify(execFile);
const corpusSha256 = `sha256:${"a".repeat(64)}`;
const clipSha256 = `sha256:${"b".repeat(64)}`;

describe("assembly gate evidence", () => {
  it("rejects a duration-only metadata file", () => {
    expect(
      AssemblyEvidenceSchema.safeParse({ durationSeconds: 480 }).success,
    ).toBe(false);
  });

  it("checks the actual MP4 and the selected clip identities", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-assembly-"));
    const outputPath = join(directory, "assembly.mp4");
    try {
      await execFileAsync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=1280x720:r=24",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=mono:sample_rate=48000",
        "-t",
        "1",
        "-frames:v",
        "24",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        "-y",
        outputPath,
      ]);
      const selectedIds = ["first", "second", "third"];
      const assembly = AssemblyEvidenceSchema.parse({
        schemaVersion: "0.1",
        outputPath,
        outputSha256: await fileSha256(outputPath),
        timelinePath: join(directory, "timeline.json"),
        narrationPath: join(directory, "narration.mp3"),
        corpusId: "corpus",
        corpusSha256,
        corpusStatus: "frozen",
        sourceStateCount: 1,
        videoFrameCount: 24,
        durationSeconds: 1,
        clipSelections: [{ stateId: "state", clipIds: selectedIds }],
        clipOutputChecksums: Object.fromEntries(
          selectedIds.map((id) => [id, clipSha256]),
        ),
      });
      const corpus = { id: "corpus", sha256: corpusSha256, status: "frozen" };
      const resultChecksums = new Map(
        selectedIds.map((id) => [id, clipSha256]),
      );
      await expect(
        verifyAssemblyEvidence(assembly, corpus, resultChecksums),
      ).resolves.toBeUndefined();
      await expect(
        verifyAssemblyEvidence(assembly, corpus, new Map()),
      ).rejects.toThrow("does not match evaluation results");
      await writeFile(outputPath, "changed video");
      await expect(
        verifyAssemblyEvidence(assembly, corpus, resultChecksums),
      ).rejects.toThrow("checksum mismatch");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
