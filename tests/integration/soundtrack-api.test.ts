import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  symlink,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeAll, afterAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { soundtrackApi } from "../../apps/lab/soundtrack-api.ts";
import {
  saveSoundtrackEdits,
  soundtrackChecksum,
} from "@still-shift/animation-engine";
import type { SoundtrackProject } from "@still-shift/scene-contract";
let root: string,
  server: ViteDevServer,
  origin: string,
  project: SoundtrackProject;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "ce16-api-"));
  const wave = Buffer.alloc(44 + 4800 * 4);
  wave.write("RIFF");
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(3, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(48000, 24);
  wave.writeUInt32LE(192000, 28);
  wave.writeUInt16LE(4, 32);
  wave.writeUInt16LE(32, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(4800 * 4, 40);
  for (let i = 0; i < 4800; i++)
    wave.writeFloatLE(i === 100 ? 0.8 : 0, 44 + i * 4);
  await writeFile(join(root, "source.wav"), wave);
  project = {
    schemaVersion: "soundtrack-project-1",
    revision: 0,
    history: { undo: [], redo: [] },
    sampleRate: 48000,
    channels: 2,
    durationSamples: 4800,
    channelConversion: "mono-duplicate-stereo-preserve",
    normalization: "none",
    tailPolicy: "retain-to-project-end",
    assets: [
      {
        id: "source",
        path: "source.wav",
        sha256: await soundtrackChecksum(join(root, "source.wav")),
      },
    ],
    clips: [
      {
        id: "cue",
        asset: "source",
        track: "effect",
        sourceStartSample: 0,
        sourceEndSample: 4800,
        startSample: 0,
        gainDb: 0,
        fadeInSamples: 0,
        fadeOutSamples: 0,
        automation: { interpolation: "linear", points: [] },
      },
    ],
    tracks: [
      {
        id: "effect",
        role: "sfx",
        output: "master",
        gainDb: 0,
        mute: false,
        solo: false,
        processors: [],
      },
    ],
    buses: [],
    master: { id: "master", gainDb: 0 },
  };
  await writeFile(join(root, "project.json"), JSON.stringify(project));
  server = await createServer({
    configFile: false,
    root,
    plugins: [soundtrackApi(root)],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("Missing server port");
  origin = "http://127.0.0.1:" + address.port;
});
afterAll(async () => {
  await server?.close();
  if (root) await rm(root, { recursive: true, force: true });
});
const post = (path: string, body: unknown, from = origin) =>
  fetch(origin + "/soundtrack-api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: from },
    body: JSON.stringify(body),
  });
it("API and CLI persistence share revisions and refuse stale edits", async () => {
  const loaded = await fetch(
    origin + "/soundtrack-api/project?path=project.json",
  );
  expect((await loaded.json()).project).toEqual(project);
  const edited = await post("edit", {
    project: "project.json",
    revision: 0,
    operations: [{ type: "gain", target: "cue", gainDb: -6 }],
  });
  expect(edited.status).toBe(200);
  expect((await edited.json()).project.revision).toBe(1);
  const stale = await post("edit", {
    project: "project.json",
    revision: 0,
    operations: [{ type: "mute", track: "effect", value: true }],
  });
  expect(stale.status).toBe(409);
  await expect(
    saveSoundtrackEdits(join(root, "project.json"), 0, [{ type: "undo" }]),
  ).rejects.toMatchObject({ code: "revision-conflict" });
  await saveSoundtrackEdits(join(root, "project.json"), 1, [{ type: "undo" }]);
});
it("serves exact rendered PCM for this saved revision and rejects different-project/stale previews", async () => {
  const rendered = await post("render", {
    project: "project.json",
    revision: 2,
  });
  expect(rendered.status).toBe(200);
  const result = await rendered.json();
  const query =
    "/soundtrack-api/audio?project=project.json&output=" +
    encodeURIComponent(result.output);
  const preview = await fetch(origin + query);
  expect(preview.status).toBe(200);
  expect(Buffer.from(await preview.arrayBuffer())).toEqual(
    await readFile(join(root, result.output, "audio/mix.wav")),
  );
  await writeFile(
    join(root, "different.json"),
    JSON.stringify({
      ...project,
      revision: 2,
      master: { id: "master", gainDb: -6 },
      history: JSON.parse(await readFile(join(root, "project.json"), "utf8"))
        .history,
    }),
  );
  const wrong = await fetch(
    origin + query.replace("project=project.json", "project=different.json"),
  );
  expect(wrong.status).toBe(409);
  await saveSoundtrackEdits(join(root, "project.json"), 2, [
    { type: "mute", track: "effect", value: true },
  ]);
  expect((await fetch(origin + query)).status).toBe(409);
}, 10000);
it("blocks cross-origin writes, traversal, symlinks and malformed bodies", async () => {
  expect(
    (
      await post(
        "edit",
        {
          project: "project.json",
          revision: 3,
          operations: [{ type: "undo" }],
        },
        "https://example.com",
      )
    ).status,
  ).toBe(400);
  expect(
    (await fetch(origin + "/soundtrack-api/project?path=../../etc/passwd"))
      .status,
  ).toBe(400);
  await symlink("/etc/passwd", join(root, "escape.json"));
  expect(
    (await fetch(origin + "/soundtrack-api/project?path=escape.json")).status,
  ).toBe(400);
  expect(
    (
      await post("edit", {
        project: "project.json",
        revision: 3,
        operations: [{ type: "replace-assets" }],
        unknown: true,
      })
    ).status,
  ).toBe(400);
  await mkdir(join(root, "not-render"));
  expect(
    (
      await fetch(
        origin + "/soundtrack-api/audio?project=project.json&output=not-render",
      )
    ).status,
  ).toBe(400);
});
it("keeps only the newest preview per project and drops all of them after an edit", async () => {
  const render = async () => {
    const response = await post("render", {
      project: "project.json",
      revision: 3,
    });
    expect(response.status).toBe(200);
    return (await response.json()).output as string;
  };
  const audio = (output: string) =>
    fetch(
      origin +
        "/soundtrack-api/audio?project=project.json&output=" +
        encodeURIComponent(output),
    );
  const first = await render(),
    directory = join(root, dirname(first));
  // Another render's unpublished stage and lock are never pruned.
  const stage =
    "01234567-89ab-cdef-0123-456789abcdef.89abcdef-0123-4567-89ab-cdef01234567.tmp";
  await mkdir(join(directory, stage));
  await writeFile(join(directory, "other.lock"), "{}");
  const second = await render();
  expect((await readdir(directory)).sort()).toEqual(
    [second.split("/").at(-1)!, stage, "other.lock"].sort(),
  );
  expect((await audio(first)).status).toBe(409);
  expect((await audio(second)).status).toBe(200);
  const edited = await post("edit", {
    project: "project.json",
    revision: 3,
    operations: [{ type: "mute", track: "effect", value: false }],
  });
  expect(edited.status).toBe(200);
  expect((await readdir(directory)).sort()).toEqual(
    [stage, "other.lock"].sort(),
  );
  expect((await audio(second)).status).toBe(409);
}, 20000);
