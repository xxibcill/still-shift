import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { probeCompositionVideo } from "@still-shift/animation-engine";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
let root: string;
const encode = async (
  name: string,
  extra: string[] = [],
  audio = false,
  color = true,
) => {
  const path = join(root, name + ".mkv");
  const filterIndex = extra.indexOf("-vf");
  const filters = [
    ...(color
      ? [
          "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=limited",
        ]
      : []),
    ...(filterIndex < 0 ? [] : [extra[filterIndex + 1]!]),
  ];
  const remaining =
    filterIndex < 0
      ? extra
      : [...extra.slice(0, filterIndex), ...extra.slice(filterIndex + 2)];
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=160x80:rate=24:duration=2",
    ...(audio
      ? [
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:sample_rate=48000:duration=3",
          "-map",
          "0:v",
          "-map",
          "1:a",
          "-c:a",
          "aac",
        ]
      : []),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    ...(color
      ? [
          "-color_primaries",
          "bt709",
          "-color_trc",
          "bt709",
          "-colorspace",
          "bt709",
          "-color_range",
          "tv",
        ]
      : []),
    ...(filters.length ? ["-vf", filters.join(",")] : []),
    ...remaining,
    path,
  ]);
  return path;
};
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "ce13-probe-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
const failureCode = async (operation: Promise<unknown>) => {
  try {
    await operation;
    expect.fail("source must be rejected");
  } catch (error) {
    return passageDiagnostics(error)[0]!.code;
  }
};

it("probes original 24 fps frame timestamps and uses picture coverage with longer container audio", async () => {
  const path = await encode("longer-audio", [], true);
  const probe = await probeCompositionVideo(path);
  expect(probe.frameRate).toEqual({ numerator: 24, denominator: 1 });
  expect(probe.frameCount).toBe(48);
  expect(probe.durationSeconds).toBe(2);
  expect(probe.presentationPts).toHaveLength(48);
  expect(probe.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(probe.color).toEqual({
    primaries: "bt709",
    transfer: "bt709",
    matrix: "bt709",
    range: "tv",
  });
  const descriptor = {
    id: "clip",
    type: "video" as const,
    path,
    sha256: probe.sourceHash,
    width: 160,
    height: 80,
    frameCount: 48,
    frameRate: probe.frameRate,
    color: probe.color,
  };
  expect(
    (await probeCompositionVideo(path, { expected: descriptor }))
      .presentationPts,
  ).toEqual(probe.presentationPts);
  expect(
    await failureCode(
      probeCompositionVideo(path, {
        expected: { ...descriptor, frameCount: 47 },
      }),
    ),
  ).toBe("comp-media-provenance");
  expect(
    await failureCode(
      probeCompositionVideo(path, {
        expected: { ...descriptor, sha256: "sha256:" + "0".repeat(64) },
      }),
    ),
  ).toBe("comp-media-checksum");
});
it("rejects real VFR gaps even when reported frame-rate metadata looks ordinary", async () => {
  const path = await encode("vfr", [
    "-vf",
    "setpts='if(lt(N,24),N,N+3)/(24*TB)'",
    "-fps_mode",
    "vfr",
  ]);
  expect(await failureCode(probeCompositionVideo(path))).toBe("comp-media-vfr");
});
it("rejects an actual rotated display matrix and corrupt source media", async () => {
  const source = await encode("rotation-source");
  const rotated = join(root, "rotated.mp4");
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-display_rotation:v:0",
    "90",
    "-i",
    source,
    "-map",
    "0:v:0",
    "-c:v",
    "copy",
    rotated,
  ]);
  expect(await failureCode(probeCompositionVideo(rotated))).toBe(
    "comp-media-rotation",
  );
  const corrupt = join(root, "corrupt.mp4");
  await writeFile(corrupt, "not media");
  expect(await failureCode(probeCompositionVideo(corrupt))).toBe(
    "comp-media-format",
  );
});
it("requires explicit normalization of non-square source pixels", async () => {
  const source = await encode("non-square", ["-vf", "setsar=2"]);
  expect(await failureCode(probeCompositionVideo(source))).toBe(
    "comp-media-format",
  );
});
it("rejects unknown color and configured source limits before decoded cache publication", async () => {
  const path = await encode("unknown-color", [], false, false);
  expect(await failureCode(probeCompositionVideo(path))).toBe(
    "comp-media-color",
  );
  const supported = await encode("limits");
  expect(
    await failureCode(
      probeCompositionVideo(supported, { limits: { maxWidth: 100 } }),
    ),
  ).toBe("comp-media-limit");
  expect(
    await failureCode(
      probeCompositionVideo(supported, { limits: { maxDurationSeconds: 1 } }),
    ),
  ).toBe("comp-media-limit");
});
