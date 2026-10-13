import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { createCueProjectFixture } from "../helpers/mechanism-cue-project.ts";
import {
  inspectMechanismProductionNativeItem,
  createMechanismProductionNativeExecutor,
} from "@still-shift/animation-engine";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";
async function run(args: string[]) {
  let stdout = "",
    stderr = "";
  const code = await runCli(["production", ...args], {
    stdout: (v) => {
      stdout += v;
    },
    stderr: (v) => {
      stderr += v;
    },
  });
  return { code, stdout, stderr };
}
describe("actual declarative native queue CLI", () => {
  it("pins three real family inputs from project-relative paths without capture code and preserves an existing manifest", async () => {
    const dir = await mkdtemp("/private/tmp/production-projects-cli-");
    try {
      const projects = [];
      for (const [i, family] of (
        ["tape-hook", "cable-tie", "clothespeg"] as const
      ).entries()) {
        await createCueProjectFixture(join(dir, family), family);
        projects.push({
          id: "S" + (i + 1),
          question: "Declared engineering question " + family,
          familyPath: family + "/family.json",
          cuePath: family + "/cues.json",
        });
      }
      const source = join(dir, "projects.json"),
        destination = join(dir, "manifests", "queue.json");
      await writeFile(
        source,
        JSON.stringify({
          schemaVersion: "mechanism-production-projects-1",
          id: "three-family",
          projects,
        }),
      );
      const result = await run([
        "queue",
        "--projects",
        source,
        "--manifest",
        destination,
      ]);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(32768);
      const receipt = MechanismCommandReceiptSchema.parse(
        JSON.parse(result.stdout),
      );
      expect(receipt.summary).toMatchObject({
        selected: 3,
        execution: "not-started",
        pilotAdmission: "not-established",
      });
      expect(receipt.artifacts[0]!.path).toBe(destination);
      const manifest = JSON.parse(await readFile(destination, "utf8"));
      expect(manifest.items.map((x: { family: string }) => x.family)).toEqual([
        "tape-hook",
        "cable-tie",
        "clothespeg",
      ]);
      expect(
        manifest.items.map((x: { inputs: unknown[] }) => x.inputs.length),
      ).toEqual([6, 6, 6]);
      for (const [i, project] of projects.entries())
        expect(manifest.items[i]).toEqual(
          await inspectMechanismProductionNativeItem(
            {
              ...project,
              familyPath: join(dir, project.familyPath),
              cuePath: join(dir, project.cuePath),
            },
            join(dir, "manifests"),
          ),
        );
      const executor = await createMechanismProductionNativeExecutor();
      expect(manifest.codeSha256).toBe(executor.codeSha256);
      expect(manifest.profileSha256).toBe(executor.profileSha256);
      const original = await readFile(destination);
      expect(
        (await run(["queue", "--projects", source, "--manifest", destination]))
          .code,
      ).toBe(2);
      expect(await readFile(destination)).toEqual(original);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});
