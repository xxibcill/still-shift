import { mkdtemp, realpath, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { checkBlenderProductionReview } from "../../packages/animation-engine/src/mechanism/blender-production-review.ts";
import {
  blenderCompiledFixture,
  blenderHash,
} from "../fixtures/blender-episode-support.ts";
import type { MechanismProductionDecodedOutput } from "../../packages/animation-engine/src/mechanism/production-output-check.ts";

describe("native review failure ownership", () => {
  it("releases child review capacity after rejected manifests across repeated reads", async () => {
    const outputRoot = await realpath(
        await mkdtemp(join(tmpdir(), "native-review-quota-")),
      ),
      owner = new CompositionNodeMemory();
    const pin = { path: "invalid.json", bytes: 2, sha256: blenderHash("{}") };
    await writeFile(join(outputRoot, pin.path), "{}");
    const before = owner.availableBytes;
    try {
      for (let i = 0; i < 3; i++) {
        await expect(
          checkBlenderProductionReview({
            compiled: blenderCompiledFixture(),
            binding: {
              inputSha256: blenderHash("input"),
              outputSha256: blenderHash("video"),
              codeSha256: blenderHash("code"),
              profileSha256: blenderHash("profile"),
            },
            decoded: {} as MechanismProductionDecodedOutput,
            outputRoot,
            video: pin,
            decodedReport: pin,
            nativePlates: pin,
            evidence: pin,
            owner,
          }),
        ).rejects.toThrow();
        expect(owner.availableBytes).toBe(before);
      }
    } finally {
      owner.dispose();
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});
