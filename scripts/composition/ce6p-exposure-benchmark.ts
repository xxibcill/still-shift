import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createServer, type ViteDevServer } from "vite";
import {
  assertPinnedRenderEnvironment,
  launchRenderBrowser,
  probeRenderEnvironment,
} from "@still-shift/execution-runtime";
import type { Browser } from "playwright";
import type * as ExportCost from "../../tests/helpers/composition-exposure-reference.ts";
import type * as PreviewCost from "../../tests/helpers/composition-ce6p-preview-cost.ts";

const root = resolve(import.meta.dirname, "../..");
const option = (name: string, fallback: string) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1]!;
};
const baselineRef = option(
  "--baseline-ref",
  "0e4838852855f6dc8cf91bba763a402dfd716f88",
);
const profile = process.argv.includes("--hardware") ? "hardware" : "pinned";
const output = resolve(
  option("--output", "benchmarks/results/composition-ce6p/exposure-ab.json"),
);
const candidateRef = option("--candidate-ref", "");
const kernelPath =
  "packages/renderer-core/src/composition/render/webgl-exposure.ts";
const rendererPath = "packages/renderer-core/src/composition/render/webgl2.ts";
const baseline = execFileSync(
  "git",
  ["show", `${baselineRef}:${rendererPath}`],
  { cwd: root, encoding: "utf8" },
);
const refSource = (ref: string, path: string, optional = false) => {
  const options = { cwd: root, encoding: "utf8" as const };
  if (
    optional &&
    !execFileSync("git", ["ls-tree", "--name-only", ref, path], options).trim()
  )
    return undefined;
  return execFileSync("git", ["show", `${ref}:${path}`], options);
};
const baselineKernel = refSource(baselineRef, kernelPath, true);
const candidate = candidateRef
  ? refSource(candidateRef, rendererPath)!
  : await readFile(join(root, rendererPath), "utf8");
const candidateKernel = candidateRef
  ? refSource(candidateRef, kernelPath, true)
  : await readFile(join(root, kernelPath), "utf8");
const digest = (source: string) =>
  createHash("sha256").update(source).digest("hex");
const runs: unknown[] = [];

const competingWorkloads = () => {
  const processes = execFileSync("ps", ["-axo", "pid,command"], {
    encoding: "utf8",
  });
  return processes.split("\n").filter((line) => {
    const match = /^\s*\d+\s+(\S+)\s+(.*)$/.exec(line);
    if (!match) return false;
    const executable = match[1]!.split("/").at(-1);
    const args = match[2]!;
    // Treat every package-manager invocation as competing: custom scripts,
    // optional `run` and filters can all launch a verification workload.
    if (executable === "pnpm" || executable === "vitest") return true;
    if (executable !== "node" && executable !== "tsx") return false;
    return /(?:^|[/\s])pnpm(?:\.[cm]?js)?(?:\s|$)|vitest|tests\/(?:browser|integration|runtime)\//.test(
      args,
    );
  });
};

for (const variant of [
  "baseline",
  "candidate",
  "candidate",
  "baseline",
] as const) {
  const competing = competingWorkloads();
  if (competing.length)
    throw new Error(
      `Competing test workloads; benchmark not started:\n${competing.join("\n")}`,
    );
  const cache = await mkdtemp(join(tmpdir(), "ce6p-ab-vite-"));
  let server: ViteDevServer | undefined;
  let browser: Browser | undefined;
  let overlap: string[] = [];
  const monitor = setInterval(() => {
    try {
      const workload = competingWorkloads();
      if (workload.length) overlap = workload;
    } catch (error) {
      overlap = [`Workload inspection failed: ${String(error)}`];
    }
  }, 2000);
  try {
    server = await createServer({
      root,
      cacheDir: cache,
      configFile: false,
      logLevel: "error",
      plugins: [
        {
          name: "ce6p-selected-renderer",
          enforce: "pre",
          load(id) {
            if (id === join(root, rendererPath))
              return variant === "baseline" ? baseline : candidate;
            if (id === join(root, kernelPath))
              return variant === "baseline" ? baselineKernel : candidateKernel;
          },
        },
      ],
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    browser = await launchRenderBrowser({ profile });
    const page = await browser.newPage();
    await page.addInitScript("window.__name = (fn) => fn;");
    await page.goto(server.resolvedUrls!.local[0]!);
    const environment = await probeRenderEnvironment(page, profile);
    if (profile === "pinned") assertPinnedRenderEnvironment(environment);
    const rendererVersion = await page.evaluate(async () => {
      const url = "/packages/renderer-core/src/composition/render/webgl2.ts";
      return (await import(url)).COMPOSITION_WEBGL_RENDERER_VERSION;
    });
    if (overlap.length || competingWorkloads().length)
      throw new Error("Competing verification began during benchmark setup");
    const exportCosts = await page.evaluate(async () => {
      const url = "/tests/helpers/composition-exposure-reference.ts";
      return ((await import(url)) as typeof ExportCost).measureExposureFrames();
    });
    const previewCosts = await page.evaluate(async () => {
      const url = "/tests/helpers/composition-ce6p-preview-cost.ts";
      return (
        (await import(url)) as typeof PreviewCost
      ).measureExposurePreview();
    });
    clearInterval(monitor);
    const contention = overlap.length ? overlap : competingWorkloads();
    runs.push({
      variant,
      rendererVersion,
      environment,
      exportCosts,
      previewCosts,
      timingValid: contention.length === 0,
      overlap: contention,
    });
    await mkdir(dirname(output), { recursive: true });
    await writeFile(
      output,
      JSON.stringify(
        {
          baselineRef,
          candidateRef: candidateRef || "working-tree",
          baselineKernelSha256: baselineKernel ? digest(baselineKernel) : null,
          baselineSourceSha256: digest(baseline),
          candidateSourceSha256: digest(candidate),
          candidateKernelSha256: candidateKernel
            ? digest(candidateKernel)
            : null,
          method:
            "Serial baseline/candidate/candidate/baseline sessions, independent Vite optimizer caches; original CE7 export-cost method; separate RAF preview diagnostic; startup/end workload checks and 2-second overlap polling (invalid runs retained and rejected)",
          runs,
        },
        null,
        2,
      ) + "\n",
    );
    if (contention.length)
      throw new Error(
        `Competing verification began during timing; retained run ${runs.length} is invalid`,
      );
    console.log(
      `${variant} ${rendererVersion}: retained run ${runs.length} at ${output}`,
    );
  } finally {
    clearInterval(monitor);
    try {
      await Promise.all([browser?.close(), server?.close()]);
    } finally {
      await rm(cache, { recursive: true, force: true });
    }
  }
}
