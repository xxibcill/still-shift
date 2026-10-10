import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectNativeAppearanceClosure,
  collectNativeAppearanceExternalClosure,
} from "../../scripts/native3d/generate-appearance.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture(source: string) {
  const root = await mkdtemp(join(tmpdir(), "native-appearance-closure-"));
  roots.push(root);
  await writeFile(join(root, "entry.ts"), source);
  await writeFile(
    join(root, "descriptor.ts"),
    'export const descriptor = new URL("./entry.ts", import.meta.url);\n',
  );
  const options = {
    root,
    entryPoints: ["entry.ts", "descriptor.ts"],
    workspacePaths: { "@still-shift/fake": ["material.ts"] },
    externalVersions: { zod: "4.1.5" },
  };
  return { root, options };
}
describe("native appearance closure maintenance", () => {
  it("keeps runtime cyclic, workspace, dynamic and JSON dependencies while skipping type-only imports", async () => {
    const f = await fixture(`import type {Gone} from "./missing-type.ts";
      import {type AlsoGone} from "./missing-inline-type.ts";
      export {type Absent} from "./missing-export-type.ts";
      export {color} from "./material.js";
      import {color as alias} from "@still-shift/fake";
      import catalog from "./catalog.json" with {type:"json"};
      void import("./device.ts");import {z} from "zod";
      export const value = [alias,catalog,z];`);
    await writeFile(
      join(f.root, "material.ts"),
      'export * from "./entry.ts";export const color="red";',
    );
    await writeFile(join(f.root, "device.ts"), "export const render=1;");
    await writeFile(
      join(f.root, "catalog.json"),
      '{"copy":"import from missing-script.ts"}',
    );
    expect(await collectNativeAppearanceClosure(f.options)).toEqual([
      "catalog.json",
      "descriptor.ts",
      "device.ts",
      "entry.ts",
      "material.ts",
    ]);
  });
  it("does not discard a mixed type and runtime import", async () => {
    const f = await fixture(
      'import {type Shape,color} from "./material.ts";export const value=color;',
    );
    await writeFile(
      join(f.root, "material.ts"),
      'export type Shape=string;export const color="red";',
    );
    expect(await collectNativeAppearanceClosure(f.options)).toContain(
      "material.ts",
    );
  });
  it("rejects an unresolved first-party dependency", async () => {
    const f = await fixture('import "./not-present.ts";');
    await expect(collectNativeAppearanceClosure(f.options)).rejects.toThrow(
      /Unresolved first-party appearance import entry.ts: .\/not-present.ts/,
    );
  });
  it("rejects a nonliteral dynamic import instead of declaring incomplete identity", async () => {
    const f = await fixture('const route="./device.ts";void import(route);');
    await expect(collectNativeAppearanceClosure(f.options)).rejects.toThrow(
      /Unverifiable nonliteral appearance import at entry.ts:1:/,
    );
  });
  it("rejects an escaping import before reading outside bytes", async () => {
    const f = await fixture('import "../outside.ts";');
    await expect(collectNativeAppearanceClosure(f.options)).rejects.toThrow(
      /escapes the repository/,
    );
  });
  it("rejects a symlinked first-party module even when it points inside the root", async () => {
    const f = await fixture('import "./linked.ts";');
    await writeFile(join(f.root, "actual.ts"), "export const data=1;");
    await symlink(join(f.root, "actual.ts"), join(f.root, "linked.ts"));
    await expect(collectNativeAppearanceClosure(f.options)).rejects.toThrow(
      /may not be a symlink/,
    );
  });
  it("rejects undeclared externals and changed external pins", async () => {
    const unknown = await fixture('import "new-unverified-runtime";');
    await expect(
      collectNativeAppearanceClosure(unknown.options),
    ).rejects.toThrow(/Unpinned or undeclared external/);
    const changed = await fixture('import "zod";');
    await expect(
      collectNativeAppearanceClosure({
        ...changed.options,
        externalVersions: { zod: "latest" },
      }),
    ).rejects.toThrow(/Unpinned or undeclared external/);
  });
  it("rejects an undeclared workspace subpath", async () => {
    const f = await fixture('import "@still-shift/fake/private";');
    await expect(collectNativeAppearanceClosure(f.options)).rejects.toThrow(
      /Undeclared workspace appearance import/,
    );
  });
});

