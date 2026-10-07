import { describe, expect, it } from "vitest";
import { findCompetingWorkloads } from "../../scripts/composition/ce6p-workloads.ts";

const ownPid = 100;

describe("CE6-P competing workloads", () => {
  it.each([
    "node --import tsx scripts/composition/ce6p-exposure-benchmark.ts",
    "node --import tsx scripts/composition/baselines.ts --check",
    "/opt/node/bin/node --import tsx /another/checkout/scripts/composition/baselines.ts --check",
    "tsx scripts/composition/ce6p-exposure-benchmark.ts --hardware",
  ])("detects directly launched composition work: %s", (command) => {
    const other = `101 ${command}`;
    expect(findCompetingWorkloads(`100 ${command}\n${other}`, ownPid)).toEqual([
      other,
    ]);
  });

  it("excludes only the current PID, including matching test commands", () => {
    expect(
      findCompetingWorkloads(
        "100 node tests/browser/composition-webgl.ts\n101 node tests/browser/composition-webgl.ts",
        ownPid,
      ),
    ).toEqual(["101 node tests/browser/composition-webgl.ts"]);
  });

  it.each([
    "pnpm --filter app test",
    "node /opt/pnpm/pnpm.cjs run check",
    "vitest run tests/unit",
    "node /opt/vitest/vitest.mjs run",
    "node --import tsx tests/browser/composition-webgl.ts",
    "tsx tests/integration/composition.test.ts",
    "node --import tsx tests/runtime/composition.test.ts",
  ])("preserves existing workload detection: %s", (command) => {
    const listing = `101 ${command}`;
    expect(findCompetingWorkloads(listing, ownPid)).toEqual([listing]);
  });

  it("ignores headers, unrelated tools and ordinary Node applications", () => {
    expect(
      findCompetingWorkloads(
        "PID COMMAND\n102 git status\n103 node server.js\n104 zsh -c node scripts/composition/baselines.ts",
        ownPid,
      ),
    ).toEqual([]);
  });
});
