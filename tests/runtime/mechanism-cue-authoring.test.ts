import {
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  truncate,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { narratedCycleFixture } from "../helpers/mechanism-narrated-cycle.ts";
import {
  readMechanismCueAuthoring,
  saveMechanismCueAuthoring,
  patchMechanismCueAuthoring,
  applyMechanismCuePatch,
} from "../../packages/animation-engine/src/mechanism/cue-authoring.ts";
import {
  createMechanismFamilyAuthoring,
  saveMechanismFamilyAuthoring,
} from "../../packages/animation-engine/src/mechanism/family-authoring.ts";
import { mechanismHash } from "../../packages/animation-engine/src/mechanism/io.ts";
import { runEpisodeCli } from "../../tools/still-shift-cli/src/episode.ts";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";
async function fixture(
  family: "tape-hook" | "cable-tie" | "clothespeg" = "tape-hook",
) {
  const dir = await mkdtemp(join(tmpdir(), "mechanism-cue-authoring-")),
    source = join(dir, "scene.json"),
    path = join(dir, "cues.json"),
    familyPath = join(dir, "family.json");
  const { instance, document } = narratedCycleFixture(family, 96000),
    bytes = JSON.stringify(instance.scene);
  await writeFile(source, bytes);
  document.source.sha256 = mechanismHash(bytes);
  await saveMechanismFamilyAuthoring(
    createMechanismFamilyAuthoring(family, "family").document,
    familyPath,
  );
  await saveMechanismCueAuthoring(instance, document, path);
  const current = await readMechanismCueAuthoring(instance, path);
  return { dir, path, source, familyPath, instance, current };
}
const request = (
  current: Awaited<ReturnType<typeof readMechanismCueAuthoring>>,
  text = "Here",
) => ({
  schemaVersion: "mechanism-cue-patch-1",
  baseRevision: current.document.revision,
  baseHash: current.projectHash,
  operations: [{ cue: "contact", property: "caption", value: text }],
});
async function run(args: string[]) {
  let output = "";
  const code = await runEpisodeCli(args, {
    stdout: (text) => {
      output += text;
    },
    stderr: () => {},
  });
  return {
    code,
    output,
    receipt: MechanismCommandReceiptSchema.parse(JSON.parse(output)),
  };
}
describe("saved source-pinned cue authoring", () => {
  it("saves/reopens and resumes scoped cue revisions across all families", async () => {
    for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
      const { path, instance, current } = await fixture(family);
      const first = await patchMechanismCueAuthoring(
          instance,
          path,
          request(current),
        ),
        reopened = await readMechanismCueAuthoring(instance, path);
      expect(reopened.projectHash).toBe(first.projectHash);
      const second = await patchMechanismCueAuthoring(
        instance,
        path,
        request(reopened, "Now"),
      );
      expect(second.revision).toBe(2);
      expect(
        (await readMechanismCueAuthoring(instance, path)).document.narration,
      ).toEqual(current.document.narration);
      expect(
        (await readdir(dirname(path))).some(
          (n) => n.includes("pending") || n.endsWith(".lock"),
        ),
      ).toBe(false);
    }
  }, 20000);
  it("preserves exact saved bytes on stale, invalid timing/reading and version requests", async () => {
    const { path, instance, current } = await fixture();
    await patchMechanismCueAuthoring(instance, path, request(current));
    const before = await readFile(path),
      next = await readMechanismCueAuthoring(instance, path);
    for (const patch of [
      request(current),
      request(next, "x".repeat(100)),
      { ...request(next), schemaVersion: "mechanism-cue-patch-9" },
    ]) {
      await expect(
        patchMechanismCueAuthoring(instance, path, patch),
      ).rejects.toThrow();
      expect(await readFile(path)).toEqual(before);
    }
  });
  it("rejects changed raw source bytes and a valid pinned scene belonging to a different family instance", async () => {
    const { path, source, instance, current } = await fixture(),
      before = await readFile(path);
    await writeFile(source, " " + (await readFile(source, "utf8")));
    await expect(
      patchMechanismCueAuthoring(instance, path, request(current)),
    ).rejects.toThrow("hash");
    expect(await readFile(path)).toEqual(before);
    const other = narratedCycleFixture("cable-tie", 96000).instance,
      bytes = JSON.stringify(other.scene);
    await writeFile(source, bytes);
    await writeFile(
      path,
      JSON.stringify({
        ...current.document,
        source: { ...current.document.source, sha256: mechanismHash(bytes) },
      }),
    );
    await expect(readMechanismCueAuthoring(instance, path)).rejects.toThrow(
      "family instance",
    );
  });
  it("rejects direct saved replacement of identity, assets and source clock", async () => {
    const { path, instance, current } = await fixture(),
      valid = applyMechanismCuePatch(
        instance,
        current.document,
        request(current),
      ),
      before = await readFile(path);
    for (const next of [
      { ...valid.document, id: "other" },
      {
        ...valid.document,
        narration: {
          ...valid.document.narration,
          sha256: `sha256:${"1".repeat(64)}`,
        },
      },
      {
        ...valid.document,
        font: { ...valid.document.font, path: "different.ttf" },
      },
    ]) {
      await expect(
        saveMechanismCueAuthoring(instance, next, path, {
          revision: 0,
          hash: current.projectHash,
        }),
      ).rejects.toThrow("preserve");
      expect(await readFile(path)).toEqual(before);
    }
  });
  it("admits only one competing writer from the same base", async () => {
    const { path, instance, current } = await fixture();
    const results = await Promise.allSettled([
      patchMechanismCueAuthoring(instance, path, request(current, "Here")),
      patchMechanismCueAuthoring(instance, path, request(current, "Now")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await readMechanismCueAuthoring(instance, path)).document.revision,
    ).toBe(1);
  });
  it("exposes bounded source-pinned CLI inspection/patch, complete compiled report and schema", async () => {
    const { dir, path, familyPath, current } = await fixture(),
      req = join(dir, "request.json"),
      report = join(dir, "patched.full.json");
    await writeFile(req, JSON.stringify(request(current)));
    const flags = [
      "--authoring",
      "cue",
      "--family-input",
      familyPath,
      "--input",
      path,
    ];
    const inspected = await run(["inspect", ...flags]);
    expect(inspected.code).toBe(0);
    expect(inspected.receipt.summary.sourceSamples).toBe(96000);
    const patched = await run([
      "patch",
      ...flags,
      "--request",
      req,
      "--report",
      report,
    ]);
    expect(patched.code).toBe(0);
    expect(Buffer.byteLength(patched.output)).toBeLessThanOrEqual(32768);
    const complete = JSON.parse(await readFile(report, "utf8"));
    expect(complete.affectedShots).toEqual(["contact"]);
    expect(complete.compiled.recording.sourceSamples).toBe(96000);
    expect(complete.document.revision).toBe(1);
    const stale = await run(["patch", ...flags, "--request", req]);
    expect(stale.code).toBe(2);
    expect(stale.receipt.summary.code).toBe("mechanism-stale-revision");
    const schema = join(dir, "cue-patch.schema.json");
    expect(
      (await run(["schema", "--kind", "cue-patch", "--output", schema])).code,
    ).toBe(0);
    expect(
      JSON.parse(await readFile(schema, "utf8")).properties.schemaVersion.const,
    ).toBe("mechanism-cue-patch-1");
    const relocation = await run([
      "save",
      ...flags,
      "--output",
      join(dir, "relocated", "cues.json"),
    ]);
    expect(relocation.code).toBe(2);
    expect(relocation.receipt.summary.code).toBe("mechanism-save-relocation");
  });
  it("rejects dense JSON expansion and oversized files before parsing or publishing", async () => {
    const { path, source, instance, current } = await fixture();
    const dense = "[" + "{},".repeat(500000) + "{}]";
    await writeFile(source, dense);
    const document = {
      ...current.document,
      source: { ...current.document.source, sha256: mechanismHash(dense) },
    };
    await writeFile(path, JSON.stringify(document));
    await expect(readMechanismCueAuthoring(instance, path)).rejects.toThrow(
      "capacity",
    );
    await writeFile(path, JSON.stringify(current.document));
    await truncate(source, 33554433);
    const before = await readFile(path);
    await expect(
      patchMechanismCueAuthoring(instance, path, request(current)),
    ).rejects.toThrow("32 MiB");
    expect(await readFile(path)).toEqual(before);
  });
});
