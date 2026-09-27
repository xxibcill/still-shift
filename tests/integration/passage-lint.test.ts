import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";

const runLint = async (plan: string) => {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(
    ["passage", "lint", "--plan", plan, "--format", "vertical"],
    {
      stdout: (value) => (stdout += value),
      stderr: (value) => (stderr += value),
    },
  );
  return { exitCode, stdout, stderr };
};

describe("vertical passage lint CLI", () => {
  it("accepts an authored portrait passage", async () => {
    const result = await runLint(
      "benchmarks/fixtures/story-authoring/vertical/linked-network.json",
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "passed",
      format: "vertical",
      diagnostics: [],
    });
    expect(result.stderr).toBe("");
  });

  it("reports a missing vertical override", async () => {
    const result = await runLint(
      "benchmarks/fixtures/story-authoring/linked-network.json",
    );
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing-format-override" }),
      ]),
    );
  });

  it("collects multiple named safe-zone violations instead of stopping at the first", async () => {
    const fixture = resolve(
      "benchmarks/fixtures/story-authoring/vertical/network-template.json",
    );
    const source = JSON.parse(await readFile(fixture, "utf8"));
    for (const asset of [...source.scene.assets, ...(source.scene.fonts ?? [])])
      asset.path = resolve(dirname(fixture), asset.path);
    source.formats.vertical.safeZones = {
      storeControls: { x: 300, y: 400, width: 80, height: 80 },
      resourceControls: { x: 350, y: 1000, width: 80, height: 80 },
    };
    const plan = JSON.parse(
      await readFile(
        "benchmarks/fixtures/story-authoring/vertical/linked-network.json",
        "utf8",
      ),
    );
    const directory = await mkdtemp(join(tmpdir(), "still-shift-lint-"));
    try {
      await writeFile(
        join(directory, "network-template.json"),
        JSON.stringify(source),
      );
      const planPath = join(directory, "linked-network.json");
      await writeFile(planPath, JSON.stringify(plan));
      const result = await runLint(planPath);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe("failed");
      expect(output.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "subject-in-safe-zone",
            beat: "network",
            node: "store",
            path: "safeZones.storeControls",
          }),
          expect.objectContaining({
            code: "subject-in-safe-zone",
            beat: "network",
            node: "resources",
            path: "safeZones.resourceControls",
          }),
        ]),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
