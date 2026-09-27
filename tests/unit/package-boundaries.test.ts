import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkPackageBoundaries } from "../../scripts/check-package-boundaries.ts";

const fixtures: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "still-shift-boundaries-"));
  fixtures.push(root);
  for (const name of ["animation-engine", "execution-runtime"]) {
    const directory = join(root, "packages", name);
    await mkdir(join(directory, "src"), { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: `@still-shift/${name}`,
        dependencies:
          name === "animation-engine"
            ? { "@still-shift/execution-runtime": "workspace:*" }
            : {},
      }),
    );
  }
  return root;
}

afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("workspace dependency boundaries", () => {
  it("allows public runtime imports with declared dependencies", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "packages/animation-engine/src/index.ts"),
      'import { exportScene } from "@still-shift/execution-runtime/export"; import { readFile } from "node:fs/promises";',
    );
    expect(await checkPackageBoundaries(root)).toEqual([]);
  });

  it("rejects application imports and undeclared transitive dependencies", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "packages/animation-engine/src/index.ts"),
      'import "../../../tools/cli/src/locks.ts"; export { chromium } from "playwright";',
    );
    expect(await checkPackageBoundaries(root)).toEqual([
      expect.stringContaining("cannot import application implementations"),
      expect.stringContaining("must declare dependency playwright"),
    ]);
  });

  it("detects deep runtime imports and cycles through dynamic and type imports", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "packages/animation-engine/src/index.ts"),
      'await import("../../execution-runtime/src/export-worker.ts");',
    );
    await writeFile(
      join(root, "packages/execution-runtime/src/index.ts"),
      'type Engine = import("@still-shift/animation-engine").Engine;',
    );
    expect(await checkPackageBoundaries(root)).toEqual([
      expect.stringContaining("public package entry points"),
      expect.stringContaining("cannot depend on the animation engine"),
      expect.stringContaining(
        "must declare dependency @still-shift/animation-engine",
      ),
    ]);
  });
});
