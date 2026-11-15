// ET3: text-over-video legibility checks in pixel lint
// (docs/editorial-typography-improvement-plan.md#et3--text-over-video-legibility-checks).
//
// Runs `comp lint --pixels true --legibility true` on the tracked ET0
// fixtures. O6 is the negative: dark text crossed by the clip's dark moving
// band. The expected frames come from the ET0 baseline, which measured where
// the band lies under each line's glyph box from the decoded clip, not from
// the rule under test.
import assert from "node:assert/strict";
import { readFile, rm, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Composition } from "@still-shift/scene-contract";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { contrastRatio } from "../../packages/renderer-core/src/typography-quality.ts";
import { paper } from "../../benchmarks/fixtures/editorial-titles/shared.ts";
import { editorialFixture } from "../helpers/editorial-video-lint.ts";

type Diagnostic = {
  code: string;
  severity: string;
  node?: string;
  frames: [number, number];
  measured: number;
  message: string;
  words?: { word: string; index: number; contrast: number }[];
  waiver?: { reason: string };
  rawSeverity?: string;
};
type LegibilityLayer = {
  readingFrames: number;
  layer: string;
  attribution: string;
  measuredFrames: number;
  worst?: { contrast: number; frame: number; word?: string };
  role: string;
  xHeight?: { reviewPixels: number; frame: number };
  waiver?: { reason: string; codes: string[] };
};
type Report = {
  status: string;
  diagnostics: Diagnostic[];
  textLegibility?: {
    version: string;
    layers: LegibilityLayer[];
    waivers: { layer: string; reason: string; applied: string[] }[];
    limitations: string[];
  };
};

