import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { loadProgram } from "../../tools/still-shift-cli/src/composition/program.ts";
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
  expect(JSON.parse(stdout.stdout).assets[0].path).toBe("art.svg");
  const output = join(folder, "comp.json");
  expect(
    (await run(["export-json", "--input", input, "--output", output])).code,
  ).toBe(0);
  const exported = JSON.parse(await readFile(output, "utf8"));
  expect(resolve(folder, exported.assets[0].path)).toBe(art);
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
