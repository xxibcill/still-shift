import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const MODULE = /\.(?:[cm]?[jt]sx?|json|css)$/;
const MANIFESTS = new Set([
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".node-version",
  ".nvmrc",
]);

/** Capture shared repository modules and dependency manifests before the bracket. */
export async function snapshotBenchmarkSources(
  directory: string,
  excluded: readonly string[] = [],
) {
  const suppliedRoot = resolve(directory);
  const root = await realpath(suppliedRoot);
  const ignored = new Set(
    excluded.map((path) => {
      const absolute = resolve(suppliedRoot, path);
      return absolute.startsWith(suppliedRoot + sep)
        ? join(root, relative(suppliedRoot, absolute))
        : absolute;
    }),
  );
  const capture = async () => {
    const paths = [
      ...new Set(
        execFileSync(
          "git",
          ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
          { cwd: root, encoding: "utf8" },
        ).split("\0"),
      ),
    ]
      .filter(
        (path) =>
          !path.startsWith("docs/") &&
          !path.includes("node_modules/") &&
          !ignored.has(join(root, path)) &&
          (MODULE.test(path) || MANIFESTS.has(path)),
      )
      .sort();
    const sources = new Map<string, string>();
    const sha256: Record<string, string | null> = {};
    for (const path of paths) {
      let source: string;
      try {
        source = await readFile(join(root, path), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        sha256[path] = null;
        continue;
      }
      sources.set(join(root, path), source);
      sha256[path] = createHash("sha256").update(source).digest("hex");
    }
    return { sources, sha256 };
  };
  const snapshot = await capture();
  if (Object.values(snapshot.sha256).includes(null))
    throw new Error(
      "benchmark-source-missing: tracked source unavailable at startup",
    );
  return {
    sha256: snapshot.sha256,
    async changedPaths() {
      const current = await capture();
      return [
        ...new Set([
          ...Object.keys(snapshot.sha256),
          ...Object.keys(current.sha256),
        ]),
      ]
        .filter((path) => snapshot.sha256[path] !== current.sha256[path])
        .sort();
    },
    load(
      id: string,
      selected: ReadonlyMap<string, string | undefined> = new Map(),
    ) {
      const path = id.split("?")[0]!;
      if (
        !path.startsWith(root + sep) ||
        path.startsWith(join(root, "node_modules") + sep) ||
        !MODULE.test(path)
      )
        return undefined;
      const source = selected.has(path)
        ? selected.get(path)
        : snapshot.sources.get(path);
      if (source === undefined)
        throw new Error(`benchmark-source-missing: ${relative(root, path)}`);
      const query = new URLSearchParams(id.slice(path.length + 1));
      if (query.has("url"))
        throw new Error(
          `benchmark-source-query: URL imports are not snapshotted: ${relative(root, path)}`,
        );
      if (query.has("raw")) return `export default ${JSON.stringify(source)};`;
      return source;
    },
  };
}
