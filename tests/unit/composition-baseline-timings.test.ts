import { describe, expect, it } from "vitest";
import {
  COMPOSITION_TIMINGS_VERSION,
  mergeBaselineTimings,
  type BaselineTimingsFile,
} from "../../scripts/composition/baseline-timings.ts";
import type { RenderEnvironment } from "../../packages/execution-runtime/src/render-browser.ts";

const mac = {
  machine: {
    cpu: "Apple M5 Pro",
    logicalCores: 15,
    platform: "darwin",
    arch: "arm64",
  },
  renderEnvironment: {
    profile: "chromium-software-2",
    browserVersion: "151.0.7922.34",
    webglRenderer: "SwiftShader",
    rasterFingerprint: `sha256:${"0".repeat(64)}`,
    platform: "darwin",
    arch: "arm64",
  } satisfies RenderEnvironment,
};
const linux = {
  machine: {
    cpu: "Linux ARM CPU",
    logicalCores: 8,
    platform: "linux",
    arch: "arm64",
  },
  renderEnvironment: { ...mac.renderEnvironment, platform: "linux" as const },
};
const measurement = {
  width: 100,
  height: 100,
  frames: 24,
  frameAverageMs: 10,
  frameP95Ms: 12,
  renderAverageMs: 4,
  readbackAverageMs: 6,
};
const previous: BaselineTimingsFile = {
  version: "composition-baseline-1",
  ...mac,
  renderEnvironment: {
    ...mac.renderEnvironment,
    profile: "chromium-software-1",
  },
  items: { retained: measurement, refreshed: measurement },
};

describe("composition timing provenance", () => {
  it("keeps legacy macOS measurements labeled macOS after a partial Linux run", () => {
    const result = mergeBaselineTimings({
      previous,
      measurements: { refreshed: { ...measurement, frameAverageMs: 30 } },
      provenance: linux,
      itemIds: ["retained", "refreshed"],
    });
    expect(result.version).toBe(COMPOSITION_TIMINGS_VERSION);
    expect(result.items.retained).toEqual({
      ...measurement,
      machine: previous.machine,
      renderEnvironment: previous.renderEnvironment,
    });
    expect(result.items.refreshed).toEqual({
      ...measurement,
      frameAverageMs: 30,
      ...linux,
    });
    expect(result).not.toHaveProperty("machine");
    expect(result).not.toHaveProperty("renderEnvironment");
    expect(previous.items.retained).not.toHaveProperty("machine");
  });

  it("preserves per-item provenance on later partial runs", () => {
    const previousRun: BaselineTimingsFile = {
      version: COMPOSITION_TIMINGS_VERSION,
      items: {
        retained: { ...measurement, ...linux },
        refreshed: { ...measurement, ...mac },
      },
    };
    const result = mergeBaselineTimings({
      previous: previousRun,
      measurements: { refreshed: measurement },
      provenance: mac,
      itemIds: ["retained", "refreshed"],
    });
    expect(result.items.retained).toEqual(previousRun.items.retained);
  });

  it("drops retired item timings with the regenerated inventory", () => {
    const result = mergeBaselineTimings({
      previous,
      measurements: {},
      provenance: mac,
      itemIds: ["retained"],
    });
    expect(Object.keys(result.items)).toEqual(["retained"]);
  });

  it("rejects retained measurements without recoverable provenance", () => {
    expect(() =>
      mergeBaselineTimings({
        previous: {
          version: "composition-baseline-1",
          items: { retained: measurement },
        },
        measurements: {},
        provenance: linux,
        itemIds: ["retained"],
      }),
    ).toThrow("Timing provenance is missing for retained");
  });

  it("accepts a full fresh run without previous provenance", () => {
    const result = mergeBaselineTimings({
      measurements: { fresh: measurement },
      provenance: linux,
      itemIds: ["fresh"],
    });
    expect(result.items.fresh).toEqual({ ...measurement, ...linux });
  });
});
