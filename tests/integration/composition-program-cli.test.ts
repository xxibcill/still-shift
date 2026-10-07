import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { renderComposition } from "@still-shift/animation-engine";
import { loadProgram } from "../../tools/still-shift-cli/src/composition/program.ts";
import { comp, image } from "@still-shift/motion";
import type { Composition } from "@still-shift/scene-contract";
import { imageAsset } from "@still-shift/motion/node";
const directories: string[] = [];
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "composition-cli-"));
  directories.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function run(args: string[]) {
  let stdout = "",
    stderr = "";
  const code = await runCli(["comp", ...args], {
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  return { code, stdout, stderr };
}
const program = `import{comp,solid,expr}from'@still-shift/motion';console.log('author console');export default comp({width:64,height:64,fps:24,frames:24},c=>{const n=c.add(solid('box',{size:[8,8],color:'#223344'}));c.expression(n.path('transform.rotation'),expr\`frame * 2\`);});`;
it("exports cinematic recipes as inspectable native camera/plane JSON with relocated assets", async () => {
  const root = await directory(),
    output = join(root, "cinematic.json");
  const fixture = resolve(
    "benchmarks/fixtures/cinematic-illustrated/ci-08-dolly-zoom-tension.json",
  );
  const source = JSON.parse(await readFile(fixture, "utf8"));
  const result = await run([
    "export-json",
    "--scene",
    fixture,
    "--output",
    output,
  ]);
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  const doc = JSON.parse(await readFile(output, "utf8")) as Composition;
  const cameras = doc.layers.filter((layer) => layer.type === "camera");
  expect(cameras).toHaveLength(1);
  expect(cameras[0]).toMatchObject({
    type: "camera",
    zoom: { keys: expect.any(Array) },
  });
  const artwork = doc.layers.filter((layer) => layer.type !== "camera");
  expect(artwork).toHaveLength(source.nodes.length);
  expect(artwork.every((layer) => layer.type === "image" && layer.threeD)).toBe(
    true,
  );
  expect(
    (doc.metadata!.nativeCameraValidation as { checkedFrames: number })
      .checkedFrames,
  ).toBe(doc.frameCount);
  expect(resolve(root, doc.assets[0]!.path)).toBe(
    await realpath(resolve(dirname(fixture), source.assets[0].path)),
  );
});
it("preserves render usage and scene exit codes while unreadable input remains a runtime failure", async () => {
  const result = await run([
    "render",
    "--input",
    "unused.json",
    "--output",
    "unused.mp4",
    "--backend",
    "invalid",
  ]);
  expect(result.code).toBe(2);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr)).toMatchObject({
    status: "failed",
    diagnostics: [
      {
        code: "comp-program-option",
        path: "backend",
        message: "Composition backend must be canvas2d or webgl2",
      },
    ],
  });
  const root = await directory(),
    input = join(root, "invalid.json"),
    output = join(root, "unused.mp4");
  await writeFile(input, "invalid JSON");
  expect(
    (await run(["render", "--input", input, "--output", output])).code,
  ).toBe(2);
  await writeFile(input, "{}");
  expect(
    (await run(["render", "--input", input, "--output", output])).code,
  ).toBe(2);
  expect(
    (
      await run([
        "render",
        "--input",
        join(root, "missing.json"),
        "--output",
        output,
      ])
    ).code,
  ).toBe(1);
  const script = join(root, "missing-import.ts");
  await writeFile(script, "import './absent.ts';");
  expect(
    (await run(["render", "--input", script, "--output", output])).code,
  ).toBe(1);
});
it.each([
  ["workers", "0"],
  ["workers", "5"],
  ["workers", "1.5"],
  ["workers", "01"],
  ["workers", "NaN"],
  ["cache-static", "yes"],
  ["cache-static", "1"],
])(
  "rejects invalid --%s %s before reading a composition",
  async (option, value) => {
    const result = await run([
      "render",
      "--input",
      "missing.json",
      "--output",
      "unused.mp4",
      `--${option}`,
      value,
    ]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      status: "failed",
      diagnostics: [{ code: "comp-program-option", path: option }],
    });
  },
);
it.each([0, 5, 1.5, Number.NaN])(
  "rejects invalid public worker count %s before loading media",
  async (workers) => {
    await expect(
      renderComposition({
        compositionPath: "missing.json",
        outputPath: "unused.mp4",
        workers: workers as 1,
      }),
    ).rejects.toMatchObject({
      code: "SCENE_INVALID",
      message:
        "Composition workers must be 1..4 and cacheStatic must be boolean",
    });
  },
);
it("rejects a nonboolean cache option before loading media", async () => {
  await expect(
    renderComposition({
      compositionPath: "missing.json",
      outputPath: "unused.mp4",
      cacheStatic: "yes" as unknown as boolean,
    }),
  ).rejects.toMatchObject({ code: "SCENE_INVALID" });
});
it("validates, normalizes, bakes and lints a TypeScript program through public CLI commands", async () => {
  const root = await directory(),
    input = join(root, "program.ts");
  await writeFile(input, program);
  const valid = await run(["validate", "--input", input]);
  expect(valid.code).toBe(0);
  expect(JSON.parse(valid.stdout)).toMatchObject({
    status: "valid",
    source: "builder",
  });
  const normalized = await run(["normalize", "--input", input]);
  expect(normalized.code).toBe(0);
  expect(
    JSON.parse(normalized.stdout).expressions["box.transform.rotation"].ast,
  ).toBeDefined();
  const output = join(root, "baked.json"),
    baked = await run(["bake", "--input", input, "--output", output]);
  expect(baked.code).toBe(0);
  expect(
    JSON.parse(await readFile(output, "utf8")).expressions,
  ).toBeUndefined();
  expect((await run(["bake", "--input", input, "--output", output])).code).toBe(
    1,
  );
  const lint = await run(["lint", "--input", input]);
  expect(lint.code).toBe(0);
  expect(JSON.parse(lint.stdout).frameCount).toBe(24);
});
it("exports portable native JSON and verifies pinned image assets during validation", async () => {
  const root = await directory(),
    input = join(root, "program.ts"),
    art = join(root, "art.svg"),
    folder = join(root, "output");
  await mkdir(folder);
  await writeFile(
    art,
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="12"/>',
  );
  await writeFile(
    input,
    `import{comp,image}from'@still-shift/motion';import{imageAsset}from'@still-shift/motion/node';const art=await imageAsset('art','./art.svg',{relativeTo:import.meta.url});export default comp({width:64,height:64,fps:24,frames:24},c=>c.add(image('drawing',art)));`,
  );
  const stdout = await run(["export-json", "--input", input]);
  expect(stdout.code).toBe(0);
  expect(resolve(root, JSON.parse(stdout.stdout).assets[0].path)).toBe(
    await realpath(art),
  );
  const output = join(folder, "comp.json");
  expect(
    (await run(["export-json", "--input", input, "--output", output])).code,
  ).toBe(0);
  const exported = JSON.parse(await readFile(output, "utf8"));
  expect(resolve(folder, exported.assets[0].path)).toBe(await realpath(art));
  expect((await run(["validate", "--input", output])).code).toBe(0);
  await writeFile(art, '<svg width="9" height="12"/>');
  const invalid = await run(["validate", "--input", output]);
  expect(invalid.code).toBe(1);
  expect(invalid.stderr).toContain("failed");
});
it("keeps native diagnostics, call sites, adapter compatibility and command errors", async () => {
  const root = await directory(),
    input = join(root, "program.ts");
  await writeFile(input, program.replace("color:'#223344'", "color:'invalid'"));
  const invalid = await run(["export-json", "--input", input]);
  expect(invalid.code).toBe(1);
  expect(JSON.parse(invalid.stderr).diagnostics[0]).toMatchObject({
    code: "comp-schema-format",
    path: expect.stringContaining("program.ts:"),
  });
  expect(
    (await run(["export-json", "--input", input, "--scene", input])).code,
  ).toBe(1);
  expect((await run(["unknown", "--input", input])).code).toBe(1);
  const unpinned = join(root, "unpinned.json");
  await writeFile(
    unpinned,
    JSON.stringify({
      schemaVersion: "composition-1",
      id: "native",
      width: 64,
      height: 64,
      fps: 24,
      frameCount: 24,
      assets: [],
      layers: [
        {
          id: "label",
          type: "text",
          text: "Hello",
          fontSize: 16,
          color: "#000000",
        },
      ],
    }),
  );
  await expect(loadProgram(unpinned)).rejects.toMatchObject({
    diagnostics: [expect.objectContaining({ code: "comp-text-system-font" })],
  });
});

