// ET6b owner gate: near-threshold and weakened variants of ET7a candidates
// (docs/editorial-typography-improvement-plan.md#et6b--editorial-title-lint-profile).
//
//   pnpm exec tsx scripts/editorial-titles/et6b-variants.ts \
//     --candidate a03-thai-get-dressed --layer script [--candidate ... --layer ...]
//
// Each `--candidate` pairs with the `--layer` at the same position. For that
// display layer the script takes the candidate's latest et7a-check iteration
// (its exported composition.json), builds variants that weaken one
// treatment at a time, renders each and lints it with
// `--profile editorial-title`, and tiles phone-scale (360×640) frames of
// every variant into one sheet per candidate, in the order of `index.json`:
//
//   base           the candidate as accepted
//   ring-half      the layer's outline at half its stroke width
//   ring-quarter   at a quarter (at least 1)
//   ring-hairline  at strokeWidth 2 (about one output pixel visible)
//   no-ring        the outline removed
//   no-halo        its light.drop-shadow / light.glow effects removed
//   fill-50        the fill moved halfway to the outline (or halo) colour
//   fill-75        three quarters of the way
//   bare           no outline, no halo
//
// Variants that do not apply (no outline, no halo) are skipped. The sheets
// show each variant at its worst measured frame for the layer and at the
// middle of the hold. The candidates use local-only third-party reels:
// everything is written under the git-ignored
// benchmarks/results/editorial-titles-phase2/variants/ and must never be
// committed. The script reports measured values; the owner judges where
// readability breaks.
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = join(root, "tools/still-shift-cli/src/cli.ts");
const checks = join(root, "benchmarks/results/editorial-titles-et7a");
const results = join(
  root,
  "benchmarks/results/editorial-titles-phase2/variants",
);
const { values } = parseArgs({
  options: {
    candidate: { type: "string", multiple: true },
    layer: { type: "string", multiple: true },
  },
});
const pairs = (values.candidate ?? []).map((candidate, i) => ({
  candidate,
  layer: values.layer?.[i],
}));
if (!pairs.length || pairs.some((pair) => !pair.layer))
  throw new Error("pass --candidate <id> --layer <layer> pairs");

type Animator = {
  node: string;
  from: Record<string, unknown>;
  to?: Record<string, unknown>;
};
type Layer = {
  id: string;
  type: string;
  color?: string;
  effects?: { effect: string; params: Record<string, unknown> }[];
};
type Composition = {
  frameCount: number;
  assets: { id: string; path?: string }[];
  layers: Layer[];
  textAnimators?: Animator[];
  markers?: { id: string; frame: number; duration?: number }[];
  metadata?: Record<string, unknown>;
};

