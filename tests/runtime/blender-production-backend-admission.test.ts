import { describe, expect, it } from "vitest";
import {
  BlenderProductionQueueSchema,
  createMechanismProductionNativeExecutor,
  type MechanismProductionExecutionContext,
} from "@still-shift/animation-engine";

const hash = "sha256:" + "a".repeat(64);
describe("native production backend admission", () => {
  it("refuses Blender items through the Three.js executor before opening episode sources or executing a renderer", async () => {
    const item = BlenderProductionQueueSchema.parse({
      schemaVersion: "mechanism-production-queue-2",
      id: "backend-admission",
      revision: 0,
      baseHash: null,
      codeSha256: hash,
      profileSha256: hash,
      maximumAttempts: 1,
      items: [
        {
          id: "EU-004",
          question: "How does a zipper join its teeth?",
          family: "zipper",
          backend: "blender-native",
          designVariant: "metal-tooth-zipper",
          familyPath: "missing-family.json",
          cuePath: "missing-cues.json",
          clock: { outputFrames: 2, sourceSamples: 3200 },
          inputs: ["missing-family.json", "missing-cues.json"].map((path) => ({
            path,
            bytes: 2,
            sha256: hash,
          })),
        },
      ],
    }).items[0]!;
    const worker = await createMechanismProductionNativeExecutor();
    await expect(
      worker.execute(item, {} as MechanismProductionExecutionContext),
    ).rejects.toThrow(/Blender/);
    await expect(
      worker.verify(
        item,
        {} as never,
        {} as MechanismProductionExecutionContext,
      ),
    ).rejects.toThrow(/backend/);
  });
});
