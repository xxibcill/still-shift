import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  compileMechanismNarratedCycle,
  sampleMechanismPackTimeline,
  renderMechanismCueProject,
  checkMechanismCueOutput,
  loadComposition,
} from "@still-shift/animation-engine";
import { CompositionPcmClock } from "@still-shift/scene-contract";
import {
  readSpokenInputManifest,
  readSpokenTake,
} from "../helpers/mechanism-spoken-inputs.ts";
import { authorSpokenCueProject } from "../helpers/mechanism-spoken-authoring.ts";
import { streamingOutputProof } from "../helpers/composition-streaming-output-proof.ts";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { MechanismEvaluationErrorV2 } from "../../packages/renderer-core/src/mechanism/types-v2.ts";

// Deliberately opt-in: never make the portable pnpm test matrix depend on private media.
const manifestPath = process.argv[2];
assert.ok(
  manifestPath,
  "Pass the private ms2-supplied-speech-inputs-1 manifest path",
);
const inputs = await readSpokenInputManifest(manifestPath);
const directory = await mkdtemp("/private/tmp/still-shift-ms2-spoken-inputs-");
const fixtures: unknown[] = [],
  authoredFrameCounts: Record<string, number> = {};
process.stdout.write(JSON.stringify({ directory, status: "running" }) + "\n");
const snapshot = async (status: string) =>
  writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        status,
        directory,
        manifestSha256: inputs.sha256,
        fixtures,
        supportedPacks: 0,
        pilotAcceptedEpisodes: 0,
      },
      null,
      2,
    ) + "\n",
  );
