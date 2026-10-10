import { mkdtemp, readFile, writeFile, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createTapeHookProject } from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import {
  readMechanismEpisode,
  mechanismDependencyReport,
  patchMechanismEpisode,
  mechanismContentHash,
  writeMechanismJson,
} from "../../packages/animation-engine/src/mechanism/io.ts";
import {
  evaluateMechanismFrame,
  prepareMechanismScene,
} from "@still-shift/renderer-core";
const directories: string[] = [];
const fontPath = resolve("assets/story-motion/fonts/plex-sans-semibold.ttf");
async function project() {
  const root = await mkdtemp(join(tmpdir(), "mechanism-project-test-"));
  directories.push(root);
  const path = join(root, "project");
  await createTapeHookProject({ outputDirectory: path, fontPath });
  return join(path, "episode.json");
}
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
describe("portable mechanism project", () => {
  test("resolves all nine shots, seven exact roles, and relocates without semantic identity change", async () => {
    const path = await project(),
      loaded = await readMechanismEpisode(path);
    expect(loaded.episode.shots).toHaveLength(9);
    expect(
      loaded.episode.shots.flatMap((shot) =>
        shot.labels.map((label) => label.role),
      ),
    ).toEqual([
      "PULL",
      "PUSH",
      "THICKNESS",
      "TRAVEL",
      "INSIDE",
      "OUTSIDE",
      "SLIDES",
    ]);
    expect(loaded.fontDiagnostics).toEqual([]);
    const target = join(directories[0]!, "relocated");
    await cp(resolve(path, ".."), target, { recursive: true });
    expect(
      (await readMechanismEpisode(join(target, "episode.json"))).projectHash,
    ).toBe(loaded.projectHash);
  });
  test("dependency inspection reports all missing/hash failures without source or package writes", async () => {
    const path = await project(),
      before = await readFile(path);
    await writeFile(
      join(resolve(path, ".."), "assets", "plex-sans-semibold.ttf"),
      "corrupt",
    );
    await rm(join(resolve(path, ".."), "scene.json"));
    const report = await mechanismDependencyReport(path);
    expect(report.valid).toBe(false);
    expect(report.findings).toHaveLength(2);
    expect(report.findings.map((item) => item.code)).toContain(
      "mechanism-dependency-hash",
    );
    expect(await readFile(path)).toEqual(before);
  });
  test("one TRAVEL edit keeps physical scene identity and rejects a stale retry", async () => {
    const path = await project(),
      before = await readMechanismEpisode(path);
    const patch = {
      baseRevision: 0,
      baseHash: before.projectHash,
      operations: [
        {
          shot: "V8-05",
          label: "label-travel",
          property: "position" as const,
          value: [540, 650],
        },
      ],
    };
    const receipt = await patchMechanismEpisode(path, patch),
      after = await readMechanismEpisode(path);
    expect(receipt.affectedShots).toEqual(["V8-05"]);
    expect(after.episode.revision).toBe(1);
    expect(mechanismContentHash(after.scene)).toBe(
      mechanismContentHash(before.scene),
    );
    expect(receipt.cacheEffects.cleanPlates).toBe("reuse");
    const saved = await readFile(path);
    await expect(patchMechanismEpisode(path, patch)).rejects.toThrow(
      "Stale patch",
    );
    expect(await readFile(path)).toEqual(saved);
  });
  test("strict unreachable glyph and unknown target patches preserve authored bytes", async () => {
    const path = await project(),
      before = await readMechanismEpisode(path),
      bytes = await readFile(path);
    for (const operation of [
      {
        shot: "V8-05",
        label: "label-travel",
        property: "text" as const,
        value: "ภาษาไทย",
      },
      {
        shot: "missing",
        label: "label-travel",
        property: "position" as const,
        value: [0, 0],
      },
    ])
      await expect(
        patchMechanismEpisode(path, {
          baseRevision: 0,
          baseHash: before.projectHash,
          operations: [operation],
        }),
      ).rejects.toThrow();
    expect(await readFile(path)).toEqual(bytes);
  });
  test("every E01 frame satisfies independent contact/travel expectations and stationary rivet geometry", async () => {
    const loaded = await readMechanismEpisode(await project()),
      prepared = prepareMechanismScene(loaded.scene);
    for (const shot of loaded.episode.shots)
      for (
        let frame = shot.startFrame;
        frame < shot.endFrameExclusive;
        frame++
      ) {
        const state = evaluateMechanismFrame(prepared, {
          frame,
          width: loaded.episode.output.width,
          height: loaded.episode.output.height,
          camera: shot.camera!,
          cameraKeys: shot.cameraKeys!,
          controls: shot.controls,
          hiddenParts: shot.hiddenParts,
        });
        const q = state.rigs.slider!.q;
        expect(q).toBeGreaterThanOrEqual(0);
        expect(q).toBeLessThanOrEqual(0.18);
        expect(
          state.parts.hook!.worldMatrix[12]! -
            state.parts.blade!.worldMatrix[12]!,
        ).toBeCloseTo(q, 12);
        if (shot.controls.slider!.contactMode === "pull")
          expect(state.anchors["hook.innerFace"]!.world[0]).toBeCloseTo(0, 12);
        if (shot.controls.slider!.contactMode === "push")
          expect(state.anchors["hook.outerFace"]!.world[0]).toBeCloseTo(0, 12);
      }
    expect(
      loaded.scene.geometry.meshes
        .filter((mesh) => mesh.id.startsWith("rivet-"))
        .every((mesh) => mesh.partId === "blade"),
    ).toBe(true);
  });
  test("exclusive JSON publication preserves an existing output", async () => {
    const root = await mkdtemp(join(tmpdir(), "mechanism-write-test-"));
    directories.push(root);
    const path = join(root, "result.json");
    await writeFile(path, "keep me");
    await expect(writeMechanismJson(path, { value: 1 })).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe("keep me");
  });
});
