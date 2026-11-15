// ET0 baseline for the editorial title fixtures
// (docs/editorial-typography-improvement-plan.md#et0--tracked-fixtures-and-baseline).
//
//   pnpm exec tsx scripts/editorial-titles/et0-baseline.ts [--output-dir <dir>] [--write | --check]
//
// Validates, renders and lints every fixture in benchmarks/fixtures/editorial-titles
// through the public CLI, then measures each finding from decoded frames:
// attach gap pixels (O1), off-frame fraction (O2), bar pixels after the text
// fades (O3), pixel-lint outcome over native video (O4), missing code points
// and fallback ink (O5), background luminance and contrast under glyphs (O6)
// and Thai mark cohesion (P1). Renders and frames go to the git-ignored output
// directory (default benchmarks/results/editorial-titles-et0/<timestamp>).
//
// --write stores the measured outcome as the tracked expected baseline
// (benchmarks/fixtures/editorial-titles/et0-baseline.json). --check re-measures
// and fails if any recorded outcome or render hash differs, so a milestone that
// changes one of these behaviours must update the baseline deliberately.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { isDeepStrictEqual, promisify } from "node:util";
import {
  inspectFontText,
  readFontIdentity,
} from "../../packages/renderer-core/src/font-identity.ts";
import { bandRows, clip } from "./generate-fixture-clip.ts";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtures = join(root, "benchmarks/fixtures/editorial-titles");
const baselinePath = join(fixtures, "et0-baseline.json");
const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const outputDir =
  option("--output-dir") ??
  join(
    root,
    "benchmarks/results/editorial-titles-et0",
    new Date().toISOString().replace(/[:.]/gu, "-"),
  );
mkdirSync(outputDir, { recursive: true });

type CliResult = { exit: number; json: unknown; stderr: string };

async function cli(...command: string[]): Promise<CliResult> {
  try {
    const { stdout, stderr } = await run(
      "pnpm",
      ["--silent", "still-shift", ...command],
      { cwd: root, maxBuffer: 64 * 1024 * 1024 },
    );
    return { exit: 0, json: parse(stdout || stderr), stderr };
  } catch (error) {
    const failure = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      exit: typeof failure.code === "number" ? failure.code : 1,
      json: parse(failure.stdout || failure.stderr || ""),
      stderr: failure.stderr ?? "",
    };
  }
}

