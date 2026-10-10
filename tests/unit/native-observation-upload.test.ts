import { expect, it } from "vitest";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { uploadNativeObservationPacket } from "../../packages/execution-runtime/src/native-observation-upload.ts";

const input = {
  outputFrame: 0,
  executionSha256: `sha256:${"a".repeat(64)}`,
  passes: [],
  maximumPacketBytes: 1024,
};

it("owns packet bytes through acknowledgement and releases every representation between frames", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 300000 });
  await withManagedMemory(memory, async () => {
    for (let outputFrame = 0; outputFrame < 128; outputFrame++) {
      let acknowledge!: () => void;
      const pending = uploadNativeObservationPacket(
        { ...input, outputFrame },
        async (bytes) => {
          expect(JSON.parse(new TextDecoder().decode(bytes))).toMatchObject({
            outputFrame,
            passes: [],
          });
          expect(memory.statistics.reservations).toBe(3);
          await new Promise<void>((resolve) => {
            acknowledge = resolve;
          });
        },
      );
      expect(memory.statistics.current.metadata).toBeGreaterThan(0);
      acknowledge();
      await pending;
      expect(memory.statistics.reservations).toBe(0);
      expect(memory.statistics.current.metadata).toBe(0);
    }
  });
  memory.dispose();
});

it("releases uploads rejected by transport, schema or encoded-byte admission", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 300000 });
  await withManagedMemory(memory, async () => {
    const rejection = Error("Server rejected the observation");
    await expect(
      uploadNativeObservationPacket(input, async () => {
        throw rejection;
      }),
    ).rejects.toBe(rejection);
    expect(memory.statistics.reservations).toBe(0);
    let sent = 0;
    const send = async () => {
      sent++;
    };
    await expect(
      uploadNativeObservationPacket({ ...input, outputFrame: -1 }, send),
    ).rejects.toThrow();
    await expect(
      uploadNativeObservationPacket({ ...input, maximumPacketBytes: 1 }, send),
    ).rejects.toThrow(/packet capacity/);
    expect(sent).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
    expect(memory.statistics.current.metadata).toBe(0);
  });
  memory.dispose();
});
