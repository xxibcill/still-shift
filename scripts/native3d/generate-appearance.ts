import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format } from "prettier";
import ts from "typescript";

const DESCRIPTOR = "packages/renderer-core/src/native3d/appearance-modules.ts";
const ENTRY_POINTS = [
  "packages/renderer-core/src/native3d/browser.ts",
  "packages/renderer-core/src/composition/render/renderer.ts",
  "packages/renderer-core/src/native3d/evaluate.ts",
  "packages/renderer-core/src/native3d/prepare.ts",
  DESCRIPTOR,
] as const;
// External versions and transitive runtime bytes are explicitly admitted. Three
// already has its own module/core/RoomEnvironment identity inventory.
// A new external runtime import must be deliberately admitted here.
const EXTERNAL_PINS = {
  "clipper2-ts": "2.0.1-18",
  earcut: "3.0.2",
  three: "0.186.0",
  zod: "4.1.5",
} as const;
type ClosureOptions = {
  root: string;
  entryPoints: readonly string[];
  workspacePaths: Readonly<Record<string, readonly string[]>>;
  externalVersions: Readonly<Record<string, string>>;
};
function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function posix(path: string): string {
  return path.split(sep).join("/");
}
function contained(root: string, file: string): string {
  const path = resolve(file),
    name = relative(root, path);
  if (name === ".." || name.startsWith(`..${sep}`) || isAbsolute(name))
    throw Error(`Appearance source escapes the repository: ${posix(name)}`);
  return path;
}
async function regular(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink())
      throw Error(`Appearance source may not be a symlink: ${path}`);
    return info.isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
function valueImport(
  node: ts.ImportDeclaration | ts.ExportDeclaration,
): boolean {
  if (ts.isImportDeclaration(node)) {
    if (node.importClause?.isTypeOnly) return false;
    const bindings = node.importClause?.namedBindings;
    return (
      Boolean(node.importClause?.name) ||
      !bindings ||
      !ts.isNamedImports(bindings) ||
      bindings.elements.length === 0 ||
      bindings.elements.some((element) => !element.isTypeOnly)
    );
  }
  if (node.isTypeOnly) return false;
  return (
    !node.exportClause ||
    !ts.isNamedExports(node.exportClause) ||
    node.exportClause.elements.length === 0 ||
    node.exportClause.elements.some((element) => !element.isTypeOnly)
  );
}
function references(file: string, content: string): string[] {
  const source = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const imports: string[] = [];
  const add = (node: ts.Node, expression: ts.Node | undefined) => {
    if (
      !expression ||
      !(
        ts.isStringLiteral(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression)
      )
    ) {
      const { line, character } = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      throw Error(
        `Unverifiable nonliteral appearance import at ${file}:${line + 1}:${character + 1}`,
      );
    }
    imports.push(expression.text);
  };
  const walk = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      valueImport(node)
    ) {
      if (node.moduleSpecifier) add(node, node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) {
      if (!ts.isExternalModuleReference(node.moduleReference))
        throw Error(`Unsupported appearance import alias in ${file}`);
      add(node, node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      add(node, node.arguments[0]);
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
  return imports;
}

/** AST value-import closure; does not execute imported modules or parse JSON as code. */
export async function collectNativeAppearanceClosure(
  options: ClosureOptions,
): Promise<readonly string[]> {
  const root = await realpath(options.root),
    seen = new Set<string>();
  const resolveImport = async (
    from: string,
    specifier: string,
  ): Promise<string | undefined> => {
    const diagnostic = `${posix(relative(root, from))}: ${specifier}`;
    let candidates: string[];
    if (specifier.startsWith("."))
      candidates = [resolve(dirname(from), specifier)];
    else if (specifier.startsWith("@still-shift/")) {
      const paths = options.workspacePaths[specifier];
      if (!paths?.length)
        throw Error(`Undeclared workspace appearance import ${diagnostic}`);
      candidates = paths.map((path) => resolve(root, path));
    } else {
      const packageName =
        specifier === "three/addons/environments/RoomEnvironment.js"
          ? "three"
          : specifier;
      const expected = EXTERNAL_PINS[packageName as keyof typeof EXTERNAL_PINS];
      if (!expected || options.externalVersions[packageName] !== expected)
        throw Error(
          `Unpinned or undeclared external appearance import ${diagnostic}`,
        );
      return undefined;
    }
    for (let candidate of candidates) {
      if (candidate.endsWith(".js")) candidate = candidate.slice(0, -3) + ".ts";
      candidate = contained(root, candidate);
      const possible = extname(candidate)
        ? [candidate]
        : [candidate + ".ts", join(candidate, "index.ts")];
      for (const path of possible)
        if (await regular(path)) {
          if (extname(path) !== ".ts" && extname(path) !== ".json")
            throw Error(`Unsupported appearance source format ${diagnostic}`);
          const actual = await realpath(path);
          if (actual !== path)
            throw Error(`Appearance source traverses a symlink ${diagnostic}`);
          return path;
        }
    }
    throw Error(`Unresolved first-party appearance import ${diagnostic}`);
  };
  const visit = async (file: string): Promise<void> => {
    const path = contained(root, file);
    if (seen.has(path)) return;
    if (!(await regular(path)))
      throw Error(
        `Missing appearance entry/source ${posix(relative(root, path))}`,
      );
    if ((await realpath(path)) !== path)
      throw Error(
        `Appearance entry traverses a symlink ${posix(relative(root, path))}`,
      );
    if (extname(path) !== ".ts" && extname(path) !== ".json")
      throw Error(
        `Unsupported appearance source ${posix(relative(root, path))}`,
      );
    seen.add(path);
    if (seen.size > 4096)
      throw Error(
        "Appearance source closure exceeds the identity module budget",
      );
    if (path.endsWith(".json")) return;
    const content = await readFile(path, "utf8");
    for (const specifier of references(posix(relative(root, path)), content)) {
      const dependency = await resolveImport(path, specifier);
      if (dependency) await visit(dependency);
    }
  };
  for (const entry of options.entryPoints) await visit(resolve(root, entry));
  return [...seen].map((file) => posix(relative(root, file))).sort(lexical);
}
export type NativeAppearanceExternalModule = {
  name: string;
  packageName: string;
  packageRelativePath: string;
  expectedVersion: string;
};
type RuntimePackage = {
  name?: unknown;
  version?: unknown;
  exports?: unknown;
  browser?: unknown;
  module?: unknown;
  main?: unknown;
};
/** Select the actual ESM/browser conditional export, never the require entry. */
function importTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const alternative of value) {
      const target = importTarget(alternative);
      if (target !== undefined) return target;
    }
  } else if (value && typeof value === "object") {
    // Condition object insertion order is significant to package resolution.
    for (const [condition, target] of Object.entries(value))
      if (
        condition === "browser" ||
        condition === "import" ||
        condition === "default"
      ) {
        const result = importTarget(target);
        if (result !== undefined) return result;
      }
  }
  return undefined;
}
function packageEntry(metadata: RuntimePackage, packageName: string): string {
  let entry: string | undefined;
  if (metadata.exports !== undefined) {
    const exports = metadata.exports;
    const rootExport =
      exports &&
      typeof exports === "object" &&
      !Array.isArray(exports) &&
      Object.keys(exports).some((key) => key.startsWith("."))
        ? (exports as Record<string, unknown>)["."]
        : exports;
    entry = importTarget(rootExport);
  } else {
    if (metadata.browser && typeof metadata.browser === "object")
      throw Error(
        `Unsupported browser remapping in external appearance package ${packageName}`,
      );
    entry = [metadata.browser, metadata.module, metadata.main].find(
      (value) => typeof value === "string",
    ) as string | undefined;
  }
  if (!entry || (!entry.startsWith("./") && metadata.exports !== undefined))
    throw Error(`Unresolved ESM appearance entry for ${packageName}`);
  return entry;
}

