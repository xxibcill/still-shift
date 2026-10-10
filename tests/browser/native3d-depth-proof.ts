import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import { SolidSceneSchema } from "@still-shift/scene-contract";
import { canonicalMechanismJson } from "../../packages/renderer-core/src/mechanism/canonical.ts";
import { nativeSolidFixture } from "../helpers/native3d-fixture.ts";
import type { NativeDepthArtifact } from "../helpers/native3d-depth-reference.ts";
import type * as Reference from "../helpers/native3d-depth-reference.ts";

const sha256 = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export async function runNativeDepthProof() {
  const root = resolve(import.meta.dirname, "../..");
  const directory = await mkdtemp(
    "/private/tmp/still-shift-ms1n-native-depth-",
  );
  await mkdir(join(directory, "artifacts"));
  const seed = nativeSolidFixture();
  const geometry = {
    ...seed.geometry,
    meshes: [
      {
        ...seed.geometry.meshes[0]!,
        positions: [-2, -2, 0, 2, -2, 0, 2, 2, 0, -2, 2, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2, 0, 2, 3],
        bounds: { min: [-2, -2, 0], max: [2, 2, 0] },
      },
    ],
    materials: [
      {
        ...seed.geometry.materials[0]!,
        color: "#000000",
        emissive: "#00ff00",
        emissiveIntensity: 1,
      },
    ],
  };
  const inputs = [];
  for (const profile of [
    { transparent: true, background: "#000000" },
    { transparent: false, background: "#000000" },
    { transparent: false, background: "#ffffff" },
  ]) {
    const source = SolidSceneSchema.parse({
      ...seed,
      geometry,
      geometrySha256: "sha256:" + sha256(canonicalMechanismJson(geometry)),
      profile: { ...seed.profile, ...profile, environmentIntensity: 0 },
    });
    // Hash normalized schema geometry (defaults are part of the exact source).
    source.geometrySha256 =
      "sha256:" + sha256(canonicalMechanismJson(source.geometry));
    const bytes = JSON.stringify(source, null, 2) + "\n";
    const sourceSha256 = "sha256:" + sha256(bytes);
    inputs.push({ source, sourceSha256 });
    await writeFile(join(directory, `source-${inputs.length}.json`), bytes);
  }
  const sourcePaths = [
    "tests/helpers/native3d-depth-reference.ts",
    "packages/renderer-core/src/composition/render/webgl-native-depth.ts",
    "packages/renderer-core/src/native3d/three-world.ts",
    "packages/renderer-core/src/native3d/three-graphics.ts",
    "packages/renderer-core/src/native3d/three-observation.ts",
    "packages/renderer-core/src/native3d/resolve.ts",
    "packages/renderer-core/src/composition/render/webgl-native-state.ts",
  ];
  const sources = await Promise.all(
    sourcePaths.map(async (path) => ({
      path,
      sha256: sha256(await readFile(join(root, path))),
    })),
  );
  await writeFile(
    join(directory, "inputs.json"),
    JSON.stringify({ inputs, sources }, null, 2) + "\n",
  );
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "error",
    resolve: {
      alias: [
        {
          find: /^@still-shift\/scene-contract$/,
          replacement: join(root, "packages/scene-contract/src/index.ts"),
        },
      ],
    },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await launchRenderBrowser();
  const artifacts: unknown[] = [];
  try {
    const page = await browser.newPage();
    await page.addInitScript("window.__name=(fn)=>fn;");
    await page.exposeFunction(
      "__retainNativeDepth",
      async (artifact: NativeDepthArtifact) => {
        const { rgba, ...facts } = artifact;
        let pixelEvidence: unknown;
        if (rgba) {
          const bytes = new Uint8Array(rgba);
          await writeFile(
            join(directory, "artifacts", artifact.id + ".rgba"),
            bytes,
          );
          pixelEvidence = {
            path: `artifacts/${artifact.id}.rgba`,
            sha256: sha256(bytes),
            bytes: bytes.length,
          };
        }
        const receipt = {
          ...facts,
          ...(pixelEvidence ? { pixels: pixelEvidence } : {}),
        };
        await writeFile(
          join(directory, "artifacts", artifact.id + ".json"),
          JSON.stringify(receipt, null, 2) + "\n",
        );
        artifacts.push(receipt);
      },
    );
    await page.goto(server.resolvedUrls!.local[0]!);
    const environment = await probeRenderEnvironment(page);
    assertPinnedRenderEnvironment(environment);
    await writeFile(
      join(directory, "environment.json"),
      JSON.stringify(environment, null, 2) + "\n",
    );
    // The module import is in a real module script. No serialized evaluate callback
    // depends on a TypeScript dynamic-import rewrite helper outside its closure.
    await page.addScriptTag({
      type: "module",
      content:
        'import * as proof from "/tests/helpers/native3d-depth-reference.ts";globalThis.__nativeDepthProof=proof;',
    });
    await page.waitForFunction("Boolean(globalThis.__nativeDepthProof)");
    const report = await page.evaluate(async (inputs) => {
      const host = globalThis as typeof globalThis & {
        __nativeDepthProof: typeof Reference;
        __retainNativeDepth: (artifact: NativeDepthArtifact) => Promise<void>;
      };
      return host.__nativeDepthProof.checkNativeDepthReference(
        inputs,
        host.__retainNativeDepth,
      );
    }, inputs);
    assert.equal(report.cases.length, 14);
    await writeFile(
      join(directory, "report.json"),
      JSON.stringify(
        { status: "passed", ...report, sources, artifacts },
        null,
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify({
        directory,
        status: "passed",
        cases: report.cases.length,
        reportSha256: sha256(await readFile(join(directory, "report.json"))),
      }),
    );
    return { directory, report };
  } catch (error) {
    await writeFile(
      join(directory, "failed.json"),
      JSON.stringify(
        {
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
          sources,
          artifacts,
        },
        null,
        2,
      ) + "\n",
    );
    console.error(`Native depth failure retained at ${directory}`);
    throw error;
  } finally {
    await browser.close();
    await server.close();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
)
  await runNativeDepthProof();
