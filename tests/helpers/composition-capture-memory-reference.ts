import {
  ManagedMemory,
  createRenderCanvas,
  allocateRenderPixels,
  releaseRenderPixels,
  renderMemory,
  withManagedMemory,
} from "../../packages/renderer-core/src/index.ts";
import {
  captureFrame,
  withManagedFrame,
} from "../../packages/execution-runtime/src/composition-frame-capture.ts";
import { sha256Hex } from "../../packages/renderer-core/src/browser-checksum.ts";
import type { FrameTransport } from "../../packages/execution-runtime/src/transport.ts";

const budget = 4 * 1024 * 1024,
  encodedCapacity = 256 + 8 + 1048576;
function assertProof(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}
function paint(canvas: HTMLCanvasElement, gpu: boolean) {
  const gl = gpu
    ? canvas.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
      })
    : null;
  const context = gpu
    ? null
    : canvas.getContext("2d", { willReadFrequently: true });
  if (gpu && !gl) throw Error("Native capture WebGL2 unavailable");
  gl?.enable(gl.SCISSOR_TEST);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const color = [x * 15 + 10, y * 20 + 14, (x + y) * 11 + 35];
      if (gl) {
        gl.scissor(x, y, 1, 1);
        gl.clearColor(color[0]! / 255, color[1]! / 255, color[2]! / 255, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      } else {
        context!.fillStyle = `rgb(${color.join(",")})`;
        context!.fillRect(x, y, 1, 1);
      }
    }
  gl?.disable(gl.SCISSOR_TEST);
  return gl;
}
/** Direct pre-admission native calls form the independent capture oracle. */
async function originalCapture(
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext | null,
  transport: FrameTransport,
): Promise<ArrayBuffer> {
  if (transport !== "raw_rgba") {
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(Error("Oracle capture failed")),
        transport === "png_pipe" ? "image/png" : "image/jpeg",
        transport === "jpeg_pipe" ? 0.95 : undefined,
      ),
    );
    return blob.arrayBuffer();
  }
  const result = new Uint8Array(256);
  if (gl) gl.readPixels(0, 0, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, result);
  else {
    const rgba = canvas.getContext("2d")!.getImageData(0, 0, 8, 8).data;
    for (let y = 0; y < 8; y++)
      result.set(rgba.subarray(y * 32, (y + 1) * 32), (7 - y) * 32);
  }
  return result.buffer;
}

