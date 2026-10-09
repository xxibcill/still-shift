import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import type * as Checks from "../helpers/composition-alpha-reference.ts";

const root = resolve(import.meta.dirname, "../..");
const scratch = await mkdtemp(join(tmpdir(), "composition-alpha-"));
const server = await createServer({
  root,
  configFile: false,
  cacheDir: join(scratch, "vite"),
  logLevel: "error",
  plugins: [
    {
      name: "alpha-independent-png-decode",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url !== "/_alpha/decode-png") return next();
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.end("POST required");
            return;
          }
          void (async () => {
            const chunks: Buffer[] = [];
            let total = 0;
            for await (const chunk of request) {
              total += chunk.length;
              if (total > 524288)
                throw Error("Alpha fixture PNG exceeds its byte bound");
              chunks.push(Buffer.from(chunk));
            }
            const png = Buffer.concat(chunks);
            assert.deepEqual(
              [...png.subarray(0, 8)],
              [137, 80, 78, 71, 13, 10, 26, 10],
            );
            const width = png.readUInt32BE(16),
              height = png.readUInt32BE(20);
            assert.ok(
              (width === 32 && height === 24) ||
                (width === 256 && height === 256),
            );
            const decoded = spawnSync(
              "ffmpeg",
              [
                "-v",
                "error",
                "-threads",
                "1",
                "-f",
                "image2pipe",
                "-vcodec",
                "png",
                "-i",
                "pipe:0",
                "-threads",
                "1",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "rgba",
                "pipe:1",
              ],
              { input: png, maxBuffer: 524288 },
            );
            if (decoded.error) throw decoded.error;
            assert.equal(decoded.status, 0, decoded.stderr.toString());
            assert.equal(decoded.stdout.length, width * height * 4);
            response.setHeader("Content-Type", "application/octet-stream");
            response.end(decoded.stdout);
          })().catch((error: unknown) => {
            response.statusCode = 500;
            response.end(String(error));
          });
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 0 },
});
let browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
try {
  await server.listen();
  browser = await launchRenderBrowser();
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const environment = await probeRenderEnvironment(page);
  assertPinnedRenderEnvironment(environment);
  if (process.argv.includes("--quantization-only")) {
    const diagnostic = await page.evaluate(async () => {
      const url = "/tests/helpers/composition-alpha-reference.ts";
      return ((await import(url)) as typeof Checks).inspectAlphaQuantization();
    });
    console.log(
      JSON.stringify({ status: "diagnostic-only", environment, ...diagnostic }),
    );
  } else {
    const result = await page.evaluate(async () => {
      const url = "/tests/helpers/composition-alpha-reference.ts";
      return ((await import(url)) as typeof Checks).checkCompositionAlpha();
    });
    assert.equal(result.cases, 38);
    const quantization = await page.evaluate(async () => {
      const url = "/tests/helpers/composition-alpha-reference.ts";
      return ((await import(url)) as typeof Checks).checkAlphaQuantization();
    });
    const directory = join(root, "benchmarks/results/composition-ce15-alpha");
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "acceptance.json"),
      `${JSON.stringify({ status: "passed", environment, ...result, quantization }, null, 2)}\n`,
    );
    console.log(
      JSON.stringify({ status: "passed", cases: result.cases, environment }),
    );
  }
} finally {
  await browser?.close();
  await server.close();
  await rm(scratch, { recursive: true, force: true });
}
