import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { createServer } from "vite";
import { resolve } from "node:path";
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

import {
  collapsedMotionComposition,
  providerReadingComposition,
  qualityCapacityComposition,
} from "../helpers/composition-quality-fixtures.ts";

const root = resolve(import.meta.dirname, "../..");
const server = await createServer({
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

  const cliPixels = await lintCompositionFile(
    resolve(root, "benchmarks/fixtures/composition/ce12/stillness-fail.json"),
    {},
    { pixels: true },
  );
  assert.equal(cliPixels.measured.pixels, true);
  assert.ok(cliPixels.diagnostics.some((d) => d.code === "frozen-pixels"));
  console.log(
    "14 fixtures, inherited timing and matte content have Node/browser parity; clipped coverage matches rendered pixels; independent meaningful pixel motion checks pass on Canvas2D and WebGL2; file lint uses pinned browser.",
  );
} finally {
  await browser.close();
  await server.close();
}
