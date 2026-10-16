import { mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createMechanismFamilyAuthoring,
  applyMechanismFamilyPatch,
  readMechanismFamilyAuthoring,
  saveMechanismFamilyAuthoring,
  patchMechanismFamilyAuthoring,
} from "../../packages/animation-engine/src/mechanism/family-authoring.ts";
import { runEpisodeCli } from "../../tools/still-shift-cli/src/episode.ts";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";
const request = (
  current: Awaited<ReturnType<typeof readMechanismFamilyAuthoring>>,
  value = 12,
) => ({
  schemaVersion: "mechanism-family-patch-1",
  baseRevision: current.document.revision,
  baseHash: current.projectHash,
  operations: [{ property: "parameter", id: "bladeLength", value }],
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "family-authoring-")),
    path = join(dir, "nested", "family.json"),
    current = createMechanismFamilyAuthoring("tape-hook", "demo");
  await saveMechanismFamilyAuthoring(current.document, path);
  return { dir, path, current };
}
async function run(args: string[]) {
  let output = "";
  const code = await runEpisodeCli(args, {
    stdout: (value) => {
      output += value;
    },
    stderr: () => {},
  });
  return {
    code,
    output,
    receipt: MechanismCommandReceiptSchema.parse(JSON.parse(output)),
  };
}
describe("saved family transactions and CLI", () => {
  it.each(["compile", "prepare", "render", "check"])(
    "rejects %s for family authoring instead of reporting inspection as completed lifecycle work",
    async (command) => {
      const { path } = await fixture(),
        before = await readFile(path);
      const result = await run([
        command,
        "--authoring",
        "family",
        "--input",
        path,
      ]);
      expect(result.code).toBe(2);
      expect(result.receipt).toMatchObject({
        command,
        status: "failed",
        summary: {
          code: "mechanism-authoring-command",
          path: "--authoring",
        },
      });
      expect(result.receipt.summary.message).toContain(command);
      expect(await readFile(path)).toEqual(before);
      expect(await readdir(join(path, ".."))).toEqual(["family.json"]);
    },
  );
  it("saves a fresh document, reopens its actual generated identity and preserves existing destinations", async () => {
    const { path, current } = await fixture();
    const before = await readFile(path);
    expect(
      (await readMechanismFamilyAuthoring(path)).instance.sourceSha256,
    ).toBe(current.instance.sourceSha256);
    await expect(
      saveMechanismFamilyAuthoring(current.document, path),
    ).rejects.toThrow();
    expect(await readFile(path)).toEqual(before);
  });
  it("applies one revision and reopens/resumes the same stable project", async () => {
    const { path, current } = await fixture();
    const saved = await patchMechanismFamilyAuthoring(path, request(current));
    const reopened = await readMechanismFamilyAuthoring(path);
    expect(saved.revision).toBe(1);
    expect(reopened.projectHash).toBe(saved.projectHash);
    expect(reopened.instance.sourceSha256).toBe(saved.sourceSha256);
    const second = await patchMechanismFamilyAuthoring(
      path,
      request(reopened, 14),
    );
    expect(second.revision).toBe(2);
    expect((await readMechanismFamilyAuthoring(path)).document.id).toBe("demo");
    expect(
      (await readdir(join(path, ".."))).some(
        (name) => name.includes("pending") || name.endsWith(".lock"),
      ),
    ).toBe(false);
  });
  it("preserves exact saved bytes on stale, invalid multi-operation and unsupported-version patches", async () => {
    const { path, current } = await fixture();
    await patchMechanismFamilyAuthoring(path, request(current));
    const before = await readFile(path),
      next = await readMechanismFamilyAuthoring(path);
    for (const patch of [
      request(current),
      { ...request(next), schemaVersion: "mechanism-family-patch-7" },
      {
        ...request(next),
        operations: [
          ...request(next).operations,
          { property: "parameter", id: "hookThickness", value: 99 },
        ],
      },
    ]) {
      await expect(
        patchMechanismFamilyAuthoring(path, patch),
      ).rejects.toThrow();
      expect(await readFile(path)).toEqual(before);
    }
  });
  it("rejects saved replacement of project/pack identity and invalid revision advances", async () => {
    const { path, current } = await fixture();
    const valid = applyMechanismFamilyPatch(current.document, request(current));
    const before = await readFile(path);
    for (const document of [
      { ...valid.document, id: "replacement" },
      { ...valid.document, revision: 2 },
    ]) {
      await expect(
        saveMechanismFamilyAuthoring(document, path, {
          revision: 0,
          hash: current.projectHash,
        }),
      ).rejects.toThrow();
      expect(await readFile(path)).toEqual(before);
    }
  });
  it("allows only one concurrent writer from an identical base", async () => {
    const { path, current } = await fixture();
    const results = await Promise.allSettled([
      patchMechanismFamilyAuthoring(path, request(current, 12)),
      patchMechanismFamilyAuthoring(path, request(current, 14)),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const final = await readMechanismFamilyAuthoring(path);
    expect(final.document.revision).toBe(1);
    if (final.document.family !== "tape-hook")
      throw new Error("Fixture family changed");
    expect([12, 14]).toContain(final.document.input.parameters.bladeLength);
  });
  it("exposes family summary, scoped patch/cache effects and complete reports in bounded CLI receipts", async () => {
    const { dir, path, current } = await fixture(),
      req = join(dir, "patch.json");
    await writeFile(req, JSON.stringify(request(current)));
    const first = await run([
      "inspect",
      "--authoring",
      "family",
      "--input",
      path,
    ]);
    expect(first.code).toBe(0);
    expect(first.receipt.summary.projectHash).toBe(current.projectHash);
    const report = join(dir, "patched.full.json"),
      patch = await run([
        "patch",
        "--authoring",
        "family",
        "--input",
        path,
        "--request",
        req,
        "--report",
        report,
      ]);
    expect(patch.code).toBe(0);
    expect(Buffer.byteLength(patch.output)).toBeLessThanOrEqual(32768);
    expect(patch.receipt.summary.revision).toBe(1);
    const full = JSON.parse(await readFile(report, "utf8"));
    expect(full.changedPaths).toEqual(["input.parameters.bladeLength"]);
    expect(full.cacheEffects.narration).toBe("reuse-unchanged-source");
    const stale = await run([
      "patch",
      "--authoring",
      "family",
      "--input",
      path,
      "--request",
      req,
    ]);
    expect(stale.code).toBe(2);
    expect(stale.receipt.summary.code).toBe("mechanism-stale-revision");
    const summary = await run([
      "summary",
      "--authoring",
      "family",
      "--input",
      path,
    ]);
    expect(summary.receipt.summary.revision).toBe(1);
    const validated = await run([
      "validate",
      "--authoring",
      "family",
      "--input",
      path,
    ]);
    expect(validated.code).toBe(0);
    expect(validated.receipt.summary.projectHash).toBe(
      summary.receipt.summary.projectHash,
    );
    const copy = join(dir, "copy", "family.json"),
      save = await run([
        "save",
        "--authoring",
        "family",
        "--input",
        path,
        "--output",
        copy,
      ]);
    expect(save.code).toBe(0);
    expect((await readMechanismFamilyAuthoring(copy)).projectHash).toBe(
      summary.receipt.summary.projectHash,
    );
  });
  it("publishes both authoring schemas and reports unsupported versions and oversized requests without overwriting", async () => {
    const { dir, path, current } = await fixture(),
      before = await readFile(path),
      requestPath = join(dir, "request.json");
    for (const kind of ["family-authoring", "family-patch"]) {
      const output = join(dir, `${kind}.schema.json`);
      const result = await run(["schema", "--kind", kind, "--output", output]);
      expect(result.code).toBe(0);
      const schema = JSON.parse(await readFile(output, "utf8"));
      if (kind === "family-authoring")
        expect(schema.oneOf ?? schema.anyOf).toHaveLength(3);
      else
        expect(schema.properties.schemaVersion.const).toBe(
          "mechanism-family-patch-1",
        );
    }
    await writeFile(
      path,
      JSON.stringify({
        ...current.document,
        schemaVersion: "mechanism-family-authoring-9",
      }),
    );
    const unsupported = await run([
      "inspect",
      "--authoring",
      "family",
      "--input",
      path,
    ]);
    expect(unsupported.code).toBe(2);
    expect(unsupported.receipt.summary.code).toBe("mechanism-version");
    expect(unsupported.receipt.summary.path).toBe("schemaVersion");
    await writeFile(path, before);
    await writeFile(
      requestPath,
      JSON.stringify({
        ...request(current),
        schemaVersion: "mechanism-family-patch-9",
      }),
    );
    const unknown = await run([
      "patch",
      "--authoring",
      "family",
      "--input",
      path,
      "--request",
      requestPath,
    ]);
    expect(unknown.code).toBe(2);
    expect(unknown.receipt.summary.code).toBe("mechanism-version");
    expect(await readFile(path)).toEqual(before);
    await writeFile(requestPath, " ".repeat(16385));
    const oversized = await run([
      "patch",
      "--authoring",
      "family",
      "--input",
      path,
      "--request",
      requestPath,
    ]);
    expect(oversized.code).toBe(2);
    expect(oversized.receipt.summary.code).toBe("mechanism-patch-budget");
    expect(await readFile(path)).toEqual(before);
  });
});
