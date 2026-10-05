import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createServer } from "vite";
import {
  assertPinnedRenderEnvironment,
  launchRenderBrowser,
  probeRenderEnvironment,
} from "@still-shift/execution-runtime";
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
const rendererPath = "packages/renderer-core/src/composition/render/webgl2.ts";
const baseline = execFileSync(
  "git",
  ["show", `${baselineRef}:${rendererPath}`],
  { cwd: root, encoding: "utf8" },
);
const candidate = await readFile(join(root, rendererPath), "utf8");
const digest = (source: string) =>
  createHash("sha256").update(source).digest("hex");
const runs: unknown[] = [];

for (const variant of [
  "baseline",
  "candidate",
  "candidate",
  "baseline",
] as const) {
  const processes = execFileSync("ps", ["-axo", "pid,command"], {
    encoding: "utf8",
  });
  const competing = processes
    .split("\n")
    .filter((line) =>
      /(?:pnpm (?:check|test)|vitest|(?:node|tsx).*tests\/browser\/)/.test(
        line,
      ),
    );
  if (competing.length)
    throw new Error(
      `Competing test workloads; benchmark not started:\n${competing.join("\n")}`,
    );
  const cache = await mkdtemp(join(tmpdir(), "ce6p-ab-vite-"));
  const server = await createServer({
    root,
    cacheDir: cache,
    configFile: false,
    logLevel: "error",
    plugins:
      variant === "baseline"
        ? [
            {
              name: "ce6p-original-renderer",
              enforce: "pre",
              load(id) {
                if (id === join(root, rendererPath)) return baseline;
              },
            },
          ]
        : [],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await launchRenderBrowser({ profile });
  try {
    const page = await browser.newPage();
    await page.addInitScript("window.__name = (fn) => fn;");
    await page.goto(server.resolvedUrls!.local[0]!);
    const environment = await probeRenderEnvironment(page, profile);
    if (profile === "pinned") assertPinnedRenderEnvironment(environment);
    const rendererVersion = await page.evaluate(async () => {
      const url = "/packages/renderer-core/src/composition/render/webgl2.ts";
      return (await import(url)).COMPOSITION_WEBGL_RENDERER_VERSION;
    });
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
    runs.push({
      variant,
      rendererVersion,
      environment,
      exportCosts,
      previewCosts,
    });
    await mkdir(dirname(output), { recursive: true });
    await writeFile(
      output,
      JSON.stringify(
        {
          baselineRef,
          baselineSourceSha256: digest(baseline),
          candidateSourceSha256: digest(candidate),
          candidateKernelSha256: digest(
            await readFile(
              join(
                root,
                "packages/renderer-core/src/composition/render/webgl-exposure.ts",
              ),
              "utf8",
            ),
          ),
          method:
            "Serial baseline/candidate/candidate/baseline sessions, independent Vite optimizer caches; original CE7 export-cost method; separate RAF preview diagnostic",
          runs,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `${variant} ${rendererVersion}: retained run ${runs.length} at ${output}`,
    );
  } finally {
    await browser.close();
    await server.close();
    await rm(cache, { recursive: true, force: true });
  }
}