export async function lintCli(args: string[]) {
  let stdout = "",
    stderr = "";
  const code = await runCli(["comp", "lint", ...args], {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

const lintFixture = async (name: string, extra: string[] = []) => {
  const result = await lintCli([
    "--input",
    fileURLToPath(editorialFixture(`${name}.ts`)),
    "--pixels",
    "true",
    ...extra,
  ]);
  assert.equal(result.stderr, "", `${name}: ${result.stderr.slice(0, 2000)}`);
  return { code: result.code, report: JSON.parse(result.stdout) as Report };
};

/** Lint a JSON copy of an ET0 fixture after `edit` changes its composition. */
const lintVariant = async (
  directory: string,
  name: string,
  edit: (composition: Composition) => void,
  extra: string[] = [],
) => {
  const composition = structuredClone(
    (
      (await import(editorialFixture(`${name}.ts`).href)) as {
        default: Composition;
      }
    ).default,
  );
  edit(composition);
  const input = join(directory, `${name}-variant-${variants++}.json`);
  await writeFile(input, JSON.stringify(composition));
  const result = await lintCli([
    "--input",
    input,
    "--pixels",
    "true",
    ...extra,
  ]);
  assert.equal(result.stderr, "", `${name}: ${result.stderr.slice(0, 2000)}`);
  return { code: result.code, report: JSON.parse(result.stdout) as Report };
};
let variants = 0;

const within = (actual: number, expected: number, tolerance = 1) =>
  Math.abs(actual - expected) <= tolerance;

export async function verifyTextLegibility() {
  const baseline = JSON.parse(
    await readFile(editorialFixture("et0-baseline.json"), "utf8"),
  ) as {
    findings: {
      O6: {
        layers: { layer: string; bandUnderGlyphFrames: [number, number][] }[];
      };
    };
  };
  const bandFrames = new Map(
    baseline.findings.O6.layers.map((layer) => [
      layer.layer,
      layer.bandUnderGlyphFrames,
    ]),
  );
  assert.deepEqual(
    [...bandFrames.keys()].sort(),
    ["credit", "line"],
    "ET0 baseline names both O6 layers",
  );

  // Advisory by default: the band is reported, the lint still passes.
  const advisory = await lintFixture("o6-dark-band", ["--legibility", "true"]);
  assert.equal(advisory.code, 0, "ET3: legibility findings are advisory");
  assert.equal(advisory.report.status, "passed");
  const contrast = advisory.report.diagnostics.filter(
    (d) => d.code === "text-contrast",
  );
  for (const [layer, ranges] of bandFrames) {
    const found = contrast.filter((d) => d.node === layer);
    assert.equal(
      found.length,
      ranges.length,
      `ET3: ${layer} has one text-contrast finding per band pass: ${JSON.stringify(found.map((d) => d.frames))}`,
    );
    ranges.forEach(([start, end], i) => {
      const diagnostic = found[i]!;
      assert.ok(
        within(diagnostic.frames[0], start) &&
          within(diagnostic.frames[1], end),
        `ET3: ${layer} flagged on frames ${diagnostic.frames.join("-")}; band under glyphs ${start}-${end} (±1)`,
      );
      assert.equal(diagnostic.severity, "warning");
      assert.ok(
        diagnostic.measured < 1.5,
        `${layer}: worst ${diagnostic.measured}`,
      );
      assert.ok(
        diagnostic.words?.length,
        `ET3: ${layer} finding names the affected words`,
      );
    });
  }
  const credit = contrast.find((d) => d.node === "credit")!;
  assert.deepEqual(
    credit.words!.map((word) => word.word),
    ["COURTYARD", "EDIT", "·", "03"],
    "ET3: a full-width band affects every word of the credit",
  );
  assert.match(credit.message, /COURTYARD/);
  const section = advisory.report.textLegibility!;
  assert.equal(section.version, "composition-text-legibility-1");
  for (const layer of section.layers) {
    assert.equal(layer.attribution, "word");
    assert.ok(layer.measuredFrames > 40, `${layer.layer} measured frames`);
  }

  // `--strict text-contrast` gates.
  const strict = await lintFixture("o6-dark-band", [
    "--strict",
    "text-contrast",
  ]);
  assert.equal(strict.code, 1, "ET3: --strict text-contrast fails the lint");
  assert.equal(strict.report.status, "failed");
  assert.ok(
    strict.report.diagnostics.some(
      (d) => d.code === "text-contrast" && d.severity === "error",
    ),
  );

  const directory = await mkdtemp(join(tmpdir(), "et3-legibility-"));
  try {
    // A title held below full opacity is still in its reading window
    // (readingOpacity 0.9) and must still be measured. With the mask drawn at
    // the layer's own opacity, no glyph pixel decoded and the credit passed
    // with 0 of 80 frames measured.
    const faded = await lintVariant(
      directory,
      "o6-dark-band",
      (composition) => {
        for (const layer of composition.layers)
          if (layer.id === "credit")
            layer.transform = { ...layer.transform, opacity: 0.95 };
      },
      ["--legibility", "true"],
    );
    const fadedCredit = faded.report.textLegibility!.layers.find(
      (layer) => layer.layer === "credit",
    )!;
    assert.ok(
      fadedCredit.measuredFrames > 40,
      `ET3: a credit at opacity 0.95 is measured on ${fadedCredit.measuredFrames} of ${fadedCredit.readingFrames} frames`,
    );
    const fadedFinding = faded.report.diagnostics.find(
      (d) => d.code === "text-contrast" && d.node === "credit",
    );
    assert.ok(
      fadedFinding &&
        fadedFinding.measured < 1.5 &&
        within(fadedFinding.frames[0], bandFrames.get("credit")![0]![0]),
      `ET3: the faded credit is flagged over the band: ${JSON.stringify(fadedFinding?.frames)}`,
    );

    // A per-layer waiver keeps the measurement but never gates; the report shows it.
    const policy = join(directory, "policy.json");
    await writeFile(
      policy,
      JSON.stringify({
        textLegibility: {
          waivers: [
            {
              layer: "credit",
              reason: "Decorative credit; intentionally low contrast.",
            },
          ],
        },
      }),
    );
    const waived = await lintFixture("o6-dark-band", [
      "--strict",
      "text-contrast",
      "--policy",
      policy,
    ]);
    const waivedCredit = waived.report.diagnostics.filter(
      (d) => d.code === "text-contrast" && d.node === "credit",
    );
    assert.ok(waivedCredit.length, "ET3: a waived layer is still measured");
    for (const d of waivedCredit) {
      assert.equal(d.severity, "warning");
      assert.equal(d.rawSeverity, "error");
      assert.equal(
        d.waiver?.reason,
        "Decorative credit; intentionally low contrast.",
      );
    }
    assert.ok(
      waived.report.diagnostics.some(
        (d) =>
          d.code === "text-contrast" &&
          d.node === "line" &&
          d.severity === "error",
      ),
      "ET3: the waiver covers only its layer",
    );
    assert.deepEqual(waived.report.textLegibility!.waivers, [
      {
        layer: "credit",
        reason: "Decorative credit; intentionally low contrast.",
        codes: ["text-contrast", "x-height-floor", "platform-safe-zone"],
        applied: ["text-contrast"],
      },
    ]);
    assert.equal(waived.code, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  // On a plain background every glyph-interior pixel has the ink/paper ratio.
  // Attach constraints must resolve in the glyph mask as in the frame: with
  // the animated attach target hidden by `enabled: false`, the labels moved
  // and read 1.00:1 (found on proof T1 pass 1).
  const attached = await lintFixture("o1-attach-animated", [
    "--legibility",
    "true",
  ]);
  const inks = { kicker: "#2F3520", headline: "#4A5A23", folio: "#2F3520" };
  for (const layer of attached.report.textLegibility!.layers) {
    const expected = contrastRatio(
      inks[layer.layer as keyof typeof inks],
      paper,
    );
    assert.ok(layer.measuredFrames > 0, `${layer.layer} measured`);
    assert.ok(
      // Animated glyphs are resampled, so interiors may be a level off.
      Math.abs(layer.worst!.contrast - expected) < expected * 0.03,
      `ET3: attached ${layer.layer} measures ${layer.worst!.contrast}:1 on paper; expected ${expected.toFixed(2)}:1`,
    );
  }
  // A highlight is the text's own backdrop: the background frame keeps it.
  // Dropping it (the container-only text probe) measured the ink against the
  // paper (and on proof T2, against dark paving at 1.95:1).
  const highlighted = await lintFixture("o3-highlight-fade", [
    "--legibility",
    "true",
  ]);
  const tag = highlighted.report.textLegibility!.layers[0]!;
  const onHighlight = contrastRatio("#1D2410", "#C9D29A");
  assert.ok(
    Math.abs(tag.worst!.contrast - onHighlight) < 0.05 &&
      onHighlight < contrastRatio("#1D2410", paper) - 1,
    `ET3: highlighted tag measures ${tag.worst!.contrast}:1; ink on its highlight is ${onHighlight.toFixed(2)}:1`,
  );

  // Option errors are reported before any work starts.
  for (const [option, value] of [
    ["--strict", "frozen-run"],
    ["--strict", "text-contrast,bogus"],
    ["--legibility", "yes"],
  ] as const) {
    const invalid = await lintCli([
      "--input",
      fileURLToPath(editorialFixture("o6-dark-band.ts")),
      option,
      value,
    ]);
    assert.equal(invalid.code, 1);
    assert.equal(invalid.stdout, "");
    assert.match(invalid.stderr, /comp-program-option/);
  }

  // Without the rule, the report keeps its previous shape.
  const plain = await lintFixture("o6-dark-band");
  assert.ok(!("textLegibility" in plain.report));
  assert.ok(!plain.report.diagnostics.some((d) => d.code === "text-contrast"));
  return { credit: credit.frames, contrast };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await verifyTextLegibility();
  console.log(
    `ET3: O6 dark band flagged on ${JSON.stringify(result.contrast.map((d) => [d.node, d.frames, d.measured]))}`,
  );
}
