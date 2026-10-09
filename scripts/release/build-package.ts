import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import {
  chmod,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import {
  publicEntries,
  workspaceDirectories,
  workspaceLayout,
} from "./package-layout.ts";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const javascript = (path: string) => path.replace(/\.ts$/, ".js");

async function filesIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? filesIn(path) : [path];
      }),
    )
  ).flat();
}

/** Resolve workspace aliases and file-backed source references in emitted code. */
export function rewritePackageReferences(
  text: string,
  sourcePath: string,
  root: string,
  aliases: ReadonlyMap<string, string>,
): string {
  const source = ts.createSourceFile(
    sourcePath,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const edits: { start: number; end: number; value: string }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      let value = node.text;
      const parent = node.parent;
      const moduleSpecifier =
        ts.isImportDeclaration(parent) ||
        ts.isExportDeclaration(parent) ||
        (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent)) ||
        (ts.isCallExpression(parent) &&
          parent.expression.kind === ts.SyntaxKind.ImportKeyword);
      const alias = moduleSpecifier ? aliases.get(value) : undefined;
      if (alias) {
        value = relative(dirname(sourcePath), alias).split(sep).join("/");
        if (!value.startsWith(".")) value = "./" + value;
        value = javascript(value);
      } else if (
        value.endsWith(".ts") &&
        (existsSync(resolve(dirname(sourcePath), value)) ||
          existsSync(resolve(root, value.replace(/^\//, ""))))
      )
        value = javascript(value);
      if (value !== node.text)
        edits.push({
          start: node.getStart(source),
          end: node.end,
          value: JSON.stringify(value),
        });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const edit of edits.reverse())
    text = text.slice(0, edit.start) + edit.value + text.slice(edit.end);
  return text;
}

function compile(
  root: string,
  output: string,
  aliases: ReadonlyMap<string, string>,
) {
  const configPath = resolve(root, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error)
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
    );
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, {
    noEmit: false,
    noEmitOnError: true,
    declaration: true,
    rewriteRelativeImportExtensions: true,
    rootDir: root,
    outDir: output,
  });
  const roots = [
    ...Object.values(publicEntries),
    "tools/still-shift-cli/src/cli.ts",
    "tools/still-shift-cli/src/composition/runner.ts",
    "apps/lab/src/composition.ts",
    "packages/execution-runtime/src/export-page.ts",
    "packages/execution-runtime/src/passage-text-page.ts",
    "packages/execution-runtime/src/composition-compile-page.ts",
  ].map((file) => resolve(root, file));
  const program = ts.createProgram(roots, parsed.options);
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
  if (diagnostics.length)
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      }),
    );
  const result = program.emit(
    undefined,
    (file, contents, _bom, _error, sources) => {
      const source = sources?.[0];
      const transformed = source
        ? rewritePackageReferences(contents, source.fileName, root, aliases)
        : contents;
      ts.sys.writeFile(file, transformed);
    },
  );
  if (result.emitSkipped)
    throw new Error("npm package compilation did not emit output");
}

function includeSourcePath(root: string, file: string): boolean {
  return (
    !/\.py[co]$/.test(file) &&
    !relative(root, file)
      .split(sep)
      .some((part) => ["node_modules", "dist", "__pycache__"].includes(part))
  );
}

