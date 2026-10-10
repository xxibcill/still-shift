import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runEpisodeCli } from "../../tools/still-shift-cli/src/episode.ts";
import { createTapeHookProject } from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import { readMechanismEpisode } from "../../packages/animation-engine/src/mechanism/io.ts";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";
let directory: string, project: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "mechanism-cli-test-"));
  const result = await createTapeHookProject({
    outputDirectory: join(directory, "project"),
    fontPath: resolve("assets/story-motion/fonts/plex-sans-semibold.ttf"),
  });
  project = result.path;
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
async function runProcess(args: string[]) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tools/still-shift-cli/src/cli.ts", "episode", ...args],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "",
    error = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    error += chunk;
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const receipt = MechanismCommandReceiptSchema.parse(JSON.parse(output));
  return { code, receipt, output, error };
}
async function run(args: string[]) {
  let output = "",
    error = "";
  const code = await runEpisodeCli(args, {
    stdout: (text) => {
      output += text;
    },
    stderr: (text) => {
      error += text;
    },
  });
  const receipt = MechanismCommandReceiptSchema.parse(JSON.parse(output));
  return { code, receipt, output, error };
}
describe("episode CLI authoring protocol", () => {
  it("discovers commands and emits schema artifacts with bounded receipts", async () => {
    const discovery = await run(["discover"]);
    expect(discovery.code).toBe(0);
    expect(
      discovery.receipt.items.filter(
        (item) => typeof item.command === "string",
      ),
    ).toHaveLength(15);
    expect(
      discovery.receipt.items.some((item) => item.command === "patch"),
    ).toBe(true);
    const path = join(directory, "episode.schema.json");
    const schema = await run(["schema", "--kind", "episode", "--output", path]);
    expect(schema.code).toBe(0);
    expect(
      JSON.parse(await readFile(path, "utf8")).properties.schemaVersion.const,
    ).toBe("mechanism-episode-1");
  });
  it("discovers native limits and emits strict native schemas without claiming source execution", async () => {
    const discovery = await run(["discover"]);
    expect(discovery.receipt.summary.defaultRoute).toBe("bridge");
    expect(discovery.receipt.summary.nativePreparedVersion).toBe(
      "mechanism-prepared-native-episode-1",
    );
    expect(
      discovery.receipt.items.find((item) => item.kind === "native-route"),
    ).toMatchObject({
      backend: "webgl2",
      workers: 1,
      canvasAllowed: false,
      profile: "native-three-aces-hdr-msaa4-1",
    });
    expect(
      discovery.receipt.items.find(
        (item) => item.kind === "native-observation-limits",
      ),
    ).toMatchObject({
      packetBytes: 1048576,
      passes: 64,
      shardBytes: 33554432,
      shards: 16,
      totalBytes: 536870912,
    });
    expect(Buffer.byteLength(discovery.output)).toBeLessThanOrEqual(32768);
    for (const kind of [
      "native-source",
      "solid-scene",
      "solid-geometry",
      "native-binding",
      "native-observed-frame",
      "native-observed-output-frame",
      "native-prepared-receipt",
    ] as const) {
      const path = join(directory, `${kind}.schema.json`);
      const result = await run(["schema", "--kind", kind, "--output", path]);
      expect(result.code).toBe(0);
      expect(result.receipt.summary.kind).toBe(kind);
      expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(32768);
      const document = JSON.parse(await readFile(path, "utf8"));
      if (kind !== "native-source" && kind !== "native-binding")
        expect(document.additionalProperties).toBe(false);
    }
    const inspected = await run(["inspect", "--input", project]);
    expect(inspected.receipt.summary).toMatchObject({
      "route.sourceRoute": null,
      "route.effectiveRoute": "bridge",
      "route.selectionOrigin": "default",
    });
  });
  it("discovers versioned native metadata selectors in the existing strict receipt", async () => {
    const discovered = await run(["discover"]);
    expect(discovered.receipt.schemaVersion).toBe("mechanism-command-result-1");
    expect(discovered.receipt.summary.nativeInspectionVersion).toBe(
      "mechanism-native-inspection-1",
    );
    expect(
      discovered.receipt.items.find(
        (item) => item.kind === "native-inspection",
      ),
    ).toMatchObject({
      version: "mechanism-native-inspection-1",
      selectors: "source parts anchors materials cameras controls all",
      schema: "native-inspection-selection",
    });
    const path = join(directory, "native-inspection-selection.schema.json");
    const schema = await run([
      "schema",
      "--kind",
      "native-inspection-selection",
      "--output",
      path,
    ]);
    expect(schema.code).toBe(0);
    const document = JSON.parse(await readFile(path, "utf8"));
    expect(document.additionalProperties).toBe(false);
    expect(document.properties.version.const).toBe(
      "mechanism-native-inspection-1",
    );
    expect(document.properties.native.enum).toEqual([
      "source",
      "parts",
      "anchors",
      "materials",
      "cameras",
      "controls",
      "all",
    ]);
  });
  it("selects original physical IDs and episode camera metadata without claiming saved recipe or rendered state", async () => {
    const loaded = await readMechanismEpisode(project),
      before = await readFile(project, "utf8");
    const part = await run([
      "inspect",
      "--input",
      project,
      "--native",
      "parts",
      "--part",
      "hook",
    ]);
    expect(part.code).toBe(0);
    expect(part.receipt.items).toHaveLength(1);
    expect(part.receipt.items[0]).toMatchObject({
      kind: "native-part",
      id: "hook",
      parent: "model",
      scope: "original-scene",
      scaleX: 1,
    });
    expect(part.receipt.summary).toMatchObject({
      nativeSourceSha256: loaded.episode.dependencies.find(
        (dependency) => dependency.id === loaded.episode.scene,
      )!.sha256,
      nativeUnits: loaded.scene.units.kind,
      savedRecipeScope: "unassessed",
      nativeExecution: "unassessed",
    });
    const shot = loaded.episode.shots[0]!;
    const camera = await run([
      "inspect",
      "--input",
      project,
      "--native",
      "cameras",
      "--shot",
      shot.id,
    ]);
    expect(camera.code).toBe(0);
    expect(
      camera.receipt.items.find((item) => item.kind === "native-shot-camera"),
    ).toMatchObject({
      shot: shot.id,
      fovDegrees: (shot.camera ?? loaded.scene.camera).fovDegrees,
      origin: "episode-shot-camera",
    });
    expect(
      camera.receipt.items.filter((item) => item.kind === "native-camera-key"),
    ).toHaveLength(shot.cameraKeys!.length);
    expect(
      camera.receipt.items.every(
        (item) => item.shot === shot.id || item.id === shot.id,
      ),
    ).toBe(true);
    expect(camera.output).not.toContain('"positions"');
    expect(camera.output).not.toContain('"indices"');
    expect(await readFile(project, "utf8")).toBe(before);
    const legacy = await run([
      "inspect",
      "--input",
      project,
      "--shot",
      shot.id,
    ]);
    expect(legacy.receipt.summary.nativeInspectionVersion).toBeUndefined();
    expect(
      legacy.receipt.items.some((item) => item.kind === "dependency"),
    ).toBe(true);
    expect(
      legacy.receipt.items.some((item) =>
        String(item.kind).startsWith("native-"),
      ),
    ).toBe(false);
  });
  it("locates invalid native categories, incompatible filters and missing declared IDs", async () => {
    for (const [options, code, path] of [
      [["--native", "renderer"], "mechanism-inspect-selection", "--native"],
      [["--part", "hook"], "mechanism-inspect-selection", "--part"],
      [
        ["--native", "materials", "--part", "hook"],
        "mechanism-inspect-selection",
        "--part",
      ],
      [
        ["--native", "parts", "--part", "missing"],
        "mechanism-inspect-reference",
        "--part",
      ],
      [
        ["--native", "cameras", "--shot", "missing"],
        "mechanism-shot-reference",
        "--shot",
      ],
    ] as const) {
      const result = await run(["inspect", "--input", project, ...options]);
      expect(result.code).toBe(2);
      expect(result.receipt.status).toBe("failed");
      expect(result.receipt.summary).toMatchObject({ code, path });
      expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(32769);
    }
  });
  it("inspects current hashes and flattened labels without emitting raw geometry", async () => {
    const result = await run(["inspect", "--input", project]);
    expect(result.code).toBe(0);
    expect(result.receipt.summary.revision).toBe(0);
    expect(result.receipt.summary.projectHash).toMatch(/^sha256:/);
    expect(
      result.receipt.items.filter((item) => item.kind === "label"),
    ).toHaveLength(7);
    expect(result.output).not.toContain('"positions"');
    expect(result.output).not.toContain('"indices"');
  });
  it("provides source-only fresh-session summary with current revision, shot ranges and label positions", async () => {
    const before = await readFile(project, "utf8");
    const result = await run(["summary", "--input", project]);
    expect(result.code).toBe(0);
    expect(result.receipt.summary.projectHash).toMatch(/^sha256:/);
    expect(
      result.receipt.items.filter((item) => item.kind === "shot"),
    ).toHaveLength(9);
    const travel = result.receipt.items.find(
      (item) => item.kind === "label" && item.id === "label-travel",
    );
    expect(travel).toMatchObject({ shot: "V8-05", text: "TRAVEL" });
    expect(travel?.position).toBeDefined();
    expect(result.output).not.toContain('"indices"');
    expect(await readFile(project, "utf8")).toBe(before);
  });
  it("locates unsupported project versions and preserves the source", async () => {
    const path = join(directory, "unknown.json"),
      value = { schemaVersion: "mechanism-episode-99" };
    await writeFile(path, JSON.stringify(value));
    const result = await run(["validate", "--input", path]);
    expect(result.code).toBe(2);
    expect(result.receipt.summary.code).toBe("mechanism-version");
    expect(result.receipt.summary.path).toContain("schemaVersion");
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(value);
  });
  it("retains every schema issue in its complete diagnostic report", async () => {
    const episode = JSON.parse(await readFile(project, "utf8"));
    episode.output.width = 0;
    episode.output.fps = 0;
    episode.output.frameCount = 0;
    const path = join(directory, "invalid-fields.json");
    await writeFile(path, JSON.stringify(episode));
    const result = await run(["validate", "--input", path]);
    expect(result.code).toBe(2);
    expect(result.receipt.summary.code).toBe("mechanism-schema");
    const artifact = result.receipt.artifacts.find(
      (item) => item.kind === "full-report",
    )!;
    const full = JSON.parse(await readFile(artifact.path, "utf8"));
    expect(full.diagnostics.length).toBeGreaterThanOrEqual(3);
    for (const field of ["width", "fps", "frameCount"])
      expect(
        full.diagnostics.some(
          (issue: { path: string[] }) =>
            issue.path.join("/") === `output/${field}`,
        ),
      ).toBe(true);
    expect(result.receipt.items.length).toBeGreaterThanOrEqual(
      full.diagnostics.length,
    );
  });
  it("rejects a stale scoped edit before touching the project", async () => {
    const loaded = await readMechanismEpisode(project),
      before = await readFile(project, "utf8");
    const shot = loaded.episode.shots.find((item) => item.labels.length > 0)!;
    const path = join(directory, "stale.patch.json");
    await writeFile(
      path,
      JSON.stringify({
        schemaVersion: "mechanism-patch-1",
        baseRevision: 0,
        baseHash: "sha256:" + "0".repeat(64),
        operations: [
          {
            shot: shot.id,
            label: shot.labels[0]!.id,
            property: "text",
            value: "PULL 2",
          },
        ],
      }),
    );
    const result = await run(["patch", "--input", project, "--request", path]);
    expect(result.code).toBe(2);
    expect(result.receipt.summary.code).toBe("mechanism-stale-revision");
    expect(await readFile(project, "utf8")).toBe(before);
  });
  it("retains all large dependency findings and returns a paginated response", async () => {
    const loaded = await readMechanismEpisode(project),
      episode = structuredClone(loaded.episode);
    episode.dependencies.push(
      ...Array.from({ length: 498 }, (_, index) => ({
        id: `missing${index}`,
        type: "timing" as const,
        path: `assets/missing-${index}.json`,
        sha256: "sha256:" + "a".repeat(64),
      })),
    );
    const path = join(directory, "project", "missing.json"),
      report = join(directory, "dependencies.full.json");
    await writeFile(path, JSON.stringify(episode));
    const result = await run([
      "deps",
      "--input",
      path,
      "--limit",
      "12",
      "--report",
      report,
    ]);
    expect(result.code).toBe(2);
    expect(result.receipt.truncated).toBe(true);
    expect(result.receipt.pagination.returned).toBe(12);
    expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(32769);
    const full = JSON.parse(await readFile(report, "utf8"));
    expect(full.findings).toHaveLength(498);
    expect(full.dependencies).toHaveLength(2);
  });
  it("refuses unsafe save relocation and validates patch protocol versions", async () => {
    const save = await run([
      "save",
      "--input",
      project,
      "--output",
      join(directory, "relocated.json"),
    ]);
    expect(save.code).toBe(2);
    expect(save.receipt.summary.code).toBe("mechanism-save-relocation");
    const path = join(directory, "unknown.patch.json");
    await writeFile(
      path,
      JSON.stringify({ schemaVersion: "mechanism-patch-8" }),
    );
    const patch = await run(["patch", "--input", project, "--request", path]);
    expect(patch.code).toBe(2);
    expect(patch.receipt.summary.path).toBe("schemaVersion");
  });
  it("applies one scoped label edit with a new revision and explicit cache dispositions", async () => {
    const loaded = await readMechanismEpisode(project),
      shot = loaded.episode.shots.find((item) => item.labels.length > 0)!;
    const path = join(directory, "valid.patch.json");
    await writeFile(
      path,
      JSON.stringify({
        schemaVersion: "mechanism-patch-1",
        baseRevision: loaded.episode.revision,
        baseHash: loaded.projectHash,
        operations: [
          {
            shot: shot.id,
            label: shot.labels[0]!.id,
            property: "text",
            value: "PULL 2",
          },
        ],
      }),
    );
    const result = await run(["patch", "--input", project, "--request", path]);
    expect(result.code).toBe(0);
    expect(result.receipt.summary.revision).toBe(1);
    expect(result.receipt.summary["cache.geometry"]).toBe("reuse");
    expect(result.receipt.summary["cache.cleanPlates"]).toBe("reuse");
    expect(result.receipt.summary["cache.overlays"]).toBe(
      "invalidate-affected-shots",
    );
    expect(
      result.receipt.items.some((item) => item.kind === "changedPaths"),
    ).toBe(true);
    const changed = await readMechanismEpisode(project);
    expect(
      changed.episode.shots.find((item) => item.id === shot.id)!.labels[0]!
        .text,
    ).toBe("PULL 2");
    expect(changed.scene.geometrySha256).toBe(loaded.scene.geometrySha256);
  });
  it("rejects response options before executing a mutating command", async () => {
    const path = join(directory, "must-not-create");
    const result = await run([
      "init-tape-hook",
      "--output-dir",
      path,
      "--font",
      resolve("assets/story-motion/fonts/plex-sans-semibold.ttf"),
      "--limit",
      "0",
    ]);
    expect(result.code).toBe(2);
    expect(result.receipt.summary.message).toContain("1..100");
    await expect(readFile(join(path, "episode.json"))).rejects.toThrow();
  });
  it("exposes actual final layout failures in the compact render receipt", async () => {
    const created = await createTapeHookProject({
      outputDirectory: join(directory, "bad-layout"),
      fontPath: resolve("assets/story-motion/fonts/plex-sans-semibold.ttf"),
    });
    const episode = JSON.parse(await readFile(created.path, "utf8"));
    const shot = episode.shots[0];
    delete shot.cameraKeys;
    shot.endFrameExclusive = 40;
    shot.controls = { slider: { travel: 0, contactMode: "free" } };
    shot.labels = [
      {
        id: "offscreen-pull",
        role: "PULL",
        text: "PULL",
        anchor: "hook.pullProof",
        proofTarget: "hook.pullProof",
        position: [400, 400],
        readingInterval: { startFrame: 0, endFrameExclusive: 40 },
        fontSize: 16,
      },
    ];
    episode.output = { width: 160, height: 284, fps: 30, frameCount: 40 };
    episode.shots = [shot];
    episode.captions = [];
    episode.events = [];
    await writeFile(created.path, JSON.stringify(episode));
    const output = join(directory, "bad-layout-render");
    const rendered = await runProcess([
      "render",
      "--input",
      created.path,
      "--output-dir",
      output,
      "--cache-dir",
      join(directory, "bad-layout-cache"),
    ]);
    expect(rendered.code, rendered.output + rendered.error).toBe(2);
    expect(rendered.receipt.status).toBe("failed");
    const complete = JSON.parse(
      await readFile(join(output, "episode.result.json"), "utf8"),
    );
    expect(complete.check.checkedFrames).toBe(40);
    expect(complete.check.overlayReport.findings.length).toBeGreaterThan(0);
    for (const finding of complete.check.overlayReport.findings)
      expect(rendered.receipt.items).toContainEqual(
        expect.objectContaining({
          code: finding.code,
          path: finding.path,
          kind: "overlayReport",
        }),
      );
    expect(rendered.receipt.summary["check.overlayReport.layoutAccepted"]).toBe(
      false,
    );
    expect(rendered.receipt.nextAction).toContain("current revision and hash");
    expect(Buffer.byteLength(rendered.output)).toBeLessThanOrEqual(32769);
    expect(
      (await readFile(join(output, "episode.mp4"))).length,
    ).toBeGreaterThan(0);
  }, 180_000);
});
