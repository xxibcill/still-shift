import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import type * as FileSystem from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { createTapeHookProject } from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import { renderMechanismEpisode } from "../../packages/animation-engine/src/mechanism/lifecycle.ts";

const mutation = vi.hoisted(() => ({
  outputDirectory: "",
  episodePath: "",
  changedBytes: undefined as Buffer | undefined,
  observed: false,
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof FileSystem>();
  return {
    ...fs,
    async writeFile(...args: Parameters<typeof fs.writeFile>) {
      const result = await fs.writeFile(...args);
      const path = typeof args[0] === "string" ? args[0] : "";
      if (
        mutation.changedBytes &&
        dirname(path) === mutation.outputDirectory &&
        path.endsWith(".result.tmp.json")
      ) {
        const changedBytes = mutation.changedBytes;
        mutation.changedBytes = undefined;
        // The real export has encoded and staged its result, but has not yet
        // revalidated source edges or published the movie/evidence bundle.
        await fs.writeFile(mutation.episodePath, changedBytes);
        mutation.observed = true;
      }
      return result;
    },
  };
});

it("rejects an episode edit after encoding and before native movie/evidence publication", async () => {
  const root = await mkdtemp(join(tmpdir(), "native-source-publication-"));
  const sourceDirectory = join(root, "source");
  const outputDirectory = join(root, "render");
  const episodePath = join(sourceDirectory, "episode.json");
  let originalEpisode: Buffer | undefined;
  try {
    await createTapeHookProject({
      outputDirectory: sourceDirectory,
      fontPath: resolve("assets/story-motion/fonts/plex-sans-semibold.ttf"),
    });
    const fixture = JSON.parse(await readFile(episodePath, "utf8"));
    fixture.output.width = 64;
    fixture.output.height = 64;
    fixture.output.frameCount = 2;
    fixture.shots = [
      {
        id: "publication-shot",
        purpose: "Native source publication fixture",
        startFrame: 0,
        endFrameExclusive: 2,
        controls: {},
        labels: [],
      },
    ];
    fixture.captions = [];
    fixture.events = [];
    originalEpisode = Buffer.from(`${JSON.stringify(fixture, null, 2)}\n`);
    await writeFile(episodePath, originalEpisode);
    mutation.outputDirectory = outputDirectory;
    mutation.episodePath = episodePath;
    mutation.changedBytes = Buffer.from(
      `${JSON.stringify(
        { ...fixture, revision: fixture.revision + 1 },
        null,
        2,
      )}\n`,
    );
    mutation.observed = false;
    await expect(
      renderMechanismEpisode(episodePath, {
        outputDirectory,
        route: "native3d",
      }),
    ).rejects.toThrow(/Saved episode changed after loading/);
    expect(mutation.observed).toBe(true);
    for (const name of [
      "episode.mp4",
      "episode.mp4.scene.json",
      "episode.mp4.result.json",
      "episode.result.json",
      "project.summary.json",
    ])
      await expect(stat(join(outputDirectory, name))).rejects.toMatchObject({
        code: "ENOENT",
      });
    expect(
      (await readdir(outputDirectory)).filter(
        (name) =>
          name.includes("native-observations") ||
          name.endsWith(".tmp.mp4") ||
          name.endsWith(".result.tmp.json") ||
          name.endsWith(".scene.tmp.json"),
      ),
    ).toEqual([]);
  } finally {
    mutation.outputDirectory = "";
    mutation.episodePath = "";
    mutation.changedBytes = undefined;
    mutation.observed = false;
    if (originalEpisode) await writeFile(episodePath, originalEpisode);
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
