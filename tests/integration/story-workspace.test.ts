import {
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  passageChecksum,
  prepareStoryPassageInput,
  readStoryPassage,
  type PreparedPassage,
} from "../../packages/animation-engine/src/story-passage-io.ts";
import { writeStoryWorkspace } from "../../packages/animation-engine/src/story-workspace.ts";
import { passageBeatKey } from "../../packages/animation-engine/src/passage-cache.ts";
import { templateScene } from "../../packages/renderer-core/src/story-template.ts";

describe("portable story workspaces", () => {
  let root: string;
  let passage: PreparedPassage;
  let sequence = 0;
  const packagePath = () => join(root, String(sequence++));
  const readJson = async (path: string) =>
    JSON.parse(await readFile(path, "utf8"));

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "still-shift-workspace-"));
    passage = await readStoryPassage(
      resolve("benchmarks/fixtures/story-authoring/linked-comparison.json"),
    );
  }, 30_000);
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("relocates all dependencies without changing evaluated scenes or cache identities", async () => {
    const source = packagePath();
    const original = JSON.stringify(passage);
    const manifest = await writeStoryWorkspace(source, passage);
    const moved = packagePath();
    await rename(source, moved);
    const restored = await readStoryPassage(join(moved, "workspace.json"));
    expect(JSON.stringify(passage)).toBe(original);
    expect(restored.frameCount).toBe(passage.frameCount);
    expect(restored.beats.map((b) => passageBeatKey(b.scene, "test"))).toEqual(
      passage.beats.map((b) => passageBeatKey(b.scene, "test")),
    );
    expect(
      manifest.files.filter((file) => file.kind === "template"),
    ).toHaveLength(1);
    for (const file of manifest.files) {
      const bytes = await readFile(join(moved, file.path));
      expect(passageChecksum(bytes)).toBe(file.sha256);
      expect(bytes.length).toBe(file.bytes);
      if (file.kind === "plan" || file.kind === "template")
        expect(bytes.toString()).not.toContain(resolve("."));
    }
    for (const beat of restored.beats)
      for (const asset of [...beat.scene.assets, ...(beat.scene.fonts ?? [])])
        expect(asset.path.startsWith(moved + "/")).toBe(true);
  }, 30_000);

  it("produces identical manifests and JSON in different output folders", async () => {
    const first = packagePath(),
      second = packagePath();
    const manifest = await writeStoryWorkspace(first, passage);
    expect(await writeStoryWorkspace(second, passage)).toEqual(manifest);
    expect(await readFile(join(second, "workspace.json"), "utf8")).toBe(
      await readFile(join(first, "workspace.json"), "utf8"),
    );
  }, 30_000);

  it("preserves asset parameters, their editable defaults, and deduplicates repeated bytes", async () => {
    const plan = structuredClone(passage.plan);
    if (plan.schemaVersion !== "story-passage-2")
      throw new Error("Wrong fixture");
    const template = structuredClone(passage.templates.values().next().value!);
    if (template.schemaVersion !== "story-template-1")
      throw new Error("Wrong fixture");
    const original = template.scene.assets[0]!;
    const replacement = Buffer.concat([
      await readFile(original.path),
      Buffer.from("\n"),
    ]);
    await writeFile(join(root, "replacement.svg"), replacement);
    template.slots.art = { kind: "asset", asset: original.id, required: false };
    await writeFile(join(root, "template.json"), JSON.stringify(template));
    for (const beat of plan.beats) beat.template = "template.json";
    for (const beat of plan.beats.slice(0, 2))
      beat.parameters.art = {
        ...original,
        path: "replacement.svg",
        sha256: "sha256:" + passageChecksum(replacement),
      };
    const customized = await prepareStoryPassageInput(
      plan,
      join(root, "custom.json"),
    );
    const output = packagePath();
    const manifest = await writeStoryWorkspace(output, customized);
    expect(manifest.files.filter((file) => file.kind === "asset")).toHaveLength(
      template.scene.assets.length + 1,
    );
    const restored = await readStoryPassage(join(output, "workspace.json"));
    expect(restored.beats.map((b) => passageBeatKey(b.scene, "test"))).toEqual(
      customized.beats.map((b) => passageBeatKey(b.scene, "test")),
    );
    expect(
      templateScene(restored.templates.values().next().value!).assets[0]!
        .sha256,
    ).toBe(original.sha256);
  }, 30_000);

  it("requires matching narration and packages a verified complete audio file", async () => {
    const narrated = structuredClone(passage);
    const audio = Buffer.alloc(44 + 25 * 8000 * 2);
    audio.write("RIFF", 0);
    audio.writeUInt32LE(audio.length - 8, 4);
    audio.write("WAVEfmt ", 8);
    audio.writeUInt32LE(16, 16);
    audio.writeUInt16LE(1, 20);
    audio.writeUInt16LE(1, 22);
    audio.writeUInt32LE(8000, 24);
    audio.writeUInt32LE(16000, 28);
    audio.writeUInt16LE(2, 32);
    audio.writeUInt16LE(16, 34);
    audio.write("data", 36);
    audio.writeUInt32LE(audio.length - 44, 40);
    const file = join(root, "narration.wav");
    await writeFile(file, audio);
    narrated.plan.narration = {
      reference: "Synthetic silence",
      sha256: passageChecksum(audio),
    };
    await expect(
      writeStoryWorkspace(packagePath(), narrated),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "workspace-narration" })],
    });
    await expect(
      writeStoryWorkspace(packagePath(), passage, file),
    ).rejects.toThrow();
    const output = packagePath();
    const manifest = await writeStoryWorkspace(output, narrated, file);
    expect(await readFile(join(output, manifest.narration!))).toEqual(audio);
    expect(
      (await readStoryPassage(join(output, "workspace.json"))).plan.narration,
    ).toEqual(narrated.plan.narration);
    narrated.plan.narration.sha256 = "0".repeat(64);
    await expect(
      writeStoryWorkspace(packagePath(), narrated, file),
    ).rejects.toThrow("Narration bytes");
  }, 30_000);

  it("rejects duplicate manifest paths", async () => {
    const output = packagePath();
    const manifest = await writeStoryWorkspace(output, passage);
    manifest.files.push({ ...manifest.files[0]! });
    await writeFile(join(output, "workspace.json"), JSON.stringify(manifest));
    await expect(
      readStoryPassage(join(output, "workspace.json")),
    ).rejects.toThrow("Duplicate workspace path");
  }, 30_000);

  it.each(["asset", "font", "template", "plan"] as const)(
    "rejects changed %s files",
    async (kind) => {
      const output = packagePath();
      const manifest = await writeStoryWorkspace(output, passage);
      const file = manifest.files.find((file) => file.kind === kind)!;
      await writeFile(join(output, file.path), "changed");
      await expect(
        readStoryPassage(join(output, "workspace.json")),
      ).rejects.toMatchObject({
        diagnostics: [
          expect.objectContaining({
            code: "workspace-integrity",
            path: file.path,
          }),
        ],
      });
    },
    30_000,
  );

  it("rejects missing files and symlinks outside the package", async () => {
    const output = packagePath();
    const manifest = await writeStoryWorkspace(output, passage);
    const file = manifest.files.find((file) => file.kind === "asset")!;
    const outside = join(root, "outside.svg");
    await rename(join(output, file.path), outside);
    await expect(
      readStoryPassage(join(output, "workspace.json")),
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({ code: "workspace-file-missing" }),
      ],
    });
    await symlink(outside, join(output, file.path));
    await expect(
      readStoryPassage(join(output, "workspace.json")),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "workspace-path" })],
    });
  }, 30_000);

  it("rejects a dependency absent from the manifest even if the file exists", async () => {
    const output = packagePath();
    const manifest = await writeStoryWorkspace(output, passage);
    manifest.files = manifest.files.filter((file) => file.kind !== "font");
    await writeFile(join(output, "workspace.json"), JSON.stringify(manifest));
    await expect(
      readStoryPassage(join(output, "workspace.json")),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "workspace-reference" })],
    });
  }, 30_000);

  it.each(["../escape.json", "/tmp/escape.json", "C:\\escape.json"])(
    "rejects nonportable manifest path %s",
    async (path) => {
      const output = packagePath();
      const manifest = await writeStoryWorkspace(output, passage);
      manifest.files[0]!.path = path;
      await writeFile(join(output, "workspace.json"), JSON.stringify(manifest));
      await expect(
        readStoryPassage(join(output, "workspace.json")),
      ).rejects.toThrow();
    },
    30_000,
  );

  it("rejects absolute dependencies even when their JSON checksum is updated", async () => {
    const output = packagePath();
    const manifest = await writeStoryWorkspace(output, passage);
    const planFile = manifest.files.find((file) => file.kind === "plan")!;
    const plan = await readJson(join(output, planFile.path));
    plan.beats[0].template = resolve(
      "benchmarks/fixtures/story-authoring/comparison-template.json",
    );
    const bytes = Buffer.from(JSON.stringify(plan));
    await writeFile(join(output, planFile.path), bytes);
    Object.assign(planFile, {
      sha256: passageChecksum(bytes),
      bytes: bytes.length,
    });
    await writeFile(join(output, "workspace.json"), JSON.stringify(manifest));
    await expect(
      readStoryPassage(join(output, "workspace.json")),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "workspace-path" })],
    });
  }, 30_000);

  it("does not overwrite an existing directory or publish an incomplete package", async () => {
    const output = packagePath();
    await writeStoryWorkspace(output, passage);
    const before = await readFile(join(output, "workspace.json"), "utf8");
    await expect(writeStoryWorkspace(output, passage)).rejects.toThrow();
    expect(await readFile(join(output, "workspace.json"), "utf8")).toBe(before);
    const invalid = structuredClone(passage);
    templateScene(invalid.templates.values().next().value!).assets[0]!.sha256 =
      "sha256:" + "0".repeat(64);
    const failed = packagePath();
    await expect(writeStoryWorkspace(failed, invalid)).rejects.toThrow();
    await expect(
      readFile(join(failed, "workspace.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  }, 30_000);
});