export async function checkManagedFrameCaptures() {
  const reports: {
    gpu: boolean;
    transport: FrameTransport;
    bytes: number;
    exactCompleteBody: boolean;
    currentWhileUploading: number;
  }[] = [];
  const failures: {
    gpu: boolean;
    failure: string;
    nativeProducerCalls?: number;
    originalNullPreserved?: boolean;
    nativeCaptureFailurePreserved?: boolean;
    lateOwnerRejected?: boolean;
    statistics?: ManagedMemory["statistics"];
  }[] = [];
  for (const gpu of [false, true]) {
    const oracle = document.createElement("canvas");
    oracle.width = oracle.height = 8;
    const oracleGl = paint(oracle, gpu);
    const expected = new Map<
      FrameTransport,
      { bytes: number; sha256: string }
    >();
    for (const transport of ["raw_rgba", "png_pipe", "jpeg_pipe"] as const) {
      const bytes = await originalCapture(oracle, oracleGl, transport);
      expected.set(transport, {
        bytes: bytes.byteLength,
        sha256: await sha256Hex(bytes),
      });
    }
    const memory = new ManagedMemory({ pixels: budget, metadata: 8192 });
    try {
      await withManagedMemory(memory, async () => {
        const canvas = createRenderCanvas();
        canvas.width = canvas.height = 8;
        const gl = paint(canvas, gpu);
        const originalEncode = canvas.toBlob;
        let encodes = 0,
          reads = 0,
          admittedEncodeCapacity = 0;
        canvas.toBlob = function (...args: Parameters<typeof originalEncode>) {
          encodes++;
          admittedEncodeCapacity = memory.statistics.current.pixels - 256;
          return Reflect.apply(originalEncode, this, args);
        };
        const nativeRead = gl
          ? gl.readPixels
          : canvas.getContext("2d")!.getImageData;
        if (gl)
          gl.readPixels = function (
            this: WebGL2RenderingContext,
            ...args: unknown[]
          ) {
            reads++;
            return Reflect.apply(nativeRead, this, args);
          } as typeof gl.readPixels;
        else
          canvas.getContext("2d")!.getImageData = function (
            this: CanvasRenderingContext2D,
            ...args: unknown[]
          ) {
            reads++;
            return Reflect.apply(nativeRead, this, args);
          } as typeof CanvasRenderingContext2D.prototype.getImageData;
        for (const transport of [
          "raw_rgba",
          "png_pipe",
          "jpeg_pipe",
        ] as const) {
          let body: ArrayBuffer | Blob | undefined;
          const reference = expected.get(transport)!;
          const result = await withManagedFrame(async () => {
            body = await captureFrame(canvas, gl, transport);
            const size = body instanceof Blob ? body.size : body.byteLength;
            assertProof(
              size === reference.bytes &&
                memory.statistics.current.pixels === 256 + size,
              "Captured body did not retain exact admission",
            );
            if (transport !== "raw_rgba")
              assertProof(
                admittedEncodeCapacity === encodedCapacity,
                "Native encoder started before bounded admission",
              );
            const consumer = fetch("/_memory_frame_capture", {
              method: "POST",
              body,
            });
            assertProof(
              memory.statistics.current.pixels === 256 + size &&
                memory.hasScratch,
              "Upload released capture before acknowledgement",
            );
            const response = await consumer;
            assertProof(
              response.ok &&
                response.headers.get("x-capture-bytes") === String(size) &&
                response.headers.get("x-capture-sha256") === reference.sha256,
              "Complete native capture differs from the independent native oracle",
            );
            return {
              transport,
              bytes: size,
              exactCompleteBody: true,
              currentWhileUploading: memory.statistics.current.pixels,
            };
          });
          assertProof(
            memory.statistics.current.pixels === 256 && !memory.hasScratch,
            "Acknowledged frame retained scratch",
          );
          if (body instanceof ArrayBuffer)
            assertProof(
              body.byteLength === 0,
              "Acknowledged native raw capture was not detached",
            );
          else
            assertProof(
              body && !memory.owns(body),
              "Acknowledged native encoded body retained an owner",
            );
          reports.push({ gpu, ...result });
        }
        for (const transport of [
          "raw_rgba",
          "png_pipe",
          "jpeg_pipe",
        ] as const) {
          const nativeCalls = reads + encodes;
          const allowed = transport === "raw_rgba" ? 255 : encodedCapacity - 1;
          const filler = allocateRenderPixels(
            budget - 256 - allowed,
            () => new Uint8Array(budget - 256 - allowed),
            true,
          );
          let rejected = false;
          try {
            await withManagedFrame(async () => {
              await captureFrame(canvas, gl, transport);
            });
          } catch (error) {
            rejected = /aggregate worker quota/.test(String(error));
          } finally {
            releaseRenderPixels(filler);
          }
          assertProof(
            rejected &&
              nativeCalls === reads + encodes &&
              memory.statistics.current.pixels === 256,
            "Over-quota capture reached a native producer or retained scratch",
          );
          failures.push({
            gpu,
            failure: "quota-" + transport,
            nativeProducerCalls: 0,
          });
        }
        let uploaded: ArrayBuffer | Blob | undefined;
        let reason: unknown = "not thrown";
        try {
          await withManagedFrame(async () => {
            uploaded = await captureFrame(canvas, gl, "png_pipe");
            const response = await fetch("/_memory_frame_capture?fail=1", {
              method: "POST",
              body: uploaded,
            });
            assertProof(
              response.status === 503,
              "Failed consumer did not acknowledge the complete body",
            );
            throw null;
          });
        } catch (error) {
          reason = error;
        }
        assertProof(
          reason === null &&
            uploaded &&
            !memory.owns(uploaded) &&
            memory.statistics.current.pixels === 256,
          "Failed native upload did not preserve original null and release capture",
        );
        failures.push({
          gpu,
          failure: "acknowledgement-null",
          originalNullPreserved: true,
        });
        canvas.width = 0;
        reason = "not thrown";
        try {
          await withManagedFrame(async () => {
            await captureFrame(canvas, gl, "png_pipe");
          });
        } catch (error) {
          reason = error;
        }
        assertProof(
          /image\/png frame capture failed/.test(String(reason)) &&
            Number(memory.statistics.current.pixels) === 0 &&
            !memory.hasScratch,
          "Actual native zero-size encode retained capacity",
        );
        failures.push({
          gpu,
          failure: "native-zero-size",
          nativeCaptureFailurePreserved: true,
        });
      });
    } finally {
      memory.dispose();
      oracle.width = oracle.height = 0;
    }
    assertProof(
      memory.statistics.reservations === 0,
      "Capture page retained reservations",
    );
    const lateMemory = new ManagedMemory({ pixels: budget, metadata: 8192 });
    await withManagedMemory(lateMemory, async () => {
      const canvas = createRenderCanvas();
      canvas.width = canvas.height = 8;
      const gl = paint(canvas, gpu);
      const original = canvas.toBlob;
      canvas.toBlob = function (callback, ...args) {
        original.call(
          this,
          (blob) => {
            lateMemory.dispose();
            callback(blob);
          },
          ...args,
        );
      };
      let reason: unknown = "not thrown";
      try {
        await withManagedFrame(async () => {
          await captureFrame(canvas, gl, "png_pipe");
        });
      } catch (error) {
        reason = error;
      }
      assertProof(
        /no active owner/.test(String(reason)) &&
          lateMemory.statistics.reservations === 0 &&
          canvas.width === 0,
        "Late native capture returned an expired owner",
      );
      failures.push({
        gpu,
        failure: "late-native-encode",
        lateOwnerRejected: true,
        statistics: lateMemory.statistics,
      });
    });
    lateMemory.dispose();
  }
  assertProof(
    renderMemory() === undefined,
    "Native capture page scope outlived its work",
  );
  return {
    status: "passed",
    nativeCaptures: reports.length,
    failures,
    reports,
    scope:
      "raw readbacks and reserved native encoded body capacity through complete HTTP acknowledgement; native codec/transport private RSS is separate",
  };
}
