// Editorial titles Phase 2: the ET6b `editorial-title` lint profile and the
// EC effect render cost fix, checked through the CLI in the pinned browser
// (docs/editorial-typography-improvement-plan.md#remaining-phases-2026-11-20).
//
// Fixtures: benchmarks/fixtures/editorial-titles/et6b-profile.ts (reading
// motion and treated display contrast over the synthetic clip) and
// ec-effect-cost.ts (one display title with each treatment).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Composition } from "@still-shift/scene-contract";
import { EDITORIAL_TITLE_PROFILE } from "../../packages/renderer-core/src/composition/quality-policy.ts";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import {
  et6bFixture,
  type Et6bCase,
} from "../../benchmarks/fixtures/editorial-titles/et6b-profile.ts";
import {
  ecEffectCost,
  type EcVariant,
} from "../../benchmarks/fixtures/editorial-titles/ec-effect-cost.ts";

type Diagnostic = {
  code: string;
  severity: string;
  node?: string;
  measured: number;
  message: string;
};
type Report = {
  status: string;
  profile?: string;
  diagnostics: Diagnostic[];
  readingMotion?: {
    velocity: number;
    windows: {
      layer: string;
      readableSeconds: number;
      requiredSeconds: number;
      glyphs?: boolean;
      peakSpeed?: number;
      peakTravel?: number;
      runEnds?: Record<string, number>;
    }[];
  };
  textLegibility?: {
    version: string;
    method: { contrast: string };
    layers: {
      layer: string;
      readingFrames: number;
      measuredFrames?: number;
      contrastTarget: number;
      sizeClass?: string;
      worst?: { contrast: number };
      edges?: { fill: number; outer: number | null };
    }[];
  };
};

