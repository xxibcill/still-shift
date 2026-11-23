/**
 * CG7: the color-managed source stage's decode. Each CG0 10-bit ramp
 * (FFV1 4:2:2, generated, license-free) is prepared into the 16-bit scene
 * cache, read back, passed through its input transform into ACEScct and a
 * neutral grade, and re-encoded to 10-bit Y′ codes: every code must survive.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  sourceTransform,
  type SourceEncoding,
} from "@still-shift/color-science";
import {
  compositionSceneSample,
  COMPOSITION_MEDIA_SCENE_DECODER_VERSION,
  type CompositionAsset,
  type CompositionMediaColor,
} from "@still-shift/scene-contract";
import { prepareCompositionVisualMedia } from "../../packages/animation-engine/src/composition-media-cache.ts";
import {
  compositionMediaChecksum,
  probeCompositionVideo,
} from "../../packages/animation-engine/src/composition-media-probe.ts";
import { decodeScenePng } from "../../packages/animation-engine/src/composition-media-scene.ts";

const root = join(import.meta.dirname, "../../benchmarks/fixtures/color/cg0");
const manifest = JSON.parse(
  await readFile(join(root, "manifest.json"), "utf8"),
) as {
  files: { id: string; path: string; lumaCodes?: number[]; tags?: unknown }[];
};
const work = await mkdtemp(join(tmpdir(), "cg7-scene-"));
afterAll(() => rm(work, { recursive: true, force: true }));

type Video = Extract<CompositionAsset, { type: "video" }>;
async function asset(
  file: string,
  encoding?: CompositionMediaColor["encoding"],
): Promise<Video> {
  const path = join(root, file);
  const probe = await probeCompositionVideo(path, { colorManaged: true });
  return {
    id: "ramp",
    type: "video",
    path,
    sha256: await compositionMediaChecksum(path),
    width: probe.width,
    height: probe.height,
    frameCount: probe.frameCount,
    frameRate: probe.frameRate,
    color: { ...probe.color, ...(encoding ? { encoding } : {}) },
  };
}

const RAMPS: [string, SourceEncoding, CompositionMediaColor["encoding"]?][] = [
  ["arri-logc3", { kind: "camera", id: "arri-logc3-awg3" }, "arri-logc3-awg3"],
  ["arri-logc4", { kind: "camera", id: "arri-logc4-awg4" }, "arri-logc4-awg4"],
  [
    "sony-slog3",
    { kind: "camera", id: "sony-slog3-sgamut3" },
    "sony-slog3-sgamut3",
  ],
  [
    "panasonic-vlog",
    { kind: "camera", id: "panasonic-vlog-vgamut" },
    "panasonic-vlog-vgamut",
  ],
  ["red-log3g10", { kind: "camera", id: "red-log3g10-rwg" }, "red-log3g10-rwg"],
  [
    "canon-log2",
    { kind: "camera", id: "canon-log2-cinema-gamut" },
    "canon-log2-cinema-gamut",
  ],
  [
    "canon-log3",
    { kind: "camera", id: "canon-log3-cinema-gamut" },
    "canon-log3-cinema-gamut",
  ],
  ["apple-log", { kind: "camera", id: "apple-log-bt2020" }, "apple-log-bt2020"],
  ["pq", { kind: "display", primaries: "bt2020", transfer: "pq" }],
  ["hlg", { kind: "display", primaries: "bt2020", transfer: "hlg" }],
  ["bt709", { kind: "display", primaries: "bt709", transfer: "srgb" }],
];
/** Largest |stored − exact| over the ramp, in encoded units. */
const bounds: Record<string, number> = {};

describe("CG7 10-bit ramps through the 16-bit scene cache", () => {
  it("a legacy probe still rejects an untagged camera ramp", async () => {
    await expect(
      probeCompositionVideo(join(root, "ramps/sony-slog3-10bit.mkv")),
    ).rejects.toMatchObject({ diagnostics: [{ code: "comp-media-color" }] });
  });
  for (const [name, source, encoding] of RAMPS)
    it(`${name}: decoded, neutral in ACEScct, re-encoded at 10 bits: lossless`, async () => {
      const video = await asset(`ramps/${name}-10bit.mkv`, encoding);
      const prepared = await prepareCompositionVisualMedia({
        asset: video,
        sourceDirectory: root,
        cacheDirectory: join(work, "cache"),
        ordinals: [0],
        scene: true,
      });
      expect(prepared.decoderVersion).toBe(
        COMPOSITION_MEDIA_SCENE_DECODER_VERSION,
      );
      const frame = decodeScenePng(
        await readFile(Object.values(prepared.assetPaths)[0]!),
      );
      const codes = manifest.files.find(
        (f) => f.id === `${name}-10bit`,
      )!.lumaCodes!;
      // Camera curves: Y′ is the code value (full range); display: limited.
      const full = encoding !== undefined;
      const toCode = (v: number) => (full ? v * 1023 : 64 + 876 * v);
      const fromCode = (c: number) => (full ? c / 1023 : (c - 64) / 876);
      const t = sourceTransform(source, "acescct");
      let worst = 0;
      const lost: number[] = [];
      codes.forEach((code, i) => {
        const at = (i * 8 + 4) * 4; // the middle of sample i, row 0
        const rgb = [0, 1, 2].map((c) =>
          compositionSceneSample(frame.samples[at + c]!),
        ) as [number, number, number];
        worst = Math.max(
          worst,
          ...rgb.map((v) => Math.abs(v - fromCode(code))),
        );
        const back = t.fromWorking(t.toWorking(rgb));
        // Neutral: Y′ = Kr·R + Kg·G + Kb·B = R = G = B.
        const y = (back[0] + back[1] + back[2]) / 3;
        if (Math.round(toCode(y)) !== code) lost.push(code);
      });
      bounds[name] = worst;
      expect(frame.samples[3]).toBe(65535);
      expect(lost).toEqual([]);
      expect(worst).toBeLessThan(1.2e-5);
    });
  it("over-budget 16-bit frames fail before any decode", async () => {
    const video = await asset(
      "ramps/sony-slog3-10bit.mkv",
      "sony-slog3-sgamut3",
    );
    // 1024 × 16 × 8 bytes = 131,072: fits an RGBA8 budget, not RGBA16.
    await expect(
      prepareCompositionVisualMedia({
        asset: video,
        sourceDirectory: root,
        cacheDirectory: join(work, "budget"),
        ordinals: [0],
        scene: true,
        limits: { decodedFrameBytes: 100_000 },
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: "comp-media-limit" }] });
    await expect(
      readFile(join(work, "budget")).catch((e) => e.code),
    ).resolves.toBe("ENOENT");
  });
  afterAll(() => {
    // Recorded in docs/color-grading-cg7-results.json.
    console.log("CG7 scene cache bounds", JSON.stringify(bounds));
  });
});
