// ET5a: framing and decoration guards in pixel lint
// (docs/editorial-typography-improvement-plan.md#et5a--framing-and-decoration-guards).
//
// O2: `text-off-canvas` reports a text layer whose settled glyph ink is
// largely off-frame, measured as the hidden share, distinct from the
// `outside-safe-area` warning a few-pixel incursion keeps. O3:
// `orphaned-decoration` reports a decoration painting while its text is
// fully transparent, and the `fadeWithText` opt-in fades the bar with the
// text. Negatives are the tracked ET0 fixtures and footage-free copies of
// the proof's pass-1 compositions; expected values come from the ET0
// baseline's pixel measurements, not from the rules under test.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Composition } from "@still-shift/scene-contract";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { centredLine } from "../../benchmarks/fixtures/editorial-titles/o2-center-origin.ts";
import { editorialFixture } from "../helpers/editorial-video-lint.ts";
import { writeFootageFreePass1 } from "../helpers/editorial-proof-pass1.ts";

const run = promisify(execFile);

type Diagnostic = {
  code: string;
  severity: string;
  node?: string;
  path?: string;
  frames: [number, number];
  measured: number;
  message: string;
};
type Report = { status: string; diagnostics: Diagnostic[] };

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

async function lint(input: string, extra: string[] = []) {
  const result = await cli([
    "comp",
    "lint",
    "--input",
    input,
    "--pixels",
    "true",
    ...extra,
  ]);
  assert.equal(result.stderr, "", `${input}: ${result.stderr.slice(0, 2000)}`);
  return JSON.parse(result.stdout) as Report;
}

const fixture = (name: string) => fileURLToPath(editorialFixture(`${name}.ts`));
const guards = (report: Report) =>
  report.diagnostics.filter((d) =>
    ["text-off-canvas", "orphaned-decoration"].includes(d.code),
  );

/** Decode selected frames of an H.264 render to full-range RGB. */
async function decodeFrames(path: string, ordinals: number[]) {
  const select = ordinals.map((n) => `eq(n\\,${n})`).join("+");
  const { stdout } = await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-vf",
      `select=${select},scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24`,
      "-fps_mode",
      "passthrough",
      "-f",
      "rawvideo",
      "-",
    ],
    { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 },
  );
  const size = 1080 * 1920 * 3;
  assert.equal(stdout.length, size * ordinals.length);
  return ordinals.map((_, i) => stdout.subarray(i * size, (i + 1) * size));
}

/** The ET0 O3 measurement: tag-row pixels near the bar colour #C9D29A. */
function barPixels(frame: Buffer) {
  let bar = 0;
  for (let y = 820; y < 1060; y++)
    for (let x = 0; x < 1080; x++) {
      const i = (y * 1080 + x) * 3;
      if (
        Math.abs(frame[i]! - 0xc9) < 22 &&
        Math.abs(frame[i + 1]! - 0xd2) < 22 &&
        Math.abs(frame[i + 2]! - 0x9a) < 26
      )
        bar++;
    }
  return bar;
}

