import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  copyPackageGuides,
  rewriteNpmReadmeLinks,
  rewritePackageReferences,
} from "../../scripts/release/build-package.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("installed package references", () => {
  it("keeps source README links usable when emitted at the installed package root", () => {
    const markdown = [
      "[guide](./user-guide.md#storytelling)",
      "[skill](../skills/ask-still-shift/SKILL.md)",
      "[example](../examples/composition/12-puppet-acting/README.md)",
      "[local section](#install)",
      "[registry](https://www.npmjs.com/package/still-shift)",
    ].join("\n");
    expect(rewriteNpmReadmeLinks(markdown)).toBe(
      [
        "[guide](source/docs/user-guide.md#storytelling)",
        "[skill](source/skills/ask-still-shift/SKILL.md)",
        "[example](source/examples/composition/12-puppet-acting/README.md)",
        "[local section](#install)",
        "[registry](https://www.npmjs.com/package/still-shift)",
      ].join("\n"),
    );
  });

  it("ships guides, release records, skills and examples without historical measurements/media", async () => {
    const root = await mkdtemp(join(tmpdir(), "still-shift-guides-"));
    directories.push(root);
    const files = {
      "docs/user-guide.md": "[reference](./composition-reference.md)",
      "docs/composition-reference.md": "composition-1",
      "docs/usage-notes.txt": "feature guidance",
      "docs/npm-release-results.json": '{"version":"0.1.0"}',
      "docs/release-branch-setup-results.json": '{"branch":"production"}',
      "docs/review/result.json": '{"status":"passed"}',
      "docs/composition-ce15-radial-gpu-metadata-results.json":
        '{"measurements":[]}',
      "docs/review/demo.mp4": "review media",
      "skills/ask-still-shift/SKILL.md": "../../docs/user-guide.md",
      "skills/ask-still-shift/agents/openai.yaml": "name: ask-still-shift",
      "skills/compose-with-still-shift/SKILL.md":
        "../../docs/composition-reference.md",
      "examples/composition/12-puppet-acting/composition.json": "actor.svg",
      "examples/composition/12-puppet-acting/actor.svg": "<svg/>",
      "docs/node_modules/private.md": "dependency",
      "examples/dist/generated.json": "generated output",
    };
    for (const [path, contents] of Object.entries(files)) {
      await mkdir(join(root, path, ".."), { recursive: true });
      await writeFile(join(root, path), contents);
    }
    const output = join(root, "package");
    await copyPackageGuides(root, output);
    for (const [path, contents] of Object.entries(files)) {
      const target = join(output, "source", path);
      const historicalJson =
        path.endsWith(".json") &&
        path.startsWith("docs/") &&
        ![
          "docs/npm-release-results.json",
          "docs/release-branch-setup-results.json",
        ].includes(path);
      if (historicalJson || /\.mp4$|\/(node_modules|dist)\//.test(path))
        await expect(readFile(target, "utf8")).rejects.toMatchObject({
          code: "ENOENT",
        });
      else expect(await readFile(target, "utf8")).toBe(contents);
    }
  });

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
