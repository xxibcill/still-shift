import { describe, expect, it } from "vitest";
import {
  DEPTH_WORKER_PROTOCOL_VERSION,
  DepthWorkerMetricsSchema,
  DepthWorkerResponseSchema,
  parseDepthWorkerResponse,
} from "../../packages/scene-contract/src/depth-worker.ts";

describe("depth worker protocol", () => {
  const failure = {
    protocolVersion: DEPTH_WORKER_PROTOCOL_VERSION,
    status: "failed",
    error: {
      code: "INPUT_UNREADABLE",
      message: "Input image is unreadable",
      context: { inputPath: "/missing.png" },
    },
  };

  it("preserves stable worker error codes and diagnostics", () => {
    expect(parseDepthWorkerResponse(failure)).toEqual(failure);
  });

  it.each([undefined, "depth-worker-2", 1])(
    "rejects an unsupported protocol version: %s",
    (protocolVersion) => {
      const payload = { ...failure, protocolVersion };
      expect(DepthWorkerResponseSchema.safeParse(payload).success).toBe(false);
      expect(parseDepthWorkerResponse(payload)).toMatchObject({
        protocolVersion: DEPTH_WORKER_PROTOCOL_VERSION,
        status: "failed",
        error: { code: "PREPARATION_FAILED" },
      });
    },
  );

  it.each([null, [], "invalid", {}, { status: "unknown" }])(
    "returns a stable preparation failure for malformed payloads: %j",
    (payload) => {
      expect(parseDepthWorkerResponse(payload)).toMatchObject({
        status: "failed",
        error: {
          code: "PREPARATION_FAILED",
          message: "Depth worker returned an invalid response",
        },
      });
    },
  );
});

describe("depth worker metrics", () => {
  const metrics = {
    inferenceMs: 1.5,
    postProcessMs: 0.5,
    totalPreparationMs: 3,
    requestMs: 4,
    cacheStatus: "miss",
    peakCpuMemoryBytes: 4096,
    peakGpuMemoryBytes: null,
    selectedDevice: "cpu",
    hardwareDescription: "Local test CPU",
  };

  it("accepts finite timings and unavailable memory measurements", () => {
    expect(
      DepthWorkerMetricsSchema.parse({
        ...metrics,
        peakCpuMemoryBytes: null,
      }),
    ).toMatchObject({ inferenceMs: 1.5, peakCpuMemoryBytes: null });
  });

  it.each([
    ["inferenceMs", "1"],
    ["postProcessMs", -1],
    ["totalPreparationMs", Number.NaN],
    ["requestMs", Number.POSITIVE_INFINITY],
    ["peakCpuMemoryBytes", 0.5],
    ["peakGpuMemoryBytes", -1],
    ["selectedDevice", ""],
    ["hardwareDescription", ""],
    ["cacheStatus", "unknown"],
    ["inferenceMs", undefined],
  ])("rejects malformed %s", (field, value) => {
    expect(
      DepthWorkerMetricsSchema.safeParse({ ...metrics, [field]: value })
        .success,
    ).toBe(false);
  });
});
