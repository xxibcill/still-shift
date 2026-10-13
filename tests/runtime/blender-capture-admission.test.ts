import { expect, it } from "vitest";
import { captureBlenderAsset } from "../../packages/animation-engine/src/mechanism/blender-capture.ts";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
it("releases only its own admission when invalid or missing native input fails before launching Blender", async () => {
  const parent = new CompositionNodeMemory(),
    foreign = parent.reserve(1024),
    available = parent.availableBytes;
  try {
    for (const input of [
      {},
      {
        schemaVersion: "blender-native-capture-job-1",
        id: "missing",
        assetPath: "/private/tmp/blender-capture-missing-asset.blend",
        assetSha256: "sha256:" + "a".repeat(64),
        collection: "asset",
        camera: "camera",
        outputDirectory: "/private/tmp/unused-output",
        width: 320,
        height: 568,
        fps: 30,
        frames: [{ sourceFrame: 0 }],
      },
    ]) {
      await expect(
        captureBlenderAsset(input, {
          blenderExecutable: "must-not-launch",
          nodeMemory: parent,
        }),
      ).rejects.toBeDefined();
      expect(parent.availableBytes).toBe(available);
      expect(foreign.active).toBe(true);
    }
  } finally {
    foreign.release();
    parent.dispose();
  }
});
