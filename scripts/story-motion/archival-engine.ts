import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const archivalCanvasPatch = {
  path: "packages/renderer-core/src/illustrated-renderer.ts",
  before: "    ctx.transform(...nodeMatrix(node, state));",
  after: `    const ox = node.width * node.origin[0];
    const oy = node.height * node.origin[1];
    ctx.translate(state.x + ox, state.y + oy);
    ctx.rotate((state.rotation * Math.PI) / 180);
    ctx.scale(state.scaleX, state.scaleY);
    ctx.translate(-ox, -oy);`,
};

type ArchivalEngineOptions = {
  projectRoot: string;
  commit: string;
  tempPrefix: string;
  rendererPatch: { path: string; before: string; after: string };
};

export async function createIsolatedArchivalEngine({
  projectRoot,
  commit,
  tempPrefix,
  rendererPatch,
}: ArchivalEngineOptions): Promise<string> {
  const checkout = await mkdtemp(join(await realpath(tmpdir()), tempPrefix));
  try {
    const archive = join(checkout, "source.tar");
    await run("git", ["archive", commit, "-o", archive], {
      cwd: projectRoot,
    });
    await run("tar", ["-xf", archive, "-C", checkout]);
    await rm(archive);

    const sourceModules = join(projectRoot, "node_modules");
    const targetModules = join(checkout, "node_modules");
    await mkdir(targetModules);
    for (const entry of await readdir(sourceModules, { withFileTypes: true })) {
      if (
        entry.name.startsWith(".") ||
        entry.name === "@still-shift" ||
        entry.name === "three"
      )
        continue;
      await symlink(
        await realpath(join(sourceModules, entry.name)),
        join(targetModules, entry.name),
      );
    }
    await symlink(
      await realpath(
        join(projectRoot, "packages/renderer-core/node_modules/three"),
      ),
      join(targetModules, "three"),
    );
    const workspaceModules = join(targetModules, "@still-shift");
    await mkdir(workspaceModules);
    for (const name of [
      "execution-runtime",
      "renderer-core",
      "scene-contract",
      "animation-engine",
    ])
      await symlink(
        join(checkout, "packages", name),
        join(workspaceModules, name),
      );

    const file = join(checkout, rendererPatch.path);
    const source = await readFile(file, "utf8");
    assert.equal(
      source.split(rendererPatch.before).length,
      2,
      "Pinned renderer changed",
    );
    await writeFile(
      file,
      source.replace(rendererPatch.before, rendererPatch.after),
    );
    return checkout;
  } catch (error) {
    await rm(checkout, { recursive: true, force: true });
    throw error;
  }
}