function parse(stdout: string): unknown {
  const text = stdout.trim();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const fixturePath = (name: string) => join(fixtures, `${name}.ts`);
const sha256 = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

async function validate(name: string) {
  const result = await cli("comp", "validate", "--input", fixturePath(name));
  const json = result.json as {
    status?: string;
    diagnostics?: { code: string; severity: string; message: string }[];
  };
  return {
    exit: result.exit,
    status: json.status ?? "unparsed",
    diagnostics: (json.diagnostics ?? []).map(
      ({ code, severity, message }) => ({ code, severity, message }),
    ),
  };
}

async function render(name: string) {
  const output = join(outputDir, `${name}.mp4`);
  const result = await cli(
    "comp",
    "render",
    "--input",
    fixturePath(name),
    "--output",
    output,
  );
  const json = result.json as {
    status?: string;
    rendererVersion?: string;
    evaluatorVersion?: string;
    warnings?: unknown[];
    systemFontLayers?: unknown[];
  };
  writeFileSync(
    join(outputDir, `${name}.render.json`),
    `${JSON.stringify(result.json, null, 2)}\n`,
  );
  if (result.exit !== 0)
    throw new Error(`${name} did not render: ${result.stderr.slice(0, 2000)}`);
  return {
    path: output,
    record: {
      exit: result.exit,
      status: json.status ?? "unparsed",
      rendererVersion: json.rendererVersion ?? null,
      evaluatorVersion: json.evaluatorVersion ?? null,
      warnings: json.warnings ?? [],
      systemFontLayers: json.systemFontLayers ?? [],
      sha256: sha256(output),
    },
  };
}

type LintDiagnostic = {
  code: string;
  severity: string;
  message: string;
  node?: string;
  frames?: [number, number];
  measured?: number;
};

async function lint(name: string, pixels: boolean) {
  const result = await cli(
    "comp",
    "lint",
    "--input",
    fixturePath(name),
    "--pixels",
    String(pixels),
  );
  writeFileSync(
    join(outputDir, `${name}.lint${pixels ? "-pixels" : ""}.json`),
    `${JSON.stringify(result.json, null, 2)}\n`,
  );
  const json = result.json as {
    status?: string;
    measured?: Record<string, unknown>;
    diagnostics?: LintDiagnostic[];
  };
  return {
    pixels,
    exit: result.exit,
    status: json.status ?? "unparsed",
    measured: json.measured ?? null,
    diagnostics: condense(json.diagnostics ?? []),
  };
}

/** Merge per-frame repeats of one diagnostic into frame ranges. */
function condense(diagnostics: readonly LintDiagnostic[]) {
  const groups = new Map<
    string,
    {
      code: string;
      severity: string;
      node?: string;
      message: string;
      frames: [number, number][];
      measured: number[];
    }
  >();
  for (const d of diagnostics) {
    const key = JSON.stringify([d.code, d.severity, d.node, d.message]);
    const group = groups.get(key) ?? {
      code: d.code,
      severity: d.severity,
      ...(d.node === undefined ? {} : { node: d.node }),
      message: d.message,
      frames: [],
      measured: [],
    };
    groups.set(key, group);
    if (d.frames) {
      const last = group.frames.at(-1);
      if (last && d.frames[0] <= last[1] + 1)
        last[1] = Math.max(last[1], d.frames[1]);
      else group.frames.push([d.frames[0], d.frames[1]]);
    }
    if (d.measured !== undefined) group.measured.push(round(d.measured));
  }
  return [...groups.values()].map(({ measured, ...group }) => ({
    ...group,
    ...(measured.length
      ? { measured: [Math.min(...measured), Math.max(...measured)] }
      : {}),
  }));
}

type Frame = { width: number; height: number; data: Buffer };

/** Decode frames by ordinal to 8-bit sRGB (BT.709 limited range input). */
async function frames(
  path: string,
  width: number,
  height: number,
  ordinals: readonly number[],
  crop?: { x: number; y: number; width: number; height: number },
): Promise<Frame[]> {
  const select = ordinals.map((n) => `eq(n\\,${n})`).join("+");
  const w = crop?.width ?? width,
    h = crop?.height ?? height;
  const filters = [
    `select=${select}`,
    "scale=in_color_matrix=bt709:in_range=tv:out_range=pc",
    "format=rgb24",
    // Crop after RGB conversion so odd sizes are not rounded to 4:2:0 blocks.
    ...(crop ? [`crop=${w}:${h}:${crop.x}:${crop.y}`] : []),
  ];
  const { stdout } = await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-vf",
      filters.join(","),
      "-fps_mode",
      "passthrough",
      "-f",
      "rawvideo",
      "-",
    ],
    { encoding: "buffer", maxBuffer: 2 * 1024 * 1024 * 1024 },
  );
  const size = w * h * 3;
  if (stdout.length !== size * ordinals.length)
    throw new Error(
      `${path}: expected ${ordinals.length} frames, decoded ${stdout.length / size}`,
    );
  return ordinals.map((_, i) => ({
    width: w,
    height: h,
    data: stdout.subarray(i * size, (i + 1) * size),
  }));
}