/** Exact transitive installed JS tree plus package metadata; no imported code is executed. */
export async function collectNativeAppearanceExternalClosure(options: {
  packageRoot: string;
  packageName: string;
  expectedVersion: string;
}): Promise<readonly NativeAppearanceExternalModule[]> {
  const root = await realpath(options.packageRoot),
    packageJson = join(root, "package.json");
  if (!(await regular(packageJson)))
    throw Error(
      `Missing external appearance package metadata ${options.packageName}`,
    );
  const metadata = JSON.parse(
    await readFile(packageJson, "utf8"),
  ) as RuntimePackage;
  if (
    metadata.name !== options.packageName ||
    metadata.version !== options.expectedVersion
  )
    throw Error(
      `External appearance package identity differs: ${options.packageName}@${options.expectedVersion}`,
    );
  const seen = new Set<string>();
  const visit = async (file: string): Promise<void> => {
    const path = contained(root, file);
    if (seen.has(path)) return;
    if (!(await regular(path)))
      throw Error(
        `Unresolved external appearance source ${options.packageName}/${posix(relative(root, path))}`,
      );
    if ((await realpath(path)) !== path)
      throw Error(
        `External appearance source traverses a symlink ${options.packageName}/${posix(relative(root, path))}`,
      );
    if (![".js", ".mjs", ".cjs", ".json"].includes(extname(path)))
      throw Error(
        `Unsupported external appearance source ${options.packageName}/${posix(relative(root, path))}`,
      );
    seen.add(path);
    if (seen.size > 4096)
      throw Error(
        "External appearance source closure exceeds the identity module budget",
      );
    if (path.endsWith(".json")) return;
    const content = await readFile(path, "utf8");
    for (const specifier of references(
      `${options.packageName}/${posix(relative(root, path))}`,
      content,
    )) {
      if (!specifier.startsWith("."))
        throw Error(
          `Undeclared transitive external appearance import ${options.packageName}/${posix(relative(root, path))}: ${specifier}`,
        );
      const target = contained(root, resolve(dirname(path), specifier));
      const candidates = extname(target)
        ? [target]
        : [
            target + ".js",
            target + ".mjs",
            target + ".cjs",
            join(target, "index.js"),
          ];
      let actual: string | undefined;
      for (const candidate of candidates)
        if (await regular(candidate)) {
          actual = candidate;
          break;
        }
      if (!actual)
        throw Error(
          `Unresolved external appearance import ${options.packageName}/${posix(relative(root, path))}: ${specifier}`,
        );
      await visit(actual);
    }
  };
  await visit(packageJson);
  await visit(
    contained(root, resolve(root, packageEntry(metadata, options.packageName))),
  );
  return [...seen]
    .map((file) => {
      const packageRelativePath = posix(relative(root, file));
      return {
        name: `external/${options.packageName}/${packageRelativePath}`,
        packageName: options.packageName,
        packageRelativePath,
        expectedVersion: options.expectedVersion,
      };
    })
    .sort((left, right) => lexical(left.name, right.name));
}
async function installedPackageRoot(
  from: string,
  packageName: string,
): Promise<string> {
  const requireRuntime = createRequire(from);
  // An import-only package can reject require.resolve(packageName). Ordered
  // node_modules lookup locates its metadata without invoking that require export.
  for (const directory of requireRuntime.resolve.paths(packageName) ?? []) {
    const root = join(directory, packageName),
      path = join(root, "package.json");
    if (!(await regular(path))) continue;
    const metadata = JSON.parse(await readFile(path, "utf8")) as RuntimePackage;
    if (metadata.name !== packageName)
      throw Error(`External appearance package name mismatch at ${path}`);
    return realpath(root);
  }
  throw Error(
    `Installed external appearance package is unavailable: ${packageName}`,
  );
}

