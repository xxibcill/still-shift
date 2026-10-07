import { sha256Hex } from "./browser-checksum.ts";
import { renderMemory } from "./managed-memory-context.ts";
import type { ManagedMemory, MemoryLease } from "./managed-memory.ts";
import type { ManagedMetadataText } from "./managed-metadata.ts";

function detach(value: object) {
  const bytes = value as ArrayBuffer & { transfer(size: number): ArrayBuffer };
  if (bytes.byteLength) bytes.transfer(0);
}
function releaseIntermediates(
  leases: (MemoryLease | undefined)[],
  originalFailed: boolean,
  output?: MemoryLease,
) {
  let failed = false,
    reason: unknown;
  for (const lease of leases) {
    try {
      lease?.release();
    } catch (error) {
      if (!failed) reason = error;
      failed = true;
    }
  }
  if (failed && !originalFailed) {
    try {
      output?.release();
    } catch {
      /* Preserve the original cleanup error. */
    }
    throw reason;
  }
}
function adoptBytes(
  memory: ManagedMemory,
  bytes: ArrayBuffer,
  lease: MemoryLease,
) {
  try {
    memory.adopt(bytes, lease, detach);
  } catch (error) {
    if (!memory.owns(bytes)) {
      try {
        detach(bytes);
      } catch {
        /* Preserve the ownership error. */
      }
    }
    throw error;
  }
}

/** Admit UTF8 input, actual SHA256 backing and bounded original hex-building copies before their producers. */
export async function hashRenderMetadata(
  value: string,
): Promise<ManagedMetadataText> {
  return hashRenderValue(value);
}

/** Pixel inputs keep their existing owner; only the native digest and result are new metadata. */
export async function hashRenderPixels(
  bytes: ArrayBuffer,
): Promise<ManagedMetadataText> {
  return hashRenderValue(bytes);
}

async function hashRenderValue(
  value: string | ArrayBuffer,
): Promise<ManagedMetadataText> {
  const memory = renderMemory();
  if (!memory)
    return {
      value:
        "sha256:" +
        (await sha256Hex(
          typeof value === "string"
            ? new TextEncoder().encode(value).buffer
            : value,
        )),
      retain() {},
      release() {},
    };
  let inputLease: MemoryLease | undefined,
    digestLease: MemoryLease | undefined,
    temporary: MemoryLease | undefined,
    output: MemoryLease | undefined;
  let failed = false;
  try {
    output = memory.reserve("metadata", 128 + 71 * 2);
    const record: { value: string | undefined } = { value: undefined };
    memory.adopt(record, output, () => {
      record.value = undefined;
    });
    if (typeof value === "string")
      inputLease = memory.reserve("metadata", value.length * 3);
    digestLease = memory.reserve("metadata", 32);
    // Two 32-slot arrays (576), at most 64 two-character string controls (2304),
    // the view/encoder (128) and joined text (160) fit below this 4KiB allowance.
    temporary = memory.reserve("metadata", 4096);
    const input =
      typeof value === "string"
        ? new TextEncoder().encode(value).buffer
        : value;
    if (inputLease) {
      adoptBytes(memory, input, inputLease);
      inputLease.resize(input.byteLength);
    }
    const digest = await crypto.subtle.digest("SHA-256", input);
    adoptBytes(memory, digest, digestLease);
    record.value =
      "sha256:" +
      [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    const owner = output;
    return {
      get value() {
        return record.value;
      },
      retain() {
        memory.retain(record);
      },
      release() {
        owner.release();
      },
    };
  } catch (error) {
    failed = true;
    try {
      output?.release();
    } catch {
      /* Preserve the original producer/quota error. */
    }
    throw error;
  } finally {
    releaseIntermediates([inputLease, digestLease, temporary], failed, output);
  }
}
