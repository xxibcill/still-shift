import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const script = "scripts/composition/baselines.ts";

describe("composition baseline selection", () => {
  it.each([
    [
      "unknown family",
      ["--family", "does-not-exist"],
      "Unknown fixture families",
    ],
    [
      "partly unknown families",
      ["--family", "story,does-not-exist"],
      "Unknown fixture families",
    ],
    [
      "disjoint fixture and family filters",
      ["--only", "story/continuous-unequal-margins", "--family", "cinematic"],
      "No composition fixtures match",
    ],
  ])(
    "rejects %s before browser rendering",
    async (_, filters, message) => {
      await expect(
        run(process.execPath, [
          "--import",
          "tsx",
          script,
          "--check",
          ...filters,
        ]),
      ).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining(message),
      });
    },
    60_000,
  );
});