async function descriptorContent(
  modules: readonly string[],
  externals: readonly NativeAppearanceExternalModule[],
): Promise<string> {
  const directory = dirname(DESCRIPTOR);
  const entries = modules.map((file) => {
    const name = file.replace(/^packages\//, ""),
      path = posix(relative(directory, file));
    const url = path.startsWith(".") ? path : "./" + path;
    return `{name:${JSON.stringify(name)},url:new URL(${JSON.stringify(url)},import.meta.url)},`;
  });
  return format(
    `/** Generated by pnpm native3d:identity:generate; checked by schema:check.
 * Conservative first-party value-import closure, including this descriptor itself.
 * Browser-safe data; installed release rewrites only literal .ts URLs to .js. */
export const native3DAppearanceModules: readonly {readonly name:string;readonly url:URL}[] = Object.freeze([
${entries.join("\n")}
]);
/** Actual pinned non-Three ESM runtime closure. Resolved and hashed by the Node IO owner. */
export const native3DAppearanceExternalModules: readonly {readonly name:string;readonly packageName:string;readonly packageRelativePath:string;readonly expectedVersion:string}[] = Object.freeze([
${externals.map((entry) => JSON.stringify(entry) + ",").join("\n")}
]);
`,
    { parser: "typescript" },
  );
}
async function run(args: readonly string[]): Promise<void> {
  if (
    args.some((arg) => arg !== "--check" && arg !== "--generate") ||
    (args.includes("--check") && args.includes("--generate"))
  )
    throw Error("Usage: generate-appearance.ts [--generate | --check]");
  const root = await realpath(
    fileURLToPath(new URL("../../", import.meta.url)),
  );
  const config = JSON.parse(
    await readFile(join(root, "tsconfig.json"), "utf8"),
  ) as { compilerOptions?: { paths?: Record<string, string[]> } };
  const manifest = JSON.parse(
    await readFile(join(root, "packages/renderer-core/package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  const modules = await collectNativeAppearanceClosure({
    root,
    entryPoints: ENTRY_POINTS,
    workspacePaths: config.compilerOptions?.paths ?? {},
    externalVersions: manifest.dependencies ?? {},
  });
  const externals: NativeAppearanceExternalModule[] = [];
  for (const [packageName, expectedVersion] of Object.entries(EXTERNAL_PINS)) {
    if (packageName === "three") continue;
    const packageRoot = await installedPackageRoot(
      join(root, "packages/renderer-core/package.json"),
      packageName,
    );
    externals.push(
      ...(await collectNativeAppearanceExternalClosure({
        packageRoot,
        packageName,
        expectedVersion,
      })),
    );
  }
  externals.sort((left, right) => lexical(left.name, right.name));
  if (modules.length + externals.length > 4096)
    throw Error(
      "Combined appearance closure exceeds the identity module budget",
    );
  const destination = join(root, DESCRIPTOR),
    content = await descriptorContent(modules, externals);
  if (args.includes("--check")) {
    if ((await readFile(destination, "utf8").catch(() => "")) !== content)
      throw Error(
        "Stale native appearance source closure. Run pnpm native3d:identity:generate.",
      );
  } else await writeFile(destination, content);
  process.stdout.write(
    `Native appearance closure ${args.includes("--check") ? "checked" : "generated"}: ${modules.length} first-party and ${externals.length} external runtime modules\n`,
  );
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  await run(process.argv.slice(2));
