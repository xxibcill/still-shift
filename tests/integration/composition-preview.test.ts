import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";
const directories: string[] = [],
  sessions: Awaited<ReturnType<typeof createProgramPreview>>[] = [];
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "composition-preview-"));
  directories.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
it("serves immutable asset snapshots, keeps the last valid rebuild and watches helper/asset edits", async () => {
  const root = await directory(),
    extra = await directory(),
    input = join(root, "program.ts"),
    helper = join(extra, "helper.ts"),
    art = join(root, "art.svg");
  const original =
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="12"><rect width="8" height="12" fill="red"/></svg>';
  await writeFile(art, original);
  await writeFile(helper, "export const x=4;");
  await writeFile(
    input,
    `import{comp,image}from'@still-shift/motion';import{imageAsset}from'@still-shift/motion/node';import{x}from${JSON.stringify(helper)};const asset=await imageAsset('art','./art.svg',{relativeTo:import.meta.url});export default comp({width:64,height:64,fps:24,frames:24},c=>c.add(image('drawing',asset).at(x,8)));`,
  );
  const session = await createProgramPreview(input, { watch: true });
  sessions.push(session);
  const base = new URL(session.url).origin;
  const first = session.snapshot()!;
  expect(first.composition.layers[0]!.transform!.position).toEqual([4, 8]);
  expect(await (await fetch(base + first.assets.art!)).text()).toBe(original);
  await writeFile(helper, "export const x=9;");
  await expect
    .poll(() => session.snapshot()?.revision, { timeout: 6000 })
    .toBeGreaterThan(first.revision);
  const next = session.snapshot()!;
  expect(next.composition.layers[0]!.transform!.position).toEqual([9, 8]);
  await writeFile(art, "invalid image");
  await expect
    .poll(
      async () =>
        (
          (await (await fetch(base + "/composition/program")).json()) as {
            diagnostics: unknown[];
          }
        ).diagnostics.length,
      { timeout: 6000 },
    )
    .toBeGreaterThan(0);
  expect(session.snapshot()!.revision).toBe(next.revision);
  expect(await (await fetch(base + next.assets.art!)).text()).toBe(original);
  const repaired = original.replace("red", "blue");
  await writeFile(art, repaired);
  await expect
    .poll(() => session.snapshot()?.revision, { timeout: 6000 })
    .toBeGreaterThan(next.revision);
  expect(
    await (await fetch(base + session.snapshot()!.assets.art!)).text(),
  ).toBe(repaired);
  expect(
    (
      await fetch(
        base + "/composition/program-asset?revision=1&id=../../AGENTS.md",
      )
    ).status,
  ).toBe(404);
  expect(
    (await fetch(base + "/composition/program-asset?revision=999&id=art"))
      .status,
  ).toBe(404);
});
it("recovers when an initially missing imported module is created", async () => {
  const root = await directory(),
    input = join(root, "program.ts"),
    helper = join(root, "missing.ts");
  await writeFile(
    input,
    `import{comp}from'@still-shift/motion';import{count}from'./missing.ts';export default comp({width:64,height:64,fps:24,frames:count},()=>{});`,
  );
  const session = await createProgramPreview(input, { watch: true });
  sessions.push(session);
  expect(session.snapshot()).toBeUndefined();
  await writeFile(helper, "export const count=24;");
  await expect
    .poll(() => session.snapshot()?.composition.frameCount, { timeout: 6000 })
    .toBe(24);
});
it("recovers when an initially missing builder image asset is created", async () => {
  const root = await directory(),
    input = join(root, "program.ts"),
    art = join(root, "missing.svg");
  await writeFile(
    input,
    `import{comp,image}from'@still-shift/motion';import{imageAsset}from'@still-shift/motion/node';const asset=await imageAsset('art','./missing.svg',{relativeTo:import.meta.url});export default comp({width:64,height:64,fps:24,frames:24},c=>c.add(image('drawing',asset)));`,
  );
  const session = await createProgramPreview(input, { watch: true });
  sessions.push(session);
  expect(session.snapshot()).toBeUndefined();
  await writeFile(
    art,
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="12"/>',
  );
  await expect
    .poll(() => session.snapshot()?.composition.assets[0]?.id, {
      timeout: 6000,
    })
    .toBe("art");
});
