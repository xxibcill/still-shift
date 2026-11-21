/**
 * CG5: LUT assets are read, size-checked, hash-checked and parsed when the
 * composition is loaded, before any browser or rendering work.
 */
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCompositionSource } from "../../packages/animation-engine/src/composition-source.ts";

const sha = (text: string) =>
  `sha256:${createHash("sha256").update(text).digest("hex")}`;
const identity = (size: number) => {
  const rows: string[] = [];
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++)
        rows.push([r, g, b].map((v) => (v / (size - 1)).toFixed(6)).join(" "));
  return `LUT_3D_SIZE ${size}\n${rows.join("\n")}\n`;
};

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "cg5-lut-source-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

async function load(
  text: string | undefined,
  pin = text ? sha(text) : sha(""),
) {
  const name = `case-${Math.random().toString(36).slice(2)}`;
  if (text !== undefined) await writeFile(join(dir, `${name}.cube`), text);
  const composition = {
    schemaVersion: "composition-1",
    id: "cg5-source",
    width: 16,
    height: 16,
    fps: 24,
    frameCount: 1,
    background: "#000000",
    assets: [
      {
        id: "look",
        type: "lut",
        path: `${name}.cube`,
        sha256: pin,
        format: "cube",
        inputSpace: "legacy-srgb",
        outputSpace: "legacy-srgb",
      },
    ],
    layers: [
      {
        id: "card",
        type: "solid",
        color: "#808080",
        size: [16, 16],
        effects: [
          { id: "grade", effect: "grade.lut", assets: { lut: "look" } },
        ],
      },
    ],
  };
  const path = join(dir, `${name}.json`);
  await writeFile(path, JSON.stringify(composition));
  return readCompositionSource(path);
}
const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return "resolved";
  } catch (error) {
    const diagnostics = (
      error as {
        diagnostics?: { code: string; message: string; path?: string }[];
      }
    ).diagnostics;
    return diagnostics
      ? diagnostics.map((d) => `${d.code} @${d.path}: ${d.message}`).join("\n")
      : String(error);
  }
};

describe("LUT assets before rendering", () => {
  it("parses a pinned LUT and serves its path", async () => {
    const source = await load(identity(5));
    expect(source.luts?.get("look")?.size).toBe(5);
    expect(source.assetPaths.look).toMatch(/\.cube$/);
  });
  it("rejects a wrong hash", async () => {
    expect(await failure(load(identity(3), sha("other")))).toMatch(
      /^comp-lut-checksum @assets\.0\.sha256: LUT checksum differs: look/,
    );
  });
  it("rejects a malformed LUT with its line", async () => {
    const text = identity(3).replace("0.500000 0.000000 0.000000", "0.5 x 0");
    expect(await failure(load(text))).toMatch(
      /^comp-lut-invalid @assets\.0: LUT look: \.cube line 3: table rows must be three finite numbers/,
    );
    expect(await failure(load("LUT_3D_SIZE 3\n0 0 0\n"))).toMatch(
      /comp-lut-invalid .*expected 27 entries, found 1/,
    );
  });
  it("rejects an oversized table", async () => {
    expect(await failure(load("LUT_3D_SIZE 130\n"))).toMatch(
      /comp-lut-invalid .*size 130 must be an integer from 2 to 129/,
    );
  });
  it("rejects a missing file", async () => {
    expect(await failure(load(undefined))).toMatch(
      /^comp-lut-unreadable @assets\.0/,
    );
  });
});
