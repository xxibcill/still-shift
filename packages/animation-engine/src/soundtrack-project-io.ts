import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import {
  validateSoundtrackProject,
  soundtrackFail,
  type SoundtrackProject,
} from "@still-shift/scene-contract";
import {
  editSoundtrackProject,
  resolveSoundtrackAnchors,
  type SoundtrackTiming,
} from "@still-shift/renderer-core/soundtrack";

export async function soundtrackChecksum(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return "sha256:" + hash.digest("hex");
}
export async function readSoundtrackProject(path: string) {
  const file = await lstat(path);
  if (!file.isFile())
    soundtrackFail("project-file", "Use a regular project JSON file");
  if (file.size > 8_000_000)
    soundtrackFail("project-size", "Project JSON exceeds 8 MB");
  return validateSoundtrackProject(JSON.parse(await readFile(path, "utf8")));
}
export async function verifySoundtrackSources(
  project: SoundtrackProject,
  projectPath: string,
) {
  const paths = new Map<string, string>();
  for (const asset of project.assets) {
    const path = resolve(dirname(projectPath), asset.path);
    const stat = await lstat(path).catch(() =>
      soundtrackFail(
        "source-missing",
        "Restore or relocate the missing source",
        { asset: asset.id, path },
      ),
    );
    if (!stat.isFile() || stat.size > 1_000_000_000)
      soundtrackFail(
        "source-size",
        "Sources must be regular files no larger than 1 GB",
        { asset: asset.id },
      );
    if ((await soundtrackChecksum(path)) !== asset.sha256)
      soundtrackFail(
        "source-checksum",
        "Restore source bytes or author a new asset identity",
        { asset: asset.id, path },
      );
    paths.set(asset.id, path);
  }
  return paths;
}
export async function updateSoundtrackProject(
  path: string,
  expectedRevision: number,
  change: (project: SoundtrackProject) => SoundtrackProject,
) {
  const actual = await realpath(path);
  const release = await acquireArtifactLock(actual + ".lock", dirname(actual));
  const temporary = actual + "." + randomUUID() + ".tmp";
  try {
    const previous = await readSoundtrackProject(actual);
    if (previous.revision !== expectedRevision)
      soundtrackFail(
        "revision-conflict",
        "Reload the saved project before retrying this edit",
        { expected: expectedRevision, actual: previous.revision },
      );
    const next = validateSoundtrackProject(change(previous));
    if (next.revision !== previous.revision + 1)
      soundtrackFail(
        "revision-step",
        "A save must advance the revision exactly once",
      );
    await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", {
      flag: "wx",
    });
    await rename(temporary, actual);
    return next;
  } finally {
    await rm(temporary, { force: true });
    await release();
  }
}
export const saveSoundtrackEdits = (
  path: string,
  revision: number,
  operations: unknown,
) =>
  updateSoundtrackProject(path, revision, (project) =>
    editSoundtrackProject(project, operations),
  );
export const retimeSoundtrackProject = (
  path: string,
  revision: number,
  timing: SoundtrackTiming,
) =>
  updateSoundtrackProject(path, revision, (project) => {
    const resolved = resolveSoundtrackAnchors(project, timing, true);
    return editSoundtrackProject(
      project,
      resolved.clips
        .filter((c) => c.anchor)
        .map((c) => ({
          type: "move",
          clip: c.id,
          startSample: c.startSample,
          offsetSamples: c.anchor!.offsetSamples,
        })),
    );
  });
/** New portable copy only; hashes and authored clips survive relocation. */
export async function packageSoundtrackProject(
  projectPath: string,
  destination: string,
) {
  const project = await readSoundtrackProject(projectPath);
  await verifySoundtrackSources(project, projectPath);
  const target = resolve(destination),
    stage = target + "." + randomUUID() + ".tmp";
  if (
    await lstat(target).then(
      () => true,
      () => false,
    )
  )
    soundtrackFail("output-exists", "Use a fresh package destination");
  try {
    await mkdir(join(stage, "assets"), { recursive: true });
    const assetPaths = new Map<string, string>();
    for (const asset of project.assets) {
      const name = asset.sha256.slice(7) + "-" + basename(asset.path);
      await copyFile(
        resolve(dirname(projectPath), asset.path),
        join(stage, "assets", name),
      );
      assetPaths.set(asset.id, "assets/" + name);
    }
    for (const state of [
      project,
      ...project.history.undo,
      ...project.history.redo,
    ])
      for (const asset of state.assets) {
        if (
          !assetPaths.has(asset.id) ||
          asset.sha256 !== project.assets.find((a) => a.id === asset.id)?.sha256
        )
          soundtrackFail(
            "package-history",
            "History includes an unavailable asset; clear history in an explicitly authored copy",
          );
        asset.path = assetPaths.get(asset.id)!;
      }
    await verifySoundtrackSources(project, join(stage, "project.json"));
    await writeFile(
      join(stage, "project.json"),
      JSON.stringify(project, null, 2) + "\n",
      { flag: "wx" },
    );
    await rename(stage, target);
    return {
      project: join(target, "project.json"),
      revision: project.revision,
    };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
