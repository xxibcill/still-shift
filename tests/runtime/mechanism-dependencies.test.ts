import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  readdir,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { MechanismEpisode } from "@still-shift/scene-contract";
import {
  mechanismDependencyReport,
  mechanismHash,
  readMechanismEpisode,
} from "../../packages/animation-engine/src/mechanism/io.ts";
import { createTapeHookProject } from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import { mediaFloat32Wave } from "../helpers/composition-media-audio.ts";
import { readFontIdentity } from "../../packages/renderer-core/src/font-identity.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "mechanism-supported-deps-"));
  roots.push(root);
  const path = (
    await createTapeHookProject({
      outputDirectory: join(root, "project"),
      fontPath: resolve("assets/story-motion/fonts/plex-sans-semibold.ttf"),
      fontLicensePath: resolve("assets/story-motion/fonts/plex-LICENSE.txt"),
    })
  ).path;
  const episode = JSON.parse(await readFile(path, "utf8")) as MechanismEpisode;
  return { root, path, episode };
}
async function replaceDependency(
  path: string,
  episode: MechanismEpisode,
  id: string,
  bytes: Uint8Array | string,
) {
  const dependency = episode.dependencies.find(
    (dependency) => dependency.id === id,
  )!;
  await writeFile(resolve(dirname(path), dependency.path), bytes);
  dependency.sha256 = mechanismHash(bytes);
}
async function save(path: string, episode: MechanismEpisode) {
  await writeFile(path, JSON.stringify(episode));
}
async function snapshot(root: string): Promise<unknown[]> {
  const files: unknown[] = [];
  async function visit(directory: string) {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else {
        const info = await stat(path);
        files.push([
          path,
          mechanismHash(await readFile(path)),
          info.size,
          info.mtimeMs,
        ]);
      }
    }
  }
  await visit(root);
  return files;
}
async function addAudio(path: string, episode: MechanismEpisode, rate: number) {
  const bytes = mediaFloat32Wave(
    4800,
    1,
    (sample) => Math.sin(sample / 40) * 0.1,
    rate,
  ).wav;
  await writeFile(join(dirname(path), "assets", "voice.wav"), bytes);
  episode.audio = "voice";
  episode.dependencies.push({
    id: "voice",
    type: "audio",
    path: "assets/voice.wav",
    sha256: mechanismHash(bytes),
  });
}

it("rejects a matching-hash unsupported scene version in the read-only dependency dry run and loader", async () => {
  const { root, path, episode } = await fixture();
  const scene = JSON.parse(
    await readFile(join(dirname(path), "scene.json"), "utf8"),
  );
  scene.schemaVersion = "mechanism-scene-99";
  await replaceDependency(path, episode, episode.scene, JSON.stringify(scene));
  await save(path, episode);
  const before = await snapshot(root);
  const report = await mechanismDependencyReport(path);
  expect(report.valid).toBe(false);
  expect(report.findings).toContainEqual(
    expect.objectContaining({
      code: "mechanism-scene-version",
      path: expect.stringContaining("#/schemaVersion"),
      message: expect.stringContaining("mechanism-scene-99"),
    }),
  );
  expect(
    report.dependencies.find((dependency) => dependency.id === episode.scene)
      ?.valid,
  ).toBe(false);
  await expect(readMechanismEpisode(path)).rejects.toMatchObject({
    context: {
      diagnosticCode: "mechanism-scene-version",
      diagnosticsJson: expect.stringContaining("mechanism-scene-99"),
    },
  });
  expect(await snapshot(root)).toEqual(before);
});

it("retains every independent matching-hash capability fault alongside missing and hash failures without writing", async () => {
  const { root, path, episode } = await fixture();
  const scene = JSON.parse(
    await readFile(join(dirname(path), "scene.json"), "utf8"),
  );
  scene.schemaVersion = "mechanism-scene-99";
  await replaceDependency(path, episode, episode.scene, JSON.stringify(scene));
  await replaceDependency(path, episode, episode.font, "not an SFNT font");
  await addAudio(path, episode, 44100);
  await writeFile(
    join(dirname(path), "assets", "plex-LICENSE.txt"),
    "wrong declared bytes",
  );
  episode.dependencies.push({
    id: "missing",
    type: "timing",
    path: "assets/missing.json",
    sha256: "sha256:" + "a".repeat(64),
  });
  await save(path, episode);
  const before = await snapshot(root);
  const report = await mechanismDependencyReport(path);
  expect(report.valid).toBe(false);
  expect(report.findings.map((finding) => finding.code).sort()).toEqual(
    [
      "mechanism-scene-version",
      "font-metadata",
      "mechanism-audio-clock",
      "mechanism-dependency-hash",
      "mechanism-dependency-missing",
    ].sort(),
  );
  expect(report.findings.every((finding) => finding.path.length > 0)).toBe(
    true,
  );
  expect(await snapshot(root)).toEqual(before);
});

