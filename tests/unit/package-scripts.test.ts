import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("release checks", () => {
  it("includes corpus readiness in check:all", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["check:all"]).toContain("pnpm corpus:check");
  });
});
