import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fallback2DScene,
  resolvePreviewScene,
} from "../../packages/renderer-core/src/index.ts";
import {
  exportScene,
  processTreeRssBytes,
} from "../../tools/export-worker/src/export-worker.ts";

const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <rect width="256" height="256" fill="#161616"/>
  <rect x="64" width="24" height="256" fill="#ff2323"/>
  <rect x="176" width="24" height="256" fill="#25ff25"/>
</svg>`;
const depthSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <rect width="128" height="256" fill="rgb(32,32,32)"/>
  <rect x="128" width="128" height="256" fill="rgb(224,224,224)"/>
</svg>`;

const directory = await mkdtemp(join(tmpdir(), "still-shift-export-test-"));
try {
  assert.equal(
    processTreeRssBytes(
      "100 1 4000 node\n101 100 2000 chromium\n102 101 3000 helper\n103 100 500 ffmpeg\n104 100 100 ps\n200 1 9999 unrelated\n",
      100,
      4_000_000,
    ),
    4_000_000 + 5_500 * 1024,
  );
  const sourcePath = join(directory, "source.svg");
  const depthPath = join(directory, "depth.svg");
  await writeFile(sourcePath, sourceSvg);
  await writeFile(depthPath, depthSvg);
  const scene = resolvePreviewScene({
    sourceWidth: 256,
    sourceHeight: 256,
    depthWidth: 256,
    depthHeight: 256,
    durationMs: 3000,
    fps: 30,
    canvasWidth: 320,
    canvasHeight: 180,
    preset: "horizontal_drift",
    intensity: "standard",
    seed: 1842,
  });
  const firstPath = join(directory, "first.mp4");
  const first = await exportScene({
    scene,
    sourcePath,
    depthPath,
    outputPath: firstPath,
  });
  assert.equal(first.frameCount, 90);
  assert.equal(first.durationMs, 3000);
  assert.ok(first.outputBytes > 0);
  assert.ok(first.frameUploadAverageMs > 0);
  assert.ok(first.frameUploadP95Ms > 0);
  assert.ok(first.ffmpegCpuMs > 0);
  assert.ok(first.encodePathWallMs > 0);
  assert.ok(first.validationWallMs > 0);
  assert.ok(first.peakParentRssBytes > 0);
  assert.ok(first.cpuModel.length > 0);
  assert.ok(first.cpuLogicalCores > 0);
  if (first.peakSampledProcessTreeRssBytes !== null) {
    assert.ok(first.peakSampledProcessTreeRssBytes > first.peakParentRssBytes);
  }
  assert.equal((await readFile(firstPath)).length, first.outputBytes);
  assert.equal(
    first.outputChecksum,
    `sha256:${createHash("sha256")
      .update(await readFile(firstPath))
      .digest("hex")}`,
  );

  const second = await exportScene({
    scene,
    sourcePath,
    depthPath,
    outputPath: join(directory, "second.mp4"),
  });
  assert.equal(second.frameCount, first.frameCount);
  assert.equal(second.durationMs, first.durationMs);
  assert.deepEqual(
    await readFile(join(directory, "second.mp4")),
    await readFile(firstPath),
  );

  const raw = await exportScene({
    scene,
    sourcePath,
    depthPath,
    outputPath: join(directory, "raw.mp4"),
    transport: "raw_rgba",
  });
  assert.equal(raw.frameTransport, "raw_rgba");
  assert.deepEqual(
    await readFile(join(directory, "raw.mp4")),
    await readFile(firstPath),
  );

  const jpeg = await exportScene({
    scene,
    sourcePath,
    depthPath,
    outputPath: join(directory, "jpeg.mp4"),
    transport: "jpeg_pipe",
  });
  assert.equal(jpeg.frameTransport, "jpeg_pipe");
  assert.equal(jpeg.frameCount, 90);

  const fallback = fallback2DScene(scene, "DEPTH_PREPARATION_FAILED");
  const fallbackMetrics = await exportScene({
    scene: fallback,
    sourcePath,
    depthPath: null,
    outputPath: join(directory, "fallback.mp4"),
  });
  assert.equal(fallbackMetrics.frameCount, 90);
  assert.ok(fallbackMetrics.outputBytes > 0);

  const missingOutput = join(directory, "missing.mp4");
  await assert.rejects(
    exportScene({
      scene,
      sourcePath: join(directory, "missing-source.svg"),
      depthPath,
      outputPath: missingOutput,
    }),
  );
  await assert.rejects(readFile(missingOutput), { code: "ENOENT" });
  const existingPath = join(directory, "existing.mp4");
  await writeFile(existingPath, "existing output");
  await assert.rejects(
    exportScene({ scene, sourcePath, depthPath, outputPath: existingPath }),
    /Output already exists/,
  );
  assert.equal(await readFile(existingPath, "utf8"), "existing output");
  assert.equal(
    (await readdir(directory)).filter((path) => path.includes(".tmp.mp4"))
      .length,
    0,
  );
  process.stdout.write(
    `Export verified: 90 exact frames, three frame transports, 2D fallback, and failed-output cleanup\n`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
