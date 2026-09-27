import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, rename, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  readStoryPassage,
  writePreparedPassage,
} from "../../packages/animation-engine/src/story-passage-io.ts";
import { writeStoryWorkspace } from "../../packages/animation-engine/src/story-workspace.ts";
import { renderStoryPassage } from "../../packages/animation-engine/src/story-passage-render.ts";

const run = promisify(execFile),
  output = resolve("benchmarks/results/reusable-components"),
  temp = await mkdtemp(join(tmpdir(), "shared-component-package-"));
await mkdir(output, { recursive: true });
try {
  const source = await readStoryPassage(
    resolve(
      "benchmarks/fixtures/reusable-components/story-components.passage.json",
    ),
  );
  const directory = join(temp, "source");
  await writePreparedPassage(directory, source);
  const original = await renderStoryPassage(directory, source, undefined, {
    cacheDirectory: join(temp, "source-cache"),
  });
  await writeStoryWorkspace(join(temp, "package"), source);
  await rename(join(temp, "package"), join(temp, "relocated"));
  const restored = await readStoryPassage(
    join(temp, "relocated/workspace.json"),
  );
  const moved = join(temp, "fresh-relocated");
  await writePreparedPassage(moved, restored);
  const rendered = await renderStoryPassage(moved, restored, undefined, {
    cacheDirectory: join(temp, "fresh-cache"),
  });
  assert.equal(original.frameCount, 576);
  assert.equal(rendered.frameCount, 576);
  assert.equal(rendered.cache.filter((c) => c.reused).length, 0);
  const hash = async (video: string) =>
    (
      await run("ffmpeg", [
        "-v",
        "error",
        "-i",
        video,
        "-map",
        "0:v",
        "-f",
        "hash",
        "-hash",
        "sha256",
        "-",
      ])
    ).stdout.trim();
  const before = await hash(original.video.path),
    after = await hash(rendered.video.path);
  assert.equal(after, before);
  await writeFile(
    join(output, "package-verification.json"),
    JSON.stringify(
      {
        frameCount: 576,
        beats: 3,
        freshRelocatedCacheReuses: 0,
        decodedHash: before,
        relocatedDecodedHash: after,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Shared component package: 576 frames match exactly after relocation and fresh rendering.",
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
