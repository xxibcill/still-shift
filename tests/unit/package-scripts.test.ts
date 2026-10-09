import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("release checks", () => {
  it("runs software release checks without requiring the retired corpus", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["check:all"]).toBe(
      "pnpm check && pnpm benchmark",
    );
  });

  it("checks that the generated corpus schema is current", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.check).toContain("pnpm schema:check");
  });
});
