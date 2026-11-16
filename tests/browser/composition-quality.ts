import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createServer } from "vite";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import {
  fixtures,
  composition,
  solid,
} from "../../benchmarks/fixtures/composition/ce12/fixtures.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import { lintCompositionFile } from "@still-shift/animation-engine";
import type * as Renderer from "@still-shift/renderer-core";
import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";

import { fileURLToPath } from "node:url";
import o4VideoPixelLint from "../../benchmarks/fixtures/editorial-titles/o4-video-pixel-lint.ts";
import { editorialFixture } from "../helpers/editorial-video-lint.ts";
import { verifyLintSignalCleanup } from "./composition-lint-signals.ts";
import { verifyTextLegibility } from "./composition-text-legibility.ts";
import { verifyFramingGuards } from "./composition-framing-guards.ts";
import { verifyTextMeasure } from "./composition-text-measure.ts";
import {
  collapsedMotionComposition,
  groupEffectMotionComposition,
  nestedCoverageComposition,
  providerReadingComposition,
  qualityCapacityComposition,
} from "../helpers/composition-quality-fixtures.ts";

const root = resolve(import.meta.dirname, "../..");
const cache = await mkdtemp(join(tmpdir(), "composition-quality-vite-"));
const server = await createServer({
  cacheDir: cache,
  configFile: resolve(root, "apps/lab/vite.config.ts"),
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0, strictPort: false },
});
await server.listen();
const browser = await launchRenderBrowser();
try {
  const page = await browser.newPage();
  const base = server.resolvedUrls!.local[0]!;
  await page.goto(base + "composition.html?scene=ce12/stillness-fail.json");
  await page.waitForFunction(
    () =>
      document.getElementById("status")?.dataset.ready ===
      "ce12/stillness-fail.json",
  );
  assert.match(await page.locator("#lint-summary").innerText(), /errors/);
  await page.locator('#lint-timeline button[aria-label*="frozen-run"]').click();
  assert.equal(await page.locator("#frame").inputValue(), "1");
  await page.locator("#lint").click();
  await page.waitForFunction(() =>
    document
      .getElementById("lint-summary")
      ?.textContent?.includes("pixels and state checked"),
  );
  assert.ok(
    await page
      .locator('#lint-timeline button[aria-label*="frozen-pixels"]')
      .count(),
  );
  console.log(
    "Lab timeline markers seek correctly; rendered pixel findings displayed.",
  );

  const oversized = "ce12/oversized-lint.json";
  await page.route("**/composition/fixtures", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: [
        ...((await response.json()) as unknown[]),
        { path: oversized, id: "oversized", name: "oversized" },
      ],
    });
  });
  await page.route(
    `**/composition/scene?scene=${encodeURIComponent(oversized)}`,
    (route) => route.fulfill({ json: qualityCapacityComposition() }),
  );
  await page.goto(base + `composition.html?scene=${oversized}`);
  await page.waitForFunction(
    (path) => document.getElementById("status")?.dataset.ready === path,
    oversized,
  );
  assert.equal(await page.locator("#error").innerText(), "");
  assert.match(
    await page.locator("#lint-summary").innerText(),
    /^Motion checks unavailable: comp-lint-limit/,
  );
  assert.equal(await page.locator("#play").isDisabled(), false);
  assert.equal(await page.locator("#lint").isDisabled(), true);
  await page.unrouteAll();
  console.log("Lab previews compositions whose motion lint cannot run.");

  const groupMotion = groupEffectMotionComposition();
  const groupNodeReport = analyzeCompositionQuality(groupMotion);
  const groupReports = await page.evaluate(
    async ({ json, moduleUrl }) => {
      const renderer = (await import(moduleUrl)) as typeof Renderer;
      const comp = JSON.parse(json) as Composition;
      const preview = renderer.createCompositionPreview(
        document.createElement("canvas"),
        comp,
        await renderer.loadCompositionResources(comp, () => {
          throw new Error("No assets expected");
        }),
      );
      try {
        return {
          state: renderer.analyzeCompositionQuality(comp),
          rendered: await renderer.analyzeRenderedCompositionQuality(
            comp,
            preview,
          ),
        };
      } finally {
        preview.dispose();
      }
    },
    {
      json: JSON.stringify(groupMotion),
      moduleUrl: `/@fs/${root}/packages/renderer-core/src/index.ts`,
    },
  );
  assert.deepEqual(groupReports.state, groupNodeReport);
  for (const report of [groupReports.state, groupReports.rendered]) {
    assert.ok(!report.diagnostics.some((d) => d.code === "frozen-run"));
    assert.ok(
      report.diagnostics.some((d) => d.code === "velocity-discontinuity"),
    );
  }
  assert.ok(
    !groupReports.rendered.diagnostics.some((d) => d.code === "frozen-pixels"),
  );

  const nestedCoverage = nestedCoverageComposition(0, 15);
  const coverageReport = await page.evaluate(
    async ({ json, moduleUrl }) => {
      const renderer = (await import(moduleUrl)) as typeof Renderer;
      const comp = JSON.parse(json) as Composition;
      const preview = renderer.createCompositionPreview(
        document.createElement("canvas"),
        comp,
        await renderer.loadCompositionResources(comp, () => {
          throw new Error("No assets expected");
        }),
      );
      try {
        preview.renderFrame(0);
        const covered = [...preview.readPixels().slice(0, 3)];
        preview.renderFrame(15);
        const uncovered = [...preview.readPixels().slice(0, 3)];
        return {
          covered,
          uncovered,
          report: renderer.analyzeCompositionQuality(comp, {
            coverageLayers: ["host/bg"],
          }),
        };
      } finally {
        preview.dispose();
      }
    },
    {
      json: JSON.stringify(nestedCoverage),
      moduleUrl: `/@fs/${root}/packages/renderer-core/src/index.ts`,
    },
  );
  assert.deepEqual(
    coverageReport.report,
    analyzeCompositionQuality(nestedCoverage, { coverageLayers: ["host/bg"] }),
  );
  assert.deepEqual(coverageReport.covered, [239, 173, 85]);
  assert.deepEqual(coverageReport.uncovered, [0, 0, 0]);
  assert.deepEqual(
    coverageReport.report.diagnostics
      .filter((d) => d.code === "coverage")
      .map((d) => d.frames),
    [[15, 29]],
  );

  for (const [name, pair] of Object.entries(fixtures)) {
    for (const [outcome, comp] of Object.entries(pair)) {
      const nodeReport = analyzeCompositionQuality(comp);
      const browserReport = await page.evaluate(
        async ({ json, moduleUrl }) => {
          const url = moduleUrl;
          const renderer = (await import(url)) as typeof Renderer;
          return renderer.analyzeCompositionQuality(
            JSON.parse(json) as Composition,
          );
        },
        {
          json: JSON.stringify(comp),
          moduleUrl: `/@fs/${root}/packages/renderer-core/src/index.ts`,
        },
      );
      assert.deepEqual(
        browserReport,
        nodeReport,
        `${name}/${outcome}: Node/browser parity`,
      );
    }
  }
  const diagnosticDirectory = await mkdtemp(
    join(tmpdir(), "ce12-pixel-diagnostics-"),
  );
  try {
    for (const test of [
      {
        name: "provider",
        comp: composition(
          [
            {
              id: "subject",
              type: "provider",
              provider: "missing.provider@1.0.0",
              params: {},
              bounds: [0, 0, 32, 32],
            },
          ],
          { width: 32, height: 32, frameCount: 1 },
        ),
        policy: {},
        code: "comp-provider-unavailable",
        path: "layers[0].provider",
      },
      {
        name: "policy",
        comp: fixtures.stillness.pass,
        policy: { intentionalCuts: [90] },
        code: "comp-lint-cut-range",
        path: "intentionalCuts.0",
      },
    ]) {
      const input = join(diagnosticDirectory, `${test.name}.json`);
      const policy = join(diagnosticDirectory, `${test.name}-policy.json`);
      await writeFile(input, JSON.stringify(test.comp));
      await writeFile(policy, JSON.stringify(test.policy));
      let stdout = "",
        stderr = "";
      const exit = await runCli(
        [
          "comp",
          "lint",
          "--input",
          input,
          "--policy",
          policy,
          "--pixels",
          "true",
        ],
        {
          stdout: (s) => {
            stdout += s;
          },
          stderr: (s) => {
            stderr += s;
          },
        },
      );
      assert.equal(exit, 1);
      assert.equal(stdout, "");
      assert.deepEqual(
        JSON.parse(stderr).diagnostics.map(
          (d: { code: string; path?: string; severity: string }) => ({
            code: d.code,
            path: d.path,
            severity: d.severity,
          }),
        ),
        [{ code: test.code, path: test.path, severity: "error" }],
        `${test.name}: browser diagnostic transport`,
      );
    }
  } finally {
    await rm(diagnosticDirectory, { recursive: true });
  }
  for (const source of ["solid", "group", "precomp"] as const) {
    const layers: CompositionLayer[] = [];
    const move = {
      position: {
        keys: [
          { frame: 0, value: [70, 70] as [number, number] },
          {
            frame: 89,
            value: [100, 70] as [number, number],
            interpolation: "linear" as const,
          },
        ],
      },
    };
    for (let i = 0; i < 4; i++) {
      const id = `matte-${i}`;
      layers.push(
        solid(`paint-${i}`, { trackMatte: { layer: id, mode: "alpha" } }),
      );
      if (source === "solid") layers.push(solid(id, { transform: move }));
      else if (source === "group")
        layers.push(
          {
            id,
            type: "group",
            size: [640, 360],
            transform: { anchor: [0, 0], position: [0, 0] },
          },
          solid(`content-${i}`, { parent: id, transform: move }),
        );
      else
        layers.push({
          id,
          type: "precomp",
          comp: "inner",
          transform: { anchor: [0, 0] },
        });
    }
    const comp = composition(
      layers,
      source === "precomp"
        ? {
            precomps: [
              {
                id: "inner",
                width: 640,
                height: 360,
                frameCount: 90,
                layers: [solid("content", { transform: move })],
              },
            ],
          }
        : {},
    );
    const node = analyzeCompositionQuality(comp);
    const rendered = await page.evaluate(
      async ({ json, moduleUrl }) => {
        const renderer = (await import(moduleUrl)) as typeof Renderer;
        const comp = JSON.parse(json) as Composition;
        const preview = renderer.createCompositionPreview(
          document.createElement("canvas"),
          comp,
          await renderer.loadCompositionResources(comp, () => {
            throw new Error("No assets expected");
          }),
        );
        try {
          return {
            state: renderer.analyzeCompositionQuality(comp),
            pixels: await renderer.analyzeRenderedCompositionQuality(
              comp,
              preview,
              { pixelMinimumChanges: 1 },
            ),
          };
        } finally {
          preview.dispose();
        }
      },
      {
        json: JSON.stringify(comp),
        moduleUrl: `/@fs/${root}/packages/renderer-core/src/index.ts`,
      },
    );
    assert.deepEqual(
      rendered.state,
      node,
      `${source}: matte timing Node/browser parity`,
    );
    for (const code of ["easing-monotony", "co-start"])
      assert.ok(rendered.state.diagnostics.some((d) => d.code === code));
    assert.equal(
      rendered.pixels.diagnostics.some(
        (d) => d.code === "frozen-run" || d.code === "frozen-pixels",
      ),
      false,
      `${source}: moving matte content`,
    );
  }
  for (const kind of [
    "group-clip",
    "group-open",
    "rotated-clip",
    "precomp-clip",
    "precomp-collapse",
  ] as const) {
    const precomp = kind.startsWith("precomp");
    const rotated = kind === "rotated-clip";
    const comp = precomp
      ? composition(
          [
            {
              id: "host",
              type: "precomp",
              comp: "small",
              collapseTransforms: kind === "precomp-collapse",
              transform: { anchor: [0, 0], position: [0, 0] },
            },
          ],
          {
            frameCount: 1,
            precomps: [
              {
                id: "small",
                width: 100,
                height: 100,
                frameCount: 1,
                layers: [
                  solid("cover", {
                    size: [640, 360],
                    transform: { anchor: [0, 0], position: [0, 0] },
                  }),
                ],
              },
            ],
          },
        )
      : composition(
          [
            {
              id: "clip",
              type: "group",
              size: rotated ? [640, 360] : [100, 100],
              clip: kind !== "group-open",
              transform: rotated
                ? { anchor: [320, 180], position: [320, 180], rotation: 45 }
                : { anchor: [0, 0], position: [0, 0] },
            },
            solid("cover", {
              parent: "clip",
              size: rotated ? [2000, 2000] : [640, 360],
              transform: rotated
                ? { anchor: [1000, 1000], position: [320, 180] }
                : { anchor: [0, 0], position: [0, 0] },
            }),
          ],
          { frameCount: 1 },
        );
    const missing = kind !== "group-open" && kind !== "precomp-collapse";
    const result = await page.evaluate(
      async ({ json, moduleUrl, coverageId, point }) => {
        const renderer = (await import(moduleUrl)) as typeof Renderer;
        const comp = JSON.parse(json) as Composition;
        const preview = renderer.createCompositionPreview(
          document.createElement("canvas"),
          comp,
          await renderer.loadCompositionResources(comp, () => {
            throw new Error("No assets expected");
          }),
        );
        try {
          preview.renderFrame(0);
          const pixels = preview.readPixels();
          return {
            coverage: renderer
              .analyzeCompositionQuality(comp, { coverageLayers: [coverageId] })
              .diagnostics.some((d) => d.code === "coverage"),
            red: pixels[(point[1]! * comp.width + point[0]!) * 4],
          };
        } finally {
          preview.dispose();
        }
      },
      {
        json: JSON.stringify(comp),
        moduleUrl: `/@fs/${root}/packages/renderer-core/src/index.ts`,
        coverageId: precomp ? "host/cover" : "cover",
        point: rotated ? [1, 1] : [200, 200],
      },
    );
    assert.equal(
      result.coverage,
      missing,
      `${kind}: clipped coverage diagnostic`,
    );
    assert.equal(
      result.red,
      missing ? 0 : 239,
      `${kind}: actual painted coverage`,
    );
  }
  const motion = composition([
    solid("large", {
      size: [400, 280],
      transform: {
        anchor: [0, 0],
        position: {
          keys: [
            { frame: 0, value: [60, 40] },
            { frame: 89, value: [104.5, 40], interpolation: "linear" },
          ],
        },
      },
    }),
  ]);
  const hidden = composition([
    solid("hidden-motion", {
      transform: {
        position: {
          keys: [
            { frame: 0, value: [60, 80] },
            { frame: 89, value: [104.5, 80], interpolation: "linear" },
          ],
        },
      },
    }),
    solid("opaque-cover", {
      size: [640, 360],
      transform: { anchor: [0, 0], position: [0, 0] },
    }),
  ]);
  for (const backend of ["canvas2d", "webgl2"] as const) {
    for (const [name, comp] of [
      ["motion", motion],
      ["hidden", hidden],
    ] as const) {
      const result = await page.evaluate(
        async ({ json, backend, moduleUrl }) => {
          const url = moduleUrl;
          const renderer = (await import(url)) as typeof Renderer;
          const comp = JSON.parse(json) as Composition;
          const preview = renderer.createCompositionPreview(
            document.createElement("canvas"),
            comp,
            await renderer.loadCompositionResources(comp, () => {
              throw new Error("No assets expected");
            }),
            { backend },
          );
          try {
            return await renderer.analyzeRenderedCompositionQuality(
              comp,
              preview,
            );
          } finally {
            preview.dispose();
          }
        },
        {
          json: JSON.stringify(comp),
          backend,
          moduleUrl: `/@fs/${root}/packages/renderer-core/src/index.ts`,
        },
      );
      assert.equal(result.measured.pixels, true);
      assert.equal(
        result.diagnostics.some((d) => d.code === "frozen-run"),
        false,
      );
      assert.equal(
        result.diagnostics.some((d) => d.code === "frozen-pixels"),
        name === "hidden",
        `${backend}/${name}`,
      );
    }
  }
  for (const type of ["null", "group"] as const) {
    const inherited = composition([]);
    for (let i = 0; i < 4; i++) {
      const id = `parent-${i}`;
      const transform = {
        anchor: [0, 0] as [number, number],
        position: {
          keys: [
            { frame: 0, value: [0, 0] as [number, number] },
            {
              frame: 89,
              value: [200, 0] as [number, number],
              interpolation: "linear" as const,
            },
          ],
        },
      };
      inherited.layers.push(
        type === "group"
          ? { id, type, size: [640, 360], transform }
          : { id, type, transform },
        solid(`child-${i}`, { parent: id }),
      );
    }
    const node = analyzeCompositionQuality(inherited);
    const rendered = await page.evaluate(
      async ({ json, moduleUrl }) => {
        const renderer = (await import(moduleUrl)) as typeof Renderer;
        return renderer.analyzeCompositionQuality(
          JSON.parse(json) as Composition,
        );
      },
      {
        json: JSON.stringify(inherited),
        moduleUrl: `/@fs/${root}/packages/renderer-core/src/index.ts`,
      },
    );
    assert.deepEqual(
      rendered,
      node,
      `${type}: inherited timing Node/browser parity`,
    );
    for (const code of ["easing-monotony", "co-start"])
      assert.ok(
        rendered.diagnostics.some((d) => d.code === code),
        `${type} parents must contribute ${code}`,
      );
  }

  const inactiveEffect = composition([
    solid("still-subject", {
      effects: [
        {
          id: "disabled-sweep",
          effect: "light.sweep",
          enabled: false,
          params: {
            progress: {
              keys: [
                { frame: 0, value: 0 },
                { frame: 89, value: 1, interpolation: "linear" },
              ],
            },
          },
        },
      ],
    }),
  ]);
  const inactiveReport = await page.evaluate(
    async ({ json, moduleUrl }) => {
      const renderer = (await import(moduleUrl)) as typeof Renderer;
      const comp = JSON.parse(json) as Composition;
      const preview = renderer.createCompositionPreview(
        document.createElement("canvas"),
        comp,
        await renderer.loadCompositionResources(comp, () => {
          throw new Error("No assets expected");
        }),
      );
      try {
        return await renderer.analyzeRenderedCompositionQuality(comp, preview);
      } finally {
        preview.dispose();
      }
    },
    {
      json: JSON.stringify(inactiveEffect),
      moduleUrl: `/@fs/${root}/packages/renderer-core/src/index.ts`,
    },
  );
  assert.equal(inactiveReport.status, "failed");
  for (const code of ["frozen-run", "frozen-pixels"])
    assert.ok(
      inactiveReport.diagnostics.some((d) => d.code === code),
      `Disabled effect must not hide ${code}`,
    );

  const providerDirectory = await mkdtemp(
    join(tmpdir(), "ce12-provider-reading-"),
  );
  try {
    for (const [revealStart, expected] of [
      [145, "failed"],
      [50, "passed"],
    ] as const) {
      const input = join(providerDirectory, `${revealStart}.json`);
      await writeFile(
        input,
        JSON.stringify(providerReadingComposition(revealStart)),
      );
      const report = await lintCompositionFile(
        input,
        {},
        { pixels: true, projectRoot: root },
      );
      assert.equal(report.status, expected);
      assert.equal(report.measured.pixels, true);
      const reading = report.diagnostics.filter(
        (d) => d.code === "reading-time",
      );
      assert.equal(reading.length, expected === "failed" ? 1 : 0);
      if (reading.length) assert.equal(reading[0]!.measured, 5 / 30);
    }
  } finally {
    await rm(providerDirectory, { recursive: true });
  }

  const collapsedDirectory = await mkdtemp(
    join(tmpdir(), "ce12-collapsed-motion-"),
  );
  try {
    for (const collapse of [true, false]) {
      const input = join(collapsedDirectory, `${collapse}.json`);
      await writeFile(
        input,
        JSON.stringify(collapsedMotionComposition(collapse)),
      );
      const report = await lintCompositionFile(
        input,
        {},
        { pixels: true, projectRoot: root },
      );
      assert.equal(report.status, collapse ? "passed" : "failed");
      assert.equal(report.measured.pixels, true);
      for (const code of ["frozen-run", "frozen-pixels", "off-canvas"])
        assert.equal(
          report.diagnostics.some((d) => d.code === code),
          !collapse,
          `${code}: collapsed source footprint`,
        );
    }
  } finally {
    await rm(collapsedDirectory, { recursive: true });
  }

  const capacityDirectory = await mkdtemp(join(tmpdir(), "ce12-lint-limit-"));
  try {
    const input = join(capacityDirectory, "oversized.json");
    await writeFile(input, JSON.stringify(qualityCapacityComposition()));
    await assert.rejects(
      lintCompositionFile(input, {}, { pixels: true, projectRoot: root }),
      (error: unknown) => {
        assert.deepEqual(
          passageDiagnostics(error).map(({ code, severity, path }) => ({
            code,
            severity,
            path,
          })),
          [{ code: "comp-lint-limit", severity: "error", path: "layers" }],
        );
        return true;
      },
    );
  } finally {
    await rm(capacityDirectory, { recursive: true });
  }

  // ET2 (O4 regression): pixel lint over native video, on the tracked
  // synthetic clip. The no-video control is the same composition without its
  // video layer, so frozen findings there and none with video show that the
  // footage's own pixels reach the pixel rule.
  const et2Lint = async (name: string, pixels = true) => {
    let stdout = "",
      stderr = "";
    const code = await runCli(
      [
        "comp",
        "lint",
        "--input",
        fileURLToPath(editorialFixture(`${name}.ts`)),
        "--pixels",
        String(pixels),
      ],
      {
        stdout: (text) => {
          stdout += text;
        },
        stderr: (text) => {
          stderr += text;
        },
      },
    );
    assert.equal(stderr, "", `${name}: ${stderr.slice(0, 2000)}`);
    const report = JSON.parse(stdout) as {
      status: string;
      measured: Record<string, unknown>;
      diagnostics: { code: string; node?: string; frames?: number[] }[];
    };
    return { code, report };
  };
  const pixelMeasured = {
    evaluatedState: true,
    pixels: true,
    pixelMethod: "grayscale-energy",
    textBounds: true,
  };
  const withVideo = await et2Lint("o4-video-pixel-lint");
  assert.equal(withVideo.code, 0, "ET2: video pixel lint exit");
  assert.equal(withVideo.report.status, "passed");
  assert.deepEqual(withVideo.report.measured, pixelMeasured);
  assert.deepEqual(
    withVideo.report.diagnostics.map((d) => [d.code, d.node]),
    [["outside-safe-area", "clip"]],
    "ET2: moving footage must not be reported frozen",
  );
  const withoutVideo = await et2Lint("o4-video-pixel-lint.no-video");
  assert.equal(withoutVideo.code, 1);
  assert.deepEqual(withoutVideo.report.measured, pixelMeasured);
  for (const code of ["frozen-pixels", "frozen-run"])
    assert.ok(
      withoutVideo.report.diagnostics.some(
        (d) => d.code === code && d.frames?.[0] === 5 && d.frames[1] === 83,
      ),
      `ET2 control: ${code} over frames 5-83 without the footage`,
    );
  const darkBand = await et2Lint("o6-dark-band");
  assert.deepEqual(darkBand.report.measured, pixelMeasured);
  assert.ok(
    !darkBand.report.diagnostics.some(
      (d) => d.code === "frozen-pixels" || d.code === "frozen-run",
    ),
    "ET2: second video fixture is not frozen",
  );
  const stateOnlyVideo = await et2Lint("o4-video-pixel-lint", false);
  assert.equal(stateOnlyVideo.report.measured.pixels, false);
  const et2Directory = await mkdtemp(join(tmpdir(), "et2-video-lint-"));
  try {
    const input = join(et2Directory, "o4.json");
    await writeFile(input, JSON.stringify(o4VideoPixelLint));
    const report = await lintCompositionFile(
      input,
      {},
      {
        pixels: true,
        projectRoot: root,
        collectTextBounds: true,
        collectMediaStatistics: true,
      },
    );
    assert.deepEqual(report.measured, pixelMeasured);
    const credit = Object.values(report.textBounds ?? {}).flat();
    assert.ok(
      credit.length > 0 &&
        credit.every((b) => b.right > b.left && b.bottom > b.top),
      "ET2: text bounds are measured over video",
    );
    const media = report.mediaStatistics!;
    assert.equal(media.decodedFrames, o4VideoPixelLint.frameCount);
    assert.ok(media.peakDecodedBytes > 0);
    assert.ok(media.peakDecodedBytes <= media.decodedFrameBytesLimit);
    const plain = await lintCompositionFile(
      resolve(root, "benchmarks/fixtures/composition/ce12/stillness-fail.json"),
      {},
      { pixels: true, collectMediaStatistics: true },
    );
    assert.equal(
      "mediaStatistics" in plain,
      false,
      "ET2: media statistics only for native media",
    );
  } finally {
    await rm(et2Directory, { recursive: true, force: true });
  }
  console.log(
    "ET2: video pixel lint measures pixels and text bounds over the tracked clip; footage motion reaches the pixel rule; decode residency stays in budget.",
  );
  const lintSignals = await verifyLintSignalCleanup();
  console.log(
    `ET2: comp lint cancelled by ${lintSignals.signals.join(", ")} during the browser phase exits 128 + the signal number with comp-program-aborted and leaves no temporary entries or browser process.`,
  );

  const legibility = await verifyTextLegibility();
  console.log(
    `ET3: text-contrast flags the O6 dark band on ${legibility.contrast.map((d) => `${d.node} ${d.frames.join("-")} (${d.measured}:1)`).join(", ")}, naming its words; --strict gates, a waiver is reported and never gates, and reports without the rule keep their shape.`,
  );

  const framing = await verifyFramingGuards();
  console.log(
    `ET5a: text-off-canvas reports O2 at ${framing.o2} of its settled ink (pass-1 T3: ${framing.t3.join(", ")}) while a 5 px incursion stays outside-safe-area; orphaned-decoration reports O3 on frames ${framing.o3.map((f) => f.join("-")).join(", ")} and pass-1 T2 on ${framing.t2.map((f) => f.join("-")).join(", ")}; fadeWithText keeps the held bar (${framing.bar.heldNew} vs ${framing.bar.heldOld} px) and clears it after the fade (${framing.bar.goneOld} -> ${framing.bar.goneNew} px).`,
  );

  const measured = await verifyTextMeasure();
  console.log(
    `ET6a: comp measure fits ${measured.widths.map((w) => `${w.name} at ${w.size} px (${w.margin} px margins; guess ${w.guess} px left ${w.guessMargin})`).join(", ")}; highlight offsets ${JSON.stringify(measured.highlight.offsets)} centre their boxes (guess off by ${Math.round(measured.highlight.guessedError.caps)} px); the stacked lockup renders a ${measured.stacked.gap} px gap (guess ${measured.stacked.guessGap}); ${measured.edges.within1px}/${measured.edges.compared} edges within 1 px, worst ${measured.edges.worst} px; shadow, halo and glow visible edges within ${measured.effects.tolerance} px at 5% (worst ${measured.effects.worst.toFixed(2)}); motionBounds equal render textBounds on ${measured.boundsEqual.length} layers (ET0 fixtures and proof T1–T3).`,
  );

  const cliPixels = await lintCompositionFile(
    resolve(root, "benchmarks/fixtures/composition/ce12/stillness-fail.json"),
    {},
    { pixels: true },
  );
  assert.equal(cliPixels.measured.pixels, true);
  assert.ok("backend" in cliPixels);
  assert.equal(cliPixels.backend, "canvas2d");
  assert.equal(typeof cliPixels.rendererVersion, "string");
  assert.match(cliPixels.rendererVersion!, /^composition-canvas-/);
  assert.ok(cliPixels.diagnostics.some((d) => d.code === "frozen-pixels"));
  const lint = async (name: string, backend?: string, pixels = true) => {
    let stdout = "",
      stderr = "";
    const code = await runCli(
      [
        "comp",
        "lint",
        "--input",
        resolve(root, `benchmarks/fixtures/composition/zipper-qa/${name}.json`),
        "--pixels",
        String(pixels),
        ...(backend ? ["--backend", backend] : []),
      ],
      {
        stdout: (text) => {
          stdout += text;
        },
        stderr: (text) => {
          stderr += text;
        },
      },
    );
    return { code, stdout, stderr };
  };
  for (const name of [
    "ambient-intensity-only",
    "lit-plane",
    "perspective-plane",
    "moving-plane-control",
  ]) {
    const result = await lint(name, "webgl2");
    assert.equal(result.stderr, "", name);
    const report = JSON.parse(result.stdout);
    assert.equal(report.measured.pixels, true, name);
    assert.equal(report.backend, "webgl2", name);
    assert.match(report.rendererVersion, /^composition-webgl2-/, name);
    assert.equal(
      report.diagnostics.some((d: { code: string }) => d.code === "frozen-run"),
      false,
      name,
    );
    assert.equal(result.code, report.status === "failed" ? 1 : 0, name);
    if (name === "lit-plane")
      assert.equal(
        report.diagnostics.some(
          (d: { code: string }) => d.code === "frozen-pixels",
        ),
        true,
        "Sub-threshold light motion must still fail the independent pixel rule",
      );
    if (name === "ambient-intensity-only" || name === "moving-plane-control") {
      assert.equal(result.code, 0, name);
      assert.deepEqual(report.diagnostics, [], name);
    }
  }
  for (const backend of [undefined, "canvas2d"]) {
    for (const name of ["ambient-intensity-only", "perspective-plane"]) {
      const result = await lint(name, backend);
      assert.equal(result.code, 1, `${name}/${backend}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /requires.*WebGL2|WebGL2.*required/i);
    }
  }
  const stateOnly = await lint("ambient-intensity-only", "webgl2", false);
  assert.equal(stateOnly.code, 0);
  assert.equal(JSON.parse(stateOnly.stdout).measured.pixels, false);
  assert.equal(JSON.parse(stateOnly.stdout).rendererVersion, undefined);
  console.log(
    "Zipper regressions: explicit WebGL2 lighting/perspective lint, default/explicit Canvas rejection and state-only checks pass.",
  );
  console.log(
    "14 fixtures, inherited timing and matte content have Node/browser parity; clipped coverage matches rendered pixels; independent meaningful pixel motion checks pass on Canvas2D and WebGL2; file lint uses pinned browser.",
  );
} finally {
  await browser.close();
  await server.close();
  await rm(cache, { recursive: true, force: true });
}