const luma = (f: Frame, x: number, y: number) => {
  const i = (y * f.width + x) * 3;
  return (
    0.2126 * f.data[i]! + 0.7152 * f.data[i + 1]! + 0.0722 * f.data[i + 2]!
  );
};
const rgb = (f: Frame, x: number, y: number) => {
  const i = (y * f.width + x) * 3;
  return [f.data[i]!, f.data[i + 1]!, f.data[i + 2]!] as const;
};

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Vertical runs of rows containing ink, merging gaps of at most `merge` rows. */
function inkRows(
  f: Frame,
  isInk: (x: number, y: number) => boolean,
  rows: [number, number],
  merge = 4,
) {
  const runs: Box[] = [];
  for (let y = rows[0]; y <= rows[1]; y++) {
    let x0 = -1,
      x1 = -1;
    for (let x = 0; x < f.width; x++)
      if (isInk(x, y)) {
        if (x0 < 0) x0 = x;
        x1 = x;
      }
    if (x0 < 0) continue;
    const last = runs.at(-1);
    if (last && y - last.y1 <= merge + 1) {
      last.y1 = y;
      last.x0 = Math.min(last.x0, x0);
      last.x1 = Math.max(last.x1, x1);
    } else runs.push({ x0, y0: y, x1, y1: y });
  }
  return runs;
}

const linear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const relativeLuminance = (r: number, g: number, b: number) =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const round = (value: number, digits = 3) =>
  Math.round(value * 10 ** digits) / 10 ** digits;

function ranges(values: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const v of values) {
    const last = out.at(-1);
    if (last && v === last[1] + 1) last[1] = v;
    else out.push([v, v]);
  }
  return out;
}

const W = clip.width,
  H = clip.height;

// ---------------------------------------------------------------- O1
async function o1() {
  const holdFrames = [30, 45, 60];
  const measure = async (name: string) => {
    const rendered = await render(name);
    const decoded = await frames(rendered.path, W, H, holdFrames);
    return {
      render: rendered.record,
      hold: decoded.map((f, i) => {
        const lines = inkRows(f, (x, y) => luma(f, x, y) < 160, [0, H - 1]);
        if (lines.length !== 3)
          throw new Error(
            `${name}: expected 3 ink line groups, found ${lines.length}`,
          );
        const [kicker, headline, folio] = lines as [Box, Box, Box];
        return {
          frame: holdFrames[i]!,
          ink: { kicker, headline, folio },
          kickerGapPx: headline.y0 - kicker.y1 - 1,
          folioGapPx: folio.y0 - headline.y1 - 1,
        };
      }),
    };
  };
  const animated = await measure("o1-attach-animated");
  const staticControl = await measure("o1-attach-static");
  return {
    finding: "O1",
    authoredGapsPx: { kicker: 18, folio: 30 },
    gapDefinition:
      "Blank rows between ink: kicker ink bottom (its baseline, all caps) to headline ink top; headline ink bottom (baseline) to folio ink top (cap). Luma < 160 on #F4EFE2, ±1 px after H.264.",
    validate: {
      animated: await validate("o1-attach-animated"),
      static: await validate("o1-attach-static"),
    },
    lintState: await lint("o1-attach-animated", false),
    animated,
    static: staticControl,
  };
}

// ---------------------------------------------------------------- O2
async function o2() {
  const rows: [number, number] = [150, 300];
  const visibleInk = async (name: string) => {
    const rendered = await render(name);
    const [f] = await frames(rendered.path, W, H, [40]);
    const lines = inkRows(f!, (x, y) => luma(f!, x, y) < 160, rows);
    if (lines.length !== 1) throw new Error(`${name}: expected one ink line`);
    return { render: rendered.record, ink: lines[0]! };
  };
  const centred = await visibleInk("o2-center-origin");
  const control = await visibleInk("o2-center-control");
  const full = control.ink.x1 - control.ink.x0 + 1;
  const visible = centred.ink.x1 - centred.ink.x0 + 1;
  return {
    finding: "O2",
    frame: 40,
    validate: await validate("o2-center-origin"),
    centred,
    control,
    fullInkWidthPx: full,
    visibleInkWidthPx: visible,
    offFrameFraction: round(1 - visible / full),
    clippedAtLeftEdge: centred.ink.x0 === 0,
    lintPixels: await lint("o2-center-origin", true),
  };
}

