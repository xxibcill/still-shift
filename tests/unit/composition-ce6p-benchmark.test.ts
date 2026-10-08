import type * as ChildProcess from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  failure: "setup" as "setup" | "timing" | "drift",
  changed: false,
  inspections: 0,
  evaluations: 0,
  browserClosed: 0,
  serverClosed: 0,
}));
const changedPath = "tests/helpers/composition-exposure-reference.ts";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof ChildProcess>();
  return {
    ...actual,
    execFileSync: (
      command: string,
      args: readonly string[],
      options: { cwd?: string; encoding?: BufferEncoding },
    ) => (command === "ps" ? "" : actual.execFileSync(command, args, options)),
  };
});
vi.mock("../../scripts/composition/ce6p-sources.ts", () => ({
  snapshotBenchmarkSources: async () => ({
    sha256: {},
    load: () => undefined,
    changedPaths: async () => {
      if (state.failure === "drift" && ++state.inspections === 2)
        state.changed = true;
      return state.changed ? [changedPath] : [];
    },
  }),
}));
vi.mock("vite", () => ({
  createServer: async () => {
    if (state.failure === "setup") {
      state.changed = true;
      throw new Error("Workload import disappeared during setup");
    }
    return {
      listen: async () => {},
      resolvedUrls: { local: ["http://127.0.0.1:1/"] },
      close: async () => {
        state.serverClosed++;
      },
    };
  },
}));
vi.mock("@still-shift/execution-runtime", () => ({
  assertPinnedRenderEnvironment: () => {},
  probeRenderEnvironment: async () => ({}),
  launchRenderBrowser: async () => ({
    newPage: async () => ({
      addInitScript: async () => {},
      goto: async () => {},
      evaluate: async () => {
        if (++state.evaluations === 1) return "composition-webgl2-0.38.1";
        state.changed = true;
        throw new Error("Workload import disappeared during timing");
      },
    }),
    close: async () => {
      state.browserClosed++;
    },
  }),
}));

let directory: string;
let output: string;
let originalArgs: string[];
beforeEach(async () => {
  vi.resetModules();
  Object.assign(state, {
    changed: false,
    inspections: 0,
    evaluations: 0,
    browserClosed: 0,
    serverClosed: 0,
  });
  directory = await mkdtemp(join(tmpdir(), "ce6p-report-test-"));
  output = join(directory, "report.json");
  originalArgs = process.argv;
  process.argv = ["node", "ce6p-exposure-benchmark.ts", "--output", output];
});
afterEach(async () => {
  process.argv = originalArgs;
  await rm(directory, { recursive: true, force: true });
});

describe("CE6-P invalid source-attempt retention", () => {
  it.each(["setup", "timing"] as const)(
    "retains source failure during %s before rethrowing",
    async (failure) => {
      state.failure = failure;
      await expect(
        import("../../scripts/composition/ce6p-exposure-benchmark.ts"),
      ).rejects.toThrow(`Workload import disappeared during ${failure}`);
      const report = JSON.parse(await readFile(output, "utf8"));
      expect(report.runs).toHaveLength(1);
      expect(report.runs[0]).toMatchObject({
        variant: "baseline",
        phase: failure,
        timingValid: false,
        sourceChanges: [changedPath],
        error: `Workload import disappeared during ${failure}`,
      });
      expect(state.browserClosed).toBe(failure === "timing" ? 1 : 0);
      expect(state.serverClosed).toBe(failure === "timing" ? 1 : 0);
    },
  );

  it("retains exactly one record for an already-recorded setup drift failure", async () => {
    state.failure = "drift";
    await expect(
      import("../../scripts/composition/ce6p-exposure-benchmark.ts"),
    ).rejects.toThrow("Benchmark sources changed during setup");
    const report = JSON.parse(await readFile(output, "utf8"));
    expect(report.runs).toHaveLength(1);
    expect(report.runs[0]).toMatchObject({
      phase: "setup",
      timingValid: false,
      sourceChanges: [changedPath],
    });
    expect(state.browserClosed).toBe(1);
    expect(state.serverClosed).toBe(1);
  });
});
