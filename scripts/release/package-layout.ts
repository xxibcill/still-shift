import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const workspaceDirectories = [
  "packages/animation-engine",
  "packages/execution-runtime",
  "packages/motion-builder",
  "packages/renderer-core",
  "packages/scene-contract",
  "tools/still-shift-cli",
];

export const publicEntries: Record<string, string> = {
  ".": "packages/motion-builder/src/index.ts",
  "./motion": "packages/motion-builder/src/index.ts",
  "./motion/node": "packages/motion-builder/src/node.ts",
  "./engine": "packages/animation-engine/src/index.ts",
  "./renderer": "packages/renderer-core/src/index.ts",
  "./renderer/native3d-browser":
    "packages/renderer-core/src/native3d/browser.ts",
  "./schema": "packages/scene-contract/src/index.ts",
  "./runtime": "packages/execution-runtime/src/index.ts",
};

type WorkspaceManifest = {
  name: string;
  exports?: string | Record<string, string>;
  dependencies?: Record<string, string>;
};

export function workspaceLayout(root: string) {
  const aliases = new Map<string, string>();
  const dependencies: Record<string, string> = {};
  for (const directory of workspaceDirectories) {
    const manifest = JSON.parse(
      readFileSync(resolve(root, directory, "package.json"), "utf8"),
    ) as WorkspaceManifest;
    const entries =
      typeof manifest.exports === "string"
        ? { ".": manifest.exports }
        : (manifest.exports ?? {});
    for (const [entry, path] of Object.entries(entries))
      aliases.set(
        manifest.name + (entry === "." ? "" : entry.slice(1)),
        resolve(root, directory, path),
      );
    for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
      if (version.startsWith("workspace:")) continue;
      if (dependencies[name] && dependencies[name] !== version)
        throw new Error(`Conflicting runtime versions of ${name}`);
      dependencies[name] = version;
    }
  }
  return { aliases, dependencies };
}