// ---------------------------------------------------------------- O3
async function o3() {
  const rendered = await render("o3-highlight-fade");
  const sampled = [40, 70, 76, 83];
  const decoded = await frames(rendered.path, W, H, sampled);
  const counts = decoded.map((f, i) => {
    let text = 0,
      bar = 0;
    for (let y = 820; y < 1060; y++)
      for (let x = 0; x < W; x++) {
        const [r, g, b] = rgb(f, x, y);
        if (luma(f, x, y) < 110) text++;
        else if (
          Math.abs(r - 0xc9) < 22 &&
          Math.abs(g - 0xd2) < 22 &&
          Math.abs(b - 0x9a) < 26
        )
          bar++;
      }
    return { frame: sampled[i]!, textInkPixels: text, highlightPixels: bar };
  });
  return {
    finding: "O3",
    textOpacityZeroFromFrame: 70,
    outPoint: 84,
    validate: await validate("o3-highlight-fade"),
    render: rendered.record,
    pixelCounts: counts,
    barVisibleAfterTextOpacityZero: counts
      .filter((c) => c.frame >= 70)
      .every((c) => c.textInkPixels === 0 && c.highlightPixels > 0),
    lintPixels: await lint("o3-highlight-fade", true),
  };
}

// ---------------------------------------------------------------- O4
async function o4() {
  return {
    finding: "O4",
    validate: await validate("o4-video-pixel-lint"),
    withVideo: await lint("o4-video-pixel-lint", true),
    withoutVideo: await lint("o4-video-pixel-lint.no-video", true),
    withVideoStateOnly: await lint("o4-video-pixel-lint", false),
  };
}