async function copyRuntimeAssets(root: string, output: string) {
  const directories = [
    "packages/execution-runtime",
    "packages/animation-engine/src",
    "packages/scene-contract/schemas",
    "apps/lab/src",
  ];
  for (const directory of directories) {
    for (const file of await filesIn(resolve(root, directory))) {
      if (!/\.(html|css|py|json)$/.test(file) || file.endsWith("package.json"))
        continue;
      const target = resolve(output, relative(root, file));
      await mkdir(dirname(target), { recursive: true });
      if (file.endsWith(".html")) {
        const html = (await readFile(file, "utf8")).replace(
          /(src="[^"]+)\.ts"/g,
          '$1.js"',
        );
        await writeFile(target, html);
      } else await cp(file, target);
    }
  }
  const html = (
    await readFile(resolve(root, "apps/lab/composition.html"), "utf8")
  )
    .replace("/src/composition.ts", "/src/composition.js")
    .replaceAll("pnpm --silent still-shift", "still-shift");
  await writeFile(resolve(output, "apps/lab/composition.html"), html);
  for (const file of [
    "toolchain.json",
    "pnpm-lock.yaml",
    "pyproject.toml",
    "uv.lock",
  ])
    await cp(resolve(root, file), resolve(output, file));
  await cp(
    resolve(root, "services/depth-worker/src"),
    resolve(output, "services/depth-worker/src"),
    { recursive: true, filter: (file) => includeSourcePath(root, file) },
  );
  await cp(
    resolve(root, "assets/ecommerce-motion/fonts"),
    resolve(output, "assets/ecommerce-motion/fonts"),
    { recursive: true },
  );
  await mkdir(resolve(output, "scripts/soundtrack"), { recursive: true });
  await cp(
    resolve(root, "scripts/soundtrack/requirements.txt"),
    resolve(output, "scripts/soundtrack/requirements.txt"),
  );
}

async function copyCorrespondingSource(root: string, output: string) {
  const files = [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "npm-release.json",
    "LICENSE",
    "toolchain.json",
    "pyproject.toml",
    "uv.lock",
    "docs/npm-package-readme.md",
    "docs/npm-third-party-notices.md",
  ];
  for (const path of [
    ...files,
    ...workspaceDirectories,
    "apps/lab",
    "catalogs",
    "scripts/release",
    "scripts/soundtrack",
    "services/depth-worker/src",
    "assets/ecommerce-motion/fonts",
  ]) {
    await cp(resolve(root, path), resolve(output, "source", path), {
      recursive: true,
      filter: (file) => includeSourcePath(root, file),
    });
  }
}

export async function buildNpmPackage(root = projectRoot): Promise<string> {
  const output = resolve(root, "dist/npm");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const { aliases, dependencies } = workspaceLayout(root);
  compile(root, output, aliases);
  await copyRuntimeAssets(root, output);
  const metadata = JSON.parse(
    await readFile(resolve(root, "npm-release.json"), "utf8"),
  );
  const exports = Object.fromEntries(
    Object.entries(publicEntries).map(([name, source]) => [
      name,
      {
        types: "./" + source.replace(/\.ts$/, ".d.ts"),
        import: "./" + javascript(source),
      },
    ]),
  );
  const manifest = {
    ...metadata,
    type: "module",
    bin: { "still-shift": "bin/still-shift.js" },
    exports,
    dependencies,
  };
  await writeFile(
    resolve(output, "package.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  const lockPath = resolve(root, "scripts/release/npm-shrinkwrap.json");
  {
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    assert.deepEqual(
      lock.packages[""].dependencies,
      dependencies,
      "Refresh the npm release dependency lock after changing dependencies",
    );
    assert.equal(
      lock.version,
      metadata.version,
      "Refresh the npm release dependency lock after changing the release version",
    );
    await cp(lockPath, resolve(output, "npm-shrinkwrap.json"));
  }
  await mkdir(resolve(output, "bin"));
  await writeFile(
    resolve(output, "bin/still-shift.js"),
    '#!/usr/bin/env node\nimport { runInstalledCli } from "../scripts/release/installed-cli.js";\nprocess.exitCode = await runInstalledCli(process.argv.slice(2));\n',
  );
  await chmod(resolve(output, "bin/still-shift.js"), 0o755);
  await mkdir(resolve(output, "scripts/release"), { recursive: true });
  const cliSource = resolve(root, "scripts/release/installed-cli.ts");
  const cli = ts.transpileModule(await readFile(cliSource, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.ESNext,
      rewriteRelativeImportExtensions: true,
    },
  }).outputText;
  await writeFile(
    resolve(output, "scripts/release/installed-cli.js"),
    rewritePackageReferences(cli, cliSource, root, aliases),
  );
  for (const [source, target] of [
    ["docs/npm-package-readme.md", "README.md"],
    ["LICENSE", "LICENSE"],
    ["docs/npm-third-party-notices.md", "THIRD-PARTY-NOTICES.md"],
  ])
    await cp(resolve(root, source!), resolve(output, target!));
  await copyCorrespondingSource(root, output);
  return output;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  console.log(await buildNpmPackage());
