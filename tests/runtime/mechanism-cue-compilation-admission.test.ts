import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import type * as FsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { createCueProjectFixture } from "../helpers/mechanism-cue-project.ts";
import {
  compileMechanismCueProject,
  readMechanismCueCompilation,
} from "../../packages/animation-engine/src/mechanism/cue-lifecycle.ts";

const monitor = vi.hoisted(() => ({
  path: "",
  reads: 0,
  closed: 0,
  afterRead: undefined as (() => void) | undefined,
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      if (args[0] !== monitor.path) return handle;
      const read = handle.read.bind(handle),
        close = handle.close.bind(handle);
      vi.spyOn(handle, "read").mockImplementation(async (...values) => {
        const result = await read(...values);
        monitor.reads++;
        const after = monitor.afterRead;
        monitor.afterRead = undefined;
        after?.();
        return result;
      });
      vi.spyOn(handle, "close").mockImplementation(async () => {
        await close();
        monitor.closed++;
      });
      return handle;
    },
  };
});

const execute = promisify(execFile);
let root: string,
  familyPath: string,
  cuePath: string,
  prepared: string,
  compositionPath: string;
const originals = new Map<string, Buffer>();
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cue-compilation-admission-"));
  ({ familyPath, cuePath } = await createCueProjectFixture(root));
  prepared = join(root, "prepared");
  const compiled = await compileMechanismCueProject(
    familyPath,
    cuePath,
    prepared,
  );
  compositionPath = compiled.compositionPath;
  for (const path of [
    compositionPath,
    join(prepared, "cue-compilation.json"),
    familyPath,
    cuePath,
    join(root, "scene.json"),
  ])
    originals.set(path, await readFile(path));
  monitor.path = await realpath(compositionPath);
}, 20_000);
afterEach(async () => {
  monitor.afterRead = undefined;
  monitor.reads = monitor.closed = 0;
  for (const [path, bytes] of originals) {
    await rm(path, { force: true });
    await writeFile(path, bytes);
  }
  monitor.path = await realpath(compositionPath);
});
afterAll(async () => {
  await rm(root, { force: true, recursive: true });
});

describe("compiled cue snapshot admission", () => {
  it
    .skipIf(process.platform === "win32")
    .each([
      "composition.json",
      "cue-compilation.json",
      "family.json",
      "cues.json",
      "scene.json",
    ])(
    "rejects a FIFO at %s through the public native-cache API before waiting for a writer",
    async (name) => {
      const path = join(
        name === "composition.json" || name === "cue-compilation.json"
          ? prepared
          : root,
        name,
      );
      await rm(path);
      execFileSync("mkfifo", [path]);
      const { stdout } = await execute(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "--eval",
          `import assert from "node:assert/strict";
           import { prepareMechanismCueNativePlates } from "./packages/animation-engine/src/mechanism/cue-native-plates.ts";
           const [family, cue, prepared, output] = process.argv.slice(1);
           await assert.rejects(
             prepareMechanismCueNativePlates(family, cue, prepared, output),
             (error) => {
               assert.match(error.message, /must be a regular file/);
               return true;
             },
           );
           console.log("FIFO rejected before native capture");`,
          familyPath,
          cuePath,
          prepared,
          join(root, "plates"),
        ],
        { timeout: 5_000, killSignal: "SIGKILL", maxBuffer: 65_536 },
      );
      expect(stdout.trim()).toBe("FIFO rejected before native capture");
    },
    10_000,
  );

  it("checks remaining caller capacity before reading the compiled snapshot body", async () => {
    const owner = new CompositionNodeMemory(),
      foreign = owner.reserve(owner.availableBytes - 65_536),
      before = owner.statistics.current.metadata;
    try {
      await expect(
        readMechanismCueCompilation(familyPath, cuePath, prepared, {
          nodeMemory: owner,
        }),
      ).rejects.toMatchObject({
        code: "SCENE_INVALID",
        message: "Composition source exceeds its available Node capacity",
      });
      expect(monitor.reads).toBe(0);
      expect(owner.statistics.current.metadata).toBe(before);
      expect(foreign.active).toBe(true);
    } finally {
      owner.dispose();
    }
  });

  it.each([Error("compiled snapshot abort"), null])(
    "preserves the original in-flight abort reason %s and retires only local leases",
    async (reason) => {
      const owner = new CompositionNodeMemory(),
        foreign = owner.reserve(1024),
        before = owner.statistics.current.metadata,
        controller = new AbortController();
      monitor.afterRead = () => controller.abort(reason);
      try {
        await expect(
          readMechanismCueCompilation(familyPath, cuePath, prepared, {
            nodeMemory: owner,
            signal: controller.signal,
          }),
        ).rejects.toBe(reason);
        expect(monitor.reads).toBe(1);
        expect(monitor.closed).toBe(1);
        expect(owner.statistics.current.metadata).toBe(before);
        expect(foreign.active).toBe(true);
      } finally {
        owner.dispose();
      }
    },
  );

  it.each(["cue-compilation.json", "family.json", "cues.json", "scene.json"])(
    "preserves cancellation while reading the saved %s input",
    async (name) => {
      monitor.path = await realpath(
        join(name === "cue-compilation.json" ? prepared : root, name),
      );
      const controller = new AbortController(),
        reason = Error("abort saved " + name);
      monitor.afterRead = () => controller.abort(reason);
      await expect(
        readMechanismCueCompilation(familyPath, cuePath, prepared, {
          signal: controller.signal,
        }),
      ).rejects.toBe(reason);
      expect(monitor.reads).toBe(1);
      expect(monitor.closed).toBe(1);
    },
  );

  it("releases successful validation storage without retiring caller leases", async () => {
    const owner = new CompositionNodeMemory(),
      foreign = owner.reserve(1024),
      before = owner.statistics.current.metadata;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await readMechanismCueCompilation(
          familyPath,
          cuePath,
          prepared,
          { nodeMemory: owner },
        );
        expect(current.receipt.composition.path).toBe(compositionPath);
        expect(owner.statistics.current.metadata).toBe(before);
        expect(foreign.active).toBe(true);
      }
      expect(monitor.reads).toBeGreaterThan(0);
    } finally {
      owner.dispose();
    }
  });

  it("preserves a pre-abort before opening any compilation inputs", async () => {
    const reason = Error("before compilation validation");
    await expect(
      readMechanismCueCompilation("missing", "missing", "missing", {
        signal: AbortSignal.abort(reason),
      }),
    ).rejects.toBe(reason);
  });
});
