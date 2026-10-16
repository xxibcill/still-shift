import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  compileMechanismNarratedCycle,
  loadComposition,
  renderComposition,
} from "@still-shift/animation-engine";
import { CompositionPcmClock } from "@still-shift/scene-contract";
import {
  verifyNativeObservationClosureV2,
  isNativeObservationRequestV2,
} from "@still-shift/execution-runtime/export";
import { createNativeObservationRequestVersions } from "../../packages/animation-engine/src/native-observation.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { compositionWorkerMemoryLimits } from "../../packages/execution-runtime/src/composition-export-memory.ts";
import { narratedCycleFixture } from "../helpers/mechanism-narrated-cycle.ts";
import { mediaFloat32Wave } from "../helpers/composition-media-audio.ts";
import {
  parallelChecksum,
  parallelOutputProof,
} from "../helpers/composition-parallel-proof.ts";
const directory = await mkdtemp(
  "/private/tmp/still-shift-ms2-narrated-cycles-",
);
const root = resolve(import.meta.dirname, "../..");
const fontPath = join(root, "assets/story-motion/fonts/plex-sans-semibold.ttf");
const fontHash = parallelChecksum(await readFile(fontPath));
const tick = mediaFloat32Wave(2400, 1, (sample) =>
  sample < 1200 ? 0.035 * Math.sin(sample * 0.3) * (1 - sample / 1200) : 0,
);
await writeFile(join(directory, "tick.wav"), tick.wav, { flag: "wx" });
const fixtures = [];
try {
  for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
    const takes = [];
    for (const sampleCount of [144000, 96000]) {
      const name = `${family}-${sampleCount}`;
      const { instance, document } = narratedCycleFixture(family, sampleCount);
      const sourceBytes = JSON.stringify(instance.scene, null, 2) + "\n";
      const sourcePath = join(directory, name + ".source.json");
      await writeFile(sourcePath, sourceBytes, { flag: "wx" });
      // Deliberately synthetic local PCM: an engineering clock fixture, not spoken pilot narration.
      const recording = mediaFloat32Wave(
        sampleCount,
        1,
        (sample) =>
          0.02 * Math.sin(sample * 0.023) + 0.007 * Math.sin(sample * 0.077),
      );
      const audioPath = join(directory, name + ".wav");
      await writeFile(audioPath, recording.wav, { flag: "wx" });
      document.source.path = sourcePath;
      document.source.sha256 = parallelChecksum(Buffer.from(sourceBytes));
      document.font.path = fontPath;
      document.font.sha256 = fontHash;
      document.narration.path = audioPath;
      document.narration.sha256 = parallelChecksum(recording.wav);
      document.output = { width: 240, height: 136, fps: 30 };
      for (const cue of document.cues)
        for (const sound of cue.sounds) {
          sound.asset.path = join(directory, "tick.wav");
          sound.asset.sha256 = parallelChecksum(tick.wav);
        }
      const compiled = compileMechanismNarratedCycle(instance, document);
      const compositionPath = join(directory, name + ".composition.json");
      await writeFile(
        compositionPath,
        JSON.stringify(compiled.composition, null, 2) + "\n",
        { flag: "wx" },
      );
      await writeFile(
        join(directory, name + ".compiled.json"),
        JSON.stringify(compiled, null, 2) + "\n",
        { flag: "wx" },
      );
      const loaded = await loadComposition(compositionPath, "webgl2");
      assert.equal(
        loaded.preparedAudio!.sources.find(
          (source) => source.asset === "narration",
        )!.sampleCount,
        sampleCount,
      );
      const binding = await createNativeObservationRequestVersions(loaded);
      assert.ok(binding && isNativeObservationRequestV2(binding));
      const outputs = [];
      let expected: Awaited<ReturnType<typeof parallelOutputProof>> | undefined;
      for (const suffix of ["first", "repeat"]) {
        const result = await renderComposition({
          compositionPath,
          outputPath: join(directory, `${name}-${suffix}.mp4`),
          backend: "webgl2",
          transport: "raw_rgba",
        });
        const closure = result.metrics.nativeObservations;
        assert(closure?.version === "native-observation-closure-2");
        assert.equal(closure.outputFrames, compiled.composition.frameCount);
        assert.equal(closure.passCount, compiled.composition.frameCount);
        assert.equal(
          result.metrics.audio!.sampleCount,
          new CompositionPcmClock().place(compiled.composition.frameCount, 30)
            .sample,
        );
        const memory = new ManagedMemory({
          pixels: 1,
          metadata: compositionWorkerMemoryLimits(1).metadata,
        });
        try {
          const verified = await verifyNativeObservationClosureV2({
            closure,
            execution: binding.execution,
            expectedPasses: binding.expectedPasses,
            reserve: (bytes) => memory.reserve("metadata", bytes),
            output: {
              sha256: result.checksums.output,
              frameCount: compiled.composition.frameCount,
              width: 240,
              height: 136,
              transport: "raw_rgba",
            },
          });
          assert.equal(verified.passCount, compiled.composition.frameCount);
          assert.equal(memory.statistics.current.metadata, 0);
          const proof = await parallelOutputProof(
            result.outputPath,
            result.metrics,
          );
          if (expected)
            assert.deepEqual(
              proof,
              expected,
              "Complete encoded output, decoded frames and decoded audio must repeat exactly",
            );
          else expected = proof;
          outputs.push({ result, proof, replayMemory: memory.statistics });
        } finally {
          memory.dispose();
        }
      }
      const identity = parallelChecksum(await readFile(audioPath));
      assert.equal(
        identity,
        document.narration.sha256,
        "Compiler/render must not mutate the supplied source recording",
      );
      const take = {
        name,
        sampleCount,
        frameCount: compiled.composition.frameCount,
        cueMap: compiled.cueMap,
        compiledPath: join(directory, name + ".compiled.json"),
        sourceAudioSha256: identity,
        outputs,
      };
      takes.push(take);
      fixtures.push({ family, ...take });
    }
    assert.equal(takes[0]!.frameCount, 90);
    assert.equal(takes[1]!.frameCount, 60);
    assert.notDeepEqual(
      takes[0]!.cueMap.map((cue) => cue.startFrame),
      takes[1]!.cueMap.map((cue) => cue.startFrame),
    );
  }
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        status: "passed",
        scope:
          "synthetic-local-PCM-cue-compilation-three-candidate-families-two-takes-all-final-native-frames-independent-replay-and-repeated-video/audio",
        fixtures,
        supportedPacks: 0,
        pilotAcceptedEpisodes: 0,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stdout.write(
    JSON.stringify({
      directory,
      status: "passed",
      families: 3,
      takesPerFamily: 2,
      exports: 12,
      observedOutputFrames: 900,
      compiledOutputFrames: 450,
      syntheticAudio: true,
    }) + "\n",
  );
} catch (error) {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify(
      {
        status: "failed",
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        fixtures,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stderr.write(
    JSON.stringify({
      directory,
      status: "failed",
      completedFixtures: fixtures.length,
    }) + "\n",
  );
  throw error;
}
