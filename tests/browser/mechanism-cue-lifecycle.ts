import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import {
  compileMechanismCueProject,
  renderMechanismCueProject,
  checkMechanismCueOutput,
  readMechanismCueAuthoring,
  patchMechanismCueAuthoring,
} from "@still-shift/animation-engine";
import { createCueProjectFixture } from "../helpers/mechanism-cue-project.ts";
import { parallelOutputProof } from "../helpers/composition-parallel-proof.ts";
const directory = await mkdtemp("/private/tmp/still-shift-ms2-cue-lifecycle-");
type Output = {
  render: Awaited<ReturnType<typeof renderMechanismCueProject>>;
  check: Awaited<ReturnType<typeof checkMechanismCueOutput>>;
  proof: Awaited<ReturnType<typeof parallelOutputProof>>;
};
type Stage = {
  stage: string;
  compiled: Awaited<ReturnType<typeof compileMechanismCueProject>>;
  outputs: Output[];
  alteredOutputRejected: string;
};
const fixtures: unknown[] = [];
try {
  for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
    const base = join(directory, family),
      fixture = await createCueProjectFixture(base, family);
    const original = await readMechanismCueAuthoring(
      fixture.instance,
      fixture.cuePath,
    );
    const stages: Stage[] = [];
    for (const stage of ["before", "edited"] as const) {
      if (stage === "edited") {
        await patchMechanismCueAuthoring(fixture.instance, fixture.cuePath, {
          schemaVersion: "mechanism-cue-patch-1",
          baseRevision: original.document.revision,
          baseHash: original.projectHash,
          operations: [{ cue: "contact", property: "caption", value: "Here" }],
        });
        const forbidden = join(base, "stale-render");
        await assert.rejects(
          () =>
            renderMechanismCueProject(
              fixture.familyPath,
              fixture.cuePath,
              join(base, "before-compiled"),
              forbidden,
            ),
          /current family\/cue revision/,
        );
        await assert.rejects(() => access(forbidden));
        await assert.rejects(
          () =>
            checkMechanismCueOutput(
              fixture.familyPath,
              fixture.cuePath,
              join(base, "before-compiled"),
              stages[0]!.outputs[0]!.render.outputPath,
            ),
          /current family\/cue revision/,
        );
      }
      const preparedDirectory = join(base, stage + "-compiled");
      const compiled = await compileMechanismCueProject(
        fixture.familyPath,
        fixture.cuePath,
        preparedDirectory,
      );
      const outputs: Output[] = [];
      for (const suffix of ["first", "repeat"]) {
        const render = await renderMechanismCueProject(
          fixture.familyPath,
          fixture.cuePath,
          preparedDirectory,
          join(base, stage + "-" + suffix),
        );
        assert.equal(render.rerenderScope, "whole-cycle");
        const check = await checkMechanismCueOutput(
          fixture.familyPath,
          fixture.cuePath,
          preparedDirectory,
          render.outputPath,
        );
        assert.equal(check.nativeFrames, 60);
        assert.equal(check.nativePasses, 60);
        const proof = await parallelOutputProof(
          render.outputPath,
          render.metrics,
        );
        if (outputs.length) assert.deepEqual(proof, outputs[0]!.proof);
        outputs.push({ render, check, proof });
      }
      const badPath = join(base, stage + "-altered.mp4");
      await writeFile(
        badPath,
        Buffer.concat([
          await readFile(outputs[0]!.render.outputPath),
          Buffer.from([1]),
        ]),
      );
      const result = JSON.parse(
        await readFile(outputs[0]!.render.outputPath + ".result.json", "utf8"),
      );
      result.outputPath = badPath;
      await writeFile(badPath + ".result.json", JSON.stringify(result));
      await assert.rejects(
        () =>
          checkMechanismCueOutput(
            fixture.familyPath,
            fixture.cuePath,
            preparedDirectory,
            badPath,
          ),
        /Output\/result/,
      );
      if (stage === "edited")
        await assert.rejects(
          () =>
            checkMechanismCueOutput(
              fixture.familyPath,
              fixture.cuePath,
              preparedDirectory,
              stages[0]!.outputs[0]!.render.outputPath,
            ),
          /Output\/result/,
        );
      stages.push({ stage, compiled, outputs, alteredOutputRejected: badPath });
    }
    assert.notDeepEqual(
      stages[0]!.outputs[0]!.proof.decodedFrames,
      stages[1]!.outputs[0]!.proof.decodedFrames,
    );
    assert.equal(
      stages[0]!.outputs[0]!.proof.decodedAudio,
      stages[1]!.outputs[0]!.proof.decodedAudio,
    );
    fixtures.push({ family, ...fixture, stages });
  }
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        status: "passed",
        fixtures,
        supportedPacks: 0,
        pilotAcceptedEpisodes: 0,
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(
    JSON.stringify({
      directory,
      status: "passed",
      families: 3,
      exports: 12,
      observedOutputFrames: 720,
      syntheticAudio: true,
      rerenderScope: "whole-cycle",
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
    ),
  );
  process.stderr.write(JSON.stringify({ directory, status: "failed" }) + "\n");
  throw error;
}