// ---------------------------------------------------------------- O5
async function o5() {
  const rendered = await render("o5-plex-thai");
  const [f] = await frames(rendered.path, 720, 360, [1]);
  let thaiOnlyInk = 0;
  for (let y = 170; y < 340; y++)
    for (let x = 0; x < 720; x++) if (luma(f!, x, y) < 128) thaiOnlyInk++;
  const plex = join(root, "assets/story-motion/fonts/plex-sans-semibold.ttf");
  const bytes = readFileSync(plex);
  const identity = readFontIdentity(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const declaration = {
    id: "sans",
    sha256: `sha256:${sha256(plex)}`,
    weight: "600",
    path: "assets/story-motion/fonts/plex-sans-semibold.ttf",
  };
  const runs = [
    { text: "3 ลุค · OLIVE GREEN", node: "mixed", path: "layers.0.text" },
    { text: "ลุค", node: "thai-only", path: "layers.1.text" },
  ];
  const strict = inspectFontText(identity, declaration, runs, {
    profile: "strict",
  });
  return {
    finding: "O5",
    validate: await validate("o5-plex-thai"),
    render: rendered.record,
    thaiOnlyLineInkPixels: thaiOnlyInk,
    fallbackInkPainted: thaiOnlyInk > 0,
    fontFace: {
      family: identity.family,
      subfamily: identity.subfamily,
      cmapFormats: identity.supportedCmapFormats,
    },
    libraryStrictInspection: strict.map((d) => ({
      code: d.code,
      severity: d.severity,
      node: d.node,
      message: d.message,
      missingCodepoints: (d.missingCodepoints ?? []).map(
        (c) => `U+${c.toString(16).toUpperCase().padStart(4, "0")}`,
      ),
    })),
    compositionRoute:
      "packages/renderer-core/src/composition/render/renderer.ts calls loadCompositionFonts(composition, assetUrl, undefined, ...): the font gate is not invoked for compositions, and comp validate/render expose no strict font profile.",
  };
}

// ---------------------------------------------------------------- O6
async function o6() {
  const rendered = await render("o6-dark-band");
  const [settled] = await frames(rendered.path, W, H, [20]);
  // Frame 20: the band covers rows 7–227, above the text; skip those rows.
  const lines = inkRows(settled!, (x, y) => luma(settled!, x, y) < 110, [
    250,
    clip.brightRows - 20,
  ]);
  if (lines.length !== 2)
    throw new Error(`o6: expected 2 ink lines, found ${lines.length}`);
  const reading = Array.from({ length: 84 - 14 }, (_, i) => 14 + i);
  const ink = relativeLuminance(0x1e, 0x27, 0x16);
  const layers = await Promise.all(
    (["credit", "line"] as const).map(async (id, index) => {
      const box = lines[index]!;
      const crop = {
        x: box.x0,
        y: box.y0,
        width: box.x1 - box.x0 + 1,
        height: box.y1 - box.y0 + 1,
      };
      const source = await frames(
        join(fixtures, "media/editorial-bands.mp4"),
        W,
        H,
        reading,
        crop,
      );
      const perFrame = source.map((f, i) => {
        let sum = 0,
          dark = 0,
          lumaSum = 0;
        for (let y = 0; y < f.height; y++)
          for (let x = 0; x < f.width; x++) {
            const [r, g, b] = rgb(f, x, y);
            sum += relativeLuminance(r, g, b);
            const l = luma(f, x, y);
            lumaSum += l;
            if (l < 80) dark++;
          }
        const n = f.width * f.height;
        return {
          frame: reading[i]!,
          meanLuma: round(lumaSum / n, 1),
          bandFraction: round(dark / n),
          contrast: round(contrast(ink, sum / n), 2),
        };
      });
      const covered = perFrame
        .filter((p) => p.bandFraction > 0)
        .map((p) => p.frame);
      const predicted = reading.filter((frame) => {
        const [top, bottom] = bandRows(frame);
        return bottom >= box.y0 && top <= box.y1;
      });
      return {
        layer: id,
        glyphBox: box,
        bandUnderGlyphFrames: ranges(covered),
        predictedFromGenerator: ranges(predicted),
        minimumContrast: Math.min(...perFrame.map((p) => p.contrast)),
        framesBelow3To1: ranges(
          perFrame.filter((p) => p.contrast < 3).map((p) => p.frame),
        ),
        perFrame,
      };
    }),
  );
  return {
    finding: "O6",
    readingWindow: [14, 83],
    inkColor: "#1E2716",
    method:
      "Glyph boxes from the rendered frame 20 (before the band arrives); background sampled from the decoded source clip under each box; WCAG 2 contrast of ink against the mean background.",
    validate: await validate("o6-dark-band"),
    render: rendered.record,
    layers,
    lintState: await lint("o6-dark-band", false),
    lintPixels: await lint("o6-dark-band", true),
  };
}

// ---------------------------------------------------------------- P1
type Component = Box & { area: number };
function components(f: Frame, threshold: number, rows: [number, number]) {
  const seen = new Uint8Array(f.width * f.height);
  const out: Component[] = [];
  for (let y = rows[0]; y <= rows[1]; y++)
    for (let x = 0; x < f.width; x++) {
      const start = y * f.width + x;
      if (seen[start] || luma(f, x, y) < threshold) continue;
      const stack = [start];
      seen[start] = 1;
      const c: Component = { x0: x, y0: y, x1: x, y1: y, area: 0 };
      while (stack.length) {
        const p = stack.pop()!;
        const px = p % f.width,
          py = (p - px) / f.width;
        c.area++;
        c.x0 = Math.min(c.x0, px);
        c.x1 = Math.max(c.x1, px);
        c.y0 = Math.min(c.y0, py);
        c.y1 = Math.max(c.y1, py);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx,
              ny = py + dy;
            if (nx < 0 || nx >= f.width || ny < rows[0] || ny > rows[1])
              continue;
            const q = ny * f.width + nx;
            if (!seen[q] && luma(f, nx, ny) >= threshold) {
              seen[q] = 1;
              stack.push(q);
            }
          }
      }
      if (c.area >= 40) out.push(c);
    }
  return out;
}