let directory = "";
async function cli(args: string[]) {
  let stdout = "",
    stderr = "";
  const code = await runCli(args, {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}
async function write(composition: Composition, name: string) {
  const path = join(directory, `${name}.json`);
  await writeFile(path, JSON.stringify(composition));
  return path;
}
async function lint(name: Et6bCase, extra: string[]) {
  const input = await write(et6bFixture(name) as Composition, name);
  const result = await cli([
    "comp",
    "lint",
    "--input",
    input,
    "--pixels",
    "true",
    ...extra,
  ]);
  assert.equal(result.stderr, "", `${name}: ${result.stderr.slice(0, 2000)}`);
  return JSON.parse(result.stdout) as Report;
}
const profile = ["--profile", "editorial-title"];
const readingTime = (report: Report) =>
  report.diagnostics.filter((d) => d.code === "reading-time");

async function verifyReadingMotion() {
  // O7: the proof's gentle hold drift fails the default reading rule and
  // passes under the profile (D-read).
  for (const name of [
    "hold-tracking",
    "hold-rise",
    "hold-line-track",
  ] as const) {
    const before = await lint(name, ["--legibility", "true"]);
    assert.equal(readingTime(before).length, 1, `${name}: O7 by default`);
    assert.equal(before.readingMotion, undefined);
    const after = await lint(name, profile);
    assert.deepEqual(readingTime(after), [], `${name}: readable drift`);
    const [window] = after.readingMotion!.windows;
    assert.ok(window!.glyphs, `${name}: glyph motion measured`);
    assert.ok(
      window!.peakSpeed! <= EDITORIAL_TITLE_PROFILE.readingMotion.velocity,
      `${name}: ${window!.peakSpeed} letter-heights/s`,
    );
  }
  // Fast motion, jitter and spinning still fail, each for its own reason.
  for (const [name, reason] of [
    ["hold-fast", "speed"],
    ["hold-jitter", "reversal"],
    ["hold-spin", "speed"],
  ] as const) {
    const report = await lint(name, profile);
    assert.equal(readingTime(report).length, 1, `${name}: not reading time`);
    const ends = report.readingMotion!.windows[0]!.runEnds!;
    assert.ok(ends[reason]! > 0, `${name}: ends on ${reason}`);
  }
}

async function verifyTreatedContrast() {
  const display = EDITORIAL_TITLE_PROFILE.textLegibility.display;
  const layer = (report: Report) => report.textLegibility!.layers[0]!;
  const contrastFindings = (report: Report) =>
    report.diagnostics.filter((d) => d.code === "text-contrast");

  // The default lint is unchanged: ET3's measure and report version.
  const plain = await lint("treat-outline", ["--legibility", "true"]);
  assert.equal(plain.textLegibility!.version, "composition-text-legibility-1");
  assert.equal(
    plain.textLegibility!.method.contrast,
    "wcag2-glyph-interior-percentile",
  );
  assert.equal(plain.profile, undefined);
  assert.ok(layer(plain).worst!.contrast < 1.5, "ET3 counts the ring");

  // Untreated low-contrast display text, and a ring under a phone pixel, fail.
  for (const name of ["treat-none", "treat-thin"] as const) {
    const report = await lint(name, profile);
    assert.equal(layer(report).sizeClass, "display");
    assert.equal(layer(report).contrastTarget, display.contrast);
    assert.ok(layer(report).worst!.contrast < display.contrast, name);
    assert.equal(contrastFindings(report).length, 1, `${name}: reported`);
  }
  // A real outline is credited by the fill edge, a hollow outline by the
  // outer edge (ET3 never measured hollow text at all).
  const outline = await lint("treat-outline", profile);
  assert.ok(layer(outline).edges!.fill > 10);
  assert.deepEqual(contrastFindings(outline), []);
  const hollowDefault = await lint("treat-hollow", ["--legibility", "true"]);
  assert.equal(layer(hollowDefault).readingFrames, 0);
  const hollow = await lint("treat-hollow", profile);
  assert.equal(layer(hollow).measuredFrames, layer(hollow).readingFrames);
  assert.ok(layer(hollow).readingFrames > 0);
  assert.ok(layer(hollow).edges!.outer! > 10);
  assert.deepEqual(contrastFindings(hollow), []);
  // A halo is credited: it beats the same text untreated.
  const none = await lint("treat-none", profile);
  const halo = await lint("treat-halo", profile);
  assert.ok(
    layer(halo).worst!.contrast > layer(none).worst!.contrast + 0.5,
    `halo ${layer(halo).worst!.contrast} vs none ${layer(none).worst!.contrast}`,
  );
}

/**
 * EC: frames rendered before the Canvas drop-shadow fix (main 894c9d32),
 * 48 PNG frames each, SHA-256 of the newline-joined per-frame SHA-256s.
 */
const EC_FRAMES: Record<EcVariant, string | undefined> = {
  none: "3075031e8613480f5b6107b81338d8b2e379c4be27ecf033a4e5673733aa6ac8",
  outline: "4d7dcb87cf61c53bc881b021caad7d07d4944eaddd81cb620da869da487aa230",
  halo: "1308f7019e7309ad669342c45eb163e358b95c05c7cbeedb93aa35d54b09bfe1",
  shadow: "81f5d31a1f7d0642a9c818300c28b2bec77d002784185ac40e0284d4ef0837da",
  glow: "3843da4b55a2d90036fe88c585fd70dcc6f4b0cf46d35c3674f94766fa305506",
  all: undefined,
};
async function verifyEffectPixels() {
  for (const variant of ["halo", "shadow"] as const) {
    const input = await write(
      ecEffectCost(variant, 48) as Composition,
      `ec-${variant}`,
    );
    const frames = join(directory, `ec-${variant}-frames`);
    const result = await cli([
      "comp",
      "render",
      "--input",
      input,
      "--output",
      join(frames, "frame_%06d.png"),
      "--format",
      "png8",
    ]);
    assert.equal(result.code, 0, result.stdout.slice(0, 2000));
    const files = (await readdir(frames))
      .filter((file) => file.endsWith(".png"))
      .sort();
    assert.equal(files.length, 48);
    const hashes: string[] = [];
    for (const file of files)
      hashes.push(
        createHash("sha256")
          .update(await readFile(join(frames, file)))
          .digest("hex"),
      );
    assert.equal(
      createHash("sha256").update(hashes.join("\n")).digest("hex"),
      EC_FRAMES[variant],
      `EC ${variant}: frames identical to before the fix`,
    );
  }
}

directory = await mkdtemp(join(tmpdir(), "still-shift-editorial-phase2-"));
try {
  await verifyReadingMotion();
  console.log("ET6b reading motion: ok");
  await verifyTreatedContrast();
  console.log("ET6b treated display contrast: ok");
  await verifyEffectPixels();
  console.log("EC drop-shadow pixels: ok");
} finally {
  await rm(directory, { recursive: true, force: true });
}