async function externalFixture(
  exports: unknown = { ".": { import: "./entry.js", require: "./legacy.cjs" } },
  version = "4.1.5",
) {
  const root = await mkdtemp(join(tmpdir(), "native-external-closure-"));
  roots.push(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "zod",
      version,
      type: "module",
      exports,
      module: "./unselected.js",
    }),
  );
  await writeFile(join(root, "entry.js"), "export const value=1;");
  const options = {
    packageRoot: root,
    packageName: "zod",
    expectedVersion: "4.1.5",
  };
  return { root, options };
}
describe("actual external appearance runtime closure", () => {
  it("walks the selected ESM entry and transitive JS tree with stable package-relative descriptors", async () => {
    const f = await externalFixture();
    await writeFile(join(f.root, "entry.js"), 'export * from "./child.js";');
    await writeFile(
      join(f.root, "child.js"),
      'export * from "./entry.js";export const code=2;',
    );
    await writeFile(
      join(f.root, "legacy.cjs"),
      'require("unselected-cjs-dependency");',
    );
    expect(await collectNativeAppearanceExternalClosure(f.options)).toEqual([
      {
        name: "external/zod/child.js",
        packageName: "zod",
        packageRelativePath: "child.js",
        expectedVersion: "4.1.5",
      },
      {
        name: "external/zod/entry.js",
        packageName: "zod",
        packageRelativePath: "entry.js",
        expectedVersion: "4.1.5",
      },
      {
        name: "external/zod/package.json",
        packageName: "zod",
        packageRelativePath: "package.json",
        expectedVersion: "4.1.5",
      },
    ]);
  });
  it("selects the actual browser conditional export before an import fallback", async () => {
    const f = await externalFixture({
      ".": { browser: "./browser.js", import: "./entry.js" },
    });
    await writeFile(join(f.root, "browser.js"), 'export const code="browser";');
    expect(
      (await collectNativeAppearanceExternalClosure(f.options)).map(
        (row) => row.packageRelativePath,
      ),
    ).toEqual(["browser.js", "package.json"]);
  });
  it("rejects an installed version change even when entry names remain unchanged", async () => {
    const f = await externalFixture(undefined, "4.1.6");
    await expect(
      collectNativeAppearanceExternalClosure(f.options),
    ).rejects.toThrow(/External appearance package identity differs/);
  });
  it("rejects missing transitive JS bytes", async () => {
    const f = await externalFixture();
    await writeFile(join(f.root, "entry.js"), 'export * from "./missing.js";');
    await expect(
      collectNativeAppearanceExternalClosure(f.options),
    ).rejects.toThrow(/Unresolved external appearance import/);
  });
  it("rejects a nonliteral external import and an undeclared package edge", async () => {
    const f = await externalFixture();
    await writeFile(
      join(f.root, "entry.js"),
      'const path="./child.js";void import(path);',
    );
    await expect(
      collectNativeAppearanceExternalClosure(f.options),
    ).rejects.toThrow(/Unverifiable nonliteral appearance import/);
    await writeFile(join(f.root, "entry.js"), 'import "unverified-package";');
    await expect(
      collectNativeAppearanceExternalClosure(f.options),
    ).rejects.toThrow(/Undeclared transitive external appearance import/);
  });
  it("rejects traversal and final symlink aliases outside the admitted package tree", async () => {
    const f = await externalFixture();
    await writeFile(join(f.root, "entry.js"), 'import "../outside.js";');
    await expect(
      collectNativeAppearanceExternalClosure(f.options),
    ).rejects.toThrow(/escapes the repository/);
    await writeFile(join(f.root, "entry.js"), 'import "./linked.js";');
    await writeFile(join(f.root, "actual.js"), "export const x=1;");
    await symlink(join(f.root, "actual.js"), join(f.root, "linked.js"));
    await expect(
      collectNativeAppearanceExternalClosure(f.options),
    ).rejects.toThrow(/may not be a symlink/);
  });
});
