import {
  allocateRenderPixels,
  renderMemory,
} from "../managed-memory-context.ts";

export function nativeUsedBytesEqual(
  actual: Uint8Array,
  expected: Uint8Array,
): boolean {
  return (
    actual.byteLength === expected.byteLength &&
    actual.every((byte, index) => byte === expected[index])
  );
}

/** Independently pack pure sampled state, never the mutable Three CPU attributes. */
export function packNativeExpectedStream(
  values: readonly number[],
  type: "float32" | "uint16",
) {
  const bytes = allocateRenderPixels(
    values.length * (type === "float32" ? 4 : 2),
    () => new Uint8Array(values.length * (type === "float32" ? 4 : 2)),
    true,
  );
  const memory = renderMemory();
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => {
    if (type === "float32") view.setFloat32(index * 4, value, true);
    else view.setUint16(index * 2, value, true);
  });
  let disposed = false;
  return {
    bytes,
    dispose() {
      if (!disposed) {
        disposed = true;
        memory?.release(bytes.buffer);
      }
    },
  };
}

export async function hashNativeUsedBytes(
  bytes: Uint8Array<ArrayBuffer>,
  assertLive: () => void,
): Promise<string> {
  assertLive();
  // Reserve owned crypto copy/output capacity before the asynchronous operation.
  const lease = renderMemory()?.reserve(
    "pixels",
    bytes.byteLength + 32,
    undefined,
    true,
  );
  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    assertLive();
    return (
      "sha256:" +
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("")
    );
  } finally {
    lease?.release();
  }
}

function utf8Length(value: string): number {
  let length = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 128) length++;
    else if (code < 2048) length += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      length += 4;
      index++;
    } else length += 3;
  }
  return length;
}

export function packNativeObservedFrameKey(value: string) {
  const memory = renderMemory(),
    bytes = allocateRenderPixels(
      utf8Length(value),
      () => new Uint8Array(utf8Length(value)),
      true,
    );
  new TextEncoder().encodeInto(value, bytes);
  let disposed = false;
  return {
    bytes,
    dispose() {
      if (!disposed) {
        disposed = true;
        memory?.release(bytes.buffer);
      }
    },
  };
}
