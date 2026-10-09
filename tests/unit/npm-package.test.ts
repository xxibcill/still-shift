import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rewritePackageReferences } from "../../scripts/release/build-package.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("installed package references", () => {
  it("resolves workspace entries and worker URLs without changing user file extensions", async () => {
    const root = await mkdtemp(join(tmpdir(), "still-shift-package-"));
    directories.push(root);
    await mkdir(join(root, "tools"));
    await writeFile(join(root, "tools/runner.ts"), "export {};\n");
    const source = [
      'import { comp } from "@still-shift/motion";',
      'const runner = new URL("./runner.ts", import.meta.url);',
      'const accepted = [".ts", ".mts"];',
      'const user = "example.ts";',
      'const legacyAlias = "@still-shift/motion";',
    ].join("\n");
    const emitted = rewritePackageReferences(
      source,
      join(root, "tools/cli.ts"),
      root,
      new Map([
        ["@still-shift/motion", join(root, "packages/motion/src/index.ts")],
      ]),
    );
    expect(emitted).toContain('from "../packages/motion/src/index.js"');
    expect(emitted).toContain('new URL("./runner.js", import.meta.url)');
    expect(emitted).toContain('[".ts", ".mts"]');
    expect(emitted).toContain('"example.ts"');
    expect(emitted).toContain('const legacyAlias = "@still-shift/motion";');
  });

  it("resolves type declarations to the same installed module graph", () => {
    const emitted = rewritePackageReferences(
      'export type Frame = import("@still-shift/schema").Frame;',
      "/project/packages/motion/src/index.ts",
      "/project",
      new Map([
        ["@still-shift/schema", "/project/packages/schema/src/index.ts"],
      ]),
    );
    expect(emitted).toBe(
      'export type Frame = import("../../schema/src/index.js").Frame;',
    );
  });
});