async function p1() {
  const rendered = await render("p1-thai-marks");
  // Every entrance frame from the first visible ink to settling, plus a
  // settled reference frame.
  const sampled = [...Array.from({ length: 23 }, (_, i) => 12 + i), 40];
  const decoded = await frames(rendered.path, W, H, sampled);
  const parts = decoded.map((f) => components(f, 96, [500, 1150]));
  // The settled frame's smallest component is U+0E38. In entrance frames the
  // mark is the smallest component of roughly that size (0.5–1.6×); smaller
  // specks are antialiased fragments of units still fading in.
  const settledMark = parts.at(-1)!.reduce((a, b) => (b.area < a.area ? b : a));
  const perFrame = parts.map((frameParts, i) => {
    const mark = frameParts
      .filter(
        (c) =>
          c.area >= settledMark.area * 0.5 && c.area <= settledMark.area * 1.6,
      )
      .sort((a, b) => a.area - b.area)[0];
    if (!mark) return { frame: sampled[i]!, components: frameParts.length };
    const above = frameParts
      .filter((c) => c !== mark && c.y1 < mark.y0)
      .map((c) => ({
        c,
        overlap:
          Math.max(0, Math.min(c.x1, mark.x1) - Math.max(c.x0, mark.x0) + 1) /
          (mark.x1 - mark.x0 + 1),
      }))
      .sort((a, b) => b.overlap - a.overlap)[0];
    return {
      frame: sampled[i]!,
      components: frameParts.length,
      mark: { ...mark },
      base: above ? { ...above.c } : null,
      markGapPx: above ? mark.y0 - above.c.y1 - 1 : null,
      horizontalOverlap: above ? round(above.overlap, 2) : 0,
    };
  });
  const settled = perFrame.at(-1) as { markGapPx: number | null };
  const tolerance = 6;
  const evaluated = perFrame.filter(
    (p): p is (typeof perFrame)[number] & { markGapPx: number } =>
      "markGapPx" in p && p.markGapPx !== null,
  );
  return {
    finding: "P1",
    validate: await validate("p1-thai-marks"),
    render: rendered.record,
    method:
      "Connected ink components (luma >= 96) per frame; U+0E38 is the settled frame's smallest component, and in entrance frames the smallest component of 0.5–1.6× that area (earlier frames show other units only). Attached when it lies under its base (horizontal overlap >= 0.5) at the settled gap ±6 px; wght/wdth vary during the entrance, so the gap is not exact.",
    settledMarkGapPx: settled.markGapPx,
    evaluatedFrames: ranges(evaluated.map((p) => p.frame)),
    perFrame,
    marksAttachedInEvaluatedFrames:
      settled.markGapPx !== null &&
      evaluated.length >= 8 &&
      evaluated.every(
        (p) =>
          p.horizontalOverlap >= 0.5 &&
          Math.abs(p.markGapPx - settled.markGapPx!) <= tolerance,
      ),
  };
}

const results = {
  schema: "still-shift-editorial-titles-et0-baseline-1",
  fixtureClip: JSON.parse(
    readFileSync(
      join(fixtures, "media/editorial-bands.descriptor.json"),
      "utf8",
    ),
  ).asset.sha256,
  findings: {
    O1: await o1(),
    O2: await o2(),
    O3: await o3(),
    O4: await o4(),
    O5: await o5(),
    O6: await o6(),
    P1: await p1(),
  },
};
const text = await format(JSON.stringify(results), { parser: "json" });
writeFileSync(join(outputDir, "et0-baseline.json"), text);
if (args.includes("--write")) writeFileSync(baselinePath, text);
if (args.includes("--check")) {
  // Compare what --write would store, not the live object: JSON drops
  // undefined fields and maps -0, NaN and Infinity, which deep equality
  // would otherwise report as differences.
  const recorded = JSON.parse(readFileSync(baselinePath, "utf8"));
  if (!isDeepStrictEqual(recorded, JSON.parse(text))) {
    console.error(
      `ET0 outcomes differ from ${baselinePath}; compare with ${join(outputDir, "et0-baseline.json")}`,
    );
    process.exit(1);
  }
  console.log("ET0 outcomes match the recorded baseline");
}
console.log(join(outputDir, "et0-baseline.json"));
