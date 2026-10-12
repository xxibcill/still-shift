import { mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createCueProjectFixture } from "../helpers/mechanism-cue-project.ts";
import {
  compileMechanismCueProject,
  readMechanismCueCompilation,
} from "../../packages/animation-engine/src/mechanism/cue-lifecycle.ts";
import {
  readMechanismCueAuthoring,
  patchMechanismCueAuthoring,
} from "../../packages/animation-engine/src/mechanism/cue-authoring.ts";
import {
  readMechanismFamilyAuthoring,
  patchMechanismFamilyAuthoring,
} from "../../packages/animation-engine/src/mechanism/family-authoring.ts";
import { mechanismHash } from "../../packages/animation-engine/src/mechanism/io.ts";
import { runEpisodeCli } from "../../tools/still-shift-cli/src/episode.ts";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";
async function fixture(
  family: "tape-hook" | "cable-tie" | "clothespeg" = "tape-hook",
) {
  const dir = await mkdtemp(join(tmpdir(), "cue-compilation-"));
  return {
    dir,
    ...(await createCueProjectFixture(dir, family)),
    prepared: join(dir, "prepared"),
  };
}
async function run(args: string[]) {
  let output = "";
  const code = await runEpisodeCli(args, {
    stdout: (v) => {
      output += v;
    },
    stderr: () => {},
  });
  return {
    code,
    output,
    receipt: MechanismCommandReceiptSchema.parse(JSON.parse(output)),
  };
}
describe("revision-bound cue compilation", () => {
  it("loads actual media and relocates relative assets into fresh snapshots for three families", async () => {
    for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
      const f = await fixture(family),
        result = await compileMechanismCueProject(
          f.familyPath,
          f.cuePath,
          f.prepared,
        );
      expect(result.receipt.frameCount).toBe(60);
      const value = JSON.parse(await readFile(result.compositionPath, "utf8"));
      expect(
        value.assets.every((asset: { path: string }) => isAbsolute(asset.path)),
      ).toBe(true);
      expect(
        (await readMechanismCueCompilation(f.familyPath, f.cuePath, f.prepared))
          .receipt,
      ).toEqual(result.receipt);
    }
  }, 20000);
  it("refuses a previous cue revision and a previous family revision even if generated geometry is unchanged", async () => {
    const f = await fixture();
    await compileMechanismCueProject(f.familyPath, f.cuePath, f.prepared);
    const current = await readMechanismCueAuthoring(f.instance, f.cuePath);
    await patchMechanismCueAuthoring(f.instance, f.cuePath, {
      schemaVersion: "mechanism-cue-patch-1",
      baseRevision: 0,
      baseHash: current.projectHash,
      operations: [{ cue: "contact", property: "caption", value: "Here" }],
    });
    await expect(
      readMechanismCueCompilation(f.familyPath, f.cuePath, f.prepared),
    ).rejects.toThrow("current family/cue");
    const second = join(f.dir, "second");
    await compileMechanismCueProject(f.familyPath, f.cuePath, second);
    const family = await readMechanismFamilyAuthoring(f.familyPath);
    await patchMechanismFamilyAuthoring(f.familyPath, {
      schemaVersion: "mechanism-family-patch-1",
      baseRevision: 0,
      baseHash: family.projectHash,
      operations: [{ property: "parameter", id: "bladeLength", value: 10 }],
    });
    await expect(
      readMechanismCueCompilation(f.familyPath, f.cuePath, second),
    ).rejects.toThrow("current family/cue");
  }, 15000);
  it("rejects snapshot byte tampering and changed semantics even with a recomputed declared checksum", async () => {
    const f = await fixture(),
      result = await compileMechanismCueProject(
        f.familyPath,
        f.cuePath,
        f.prepared,
      ),
      original = await readFile(result.compositionPath, "utf8");
    await writeFile(result.compositionPath, original + " ");
    await expect(
      readMechanismCueCompilation(f.familyPath, f.cuePath, f.prepared),
    ).rejects.toThrow("bytes changed");
    const doc = JSON.parse(original);
    doc.width = 242;
    const bytes = JSON.stringify(doc);
    await writeFile(result.compositionPath, bytes);
    await writeFile(
      result.receiptPath,
      JSON.stringify({
        ...result.receipt,
        composition: {
          ...result.receipt.composition,
          sha256: mechanismHash(bytes),
        },
      }),
    );
    await expect(
      readMechanismCueCompilation(f.familyPath, f.cuePath, f.prepared),
    ).rejects.toThrow("current cue semantics");
  }, 15000);
  it("preserves existing compilation directories and rejects changed actual media before creating a snapshot", async () => {
    const f = await fixture(),
      result = await compileMechanismCueProject(
        f.familyPath,
        f.cuePath,
        f.prepared,
      ),
      before = await readFile(result.compositionPath);
    await expect(
      compileMechanismCueProject(f.familyPath, f.cuePath, f.prepared),
    ).rejects.toThrow();
    expect(await readFile(result.compositionPath)).toEqual(before);
    await writeFile(join(f.dir, "narration.wav"), "bad audio");
    const output = join(f.dir, "bad");
    await expect(
      compileMechanismCueProject(f.familyPath, f.cuePath, output),
    ).rejects.toThrow();
    await expect(access(output)).rejects.toThrow();
  }, 15000);
  it("exposes bounded CLI compilation and version diagnostics while preserving old commands", async () => {
    const f = await fixture(),
      result = await run([
        "compile",
        "--authoring",
        "cue",
        "--family-input",
        f.familyPath,
        "--input",
        f.cuePath,
        "--output-dir",
        f.prepared,
      ]);
    expect(result.code).toBe(0);
    expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(32768);
    const receipt = join(f.prepared, "cue-compilation.json"),
      value = JSON.parse(await readFile(receipt, "utf8"));
    await writeFile(
      receipt,
      JSON.stringify({
        ...value,
        schemaVersion: "mechanism-cue-compilation-9",
      }),
    );
    const check = await run([
      "check",
      "--authoring",
      "cue",
      "--family-input",
      f.familyPath,
      "--input",
      f.cuePath,
      "--prepared-dir",
      f.prepared,
      "--final-output",
      join(f.dir, "missing.mp4"),
    ]);
    expect(check.code).toBe(2);
    expect(check.receipt.summary.code).toBe("mechanism-version");
    expect(check.receipt.summary.message).toContain(
      "mechanism-cue-compilation-9",
    );
  }, 15000);
});
