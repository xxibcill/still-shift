import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { fixtures } from "../../benchmarks/fixtures/composition/ce12/fixtures.ts";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((p) => rm(p, { recursive: true })),
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
