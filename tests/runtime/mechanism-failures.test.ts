import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as Vite from "vite";
import { runEpisodeCli } from "../../tools/still-shift-cli/src/episode.ts";
import { createTapeHookProject } from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";

vi.mock("vite", async (original) => ({
  ...(await original<typeof Vite>()),
  createServer: vi.fn(async () => ({
    listen: async () => {
      throw Object.assign(new Error("listen EPERM token=private-test-token"), {
        code: "EPERM",
      });
    },
    close: async () => {},
  })),
}));
let directory: string, project: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "mechanism-failures-"));
  const result = await createTapeHookProject({
    outputDirectory: join(directory, "project"),
    fontPath: resolve("assets/story-motion/fonts/plex-sans-semibold.ttf"),
  });
  project = result.path;
});
afterAll(async () => rm(directory, { recursive: true, force: true }));
async function command(args: string[]) {
  let output = "";
  const code = await runEpisodeCli(args, {
    stdout: (value) => {
      output += value;
    },
    stderr: () => {},
  });
  return {
    code,
    receipt: MechanismCommandReceiptSchema.parse(JSON.parse(output)),
    output,
  };
}
describe("located mechanism failure receipts", () => {
  it("sanitizes top-level command text and the retained complete error report", async () => {
    const result = await command(["token=review-secret-value"]);
    expect(result.code).toBe(2);
    expect(result.output).not.toContain("review-secret-value");
    expect(result.receipt.summary.message).toContain("[redacted]");
    const report = result.receipt.artifacts.find(
      (item) => item.kind === "full-report",
    )!;
    expect(await readFile(report.path, "utf8")).not.toContain(
      "review-secret-value",
    );
    expect(result.receipt.nextAction).toContain("episode discover");
  });

  it("retains bind EPERM cause and attempt without publishing a plate or exposing credentials", async () => {
    const destination = join(directory, "blocked-capture");
    const result = await command([
      "preview",
      "--input",
      project,
      "--frame",
      "138",
      "--output-dir",
      destination,
    ]);
    expect(result.code).toBe(1);
    expect(result.receipt.status).toBe("failed");
    expect(result.output).toContain("EPERM");
    expect(result.output).not.toContain("private-test-token");
    expect(result.receipt.summary.stage).toContain("capture");
    expect(result.receipt.nextAction).toBeTruthy();
    await expect(
      readFile(join(destination, "capture.receipt.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    const reportPath = result.receipt.artifacts.find(
      (item) => item.kind === "full-report",
    )?.path;
    expect(reportPath).toBeTruthy();
    const full = await readFile(reportPath!, "utf8");
    expect(full).not.toContain("private-test-token");
  }, 30_000);
  it("rejects an unsupported backend before creating output and preserves the saved project", async () => {
    const before = await readFile(project),
      destination = join(directory, "unsupported");
    const result = await command([
      "render",
      "--input",
      project,
      "--output-dir",
      destination,
      "--backend",
      "unavailable",
    ]);
    expect(result.code).toBe(2);
    expect(result.receipt.summary.path).toBe("--backend");
    expect(result.receipt.summary.code).toBe("mechanism-backend");
    expect(await readFile(project)).toEqual(before);
    await expect(
      readFile(join(destination, "episode.mp4")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("reports missing font and incompatible geometry with asset paths and complete diagnostics", async () => {
    const episode = JSON.parse(await readFile(project, "utf8"));
    const missing = join(directory, "project", "missing-font.json");
    episode.dependencies.find(
      (item: { type: string }) => item.type === "font",
    ).path = "assets/absent.ttf";
    await writeFile(missing, JSON.stringify(episode));
    const result = await command(["validate", "--input", missing]);
    expect(result.code).toBe(2);
    expect(result.output).toContain("absent.ttf");
    expect(result.receipt.nextAction).toBeTruthy();
    const scene = JSON.parse(
      await readFile(join(directory, "project", "scene.json"), "utf8"),
    );
    scene.schemaVersion = "mechanism-scene-99";
    await writeFile(
      join(directory, "project", "scene.json"),
      JSON.stringify(scene),
    );
    const mismatch = await command(["deps", "--input", project]);
    expect(mismatch.code).toBe(2);
    expect(
      mismatch.receipt.items.some((item) => item.path === "scene.json"),
    ).toBe(true);
  });
});