it("uses actual pinned font cut, exact-copy coverage and explicit axes in both dry run and load", async () => {
  const { path, episode } = await fixture();
  const font = episode.dependencies.find(
    (dependency) => dependency.id === episode.font,
  )!;
  if (font.type !== "font") throw new Error("fixture");
  font.weight = "400";
  episode.shots[1]!.labels[0]!.text = "ภาษาไทย";
  await save(path, episode);
  const report = await mechanismDependencyReport(path);
  expect(report.findings.map((finding) => finding.code)).toEqual(
    expect.arrayContaining(["font-cut-identity", "font-coverage"]),
  );
  await expect(readMechanismEpisode(path)).rejects.toMatchObject({
    context: {
      diagnosticsJson: expect.stringContaining("font-coverage"),
    },
  });
  font.profile = "legacy";
  await save(path, episode);
  const legacy = await mechanismDependencyReport(path);
  expect(legacy.valid).toBe(true);
  expect(legacy.fontDiagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "font-cut-identity",
        severity: "warning",
      }),
      expect.objectContaining({
        code: "font-coverage",
        severity: "warning",
      }),
    ]),
  );
  expect((await readMechanismEpisode(path)).fontDiagnostics).toEqual(
    legacy.fontDiagnostics,
  );
  const bytes = await readFile(
    resolve("assets/ecommerce-motion/fonts/noto-sans-thai.ttf"),
  );
  const identity = readFontIdentity(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  await replaceDependency(path, episode, episode.font, bytes);
  Object.assign(font, {
    weight: String(identity.weight),
    family: identity.family,
    subfamily: identity.subfamily,
    postscriptName: identity.postscriptName,
    style: identity.style,
    profile: "strict",
    axes: { wght: 600, wdth: 75 },
  });
  await save(path, episode);
  expect((await mechanismDependencyReport(path)).valid).toBe(true);
  expect((await readMechanismEpisode(path)).fontAxes?.[font.id]).toEqual(
    identity.axes,
  );
  font.axes = { wght: 901 };
  await save(path, episode);
  expect((await mechanismDependencyReport(path)).findings).toContainEqual(
    expect.objectContaining({ code: "font-axis-range" }),
  );
});

it("reports matching-hash geometry and all independent anchor references with exact locations", async () => {
  const { path, episode } = await fixture();
  const scene = JSON.parse(
    await readFile(join(dirname(path), "scene.json"), "utf8"),
  );
  scene.geometrySha256 = "sha256:" + "a".repeat(64);
  await replaceDependency(path, episode, episode.scene, JSON.stringify(scene));
  episode.shots[1]!.labels[0]!.anchor = "missing.anchor";
  episode.shots[1]!.labels[0]!.proofTarget = "missing.proof";
  await save(path, episode);
  const report = await mechanismDependencyReport(path);
  expect(report.findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "mechanism-geometry-hash",
        path: expect.stringContaining("#/geometrySha256"),
      }),
      expect.objectContaining({
        code: "mechanism-anchor-reference",
        path: "shots.V8-02.labels.label-pull.anchor",
      }),
      expect.objectContaining({
        code: "mechanism-anchor-reference",
        path: "shots.V8-02.labels.label-pull.proofTarget",
      }),
    ]),
  );
});

it("reuses supported exact PCM metadata and actual scene/font preparation while preserving every source byte", async () => {
  const { root, path, episode } = await fixture();
  await addAudio(path, episode, 48000);
  await save(path, episode);
  const before = await snapshot(root);
  const report = await mechanismDependencyReport(path);
  expect(report.valid).toBe(true);
  const loaded = await readMechanismEpisode(path);
  expect(loaded.audioMetadata).toEqual({
    sampleRate: 48000,
    sampleCount: 4800,
    channels: 1,
  });
  expect(loaded.fontDiagnostics).toEqual([]);
  expect(loaded.scene.schemaVersion).toBe("mechanism-scene-1");
  expect(await snapshot(root)).toEqual(before);
});
