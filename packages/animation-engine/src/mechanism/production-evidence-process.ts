import type { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { MECHANISM_PRODUCTION_EVIDENCE_LIMITS as LIMIT } from "./production-evidence-contract.ts";
import { productionFailure } from "./production-queue-files.ts";
/** Fixed captured text capacity and bounded child lifetime; cancellation settles after child/pipe close. */
export async function evidenceProcess(
  command: string,
  args: string[],
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  const cancellation = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(600000)])
    : AbortSignal.timeout(600000);
  cancellation.throwIfAborted();
  const lease = owner.reserve(4 * LIMIT.processOutputBytes + 256);
  try {
    return await runProcess(command, args, {
      signal: cancellation,
      maxBuffer: LIMIT.processOutputBytes,
    });
  } finally {
    lease.release();
  }
}
export async function evidenceFrameHashes(
  path: string,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
  filter?: string,
  sequence = false,
): Promise<string[]> {
  const result = await evidenceProcess(
    "ffmpeg",
    [
      "-v",
      "error",
      "-threads",
      "1",
      ...(sequence ? ["-start_number", "0"] : []),
      "-i",
      path,
      "-map",
      "0:v:0",
      "-an",
      ...(filter ? ["-vf", filter] : []),
      "-fps_mode",
      "passthrough",
      "-pix_fmt",
      "rgba",
      "-threads",
      "1",
      "-f",
      "framehash",
      "-hash",
      "sha256",
      "pipe:1",
    ],
    owner,
    signal,
  );
  const rows = result.stdout
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"));
  if (rows.length > LIMIT.images)
    productionFailure(
      "production-evidence-hash-budget",
      "Decoded image hash count exceeds its bound",
      path,
    );
  return rows.map((line) => {
    const fields = line.split(",").map((f) => f.trim());
    if (
      fields.length !== 6 ||
      !/^\d+$/.test(fields[4]!) ||
      !/^[a-f0-9]{64}$/.test(fields[5]!)
    )
      productionFailure(
        "production-evidence-hash",
        "Invalid actual decoded frame hash",
        path,
      );
    return "sha256:" + fields[5];
  });
}
export const evidenceSelect = (frames: readonly number[]) =>
  "select='" + frames.map((frame) => `eq(n,${frame})`).join("+") + "'";
