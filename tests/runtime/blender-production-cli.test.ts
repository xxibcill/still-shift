import { readFile, writeFile, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ blender: vi.fn(), native: vi.fn() }));
vi.mock("@still-shift/animation-engine", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createBlenderProductionExecutor: mocks.blender,
  createMechanismProductionNativeExecutor: mocks.native,
}));
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import {
  BlenderProductionQueueSchema,
  BlenderProductionQueueProductSchema,
  type MechanismProductionExecutor,
  inspectMechanismProductionCapabilities,
  mechanismProductionCapabilityMarkdown,
} from "@still-shift/animation-engine";
import {
  fixture,
  product,
  code,
  profile,
} from "../fixtures/mechanism-production-queue-support.ts";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";

async function run(args: string[]) {
  let stdout = "",
    stderr = "";
  const exitCode = await runCli(["production", ...args], {
    stdout: (v) => {
      stdout += v;
    },
    stderr: (v) => {
      stderr += v;
    },
  });
  return { exitCode, stdout, stderr };
}
async function setup() {
  const f = await fixture();
  const manifest = BlenderProductionQueueSchema.parse({
    ...f.manifest,
    schemaVersion: "mechanism-production-queue-2",
    items: f.manifest.items.map((item, i) => ({
      ...item,
      id: i ? "EU-005" : "EU-004",
      question: i
        ? "How does a keyhole slot hold a screw?"
        : "How does a zipper join its teeth?",
      family: i ? "keyhole-slot" : "zipper",
      backend: "blender-native",
    })),
  });
  await writeFile(f.path, JSON.stringify(manifest));
  return { ...f, manifest };
}
function worker(
  execute?: MechanismProductionExecutor["execute"],
): MechanismProductionExecutor {
  return {
    codeSha256: code,
    profileSha256: profile,
    verify: async () => {},
    execute:
      execute ??
      (async (item, context) => {
        const legacy = await product({ ...item, family: "tape-hook" }, context);
        return BlenderProductionQueueProductSchema.parse({
          ...legacy,
          schemaVersion: "mechanism-production-queue-product-2",
          report: {
            ...legacy.report,
            schemaVersion: "mechanism-production-episode-report-2",
            backend: "blender-native",
            family: item.family,
          },
        });
      }),
  };
}
const executable = "/declared/host/Blender";
describe("native Blender production CLI with a declared byte-fixture adapter", () => {
  it("creates one immutable version2 manifest in a new directory without executing or selecting the legacy producer", async () => {
    const f = await setup();
    let executed = 0;
    const adapter = {
      ...worker(async () => {
        executed++;
        throw Error("creation cannot execute");
      }),
      createQueue: async (
        id: string,
        projects: {
          id: string;
          question: string;
          familyPath: string;
          cuePath: string;
        }[],
        directory: string,
      ) =>
        BlenderProductionQueueSchema.parse({
          ...f.manifest,
          id,
          items: f.manifest.items.map((item, i) => ({
            ...item,
            id: projects[i]!.id,
            question: projects[i]!.question,
            familyPath: relative(directory, projects[i]!.familyPath),
            cuePath: relative(directory, projects[i]!.cuePath),
            inputs: [projects[i]!.familyPath, projects[i]!.cuePath].map(
              (path) => ({
                path: relative(directory, path),
                bytes: 2,
                sha256: item.inputs[0]!.sha256,
              }),
            ),
          })),
        }),
    };
    mocks.blender.mockResolvedValue(adapter);
    mocks.native.mockClear();
    const declaration = join(f.root, "projects.json"),
      destination = join(f.root, "new", "queue.json");
    await writeFile(
      declaration,
      JSON.stringify({
        schemaVersion: "mechanism-production-projects-1",
        id: f.manifest.id,
        projects: f.manifest.items.map((i) => ({
          id: i.id,
          question: i.question,
          familyPath: i.familyPath,
          cuePath: i.cuePath,
        })),
      }),
    );
    try {
      const args = [
        "queue",
        "--projects",
        declaration,
        "--manifest",
        destination,
        "--backend",
        "blender-native",
        "--blender-executable",
        executable,
      ];
      expect((await run(args)).exitCode).toBe(0);
      const original = await readFile(destination);
      expect(
        BlenderProductionQueueSchema.parse(JSON.parse(original.toString()))
          .items[0]!.backend,
      ).toBe("blender-native");
      expect((await run(args)).exitCode).toBe(2);
      expect(await readFile(destination)).toEqual(original);
      expect(executed).toBe(0);
      expect(mocks.native).not.toHaveBeenCalled();
      expect(mocks.blender).toHaveBeenCalledWith({
        blenderExecutable: resolve(executable),
      });
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("selects version2 from its manifest, resumes and reports one complete bounded episode/cohort bundle without another execution", async () => {
    const f = await setup();
    let calls = 0;
    const base = worker();
    mocks.blender.mockResolvedValue(
      worker(async (i, c) => {
        calls++;
        return base.execute(i, c);
      }),
    );
    mocks.native.mockClear();
    try {
      const args = [
        "run",
        "--manifest",
        f.path,
        "--output-dir",
        f.output,
        "--blender-executable",
        executable,
      ];
      expect(
        (await run([...args, "--report", join(f.root, "first.json")])).exitCode,
      ).toBe(0);
      expect(
        (await run([...args, "--report", join(f.root, "again.json")])).exitCode,
      ).toBe(0);
      expect(calls).toBe(2);
      const result = await run([
        "report",
        "--manifest",
        f.path,
        "--output-dir",
        f.output,
        "--blender-executable",
        executable,
        "--report",
        join(f.root, "bundle.json"),
      ]);
      expect(result.exitCode).toBe(0);
      expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(32768);
      const receipt = MechanismCommandReceiptSchema.parse(
        JSON.parse(result.stdout),
      );
      expect(receipt.summary).toMatchObject({
        selected: 2,
        reviewedReady: 0,
        pilotAdmission: "not-established",
      });
      const complete = JSON.parse(
        await readFile(join(f.root, "bundle.json"), "utf8"),
      );
      expect(
        complete.episodes.every(
          (e: {
            validation: { status: string };
            report: { backend: string };
          }) =>
            e.validation.status === "verified" &&
            e.report.backend === "blender-native",
        ),
      ).toBe(true);
      expect(complete.cohort.authoring.savings).toBeNull();
      expect(calls).toBe(2);
      expect(mocks.native).not.toHaveBeenCalled();
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("rejects unsupported flags, missing executable and backend reclassification before producer construction or report replacement", async () => {
    const f = await setup(),
      report = join(f.root, "owned.json");
    await writeFile(report, "owned");
    mocks.blender.mockClear();
    mocks.native.mockClear();
    try {
      for (const extra of [
        [],
        ["--backend", "three-native"],
        ["--backend", "invalid"],
        ["--backend", "three-native", "--blender-executable", executable],
      ]) {
        const result = await run([
          "report",
          "--manifest",
          f.path,
          "--output-dir",
          f.output,
          "--report",
          report,
          ...extra,
        ]);
        expect(result.exitCode).toBe(2);
      }
      expect(await readFile(report, "utf8")).toBe("owned");
      expect(mocks.blender).not.toHaveBeenCalled();
      expect(mocks.native).not.toHaveBeenCalled();
      expect(
        (await run(["discover", "--blender-executable", executable])).exitCode,
      ).toBe(2);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("preserves version2 through selected failed-item retry without a producer, then reuses its completed neighbor", async () => {
    const f = await setup();
    let broken = true,
      calls = 0;
    const base = worker();
    mocks.blender.mockResolvedValue(
      worker(async (i, c) => {
        calls++;
        if (i.id === "EU-005" && broken)
          throw Error("permanent byte-fixture failure");
        return base.execute(i, c);
      }),
    );
    try {
      const args = [
        "run",
        "--manifest",
        f.path,
        "--output-dir",
        f.output,
        "--blender-executable",
        executable,
      ];
      expect(
        (await run([...args, "--report", join(f.root, "failure.json")]))
          .exitCode,
      ).toBe(1);
      const state = JSON.parse(
        await readFile(join(f.output, "queue-state.json"), "utf8"),
      );
      const request = join(f.root, "retry.json");
      await writeFile(
        request,
        JSON.stringify({
          schemaVersion: "mechanism-production-retry-1",
          baseRevision: 0,
          baseHash: mechanismPackHash(f.manifest),
          episodes: ["EU-005"],
        }),
      );
      mocks.blender.mockClear();
      expect(
        (
          await run([
            "retry",
            "--manifest",
            f.path,
            "--output-dir",
            f.output,
            "--request",
            request,
            "--report",
            join(f.root, "retry-result.json"),
          ])
        ).exitCode,
      ).toBe(0);
      expect(mocks.blender).not.toHaveBeenCalled();
      expect(
        BlenderProductionQueueSchema.parse(
          JSON.parse(await readFile(f.path, "utf8")),
        ).retryFailedIds,
      ).toEqual(["EU-005"]);
      broken = false;
      expect(
        (await run([...args, "--report", join(f.root, "repaired.json")]))
          .exitCode,
      ).toBe(0);
      expect(calls).toBe(3);
      const final = JSON.parse(
        await readFile(join(f.output, "queue-state.json"), "utf8"),
      );
      expect(final.rows[0]).toEqual(state.rows[0]);
      expect(
        final.rows[1].attempts.map((a: { status: string }) => a.status),
      ).toEqual(["failed", "passed"]);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("exports each strict native schema and makes no supported-pack or pilot claim in discovery", async () => {
    const f = await setup();
    try {
      const caps = inspectMechanismProductionCapabilities();
      expect(caps.backendSelection.execution).toBe(
        "pinned-manifest-schema-version",
      );
      expect(caps.nativeBlenderExecutor.commands).toEqual([
        "queue",
        "run",
        "retry",
        "report",
      ]);
      expect(caps.nativeBlenderExecutor.qa.plan).toBe("optional-pinned-qaPath");
      expect(caps.nativeBlenderExecutor.renderedQA.default).toBe(
        "all-native-products",
      );
      expect(caps.nativeBlenderExecutor.renderedQA.limits.badFrames).toBe(512);
      expect(mechanismProductionCapabilityMarkdown()).toContain(
        "Optional native `qaPath`",
      );
      expect(mechanismProductionCapabilityMarkdown()).not.toContain(
        "unsupported `qaPath`",
      );
      for (const kind of caps.schemas.filter((k) => k.startsWith("blender-"))) {
        const output = join(f.root, kind + ".json");
        expect(
          (await run(["schema", "--kind", kind, "--output", output])).exitCode,
        ).toBe(0);
        const schema = JSON.parse(await readFile(output, "utf8"));
        expect(schema.additionalProperties).toBe(false);
      }
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
});
