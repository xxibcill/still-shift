import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { snapshotBenchmarkSources } from "../../scripts/composition/ce6p-sources.ts";

let root: string;
const workload = "tests/helpers/workload.ts";
const runtime = "packages/runtime.ts";
const original = "export const value: number = 17;";

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "ce6p-source-test-")));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  await mkdir(join(root, "tests/helpers"), { recursive: true });
  await mkdir(join(root, "packages"));
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  await writeFile(
    join(root, workload),
    'export { value } from "../../packages/runtime.ts";',
  );
  await writeFile(join(root, runtime), original);
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("CE6-P immutable workload sources", () => {
  it("records transitive runtime and dependency-manifest hashes", async () => {
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const snapshot = await snapshotBenchmarkSources(root);
    expect(snapshot.sha256[runtime]).toBe(
      createHash("sha256").update(original).digest("hex"),
    );
    expect(snapshot.sha256["pnpm-lock.yaml"]).toBeDefined();
    expect(Object.keys(snapshot.sha256)).toEqual(
      [...Object.keys(snapshot.sha256)].sort(),
    );
  });

  it("keeps a transitive import identical in fresh baseline/candidate Vite sessions", async () => {
    const snapshot = await snapshotBenchmarkSources(root);
    const values = [];
    for (const variant of ["baseline", "candidate"]) {
      if (variant === "candidate")
        await writeFile(
          join(root, runtime),
          "export const value: number = 91;",
        );
      const server = await createServer({
        root,
        configFile: false,
        logLevel: "silent",
        cacheDir: join(root, "node_modules", `.cache-${variant}`),
        plugins: [
          {
            name: "immutable-workload",
            enforce: "pre",
            load: (id) => snapshot.load(id),
          },
        ],
        server: { middlewareMode: true },
      });
      try {
        const loaded = await server.ssrLoadModule(`/${workload}`);
        values.push(loaded.value);
      } finally {
        await server.close();
      }
    }
    expect(values).toEqual([17, 17]);
    expect(await snapshot.changedPaths()).toEqual([runtime]);
  });

  it("rejects new runtime files instead of falling through to live code", async () => {
    const snapshot = await snapshotBenchmarkSources(root);
    const path = join(root, "packages/new.ts");
    await writeFile(path, "export const value = 99;");
    expect(() => snapshot.load(path)).toThrow(/benchmark-source-missing/);
  });

  it("preserves selected historical source overrides and rejects missing overrides", async () => {
    const snapshot = await snapshotBenchmarkSources(root);
    const path = join(root, runtime);
    expect(
      snapshot.load(path, new Map([[path, "export const value = 5;"]])),
    ).toBe("export const value = 5;");
    expect(() => snapshot.load(path, new Map([[path, undefined]]))).toThrow(
      /benchmark-source-missing/,
    );
  });

  it("preserves raw imports while leaving installed and virtual modules to Vite", async () => {
    const snapshot = await snapshotBenchmarkSources(root);
    expect(snapshot.load(join(root, runtime) + "?raw")).toBe(
      `export default ${JSON.stringify(original)};`,
    );
    expect(
      snapshot.load(join(root, "node_modules/vite/index.js")),
    ).toBeUndefined();
    expect(snapshot.load("\0virtual-module")).toBeUndefined();
    expect(() => snapshot.load(join(root, runtime) + "?url")).toThrow(
      /benchmark-source-query/,
    );
  });
  it("reports modified manifests, deleted sources and new untracked runtime files", async () => {
    const snapshot = await snapshotBenchmarkSources(root);
    await writeFile(
      join(root, "package.json"),
      '{"type":"module","exports":"./other.ts"}',
    );
    await rm(join(root, runtime));
    await writeFile(join(root, "packages/new.ts"), "export const value = 99;");
    expect(await snapshot.changedPaths()).toEqual([
      "package.json",
      "packages/new.ts",
      runtime,
    ]);
  });

  it("excludes the report and generated dependencies from source comparisons", async () => {
    const output = join(root, "report.json");
    const snapshot = await snapshotBenchmarkSources(root, [output]);
    await writeFile(output, '{"runs":[]}');
    await mkdir(join(root, "node_modules/generated"), { recursive: true });
    await writeFile(
      join(root, "node_modules/generated/index.js"),
      "export default 1;",
    );
    expect(await snapshot.changedPaths()).toEqual([]);
  });
  it("normalizes a symlinked checkout to Vite's canonical module paths", async () => {
    const alias = root + "-alias";
    await symlink(root, alias);
    try {
      const snapshot = await snapshotBenchmarkSources(alias, [
        join(alias, "report.json"),
      ]);
      await writeFile(join(root, "report.json"), '{"runs":[]}');
      expect(snapshot.load(join(root, runtime))).toBe(original);
      expect(await snapshot.changedPaths()).toEqual([]);
    } finally {
      await rm(alias);
    }
  });
});
