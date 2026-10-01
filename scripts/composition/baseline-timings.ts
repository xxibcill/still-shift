import type { RenderEnvironment } from "../../packages/execution-runtime/src/render-browser.ts";

export const COMPOSITION_TIMINGS_VERSION = "composition-timings-2" as const;

export type TimingMachine = {
  cpu: string;
  logicalCores: number;
  platform: string;
  arch: string;
};

export type FrameTimings = {
  width: number;
  height: number;
  frames: number;
  frameAverageMs: number;
  frameP95Ms: number;
  renderAverageMs: number;
  readbackAverageMs: number;
};

type TimingProvenance = {
  machine: TimingMachine;
  renderEnvironment: Omit<RenderEnvironment, "profile"> & { profile: string };
};

export type BaselineTimingsFile = {
  version: string;
  machine?: TimingMachine;
  renderEnvironment?: TimingProvenance["renderEnvironment"];
  items: Record<string, FrameTimings & Partial<TimingProvenance>>;
};

export function mergeBaselineTimings(options: {
  previous?: BaselineTimingsFile | undefined;
  measurements: Record<string, FrameTimings>;
  provenance: TimingProvenance;
  itemIds: readonly string[];
}) {
  const items: Record<string, FrameTimings & TimingProvenance> = {};
  for (const id of options.itemIds) {
    if (Object.hasOwn(options.measurements, id)) {
      items[id] = { ...options.measurements[id]!, ...options.provenance };
      continue;
    }
    const retained = options.previous?.items[id];
    if (!retained) continue;
    const machine = retained.machine ?? options.previous?.machine;
    const renderEnvironment =
      retained.renderEnvironment ?? options.previous?.renderEnvironment;
    if (!machine || !renderEnvironment)
      throw new Error(
        `Timing provenance is missing for ${id}; regenerate the full timing baseline with --write`,
      );
    items[id] = { ...retained, machine, renderEnvironment };
  }
  return { version: COMPOSITION_TIMINGS_VERSION, items };
}