try {
  for (const take of inputs.manifest.takes) {
    const authored = await authorSpokenCueProject(take, directory);
    const { instance, document } = authored;
    const compiled = compileMechanismNarratedCycle(instance, document);
    const frameCount = Math.ceil(take.sampleCount / 1600);
    assert.equal(document.maxGraphemesPerSecond, 18);
    assert.equal(compiled.composition.frameCount, frameCount);
    assert.equal(compiled.recording.sourceSamples, take.sampleCount);
    assert.equal(compiled.recording.samplePolicy, "unchanged-source-clock");
    assert.equal(compiled.recording.renderBoundarySamples, frameCount * 1600);
    assert.equal(document.cues.at(-1)!.endSampleExclusive, take.sampleCount);
    authoredFrameCounts[take.id] = frameCount;
    const onsetProof = document.cues.map((cue, index) => {
      const map = compiled.cueMap[index]!;
      assert.equal(map.startFrame, Math.ceil(cue.startSample / 1600));
      assert.equal(
        map.endFrameExclusive,
        Math.ceil(cue.endSampleExclusive / 1600),
      );
      assert.equal(compiled.composition.markers![index]!.frame, map.startFrame);
      return {
        id: cue.id,
        startSample: cue.startSample,
        endSampleExclusive: cue.endSampleExclusive,
        startFrame: map.startFrame,
        endFrameExclusive: map.endFrameExclusive,
        wordRangeOneBasedInclusive: authored.wordCoverage[index]!.range,
        firstOutputFrameDelaySamples: map.startFrame * 1600 - cue.startSample,
      };
    });
    const negatives: unknown[] = [];
    const reject = (name: string, changed: unknown, code: string) => {
      try {
        compileMechanismNarratedCycle(instance, changed);
      } catch (error) {
        assert.ok(
          error instanceof MechanismEvaluationErrorV2,
          "Control must fail with a located mechanism diagnostic",
        );
        assert.equal(error.location.code, code);
        assert.ok(error.location.path.length);
        negatives.push({ name, diagnostic: error.location });
        return;
      }
      throw Error("Spoken control was accepted:" + name);
    };
    if (take.id === "EU-001" || take.id === "EU-002") {
      const full = structuredClone(document),
        [first, last] = take.cues.at(-1)!.wordRangeOneBasedInclusive;
      full.cues.at(-1)!.text = authored.words
        .slice(first - 1, last)
        .map((word) => word.text)
        .join(" ");
      reject(
        "overfull original final clause at unchanged18 graphemes/s",
        full,
        "mechanism-cue-reading",
      );
    }
    const action = structuredClone(document);
    action.cues[0]!.minimumActionSamples =
      action.cues[0]!.endSampleExclusive + 1;
    reject(
      "minimum action exceeds its supplied source interval",
      action,
      "mechanism-cue-action",
    );
    const endpoint = structuredClone(document);
    endpoint.cues.at(-1)!.endSampleExclusive = take.sampleCount + 1;
    reject(
      "cue extends beyond the unchanged recording",
      endpoint,
      "mechanism-cue-recording",
    );
    if (take.family === "cable-tie") {
      const reverse = structuredClone(document),
        control = reverse.controls[0]!.control;
      assert.equal(control.type, "ratchet");
      if (control.type === "ratchet") control.position.keys!.at(-1)!.value = 0;
      reject(
        "reverse travel while this non-releasable tie stays engaged",
        reverse,
        "mechanism-ratchet-reverse",
      );
    }
    const semanticPoses: unknown[] = [];
    let previousTiePosition = -Infinity,
      flexFrames = 0;
    for (let frame = 0; frame < frameCount; frame++) {
      const sample = sampleMechanismPackTimeline(
        instance,
        compiled.timeline,
        frame,
        { width: 640, height: 360 },
      ).frame;
      if (take.family === "cable-tie") {
        const rig = sample.rigs.ratchet!;
        assert.equal(rig.type, "ratchet");
        if (rig.type === "ratchet") {
          assert.notEqual(rig.phase, "released");
          assert.ok(rig.position >= previousTiePosition);
          previousTiePosition = rig.position;
          if (rig.pawlDeflection > 0) flexFrames++;
        }
      }
      const cueIndex = onsetProof.findIndex((cue) => cue.startFrame === frame);
      if (cueIndex >= 0) {
        const id = onsetProof[cueIndex]!.id;
        if (
          take.family === "tape-hook" &&
          (id === "inside-face" || id === "outside-face")
        ) {
          const contact =
            id === "inside-face" ? "hook.innerFace" : "hook.outerFace";
          const datum = id === "inside-face" ? "board.contact" : "wall.contact";
          const a = sample.anchors[contact]!.world,
            b = sample.anchors[datum]!.world;
          assert.ok(
            Math.hypot(...a.map((value, index) => value - b[index]!)) < 1e-8,
            "Tape cue contact face differs from the selected measurement datum",
          );
        }
        semanticPoses.push({
          frame,
          cue: id,
          rigs: sample.rigs,
          relationships: sample.relationships,
        });
      }
    }
    if (take.family === "cable-tie")
      assert.ok(
        flexFrames > 0,
        "The actual tongue must flex during forward travel",
      );
    const owner = new CompositionNodeMemory();
    try {
      const loaded = await loadComposition(
        authored.compiled.compositionPath,
        "webgl2",
        { nodeMemory: owner },
      );
      const source = loaded.preparedAudio!.sources.find(
        (source) => source.asset === "narration",
      )!;
      assert.equal(source.sampleCount, take.sampleCount);
      assert.equal(source.channels, 1);
      assert.equal(source.pcmSha256, authored.sourcePcmSha256);
    } finally {
      owner.dispose();
    }
    const outputs: unknown[] = [];
    let firstProof:
      | Awaited<ReturnType<typeof streamingOutputProof>>
      | undefined;
    for (const suffix of ["first", "repeat"]) {
      const render = await renderMechanismCueProject(
        authored.familyPath,
        authored.cuePath,
        join(directory, take.id, "compiled"),
        join(directory, take.id, suffix),
      );
      assert.equal(render.frameCount, frameCount);
      assert.equal(
        render.metrics.audio!.sampleCount,
        new CompositionPcmClock().place(frameCount, 30).sample,
      );
      const check = await checkMechanismCueOutput(
        authored.familyPath,
        authored.cuePath,
        join(directory, take.id, "compiled"),
        render.outputPath,
      );
      assert.equal(check.nativeFrames, frameCount);
      assert.equal(check.nativePasses, frameCount);
      const proof = await streamingOutputProof(
        render.outputPath,
        640,
        360,
        frameCount,
      );
      assert.equal(proof.encoded, render.checksums.output);
      if (firstProof)
        assert.deepEqual(
          proof,
          firstProof,
          "Complete encoded body, every decoded frame and complete decoded PCM must repeat",
        );
      else firstProof = proof;
      outputs.push({ suffix, render, check, proof });
      process.stdout.write(
        JSON.stringify({
          take: take.id,
          suffix,
          frameCount,
          status: "rendered-checked-decoded",
        }) + "\n",
      );
    }
    await readSpokenTake(take);
    const facts = Object.fromEntries(
      Object.entries(authored).filter(
        ([key]) => !["instance", "document", "words"].includes(key),
      ),
    );
    fixtures.push({
      ...facts,
      onsetProof,
      negatives,
      semanticPoses,
      flexFrames,
      outputBoundaryPaddingSamples: frameCount * 1600 - take.sampleCount,
      outputs,
    });
    await snapshot("in-flight");
  }
  assert.deepEqual(authoredFrameCounts, {
    "EU-001": 587,
    "EU-002": 646,
    "EU-003": 643,
    "EU-001-legacy": 692,
  });
  assert.ok(
    authoredFrameCounts["EU-001"]! < authoredFrameCounts["EU-001-legacy"]!,
  );
  await snapshot("passed");
  process.stdout.write(
    JSON.stringify({
      directory,
      status: "passed",
      genuineExistingAudioTakes: 4,
      exports: 8,
      observedNativeFrames: 5136,
      privatelyRetainedMedia: true,
      acceptedEpisodes: 0,
    }) + "\n",
  );
} catch (error) {
  await snapshot("failed");
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify(
      {
        status: "failed",
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      null,
      2,
    ) + "\n",
  );
  process.stderr.write(
    JSON.stringify({
      directory,
      status: "failed",
      completedTakes: fixtures.length,
    }) + "\n",
  );
  throw error;
}
