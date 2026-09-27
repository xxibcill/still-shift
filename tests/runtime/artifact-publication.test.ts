import type * as FileSystem from "node:fs/promises";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishArtifacts } from "@still-shift/execution-runtime/publication";

const injection = vi.hoisted(() => ({
  beforeLink: undefined as ((destination: string) => Promise<void>) | undefined,
  afterLink: undefined as ((destination: string) => Promise<void>) | undefined,
  beforeRename: undefined as ((source: string) => Promise<void>) | undefined,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return {
    ...actual,
    link: async (source: string, destination: string) => {
      await injection.beforeLink?.(destination);
      await actual.link(source, destination);
      await injection.afterLink?.(destination);
    },
    rename: async (source: string, destination: string) => {
      await injection.beforeRename?.(source);
      await actual.rename(source, destination);
    },
  };
});

let root: string;
let artifacts: Array<{ staged: string; destination: string }>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "still-shift-publication-"));
  await mkdir(join(root, "assembly"));
  artifacts = ["video", "report", "job"].map((name) => ({
    staged: join(root, "assembly", name),
    destination: join(root, name),
  }));
  for (const { staged } of artifacts) await writeFile(staged, "new");
});

afterEach(async () => {
  injection.beforeLink = undefined;
  injection.afterLink = undefined;
  injection.beforeRename = undefined;
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

const backups = async () =>
  (await readdir(root)).filter((name) => name.endsWith(".backup"));
const seedPrevious = async () => {
  for (const { destination } of artifacts)
    await writeFile(destination, "previous");
};

describe("artifact bundle publication", () => {
  it("publishes exclusively and rolls back failure before allowing retry", async () => {
    const failure = new Error("Storage full");
    injection.beforeLink = async (destination) => {
      if (destination === artifacts[1]!.destination) throw failure;
    };
    await expect(publishArtifacts(artifacts)).rejects.toBe(failure);
    expect(await readdir(root)).toEqual(["assembly"]);
    injection.beforeLink = undefined;
    await publishArtifacts(artifacts);
    expect(
      await Promise.all(
        artifacts.map(({ destination }) => readFile(destination, "utf8")),
      ),
    ).toEqual(["new", "new", "new"]);
    expect(await backups()).toEqual([]);
  });

  it("preserves an output created concurrently after preflight", async () => {
    injection.afterLink = async (destination) => {
      if (destination === artifacts[0]!.destination) {
        injection.afterLink = undefined;
        await writeFile(artifacts[1]!.destination, "another job", {
          flag: "wx",
        });
      }
    };
    await expect(publishArtifacts(artifacts)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(await readFile(artifacts[1]!.destination, "utf8")).toBe(
      "another job",
    );
    expect((await readdir(root)).sort()).toEqual(["assembly", "report"]);
  });

  it("restores previous resume outputs when a later publication fails", async () => {
    await seedPrevious();
    const failure = new Error("Report publication failed");
    injection.beforeLink = async (destination) => {
      if (destination === artifacts[1]!.destination) {
        injection.beforeLink = undefined;
        throw failure;
      }
    };
    await expect(
      publishArtifacts(artifacts, undefined, { replaceExisting: true }),
    ).rejects.toBe(failure);
    expect(
      await Promise.all(
        artifacts.map(({ destination }) => readFile(destination, "utf8")),
      ),
    ).toEqual(["previous", "previous", "previous"]);
    expect(await backups()).toEqual([]);
  });

  it("restores report and job completion when cancellation arrives during final publication", async () => {
    await seedPrevious();
    const controller = new AbortController();
    const reason = new Error("Cancelled before commit");
    injection.afterLink = async (destination) => {
      if (destination === artifacts[2]!.destination) {
        injection.afterLink = undefined;
        controller.abort(reason);
      }
    };
    await expect(
      publishArtifacts(artifacts, controller.signal, { replaceExisting: true }),
    ).rejects.toBe(reason);
    expect(
      await Promise.all(
        artifacts.map(({ destination }) => readFile(destination, "utf8")),
      ),
    ).toEqual(["previous", "previous", "previous"]);
    expect(await backups()).toEqual([]);
  });

  it("keeps a concurrent replacement and retains unrestored backups outside assembly cleanup", async () => {
    await seedPrevious();
    const failure = new Error("Later publication failed");
    injection.afterLink = async (destination) => {
      if (destination === artifacts[0]!.destination) {
        injection.afterLink = undefined;
        await rm(destination);
        await writeFile(destination, "replacement", { flag: "wx" });
      }
    };
    injection.beforeLink = async (destination) => {
      if (destination === artifacts[1]!.destination) {
        injection.beforeLink = undefined;
        throw failure;
      }
    };
    await expect(
      publishArtifacts(artifacts, undefined, { replaceExisting: true }),
    ).rejects.toMatchObject({ cause: failure });
    await rm(join(root, "assembly"), { recursive: true });
    expect(await readFile(artifacts[0]!.destination, "utf8")).toBe(
      "replacement",
    );
    const retained = await backups();
    expect(retained).toHaveLength(1);
    expect(await readFile(join(root, retained[0]!), "utf8")).toBe("previous");
  });

  it("preserves cancellation even when a replacement prevents rollback restoration", async () => {
    await seedPrevious();
    const controller = new AbortController();
    const reason = new Error("Cancelled");
    const diagnostic = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    injection.afterLink = async (destination) => {
      if (destination === artifacts[0]!.destination) {
        injection.afterLink = undefined;
        await rm(destination);
        await writeFile(destination, "replacement", { flag: "wx" });
        controller.abort(reason);
      }
    };
    await expect(
      publishArtifacts(artifacts, controller.signal, { replaceExisting: true }),
    ).rejects.toBe(reason);
    expect(await readFile(artifacts[0]!.destination, "utf8")).toBe(
      "replacement",
    );
    expect(await backups()).toHaveLength(1);
    expect(diagnostic).toHaveBeenCalledWith(
      expect.stringContaining("Artifact rollback failed"),
    );
  });

  it("does not replace a destination changed between inspection and backup", async () => {
    await seedPrevious();
    injection.beforeRename = async (source) => {
      if (source === artifacts[0]!.destination) {
        injection.beforeRename = undefined;
        await rm(source);
        await writeFile(source, "replacement", { flag: "wx" });
      }
    };
    await expect(
      publishArtifacts(artifacts, undefined, { replaceExisting: true }),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(artifacts[0]!.destination, "utf8")).toBe(
      "replacement",
    );
    expect(await backups()).toEqual([]);
  });
});
