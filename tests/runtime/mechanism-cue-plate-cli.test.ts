import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MECHANISM_CUE_NATIVE_PLATES_VERSION,
  MECHANISM_CUE_PLATE_EXPORT_VERSION,
  prepareMechanismCueNativePlates,
  checkMechanismCueNativePlates,
  renderMechanismCuePlateProject,
  checkMechanismCuePlateOutput,
} from "@still-shift/animation-engine";
import { runEpisodeCli } from "../../tools/still-shift-cli/src/episode.ts";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";
async function run(args: string[]) {
  let output = "";
  const code = await runEpisodeCli(args, {
    stdout: (value) => {
      output += value;
    },
    stderr: () => {},
  });
  expect(Buffer.byteLength(output)).toBeLessThanOrEqual(32768);
  return {
    code,
    receipt: MechanismCommandReceiptSchema.parse(JSON.parse(output)),
  };
}
describe("public native cue plate protocol", () => {
  it("discovers actual versioned capture/reuse/check routes and exports the strict registered schemas", async () => {
    const directory = await mkdtemp("/private/tmp/still-shift-cue-plate-cli-");
    try {
      const discovery = await run(["discover"]);
      expect(discovery.code).toBe(0);
      expect(discovery.receipt.summary.cueNativePlatesVersion).toBe(
        MECHANISM_CUE_NATIVE_PLATES_VERSION,
      );
      expect(discovery.receipt.summary.cuePlateExportVersion).toBe(
        MECHANISM_CUE_PLATE_EXPORT_VERSION,
      );
      expect(
        discovery.receipt.items.find(
          (row) => row.kind === "cue-native-plate-cache",
        ),
      ).toMatchObject({ authoring: "cue", backend: "webgl2", workers: 1 });
      for (const [kind, version] of [
        ["cue-native-plates", MECHANISM_CUE_NATIVE_PLATES_VERSION],
        ["cue-plate-export", MECHANISM_CUE_PLATE_EXPORT_VERSION],
      ] as const) {
        const path = join(directory, kind + ".json");
        const result = await run(["schema", "--kind", kind, "--output", path]);
        expect(result.code).toBe(0);
        const schema = JSON.parse(await readFile(path, "utf8"));
        expect(schema.additionalProperties).toBe(false);
        expect(schema.properties.schemaVersion.const).toBe(version);
        expect(schema.required).toContain("nativePictureSha256");
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
  it("rejects ambiguous or ignored cache flags before any missing input is opened", async () => {
    const input = ["--input", "/deliberately-missing/cues.json"];
    const cue = [
      ...input,
      "--authoring",
      "cue",
      "--family-input",
      "/deliberately-missing/family.json",
    ];
    for (const [args, path] of [
      [
        [
          "prepare",
          ...cue,
          "--plates-dir",
          "/deliberately-missing/plates",
          "--prepared-dir",
          "/deliberately-missing/compiled",
          "--output-dir",
          "/deliberately-missing/output",
        ],
        "--output-dir",
      ],
      [
        [
          "prepare",
          ...cue,
          "--prepared-dir",
          "/deliberately-missing/compiled",
          "--output-dir",
          "/deliberately-missing/output",
        ],
        "--prepared-dir",
      ],
      [
        [
          "prepare",
          ...input,
          "--prepared-dir",
          "/deliberately-missing/compiled",
        ],
        "--prepared-dir",
      ],
      [
        ["render", ...input, "--plates-dir", "/deliberately-missing/plates"],
        "--plates-dir",
      ],
      [
        [
          "check",
          ...input,
          "--authoring",
          "family",
          "--plates-dir",
          "/deliberately-missing/plates",
        ],
        "--plates-dir",
      ],
    ] as const) {
      const result = await run([...args]);
      expect(result.code).toBe(2);
      expect(result.receipt.summary.path).toBe(path);
      expect(result.receipt.status).toBe("failed");
    }
  });
  it("preserves pre-abort identity at all four public API boundaries without creating output", async () => {
    const directory = await mkdtemp(
      "/private/tmp/still-shift-cue-plate-public-abort-",
    );
    const controller = new AbortController(),
      reason = Error("public cache pre-abort");
    controller.abort(reason);
    const family = join(directory, "family.json"),
      cue = join(directory, "cues.json"),
      compiled = join(directory, "compiled"),
      plates = join(directory, "plates"),
      output = join(directory, "output");
    try {
      const options = { signal: controller.signal };
      await expect(
        prepareMechanismCueNativePlates(family, cue, compiled, plates, options),
      ).rejects.toBe(reason);
      await expect(
        checkMechanismCueNativePlates(family, cue, compiled, plates, options),
      ).rejects.toBe(reason);
      await expect(
        renderMechanismCuePlateProject(
          family,
          cue,
          compiled,
          plates,
          output,
          options,
        ),
      ).rejects.toBe(reason);
      await expect(
        checkMechanismCuePlateOutput(
          family,
          cue,
          compiled,
          plates,
          join(output, "output.mp4"),
          options,
        ),
      ).rejects.toBe(reason);
      await expect(access(plates)).rejects.toThrow();
      await expect(access(output)).rejects.toThrow();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
