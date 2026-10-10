import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const requireRuntime = createRequire(
  new URL("../../package.json", import.meta.url),
);
const loader = requireRuntime.resolve("tsx");
const helperPath = join(
  root,
  "packages/animation-engine/src/native3d-appearance-identity.ts",
);
const descriptorPath = join(
  root,
  "packages/renderer-core/src/native3d/appearance-modules.ts",
);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const path = await mkdtemp(join(tmpdir(), "native-appearance-bare-node-"));
  roots.push(path);
  // Copied .ts helpers must retain the repository's ESM mode; an outside tmp
  // fixture otherwise routes import-only renderer dependencies through CJS.
  await writeFile(
    join(path, "package.json"),
    JSON.stringify({ type: "module" }),
  );
  return path;
}
async function child(cwd: string, program: string) {
  const env = { ...process.env };
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  delete env.TSX_TSCONFIG_PATH;
  return execute(
    process.execPath,
    ["--import", loader, "--input-type=module", "-e", program],
    {
      cwd,
      env,
      timeout: 25_000,
      maxBuffer: 1024 * 1024,
    },
  );
}
async function helperWithDescriptors(directory: string, descriptors: string) {
  const replacement = join(directory, "descriptor.ts");
  await writeFile(
    replacement,
    `export const native3DAppearanceModules = ${descriptors};\nexport const native3DAppearanceExternalModules = [];\n`,
  );
  let source = await readFile(helperPath, "utf8");
  const imports = {
    "@still-shift/scene-contract": join(
      root,
      "packages/scene-contract/src/index.ts",
    ),
    "@still-shift/renderer-core": join(
      root,
      "packages/renderer-core/src/index.ts",
    ),
    "../../renderer-core/src/native3d/appearance-modules.ts": replacement,
  };
  for (const [specifier, actual] of Object.entries(imports)) {
    expect(source).toContain(JSON.stringify(specifier));
    source = source.replace(
      JSON.stringify(specifier),
      JSON.stringify(pathToFileURL(actual).href),
    );
  }
  const copy = join(directory, "appearance-identity.ts");
  await writeFile(copy, source);
  return pathToFileURL(copy).href;
}

describe("native appearance identity in bare Node", () => {
  it("hashes actual renderer-owned dependencies without pnpm NODE_PATH from an outside cwd", async () => {
    const directory = await fixture();
    const result = await child(
      directory,
      `
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
assert.equal(process.env.NODE_PATH, undefined);
assert.equal(process.env.NODE_OPTIONS, undefined);
assert.equal(process.env.TSX_TSCONFIG_PATH, undefined);
assert.equal(globalThis.document, undefined);
const root = ${JSON.stringify(root)};
const pins = JSON.parse(await readFile(join(root, "toolchain.json"), "utf8"));
assert.equal(process.versions.node, pins.node);
const helper = await import(${JSON.stringify(pathToFileURL(helperPath).href)});
const descriptors = await import(${JSON.stringify(pathToFileURL(descriptorPath).href)});
const actual = await helper.loadNativeAppearanceCodeIdentity();
assert.equal(actual.runtimeFormat, "source-ts");
assert.equal(actual.threeRuntime.version, "0.186.0");
const expected = [];
const versions = new Map();
for (const row of descriptors.native3DAppearanceExternalModules) {
  // Independent expected bytes come from renderer-core's declared direct
  // dependency links, not the helper's package search or injected NODE_PATH.
  const packageRoot = await realpath(join(root, "packages/renderer-core/node_modules", row.packageName));
  const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  assert.equal(metadata.name, row.packageName);
  assert.equal(metadata.version, row.expectedVersion);
  versions.set(metadata.name, metadata.version);
  const bytes = await readFile(join(packageRoot, row.packageRelativePath));
  const sha256 = "sha256:" + createHash("sha256").update(bytes).digest("hex");
  expected.push({ name: row.name, sha256 });
}
assert.deepEqual(actual.modules.filter(({name}) => name.startsWith("external/")), expected);
assert.equal(actual.modules.length, descriptors.native3DAppearanceModules.length + expected.length);
assert.deepEqual([...versions].sort(), [["clipper2-ts", "2.0.1-18"], ["earcut", "3.0.2"], ["zod", "4.1.5"]]);
console.log(JSON.stringify({ node: process.versions.node, runtimeFormat: actual.runtimeFormat, externalModules: expected.length,
  modules: actual.modules.length, versions: [...versions].sort(), identitySha256: helper.hashNativeAppearanceCodeIdentity(actual),
  nodePath: process.env.NODE_PATH ?? null, nodeOptions: process.env.NODE_OPTIONS ?? null, cwd: process.cwd() }));
`,
    );
    expect(result.stderr).toBe("");
    const receipt = JSON.parse(result.stdout) as {
      runtimeFormat: string;
      externalModules: number;
      modules: number;
      nodePath: null;
      nodeOptions: null;
      cwd: string;
    };
    expect(receipt.runtimeFormat).toBe("source-ts");
    expect(receipt.externalModules).toBe(79);
    expect(receipt.modules).toBeGreaterThan(receipt.externalModules);
    expect(receipt.nodePath).toBeNull();
    expect(receipt.nodeOptions).toBeNull();
    expect(await realpath(receipt.cwd)).toBe(await realpath(directory));
  }, 30_000);

  it.each(["missing", "duplicate"] as const)(
    "rejects a %s renderer self-descriptor instead of choosing another context",
    async (kind) => {
      const directory = await fixture();
      const url = pathToFileURL(descriptorPath).href;
      const row = `{ name: "renderer-core/src/native3d/appearance-modules.ts", url: new URL(${JSON.stringify(url)}) }`;
      const copiedHelper = await helperWithDescriptors(
        directory,
        kind === "missing" ? "[]" : `[${row}, ${row}]`,
      );
      const result = await child(
        directory,
        `
import assert from "node:assert/strict";
const { loadNativeAppearanceCodeIdentity } = await import(${JSON.stringify(copiedHelper)});
await assert.rejects(loadNativeAppearanceCodeIdentity, (error) => {
  assert(error.diagnostics.some((diagnostic) => diagnostic.code === "comp-native3d-source"
    && diagnostic.path === "native3d.appearanceCode.modules"
    && /exactly one renderer descriptor/.test(diagnostic.message)));
  return true;
});
console.log("located descriptor admission rejected");
`,
      );
      expect(result.stderr).toBe("");
      expect(result.stdout.trim()).toBe(
        "located descriptor admission rejected",
      );
    },
    30_000,
  );
});
