import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { createCueProjectFixture } from "../helpers/mechanism-cue-project.ts";

describe("located invalid-cue CLI failure", () => {
  it("keeps the actual rig/parts/interval in production admission and the episode full report without writing a queue or editing source", async () => {
    const root = await mkdtemp("/private/tmp/mechanism-located-failure-cli-");
    try {
      const f = await createCueProjectFixture(join(root, "input"));
      const document = JSON.parse(await readFile(f.cuePath, "utf8"));
      document.transitions.shift();
      await writeFile(f.cuePath, JSON.stringify(document));
      const source = await readFile(f.cuePath);
      const projects = join(root, "projects.json"),
        manifest = join(root, "queue.json");
      await writeFile(
        projects,
        JSON.stringify({
          schemaVersion: "mechanism-production-projects-1",
          id: "invalid-cue",
          projects: [
            {
              id: "E01",
              question: "Invalid transition engineering control",
              familyPath: f.familyPath,
              cuePath: f.cuePath,
            },
          ],
        }),
      );
      async function run(args: string[]) {
        let stdout = "",
          stderr = "";
        const code = await runCli(args, {
          stdout: (s) => {
            stdout += s;
          },
          stderr: (s) => {
            stderr += s;
          },
        });
        return { code, stdout, stderr };
      }
      const production = await run([
        "production",
        "queue",
        "--projects",
        projects,
        "--manifest",
        manifest,
      ]);
      expect(production.code).toBe(2);
      expect(JSON.parse(production.stderr).finding).toMatchObject({
        code: "mechanism-timeline-transition",
        rig: "slider",
        parts: ["board", "hook"],
        interval: { startFrame: 15, endFrameExclusive: 30 },
      });
      await expect(readFile(manifest)).rejects.toMatchObject({
        code: "ENOENT",
      });
      const episode = await run([
        "episode",
        "validate",
        "--authoring",
        "cue",
        "--family-input",
        f.familyPath,
        "--input",
        f.cuePath,
      ]);
      expect(episode.code).toBe(2);
      const receipt = JSON.parse(episode.stdout);
      const report = JSON.parse(
        await readFile(
          receipt.artifacts.find(
            (a: { kind: string }) => a.kind === "full-report",
          ).path,
          "utf8",
        ),
      );
      expect(report.finding).toMatchObject({
        code: "mechanism-timeline-transition",
        rig: "slider",
        parts: ["board", "hook"],
        interval: { startFrame: 15, endFrameExclusive: 30 },
      });
      expect(receipt.items).toContainEqual(
        expect.objectContaining({
          code: "mechanism-timeline-transition",
          rig: "slider",
        }),
      );
      expect(await readFile(f.cuePath)).toEqual(source);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
