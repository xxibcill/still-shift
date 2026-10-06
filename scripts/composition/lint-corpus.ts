import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  CompositionQualityPolicySchema,
  analyzeCompositionQuality,
  passageDiagnostics,
} from "@still-shift/renderer-core";
import {
  CompositionSchema,
  CommerceSceneSchema,
  StorySceneSchema,
  type Composition,
} from "@still-shift/scene-contract";
import {
  compileCommerceComposition,
  compileStoryComposition,
  readStoryPassage,
} from "@still-shift/animation-engine";
import { analyzeCompositionStillness } from "../../packages/renderer-core/src/story-continuous-quality.ts";
import { resolveCompositionQualityPolicy } from "../../packages/renderer-core/src/composition/quality-policy.ts";

const outputIndex = process.argv.indexOf("--output");
if (outputIndex < 0 || !process.argv[outputIndex + 1])
  throw new Error("Pass --output <new-report.json>");
const baselinePath = resolve(
  `tests/visual/composition-baselines/${process.platform}-${process.arch}.json`,
);
const baselineBytes = await readFile(baselinePath);
const baseline = JSON.parse(baselineBytes.toString()) as {
  renderEnvironment: unknown;
  items: Record<
    string,
    {
      fixture: string;
      path: string;
      family: string;
      frameCount: number;
      width: number;
      height: number;
      frames: string;
    }
  >;
};
const manifest = JSON.parse(
  await readFile("tests/visual/composition-baselines/fixtures.json", "utf8"),
) as { fixtures: { id: string; path: string; kind: string }[] };
const cache = new Map<string, Map<string, unknown>>();
async function sourceScenes(fixtureId: string) {
  const cached = cache.get(fixtureId);
  if (cached) return cached;
  const fixture = manifest.fixtures.find((f) => f.id === fixtureId)!;
  const scenes =
    fixture.kind === "passage"
      ? new Map(
          (await readStoryPassage(resolve(fixture.path))).beats.map((beat) => [
            `${fixture.id}/${beat.id}`,
            beat.scene as unknown,
          ]),
        )
      : new Map([
          [
            fixture.id,
            JSON.parse(await readFile(fixture.path, "utf8")) as unknown,
          ],
        ]);
  cache.set(fixtureId, scenes);
  return scenes;
}
const results: unknown[] = [];
let full = 0,
  pixelOnly = 0,
  unexpected = 0;
for (const [id, item] of Object.entries(baseline.items)) {
  const hashes = item.frames.split(" ");
  if (hashes.length !== item.frameCount)
    throw new Error(`Incomplete baseline hashes: ${id}`);
  const placeholder = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "pixel-reference",
    width: item.width,
    height: item.height,
    fps: 24,
    frameCount: item.frameCount,
    assets: [],
    layers: [],
  });
  const pixels = analyzeCompositionStillness(
    [],
    resolveCompositionQualityPolicy(placeholder, { pixelHashes: hashes }),
  );
  try {
    const scenes = await sourceScenes(item.fixture);
    const source = scenes.get(id) as { schemaVersion?: string } | undefined;
    if (!source) throw new Error(`Missing expanded scene ${id}`);
    let comp: Composition | undefined;
    if (source.schemaVersion === "story-scene-1")
      comp = await compileStoryComposition(
        StorySceneSchema.parse(source),
        dirname(resolve(item.path)),
      );
    else if (source.schemaVersion === "commerce-scene-1")
      comp = await compileCommerceComposition(
        CommerceSceneSchema.parse(source),
        dirname(resolve(item.path)),
      );
    if (!comp) {
      pixelOnly++;
      results.push({
        id,
        family: item.family,
        coverage: "pixel-only",
        reason:
          "Composition adapter belongs to CE4c/CE4d; exact frozen-pixel lint still covers every frame.",
        diagnostics: pixels,
      });
    } else {
      if (comp.frameCount !== hashes.length)
        throw new Error(`Frame-count mismatch: ${id}`);
      const report = analyzeCompositionQuality(comp, {
        ...CompositionQualityPolicySchema.parse({}),
        pixelHashes: hashes,
      });
      full++;
      results.push({
        id,
        family: item.family,
        coverage: "composition-state-and-reference-pixels",
        report,
      });
    }
  } catch (error) {
    const diagnostics = passageDiagnostics(error);
    const unsupported = diagnostics.every((d) =>
      ["comp-adapter-unsupported", "comp-adapter-limit"].includes(d.code),
    );
    if (unsupported) pixelOnly++;
    else unexpected++;
    results.push({
      id,
      family: item.family,
      coverage: unsupported ? "pixel-only" : "analysis-failed",
      reason: diagnostics,
      diagnostics: pixels,
    });
  }
  if (results.length % 10 === 0)
    console.log(
      `Linted ${results.length}/${Object.keys(baseline.items).length} CE0 items`,
    );
}
const report = {
  date: "2026-10-04",
  version: "composition-ce12-corpus-lint-1",
  source: baselinePath,
  sourceChecksum: createHash("sha256").update(baselineBytes).digest("hex"),
  renderEnvironment: baseline.renderEnvironment,
  pixelEvidence:
    "Stored full-frame 64-bit SHA-256 prefixes, checked separately against fresh pinned renders. Exact frozen-pixel comparison, not the 200-pixel grayscale-energy gate.",
  total: results.length,
  frames: Object.values(baseline.items).reduce((n, i) => n + i.frameCount, 0),
  compositionStateAndPixels: full,
  pixelOnly,
  unexpectedFailures: unexpected,
  results,
};
await writeFile(
  resolve(process.argv[outputIndex + 1]!),
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    total: report.total,
    frames: report.frames,
    compositionStateAndPixels: full,
    pixelOnly,
    unexpectedFailures: unexpected,
  }),
);
if (unexpected) process.exitCode = 1;
