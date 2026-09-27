import { readdir, readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

type WorkspacePackage = {
  directory: string;
  name: string;
  dependencies: Set<string>;
};

async function packagesIn(root: string): Promise<WorkspacePackage[]> {
  const packages: WorkspacePackage[] = [];
  for (const group of ["packages", "tools"]) {
    const entries = await readdir(resolve(root, group), {
      withFileTypes: true,
    }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const entry of entries.filter((candidate) =>
      candidate.isDirectory(),
    )) {
      const directory = resolve(root, group, entry.name);
      try {
        const manifest = JSON.parse(
          await readFile(resolve(directory, "package.json"), "utf8"),
        ) as {
          name: string;
          dependencies?: Record<string, string>;
          peerDependencies?: Record<string, string>;
        };
        packages.push({
          directory,
          name: manifest.name,
          dependencies: new Set([
            ...Object.keys(manifest.dependencies ?? {}),
            ...Object.keys(manifest.peerDependencies ?? {}),
          ]),
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  return packages;
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.[cm]?tsx?$/.test(entry.name) ? [path] : [];
    }),
  );
  return files.flat();
}

function imports(source: string, path: string): string[] {
  const references: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      references.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      references.push(node.arguments[0].text);
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      references.push(node.argument.literal.text);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true));
  return references;
}

const contains = (directory: string, path: string) =>
  path === directory || path.startsWith(directory + sep);

/** Check the actual source graph so relative imports cannot hide dependencies. */
export async function checkPackageBoundaries(root: string): Promise<string[]> {
  const packages = await packagesIn(root);
  const diagnostics: string[] = [];
  for (const owner of packages) {
    for (const file of await sourceFiles(resolve(owner.directory, "src"))) {
      for (const specifier of imports(await readFile(file, "utf8"), file)) {
        if (isBuiltin(specifier)) continue;
        const path = specifier.startsWith(".")
          ? resolve(dirname(file), specifier)
          : undefined;
        const dependency = path
          ? packages.find((candidate) => contains(candidate.directory, path))
              ?.name
          : specifier
              .split("/")
              .slice(0, specifier.startsWith("@") ? 2 : 1)
              .join("/");
        const problem = (message: string) =>
          diagnostics.push(
            `${relative(root, file)}: ${message} (${specifier})`,
          );
        if (
          path &&
          contains(resolve(root, "packages"), owner.directory) &&
          ["apps", "tools", "scripts"].some((group) =>
            contains(resolve(root, group), path),
          )
        )
          problem("shared packages cannot import application implementations");
        if (
          owner.name === "@still-shift/execution-runtime" &&
          dependency === "@still-shift/animation-engine"
        )
          problem("execution runtime cannot depend on the animation engine");
        if (
          path &&
          dependency === "@still-shift/execution-runtime" &&
          dependency !== owner.name
        )
          problem("use the execution runtime's public package entry points");
        if (
          dependency &&
          dependency !== owner.name &&
          !owner.dependencies.has(dependency)
        )
          problem(`${owner.name} must declare dependency ${dependency}`);
      }
    }
  }
  return diagnostics;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const diagnostics = await checkPackageBoundaries(root);
  if (diagnostics.length) {
    console.error(diagnostics.join("\n"));
    process.exitCode = 1;
  } else console.log("Package dependency boundaries pass.");
}