async function still(args: string[]) {
  const { stdout } = await run(
    process.execPath,
    ["--import", "tsx", cli, "comp", ...args],
    { cwd: root, maxBuffer: 512 * 1024 * 1024 },
  ).catch((error: { stdout?: string }) => ({ stdout: error.stdout ?? "" }));
  return JSON.parse(stdout) as Record<string, unknown>;
}
async function ffmpeg(args: string[]) {
  await run("ffmpeg", ["-v", "error", "-y", ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

const strokes = (comp: Composition, layer: string) =>
  (comp.textAnimators ?? []).filter(
    (a) =>
      a.node === layer &&
      [a.from, a.to ?? {}].some((p) => typeof p.strokeWidth === "number"),
  );
const backdrops = (layer: Layer) =>
  (layer.effects ?? []).filter((effect) =>
    ["light.drop-shadow", "light.glow"].includes(effect.effect),
  );
function mix(a: string, b: string, t: number) {
  const channel = (hex: string, i: number) =>
    parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return (
    "#" +
    [0, 1, 2]
      .map((i) =>
        Math.round(channel(a, i) * (1 - t) + channel(b, i) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("") +
    a.slice(7)
  );
}
function treatmentColour(comp: Composition, layer: Layer) {
  const stroke = strokes(comp, layer.id)
    .map((a) => (a.to?.stroke ?? a.from.stroke) as string | undefined)
    .find((value) => typeof value === "string");
  if (stroke) return stroke;
  const color = backdrops(layer)
    .map((effect) => effect.params.color)
    .find((value): value is string => typeof value === "string");
  return color;
}

function variants(base: Composition, id: string) {
  const out: { name: string; comp: Composition }[] = [
    { name: "base", comp: base },
  ];
  const layer = base.layers.find((l) => l.id === id);
  if (!layer || layer.type !== "text") throw new Error(`no text layer ${id}`);
  const edit = (name: string, change: (comp: Composition) => void) => {
    const comp = structuredClone(base);
    change(comp);
    out.push({ name, comp });
  };
  const scaleRing = (comp: Composition, factor: number) => {
    for (const a of strokes(comp, id))
      for (const p of [a.from, a.to ?? {}])
        if (typeof p.strokeWidth === "number")
          p.strokeWidth = Math.max(1, Math.round(p.strokeWidth * factor));
  };
  const hasRing = strokes(base, id).length > 0,
    hasHalo = backdrops(layer).length > 0;
  if (hasRing) {
    edit("ring-half", (comp) => scaleRing(comp, 0.5));
    edit("ring-quarter", (comp) => scaleRing(comp, 0.25));
    edit("ring-hairline", (comp) => {
      for (const a of strokes(comp, id))
        for (const p of [a.from, a.to ?? {}])
          if (typeof p.strokeWidth === "number") p.strokeWidth = 2;
    });
    edit("no-ring", (comp) => {
      comp.textAnimators = comp.textAnimators!.filter(
        (a) =>
          !strokes(base, id).some(
            (s) => JSON.stringify(s) === JSON.stringify(a),
          ),
      );
    });
  }
  if (hasHalo)
    edit("no-halo", (comp) => {
      const target = comp.layers.find((l) => l.id === id)!;
      target.effects = target.effects!.filter(
        (effect) =>
          !["light.drop-shadow", "light.glow"].includes(effect.effect),
      );
    });
  const towards = treatmentColour(base, layer);
  if (towards && typeof layer.color === "string" && layer.color.length >= 7)
    for (const t of [0.5, 0.75])
      edit(`fill-${t * 100}`, (comp) => {
        comp.layers.find((l) => l.id === id)!.color = mix(
          layer.color!,
          towards,
          t,
        );
      });
  if (hasRing && hasHalo)
    edit("bare", (comp) => {
      comp.textAnimators = comp.textAnimators!.filter(
        (a) =>
          !strokes(base, id).some(
            (s) => JSON.stringify(s) === JSON.stringify(a),
          ),
      );
      const target = comp.layers.find((l) => l.id === id)!;
      target.effects = target.effects!.filter(
        (effect) =>
          !["light.drop-shadow", "light.glow"].includes(effect.effect),
      );
    });
  return out;
}

async function latestIteration(candidate: string) {
  const dir = join(checks, candidate);
  const latest = (await readdir(dir))
    .filter((n) => /^r\d+$/.test(n))
    .sort()
    .at(-1);
  if (!latest) throw new Error(`no et7a-check iteration for ${candidate}`);
  return join(dir, latest);
}

// Rerunning some candidates keeps the others' entries.
const indexPath = join(results, "index.json");
const index: Record<string, unknown>[] = await readFile(indexPath, "utf8")
  .then((text) => JSON.parse(text) as Record<string, unknown>[])
  .catch(() => []);
for (const { candidate, layer } of pairs) {
  const source = await latestIteration(candidate);
  const base = JSON.parse(
    await readFile(join(source, "composition.json"), "utf8"),
  ) as Composition;
  // Exported asset paths are relative to the iteration folder.
  for (const asset of base.assets)
    if (asset.path) asset.path = resolve(source, asset.path);
  // Lint without the saved waivers: the profile replaces them.
  const policy = base.metadata?.readingPolicy as
    | { textLegibility?: Record<string, unknown> }
    | undefined;
  if (policy?.textLegibility) delete policy.textLegibility.waivers;
  const hold = base.markers?.find((m) => m.id === "hold");
  const midHold = hold
    ? Math.round(hold.frame + (hold.duration ?? 1) / 2)
    : Math.floor(base.frameCount / 2);
  const dir = join(results, candidate);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const tiles: string[] = [];
  const rows: Record<string, unknown>[] = [];
  for (const { name, comp } of variants(base, layer!)) {
    const input = join(dir, `${name}.json`);
    await writeFile(input, JSON.stringify(comp));
    const video = join(dir, `${name}.mp4`);
    const render = await still(["render", "--input", input, "--output", video]);
    if (render.status !== "rendered")
      throw new Error(`${candidate} ${name}: ${JSON.stringify(render)}`);
    const report = await still([
      "lint",
      "--input",
      input,
      "--pixels",
      "true",
      "--profile",
      "editorial-title",
    ]);
    await writeFile(join(dir, `${name}.lint.json`), JSON.stringify(report));
    const entry = (
      report.textLegibility as {
        layers: {
          layer: string;
          worst?: { contrast: number; frame: number; word: string };
          edges?: { fill: number; outer: number | null };
          contrastTarget: number;
        }[];
      }
    ).layers.find((l) => l.layer === layer)!;
    const worstFrame = entry.worst?.frame ?? midHold;
    for (const [suffix, frame] of [
      ["worst", worstFrame],
      ["hold", midHold],
    ] as const) {
      const png = join(dir, `${name}-${suffix}.png`);
      await ffmpeg([
        "-i",
        video,
        "-vf",
        `select='eq(n\\,${frame})',scale=360:640`,
        "-frames:v",
        "1",
        "-fps_mode",
        "passthrough",
        png,
      ]);
      tiles.push(png);
    }
    rows.push({
      variant: name,
      contrast: entry.worst?.contrast ?? null,
      edges: entry.edges ?? null,
      worstWord: entry.worst?.word ?? null,
      worstFrame,
      midHoldFrame: midHold,
      target: entry.contrastTarget,
      passes:
        entry.worst !== undefined &&
        entry.worst.contrast >= entry.contrastTarget,
    });
    console.error(`${candidate} ${layer} ${name}: ${entry.worst?.contrast}`);
  }
  // Two tiles per variant (worst frame, then mid-hold), one variant per row.
  const columns = 2;
  const layout = tiles
    .map((_, i) => `${(i % columns) * 360}_${Math.floor(i / columns) * 640}`)
    .join("|");
  const sheet = join(dir, `${candidate}-${layer}-variants.png`);
  await ffmpeg([
    ...tiles.flatMap((png) => ["-i", png]),
    "-filter_complex",
    `xstack=inputs=${tiles.length}:layout=${layout}:fill=black`,
    sheet,
  ]);
  const at = index.findIndex(
    (entry) => entry.candidate === candidate && entry.layer === layer,
  );
  if (at >= 0) index.splice(at, 1);
  index.push({ candidate, layer, sheet, rows });
}
await writeFile(indexPath, JSON.stringify(index, null, 2));
process.stdout.write(JSON.stringify(index, null, 2) + "\n");
