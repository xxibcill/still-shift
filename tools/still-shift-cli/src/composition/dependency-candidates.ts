import { extname, join } from "node:path";
export function typescriptCandidates(path: string): string[] {
  const extension = extname(path);
  const replacements: Record<string, string[]> = {
    ".js": [".ts", ".tsx"],
    ".jsx": [".tsx"],
    ".mjs": [".mts"],
    ".cjs": [".cts"],
  };
  if (replacements[extension])
    return replacements[extension]!.map(
      (candidate) => path.slice(0, -extension.length) + candidate,
    );
  if (extension) return [];
  const extensions = [
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
  ];
  return extensions.flatMap((candidate) => [
    path + candidate,
    join(path, "index" + candidate),
  ]);
}
