import { mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";

const cases: { name: string; flags: string[]; diagnostic: string }[] = [
  {
    name: "unsupported recovery",
    flags: ["--recovery", "unknown"],
    diagnostic: "--recovery overlap requires",
  },
  {
    name: "ambiguous manual request",
    flags: ["--recovery", "overlap", "--request", "missing.json"],
    diagnostic: "excludes --request",
  },
  {
    name: "cue override",
    flags: ["--recovery", "overlap", "--authoring", "cue"],
    diagnostic: "without authoring overrides",
  },
  {
    name: "recovery options on manual patch",
    flags: ["--request", "missing.json"],
    diagnostic: "require --recovery overlap",
  },
];
describe("overlap recovery CLI admission", () => {
  it.each(cases)(
    "rejects $name before reading source or creating an export",
    async ({ flags, diagnostic }) => {
      const root = await mkdtemp(join(tmpdir(), "overlap-admission-"));
      const input = join(root, "episode.json"),
        output = join(root, "output");
      const bytes = '{"admissionOnly":true}\n';
      await writeFile(input, bytes);
      let stdout = "";
      const code = await runCli(
        [
          "episode",
          "patch",
          "--input",
          input,
          "--output-dir",
          output,
          "--cache-dir",
          join(root, "cache"),
          "--prepared-dir",
          join(root, "prepared"),
          "--final-output",
          join(root, "bad.mp4"),
          ...flags,
        ],
        {
          stdout: (v) => {
            stdout += v;
          },
          stderr: () => {},
        },
      );
      expect(code).toBe(2);
      const receipt = MechanismCommandReceiptSchema.parse(JSON.parse(stdout));
      expect(receipt.status).toBe("failed");
      expect(receipt.summary.message).toContain(diagnostic);
      expect(await readFile(input, "utf8")).toBe(bytes);
      await expect(access(output)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );
});
