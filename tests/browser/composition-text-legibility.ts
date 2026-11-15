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
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
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
  layer: string;
  attribution: string;
  measuredFrames: number;
  worst?: { contrast: number; frame: number; word?: string };
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

  // A per-layer waiver keeps the measurement but never gates; the report shows it.
  const directory = await mkdtemp(join(tmpdir(), "et3-legibility-"));
  try {
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