it("resolves native JSON assets from the requested directory before canonicalizing paths", async () => {
  const root = await directory(),
    physical = join(root, "physical", "nested"),
    alias = join(root, "alias"),
    art = join(root, "art.svg");
  await mkdir(physical, { recursive: true });
  await symlink(physical, alias, "dir");
  await writeFile(art, '<svg width="8" height="12"/>');
  const asset = await imageAsset("art", art),
    composition = comp({ width: 64, height: 64, fps: 24, frames: 24 }, (c) =>
      c.add(image("drawing", asset)),
    );
  composition.assets[0]!.path = relative(alias, await realpath(art));
  const input = join(alias, "native.json");
  await writeFile(input, JSON.stringify(composition));
  const loaded = await loadProgram(input);
  expect(loaded.composition.assets[0]!.path).toBe(await realpath(art));
  expect(loaded.dependencies).toEqual([await realpath(input)]);
  expect((await run(["validate", "--input", input])).code).toBe(0);
  const output = join(alias, "exported.json");
  expect(
    (await run(["export-json", "--input", input, "--output", output])).code,
  ).toBe(0);
  expect((await run(["validate", "--input", output])).code).toBe(0);
  const exported = await run(["export-json", "--input", input]);
  expect(exported.code).toBe(0);
  expect(resolve(alias, JSON.parse(exported.stdout).assets[0].path)).toBe(
    await realpath(art),
  );
});
it("reports the legacy pinned-font checksum through an aliased scene directory", async () => {
  const root = await directory(),
    physical = join(root, "physical", "nested"),
    alias = join(root, "alias"),
    fixture = resolve("benchmarks/fixtures/ecommerce-motion/atoms/layout.json");
  await mkdir(physical, { recursive: true });
  await symlink(physical, alias, "dir");
  const scene = JSON.parse(await readFile(fixture, "utf8"));
  for (const asset of [...scene.assets, ...scene.fonts])
    asset.path = relative(
      alias,
      await realpath(resolve(dirname(fixture), asset.path)),
    );
  scene.fonts[0].sha256 = `sha256:${"0".repeat(64)}`;
  const input = join(alias, "legacy.json"),
    output = join(root, "unused.json");
  await writeFile(input, JSON.stringify(scene));
  const result = await run([
    "export-json",
    "--scene",
    input,
    "--output",
    output,
  ]);
  expect(result.code).toBe(1);
  expect(JSON.parse(result.stderr).diagnostics[0]).toMatchObject({
    code: "invalid-scene",
    message: expect.stringContaining("Font checksum differs"),
  });
  await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
});

it("validates explicit lint backend selection before reading a source", async () => {
  const result = await run([
    "lint",
    "--input",
    "unused.json",
    "--pixels",
    "true",
    "--backend",
    "invalid",
  ]);
  expect(result.code).toBe(1);
  expect(JSON.parse(result.stderr)).toMatchObject({
    diagnostics: [
      {
        code: "comp-program-option",
        path: "backend",
        message: "Composition backend must be canvas2d or webgl2",
      },
    ],
  });
});
