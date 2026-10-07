import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadProgram } from "../../tools/still-shift-cli/src/composition/program.ts";
import { portableComposition } from "../../tools/still-shift-cli/src/composition/files.ts";
const directories: string[] = [];
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "composition-program-"));
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
const empty = {
  schemaVersion: "composition-1",
  id: "native",
  width: 64,
  height: 64,
  fps: 24,
  frameCount: 24,
  layers: [],
  assets: [],
};
it("resolves and relocates both sequence pattern and manifest bindings", async () => {
  const root = await directory();
  const input = join(root, "sequence.json");
  await writeFile(
    input,
    JSON.stringify({
      ...empty,
      assets: [
        {
          id: "clip",
          type: "sequence",
          path: "frame_%02d.png",
          manifestPath: "manifest.json",
          firstFrame: 11,
          width: 32,
          height: 16,
          frameCount: 12,
          frameRate: { numerator: 12, denominator: 1 },
          sha256: `sha256:${"0".repeat(64)}`,
          color: {
            primaries: "bt709",
            transfer: "iec61966-2-1",
            matrix: "gbr",
            range: "pc",
          },
        },
      ],
    }),
  );
  const loaded = await loadProgram(input);
  expect(loaded.composition.assets[0]).toMatchObject({
    path: join(await realpath(root), "frame_%02d.png"),
    manifestPath: join(await realpath(root), "manifest.json"),
  });
  expect(
    portableComposition(
      loaded.composition,
      join(await realpath(root), "output"),
    ).assets[0],
  ).toMatchObject({
    path: "../frame_%02d.png",
    manifestPath: "../manifest.json",
    firstFrame: 11,
  });
});
it("loads JSON with native diagnostics and absolute asset paths", async () => {
  const root = await directory(),
    input = join(root, "input.json");
  await writeFile(
    input,
    JSON.stringify({
      ...empty,
      assets: [
        {
          id: "art",
          type: "image",
          width: 8,
          height: 8,
          path: "art.svg",
          sha256: `sha256:${"0".repeat(64)}`,
        },
      ],
    }),
  );
  const loaded = await loadProgram(input);
  expect(loaded.composition.assets[0]!.path).toBe(
    join(await realpath(root), "art.svg"),
  );
  expect(loaded.source).toBe("json");
  await writeFile(input, "invalid");
  await expect(loadProgram(input)).rejects.toMatchObject({
    diagnostics: [
      {
        code: "comp-program-json",
        severity: "error",
        path: await realpath(input),
        message: expect.any(String),
      },
    ],
  });
  await writeFile(input, JSON.stringify({ ...empty, fps: 13 }));
  await expect(loadProgram(input)).rejects.toMatchObject({
    diagnostics: [
      expect.objectContaining({ code: "comp-schema-union", path: "fps" }),
    ],
  });
});
it("rebuilds imported helpers in a fresh process and supports standalone async TypeScript", async () => {
  const root = await directory(),
    input = join(root, "entry.ts"),
    helper = join(root, "helper.ts");
  await writeFile(helper, "export const x=17;");
  await writeFile(
    input,
    `import {comp,solid} from '@still-shift/motion'; import {x} from './helper.ts'; await Promise.resolve(); console.log('author output'); export default comp({width:64,height:64,fps:24,frames:24},c=>{c.add(solid('box',{size:[8,8],color:'#223344'}).at(x,20));});`,
  );
  const first = await loadProgram(input);
  expect(first.source).toBe("builder");
  expect(first.dependencies).toContain(await realpath(helper));
  expect(first.composition.layers[0]!.transform!.position).toEqual([17, 20]);
  await writeFile(helper, "export const x=29;");
  expect(
    (await loadProgram(input)).composition.layers[0]!.transform!.position,
  ).toEqual([29, 20]);
  await writeFile(helper, "export const x=NaN;");
  await expect(loadProgram(input)).rejects.toMatchObject({
    diagnostics: [
      expect.objectContaining({
        code: "comp-schema-type",
        path: expect.stringContaining("entry.ts:"),
      }),
    ],
  });
});
it("loads Node assets and traces JSON data dependencies without mixing console output with JSON", async () => {
  const root = await directory(),
    input = join(root, "entry.ts"),
    art = join(root, "art.svg"),
    data = join(root, "data.json");
  await writeFile(
    art,
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="12"/>',
  );
  await writeFile(data, JSON.stringify({ x: 4 }));
  await writeFile(
    input,
    `import {comp,image} from '@still-shift/motion';import {imageAsset} from '@still-shift/motion/node';import data from './data.json' with {type:'json'};const asset=await imageAsset('art','./art.svg',{relativeTo:import.meta.url});export default comp({width:64,height:64,fps:24,frames:24},c=>c.add(image('drawing',asset).at(data.x,8)));`,
  );
  const loaded = await loadProgram(input);
  expect(loaded.dependencies).toContain(await realpath(data));
  expect(loaded.composition.assets[0]).toMatchObject({
    width: 8,
    height: 12,
    path: await realpath(art),
  });
  expect((await readFile(art, "utf8")).length).toBeGreaterThan(0);
});
it("reports missing exports and program exceptions as structured diagnostics", async () => {
  const root = await directory(),
    input = join(root, "entry.ts");
  await writeFile(input, "export const value=1;");
  await expect(loadProgram(input)).rejects.toMatchObject({
    diagnostics: [expect.objectContaining({ code: "comp-program-load" })],
  });
  await writeFile(
    input,
    "throw new Error('authored failure');export default {};",
  );
  await expect(loadProgram(input)).rejects.toMatchObject({
    diagnostics: [expect.objectContaining({ message: "authored failure" })],
  });
});
it("bounds console output and runtime and retains dependencies on failed reloads", async () => {
  const root = await directory(),
    input = join(root, "entry.ts"),
    missing = join(root, "missing.ts");
  await writeFile(input, "console.log('x'.repeat(4096));export default {};");
  await expect(
    loadProgram(input, { maxOutputBytes: 1024 }),
  ).rejects.toMatchObject({
    diagnostics: [expect.objectContaining({ code: "comp-program-output" })],
  });
  await writeFile(
    input,
    "setInterval(()=>{},10);await new Promise(()=>{});export default {};",
  );
  await expect(loadProgram(input, { timeoutMs: 500 })).rejects.toMatchObject({
    diagnostics: [expect.objectContaining({ code: "comp-program-timeout" })],
  });
  await writeFile(
    input,
    "import {value} from './missing.ts';export default value;",
  );
  await expect(loadProgram(input)).rejects.toMatchObject({
    dependencies: expect.arrayContaining([
      expect.stringMatching(/missing\.ts$/),
    ]),
  });
  expect(missing).toContain("missing.ts");
});
it("cancels a running rebuild and closes the child before cleaning temporary output", async () => {
  const root = await directory(),
    input = join(root, "entry.ts");
  await writeFile(
    input,
    "setInterval(()=>{},10);await new Promise(()=>{});export default {};",
  );
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 500);
  try {
    await expect(
      loadProgram(input, { signal: controller.signal }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "comp-program-aborted" })],
    });
  } finally {
    clearTimeout(timer);
  }
});
