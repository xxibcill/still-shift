import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildNpmPackage } from "./build-package.ts";
import { packNpmPackage } from "./pack-package.ts";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = resolve(root, "dist/releases");
const project = await realpath(
  await mkdtemp(resolve(tmpdir(), "still-shift npm consumer-")),
);
const environment = { ...process.env };
delete environment.NODE_PATH;
delete environment.NODE_OPTIONS;
delete environment.TSX_TSCONFIG_PATH;
const checks: { name: string; seconds: number; stdout: string }[] = [];

async function run(
  name: string,
  command: string,
  args: string[],
  cwd = project,
) {
  const start = performance.now();
  console.log(name);
  try {
    const result = await execute(command, args, {
      cwd,
      env: environment,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 300_000,
    });
    checks.push({
      name,
      seconds: (performance.now() - start) / 1000,
      stdout: result.stdout,
    });
    return result.stdout;
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    throw new Error(
      `${name}: ${failure.message}\n${failure.stdout ?? ""}\n${failure.stderr ?? ""}`,
    );
  }
}

try {
  await buildNpmPackage(root);
  const archive = await packNpmPackage(root);
  await writeFile(
    resolve(project, "package.json"),
    JSON.stringify({
      name: "still-shift-release-consumer",
      private: true,
      type: "module",
    }),
  );
  const store = process.env.STILL_SHIFT_PNPM_STORE;
  if (!store)
    await run(
      "locked production dependency audit",
      "npm",
      [
        "--cache",
        resolve(tmpdir(), "still-shift-npm-cache"),
        "audit",
        "--omit=dev",
        "--audit-level=high",
        "--json",
      ],
      resolve(root, "dist/npm"),
    );
  const consumerDependencies = [
    archive,
    "typescript@5.9.2",
    "@types/node@22.20.1",
  ];
  if (store)
    await run("install archive outside repository (pnpm offline)", "pnpm", [
      "add",
      "--ignore-scripts",
      "--offline",
      "--store-dir",
      store,
      ...consumerDependencies,
    ]);
  else
    await run("install archive outside repository (npm)", "npm", [
      "--cache",
      resolve(tmpdir(), "still-shift-npm-cache"),
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--fetch-retries=0",
      ...consumerDependencies,
    ]);
  const bin = resolve(project, "node_modules/.bin/still-shift");
  const metadata = JSON.parse(
    await readFile(resolve(root, "npm-release.json"), "utf8"),
  ) as { version: string };
  const help = await run("installed command help", bin, ["--help"]);
  assert.ok(help.includes(`Still Shift v${metadata.version}`));
  assert.match(help, /npx still-shift comp render/);
  assert.doesNotMatch(help, /pnpm/);
  assert.equal(
    (await run("installed command version", bin, ["--version"])).trim(),
    metadata.version,
  );
  const installedManifest = JSON.parse(
    await readFile(
      resolve(project, "node_modules/still-shift/package.json"),
      "utf8",
    ),
  ) as { dependencies: Record<string, string> };
  assert.equal(installedManifest.dependencies["@types/three"], "0.186.0");
  const program = `import { comp, solid } from "still-shift";
import type { CompositionLintReport } from "still-shift/engine";
import type { CompositionSemanticAssociation } from "still-shift/renderer";
import type { createNativeThreeWorld, createNativeThreeGeometry, NativeTextureFont } from "still-shift/renderer/native3d-browser";
export const nativeTextureFont: NativeTextureFont = { family: "Package fixture", weight: "600" };
export function nativeCameraFov(world: ReturnType<typeof createNativeThreeWorld>): number { return world.camera.fov; }
export function nativeEnvironmentColorSpace(world: ReturnType<typeof createNativeThreeWorld>): string | undefined { return world.world.environment?.colorSpace; }
export function nativeGeometryPositionCount(geometry: ReturnType<typeof createNativeThreeGeometry>): number { return geometry.geometries.get("fixture")?.getAttribute("position").count ?? 0; }
export const declaredContext: CompositionSemanticAssociation = { id: "amount", purpose: "Read the amount with units", kind: "quantity", start: 0, end: 4, members: [{ layer: "value", text: "12", kind: "value" }, { layer: "unit", text: "mm", kind: "unit" }] };
export function semanticStatus(report: CompositionLintReport) { return report.semantic.status; }
export default comp({ id: "package-test", width: 320, height: 192, fps: 24, frames: 4, background: "#fff4df" }, (scene) => {
  scene.add(solid("card", { color: "#305c70", size: [100, 100] }));
});\n`;
  await writeFile(resolve(project, "composition.ts"), program);
  await writeFile(
    resolve(project, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "NodeNext",
        target: "ES2023",
        lib: ["ES2023", "DOM", "DOM.Iterable"],
      },
      include: ["composition.ts"],
    }),
  );
  await run(
    "consumer TypeScript declarations",
    resolve(project, "node_modules/.bin/tsc"),
    ["--project", "tsconfig.json"],
  );
  await run(
    "consumer bundler declarations",
    resolve(project, "node_modules/.bin/tsc"),
    [
      "--project",
      "tsconfig.json",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
    ],
  );
  await run("TypeScript program validation", bin, [
    "comp",
    "validate",
    "--input",
    "composition.ts",
  ]);
  await writeFile(
    resolve(project, "pixel-lint.json"),
    JSON.stringify({
      schemaVersion: "composition-1",
      id: "installed-pixel-lint",
      metadata: {
        readingPolicy: { semanticProfile: "require-declared-context" },
      },
      width: 320,
      height: 192,
      fps: 24,
      frameCount: 4,
      background: "#fff4df",
      assets: [],
      layers: [
        {
          id: "card",
          type: "solid",
          color: "#305c70",
          size: [100, 100],
          inPoint: 0,
          outPoint: 4,
        },
      ],
    }),
  );
  await writeFile(
    resolve(project, "pixel-lint.mjs"),
    `import assert from "node:assert/strict";
import { lintCompositionFile } from "still-shift/engine";
import { CompositionSemanticAssociationSchema } from "still-shift/renderer";
CompositionSemanticAssociationSchema.parse({ id: "amount", purpose: "Read the amount with units", kind: "quantity", start: 0, end: 4, members: [{ layer: "value", text: "12", kind: "value" }, { layer: "unit", text: "mm", kind: "unit" }] });
const report = await lintCompositionFile("pixel-lint.json", {}, { pixels: true });
assert.equal(report.backend, "canvas2d");
assert.equal(typeof report.rendererVersion, "string");
assert.ok(Array.isArray(report.diagnostics));
assert.equal(report.semantic.profile, "require-declared-context");
assert.equal(report.semantic.status, "failed");
assert.ok(report.diagnostics.some(({ code }) => code === "semantic-context-required"));
console.log("Installed browser pixel lint completed");\n`,
  );
  await run("installed browser pixel-quality analysis", process.execPath, [
    "pixel-lint.mjs",
  ]);
  await writeFile(
    resolve(project, "legacy.ts"),
    program.replace('"still-shift"', '"@still-shift/motion"'),
  );
  await run("legacy motion import in installed program", bin, [
    "comp",
    "validate",
    "--input",
    "legacy.ts",
  ]);
  const example = resolve(project, "puppet");
  await cp(resolve(root, "examples/composition/12-puppet-acting"), example, {
    recursive: true,
  });
  await run("JSON program validation", bin, [
    "comp",
    "validate",
    "--input",
    "puppet/composition.json",
  ]);
  await run("installed API imports", process.execPath, [
    "--input-type=module",
    "-e",
    'for (const entry of ["still-shift", "still-shift/motion/node", "still-shift/engine", "still-shift/renderer", "still-shift/schema", "still-shift/runtime"]) { await import(entry); console.log(entry); }',
  ]);
  await run("opt-in browser runtime setup", bin, ["setup", "browser"]);
  await run("opt-in depth runtime setup", bin, ["setup", "depth"]);
  await run(
    "installed depth worker command",
    resolve(project, "node_modules/still-shift/.venv/bin/still-shift-depth"),
    ["--help"],
  );
  for (const backend of ["canvas2d", "webgl2"]) {
    await run(`installed ${backend} export`, bin, [
      "comp",
      "render",
      "--input",
      "puppet/composition.json",
      "--output",
      `${backend}.mp4`,
      "--backend",
      backend,
    ]);
    const probe = JSON.parse(
      await run(`${backend} frame count`, "ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=nb_read_frames,width,height",
        "-of",
        "json",
        `${backend}.mp4`,
      ]),
    ) as {
      streams: { nb_read_frames: string; width: number; height: number }[];
    };
    assert.deepEqual(probe.streams[0], {
      width: 320,
      height: 192,
      nb_read_frames: "48",
    });
    await run(
      `${backend} source comparison`,
      process.execPath,
      [
        "--import",
        "tsx",
        "tools/still-shift-cli/src/cli.ts",
        "comp",
        "render",
        "--input",
        resolve(example, "composition.json"),
        "--output",
        resolve(project, `${backend}-source.mp4`),
        "--backend",
        backend,
      ],
      root,
    );
    assert.deepEqual(
      await readFile(resolve(project, `${backend}.mp4`)),
      await readFile(resolve(project, `${backend}-source.mp4`)),
      `${backend} installed output differs from the source checkout`,
    );
  }
  await cp(
    resolve(root, "tests/package/preview.mjs"),
    resolve(project, "preview.mjs"),
  );
  await run("installed preview page and seeking", process.execPath, [
    "preview.mjs",
  ]);
  environment.STILL_SHIFT_SOUNDTRACK_ENV = resolve(
    project,
    "soundtrack-runtime",
  );
  await run("opt-in soundtrack runtime setup", bin, ["setup", "soundtrack"]);
  environment.STILL_SHIFT_SOUNDTRACK_PYTHON = resolve(
    project,
    "soundtrack-runtime/bin/python",
  );
  await run("soundtrack fixture", "ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=0.1",
    "-c:a",
    "pcm_f32le",
    "source.wav",
  ]);
  await cp(
    resolve(root, "tests/package/soundtrack.mjs"),
    resolve(project, "soundtrack.mjs"),
  );
  await run("installed soundtrack worker and API", process.execPath, [
    "soundtrack.mjs",
  ]);
  await run("installed soundtrack CLI", bin, [
    "soundtrack",
    "validate",
    "--project",
    "soundtrack.json",
  ]);
  const source = resolve(project, "source rebuild");
  await cp(resolve(project, "node_modules/still-shift/source"), source, {
    recursive: true,
  });
  await run(
    "corresponding source dependencies",
    "pnpm",
    [
      "install",
      "--frozen-lockfile",
      "--ignore-scripts",
      ...(store ? ["--offline", "--store-dir", store] : []),
    ],
    source,
  );
  await run("corresponding source rebuild", "pnpm", ["build:package"], source);
  assert.deepEqual(
    await readFile(resolve(source, "dist/npm/package.json")),
    await readFile(resolve(project, "node_modules/still-shift/package.json")),
  );
  await mkdir(output, { recursive: true });
  await writeFile(
    resolve(output, "package-verification.json"),
    JSON.stringify(
      {
        status: "passed",
        archive,
        archiveSha256: createHash("sha256")
          .update(await readFile(archive))
          .digest("hex"),
        consumerDirectory: project,
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Installed-package checks pass. Artifacts: ${output}`);
} catch (error) {
  await mkdir(output, { recursive: true });
  await writeFile(
    resolve(output, "package-verification.json"),
    JSON.stringify(
      {
        status: "failed",
        consumerDirectory: project,
        checks,
        error: String(error),
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
}
