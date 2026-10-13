import { readFile, writeFile, rm, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  createMechanismProductionQueueFile,
  MechanismProductionProjectsSchema,
} from "@still-shift/animation-engine";
import { fixture } from "../fixtures/mechanism-production-queue-support.ts";
async function setup() {
  const f = await fixture();
  const projectsPath = join(f.root, "projects.json"),
    destination = join(f.root, "nested", "created.json");
  const input = {
    schemaVersion: "mechanism-production-projects-1",
    id: f.manifest.id,
    projects: f.manifest.items.map((item) => ({
      id: item.id,
      question: item.question,
      familyPath: item.familyPath,
      cuePath: item.cuePath,
    })),
  };
  await writeFile(projectsPath, JSON.stringify(input));
  const factory = {
    createQueue: async (
      _id: string,
      projects: {
        id: string;
        question: string;
        familyPath: string;
        cuePath: string;
      }[],
      directory: string,
    ) => ({
      ...f.manifest,
      items: f.manifest.items.map((item, index) => ({
        ...item,
        familyPath: relative(directory, projects[index]!.familyPath),
        cuePath: relative(directory, projects[index]!.cuePath),
        inputs: item.inputs.map((pin) => ({
          ...pin,
          path: relative(directory, join(f.root, pin.path)),
        })),
      })),
    }),
  };
  return { ...f, projectsPath, destination, input, factory };
}
describe("declarative production queue creation", () => {
  it("resolves project paths from the declaration and publishes exactly one immutable concurrent manifest", async () => {
    const f = await setup();
    const parent = new CompositionNodeMemory(),
      foreign = parent.reserve(1024);
    try {
      const attempts = await Promise.allSettled(
        [1, 2].map(() =>
          createMechanismProductionQueueFile(
            f.projectsPath,
            f.destination,
            f.factory,
            { nodeMemory: parent },
          ),
        ),
      );
      expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter((a) => a.status === "rejected")).toHaveLength(1);
      const manifest = JSON.parse(await readFile(f.destination, "utf8"));
      expect(manifest.items[0].familyPath).toBe("../family.json");
      expect(
        manifest.items[0].inputs.map((p: { path: string }) => p.path),
      ).toEqual(["../family.json", "../cues.json"]);
      const original = await readFile(f.destination);
      await expect(
        createMechanismProductionQueueFile(
          f.projectsPath,
          f.destination,
          f.factory,
          { nodeMemory: parent },
        ),
      ).rejects.toThrow();
      expect(await readFile(f.destination)).toEqual(original);
      expect(foreign.active).toBe(true);
      expect(parent.statistics.current.metadata).toBe(1024);
    } finally {
      parent.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("rejects an excessive project array before producer calls and retires only its own admission", async () => {
    const f = await setup();
    const parent = new CompositionNodeMemory(),
      foreign = parent.reserve(1024);
    let calls = 0;
    try {
      await writeFile(
        f.projectsPath,
        JSON.stringify({ ...f.input, projects: Array(50000).fill(0) }),
      );
      await expect(
        createMechanismProductionQueueFile(
          f.projectsPath,
          f.destination,
          {
            createQueue: async () => {
              calls++;
              return f.manifest;
            },
          },
          { nodeMemory: parent },
        ),
      ).rejects.toThrow(/Project count/);
      expect(calls).toBe(0);
      expect(foreign.active).toBe(true);
      expect(parent.statistics.current.metadata).toBe(1024);
      await expect(stat(f.destination)).rejects.toThrow();
    } finally {
      parent.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("rejects duplicate questions, factory misbinding and cancellation without publishing", async () => {
    const f = await setup();
    try {
      expect(
        MechanismProductionProjectsSchema.safeParse({
          ...f.input,
          projects: [
            f.input.projects[0],
            {
              ...f.input.projects[1],
              question: f.input.projects[0]!.question.toUpperCase(),
            },
          ],
        }).success,
      ).toBe(false);
      await expect(
        createMechanismProductionQueueFile(f.projectsPath, f.destination, {
          createQueue: async () => ({ ...f.manifest, id: "different" }),
        }),
      ).rejects.toThrow(/differs from the declared/);
      const controller = new AbortController();
      controller.abort(Error("stop creation"));
      await expect(
        createMechanismProductionQueueFile(
          f.projectsPath,
          f.destination,
          f.factory,
          { signal: controller.signal },
        ),
      ).rejects.toThrow(/stop creation/);
      await expect(stat(f.destination)).rejects.toThrow();
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
});