export async function verifyFramingGuards() {
  const baseline = JSON.parse(
    await readFile(editorialFixture("et0-baseline.json"), "utf8"),
  ) as {
    findings: {
      O2: { offFrameFraction: number };
      O3: {
        textOpacityZeroFromFrame: number;
        outPoint: number;
        pixelCounts: { frame: number; highlightPixels: number }[];
      };
    };
  };
  const directory = await mkdtemp(join(tmpdir(), "et5a-framing-"));
  try {
    // ---------------------------------------------------------------- O2
    const o2 = await lint(fixture("o2-center-origin"));
    const [hidden, ...more] = guards(o2);
    assert.equal(more.length, 0, "ET5a O2: one guard finding");
    assert.equal(hidden?.code, "text-off-canvas");
    assert.equal(hidden.severity, "error");
    assert.equal(hidden.node, "line");
    assert.deepEqual(hidden.frames, [4, 83], "ET5a O2: every visible frame");
    assert.ok(
      Math.abs(hidden.measured - baseline.findings.O2.offFrameFraction) <= 0.01,
      `ET5a O2: measured ${hidden.measured} vs ET0 pixel share ${baseline.findings.O2.offFrameFraction}`,
    );
    assert.match(hidden.message, /`align: "center"`.*textLayout\.width/u);
    assert.equal(o2.status, "failed");
    assert.ok(
      o2.diagnostics.some(
        (d) => d.code === "outside-safe-area" && d.node === "line",
      ),
      "ET5a O2: the safe-area warning is kept beside the new error",
    );
    assert.deepEqual(
      guards(await lint(fixture("o2-center-control"))),
      [],
      "ET5a O2 control: left-aligned line is fully on-frame",
    );
    // A 5 px incursion past the left edge stays a safe-area warning.
    const incursion = centredLine("left") as Composition;
    const line = incursion.layers.find((layer) => layer.id === "line")!;
    (line.transform as { position: [number, number] }).position = [-5, 258];
    const incursionPath = join(directory, "o2-incursion.composition.json");
    await writeFile(incursionPath, JSON.stringify(incursion));
    const small = await lint(incursionPath);
    assert.deepEqual(
      guards(small),
      [],
      "ET5a: 5 px incursion is not hidden copy",
    );
    assert.ok(
      small.diagnostics.some(
        (d) =>
          d.code === "outside-safe-area" &&
          d.node === "line" &&
          d.severity === "warning",
      ),
      "ET5a: 5 px incursion stays an outside-safe-area warning",
    );
    // Policy controls: a higher threshold and a severity override.
    const policyPath = join(directory, "relaxed.policy.json");
    await writeFile(
      policyPath,
      JSON.stringify({
        textOffCanvasFraction: 0.5,
        severities: { "orphaned-decoration": "warning" },
      }),
    );
    assert.deepEqual(
      guards(await lint(fixture("o2-center-origin"), ["--policy", policyPath])),
      [],
      "ET5a O2: textOffCanvasFraction 0.5 tolerates 39.9%",
    );
    // State-only lint has no measured ink and adds nothing.
    const state = await cli([
      "comp",
      "lint",
      "--input",
      fixture("o2-center-origin"),
    ]);
    assert.deepEqual(
      guards(JSON.parse(state.stdout) as Report),
      [],
      "ET5a: state lint measures no glyph ink",
    );

    // ---------------------------------------------------------------- O3
    const o3 = await lint(fixture("o3-highlight-fade"));
    const orphaned = guards(o3);
    assert.ok(orphaned.every((d) => d.code === "orphaned-decoration"));
    assert.ok(
      orphaned.every(
        (d) => d.node === "tag" && d.path?.endsWith(".decorations.0"),
      ),
    );
    const { textOpacityZeroFromFrame: zero, outPoint } = baseline.findings.O3;
    assert.ok(
      orphaned.some(
        (d) =>
          d.severity === "error" &&
          d.frames[0] === zero &&
          d.frames[1] === outPoint - 1,
      ),
      `ET5a O3: bar after the fade (${zero}-${outPoint - 1}) is reported: ${JSON.stringify(orphaned.map((d) => d.frames))}`,
    );
    // The line animator also starts the tag at opacity 0 on its first frame.
    assert.deepEqual(
      orphaned.map((d) => d.frames),
      [
        [4, 4],
        [zero, outPoint - 1],
      ],
    );
    const relaxed = guards(
      await lint(fixture("o3-highlight-fade"), ["--policy", policyPath]),
    );
    assert.ok(relaxed.every((d) => d.severity === "warning"));
    const fading = await lint(fixture("o3-highlight-fade-with-text"));
    assert.deepEqual(
      guards(fading),
      [],
      "ET5a O3: fadeWithText leaves no orphaned bar",
    );

    // The opt-in changes pixels only where the text is transparent or fading.
    const renders: Record<string, Buffer[]> = {};
    for (const name of ["o3-highlight-fade", "o3-highlight-fade-with-text"]) {
      const output = join(directory, `${name}.mp4`);
      const rendered = await cli([
        "comp",
        "render",
        "--input",
        fixture(name),
        "--output",
        output,
      ]);
      assert.equal(rendered.code, 0, `${name}: ${rendered.stderr}`);
      renders[name] = await decodeFrames(output, [40, 76]);
    }
    const [heldOld, goneOld] = renders["o3-highlight-fade"]!.map(barPixels);
    const [heldNew, goneNew] =
      renders["o3-highlight-fade-with-text"]!.map(barPixels);
    const recorded = baseline.findings.O3.pixelCounts;
    assert.equal(
      heldOld,
      recorded.find((c) => c.frame === 40)!.highlightPixels,
      "ET5a O3: default output matches the ET0 measurement (frame 40)",
    );
    assert.equal(
      goneOld,
      recorded.find((c) => c.frame === 76)!.highlightPixels,
      "ET5a O3: default output keeps the bar (frame 76)",
    );
    assert.ok(
      Math.abs(heldNew! - heldOld!) <= heldOld! * 0.01,
      `ET5a O3: held bar unchanged by fadeWithText (${heldNew} vs ${heldOld})`,
    );
    assert.equal(goneNew, 0, "ET5a O3: fadeWithText removes the bare bar");

    // ------------------------------------------- proof pass-1 compositions
    const t3 = guards(
      await lint(await writeFootageFreePass1(directory, "t3-minimal-centered")),
    );
    assert.deepEqual(
      t3.map((d) => [d.code, d.node, d.severity]).sort(),
      [
        ["text-off-canvas", "credit", "error"],
        ["text-off-canvas", "line", "error"],
      ],
      "ET5a pass-1 T3: both centred lines are reported",
    );
    const t3Line = t3.find((d) => d.node === "line")!;
    assert.ok(Math.abs(t3Line.measured - 0.399) <= 0.01, `${t3Line.measured}`);
    const t2 = guards(
      await lint(
        await writeFootageFreePass1(directory, "t2-thai-condensed-poster"),
      ),
    );
    assert.deepEqual(
      t2.map((d) => [d.code, d.node, d.frames]),
      [["orphaned-decoration", "tag", [134, 149]]],
      "ET5a pass-1 T2: the bar after the tag fades is reported",
    );
    const t1 = guards(
      await lint(await writeFootageFreePass1(directory, "t1-editorial-stack")),
    );
    assert.deepEqual(t1, [], "ET5a pass-1 T1: control has no guard findings");
    return {
      o2: hidden.measured,
      o3: orphaned.map((d) => d.frames),
      t3: t3.map((d) => `${d.node} ${d.measured}`),
      t2: t2.map((d) => d.frames),
      bar: { heldOld, heldNew, goneOld, goneNew },
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
