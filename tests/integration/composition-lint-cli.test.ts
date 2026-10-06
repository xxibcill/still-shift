import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import {
  fixtures,
  composition,
  solid,
} from "../../benchmarks/fixtures/composition/ce12/fixtures.ts";
import {
  collapsedMotionComposition,
  nestedCoverageComposition,
  providerReadingComposition,
  qualityCapacityComposition,
} from "../helpers/composition-quality-fixtures.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((p) => rm(p, { recursive: true })),
  );
});

it("returns a coverage error when a nested host disappears", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ce12-coverage-policy-"));
  directories.push(dir);
  const policy = join(dir, "policy.json");
  await writeFile(policy, JSON.stringify({ coverageLayers: ["host/bg"] }));
  const result = await invoke(nestedCoverageComposition(0, 15), [
    "--policy",
    policy,
  ]);
  expect(result.exit).toBe(1);
  expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
    expect.objectContaining({
      code: "coverage",
      frames: [15, 29],
      node: "host/bg",
    }),
  );
});
async function invoke(input: unknown, extra: string[] = []) {
  const dir = await mkdtemp(join(tmpdir(), "ce12-cli-"));
  directories.push(dir);
  const path = join(dir, "input.json");
  await writeFile(path, JSON.stringify(input));
  let stdout = "",
    stderr = "";
  const exit = await runCli(["comp", "lint", "--input", path, ...extra], {
    stdout: (s) => {
      stdout += s;
    },
    stderr: (s) => {
      stderr += s;
    },
  });
  return { exit, stdout, stderr, dir };
}
describe("comp lint CLI", () => {
  it("returns nonzero and JSON frame ranges for craft errors", async () => {
    const result = await invoke(fixtures.stillness.fail);
    expect(result.exit).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "frozen-run",
        severity: "error",
        frames: [1, 89],
      }),
    );
  });
  it("returns zero for passing motion and reports unmeasured pixels", async () => {
    const result = await invoke(fixtures.stillness.pass);
    expect(result.exit).toBe(0);
    expect(JSON.parse(result.stdout).measured.pixels).toBe(false);
  });
  it("rejects invalid contracts, unknown options and malformed policies", async () => {
    for (const result of [
      await invoke({ schemaVersion: "wrong" }),
      await invoke(fixtures.stillness.pass, ["--pixels", "maybe"]),
      await invoke(fixtures.stillness.pass, ["--unknown", "value"]),
    ]) {
      expect(result.exit).toBe(1);
      expect(JSON.parse(result.stderr).status).toBe("failed");
    }
  });
  it("applies a policy file without mutating source data", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ce12-policy-"));
    directories.push(dir);
    const policy = join(dir, "policy.json");
    await writeFile(policy, JSON.stringify({ maxFrozenFrames: 100 }));
    const result = await invoke(fixtures.stillness.fail, ["--policy", policy]);
    expect(result.exit).toBe(0);
    expect(JSON.parse(result.stdout).diagnostics).toEqual([]);
  });
});

it("preserves semantic composition diagnostic codes and JSON paths", async () => {
  const input = structuredClone(fixtures.stillness.pass);
  input.layers[0]!.parent = "missing";
  const result = await invoke(input);
  expect(result.exit).toBe(1);
  const diagnostics = JSON.parse(result.stderr).diagnostics;
  expect(
    diagnostics.some(
      (d: { code: string; path?: string }) =>
        d.code.startsWith("comp-") && d.path?.includes("parent"),
    ),
  ).toBe(true);
});

it.each([
  [{ intentionalCuts: [90] }, "comp-lint-cut-range", "intentionalCuts.0"],
  [
    { shots: [{ id: "a", start: 0, end: 91 }] },
    "comp-lint-shot-range",
    "shots.0.end",
  ],
  [
    { shots: [{ id: "a", start: 1, end: 90 }] },
    "comp-lint-shot-partition",
    "shots.0.start",
  ],
  [
    { shots: [{ id: "a", start: 0, end: 20 }] },
    "comp-lint-shot-partition",
    "shots.0.end",
  ],
  [
    {
      shots: [
        { id: "a", start: 0, end: 40 },
        { id: "a", start: 40, end: 90 },
      ],
    },
    "comp-lint-shot-id",
    "shots.1.id",
  ],
  [
    { shots: [{ id: "a", start: 0, end: 0 }] },
    "comp-lint-shot-range",
    "shots.0.end",
  ],
])(
  "preserves the diagnostic code and path for invalid policy %j",
  async (settings, code, path) => {
    const dir = await mkdtemp(join(tmpdir(), "ce12-policy-error-"));
    directories.push(dir);
    const policy = join(dir, "policy.json");
    await writeFile(policy, JSON.stringify(settings));
    const result = await invoke(fixtures.stillness.fail, ["--policy", policy]);
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).diagnostics).toEqual([
      expect.objectContaining({
        code,
        severity: "error",
        path,
        message: expect.any(String),
      }),
    ]);
  },
);

it("returns nonzero for undeclared one-frame scale and opacity pulses", async () => {
  const input = composition([
    solid("pulse", {
      transform: {
        position: {
          keys: [
            { frame: 0, value: [80, 80] },
            { frame: 89, value: [169, 80], interpolation: "linear" },
          ],
        },
        opacity: {
          keys: [
            { frame: 0, value: 1 },
            { frame: 20, value: 0.1, interpolation: "hold" },
            { frame: 21, value: 1, interpolation: "hold" },
          ],
        },
        scale: {
          keys: [
            { frame: 0, value: [1, 1] },
            { frame: 20, value: [2, 2], interpolation: "hold" },
            { frame: 21, value: [1, 1], interpolation: "hold" },
          ],
        },
      },
    }),
  ]);
  const result = await invoke(input);
  expect(result.exit).toBe(1);
  expect(result.stderr).toBe("");
  const report = JSON.parse(result.stdout);
  expect(report.status).toBe("failed");
  for (const code of ["scale-pop", "opacity-pop"])
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code, severity: "error", frames: [19, 21] }),
    );
});

it("rejects unpinned provider text without adapter provenance", async () => {
  const input = providerReadingComposition();
  delete input.layers[0]!.source;
  const result = await invoke(input);
  expect(result.exit).toBe(1);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr).diagnostics).toContainEqual(
    expect.objectContaining({
      code: "comp-text-system-font",
      severity: "error",
      path: "layers[0].usesSystemFonts",
    }),
  );
});

it("fails CLI lint when provider text is revealed too briefly", async () => {
  const result = await invoke(providerReadingComposition());
  expect(result.exit).toBe(1);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
    expect.objectContaining({ code: "reading-time", measured: 5 / 30 }),
  );
});

it("accepts continuous collapsed child motion outside the source rectangle", async () => {
  const result = await invoke(collapsedMotionComposition());
  expect(result.exit).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout).diagnostics).toEqual([]);
});

it("returns a structured lint-limit error without allocating an oversized timeline", async () => {
  const result = await invoke(qualityCapacityComposition());
  expect(result.exit).toBe(1);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr).diagnostics).toEqual([
    expect.objectContaining({
      code: "comp-lint-limit",
      severity: "error",
      path: "layers",
    }),
  ]);
});
