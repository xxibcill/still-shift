import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import type { Composition } from "@still-shift/scene-contract";
import {
  evaluateComp,
  evaluateProperty,
} from "../../packages/renderer-core/src/composition/evaluate/index.ts";
type Evaluator = {
  evaluateComp: typeof evaluateComp;
  evaluateProperty: typeof evaluateProperty;
};

const root = resolve(import.meta.dirname, "../..");
const fixtures = await Promise.all(
  ["ce1/first-slice", "ce1/every-field", "ce2/timing"].map(async (name) => ({
    name,
    comp: JSON.parse(
      await readFile(
        resolve(root, `benchmarks/fixtures/composition/${name}.json`),
        "utf8",
      ),
    ) as Composition,
  })),
);
const times = [0, 2.5, 10, 19.9, 20, 45, 59, 60, 101];
const server = await createServer({
  root,
  configFile: false,
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
const browser = await launchRenderBrowser();
try {
  await server.listen();
  const origin = server.resolvedUrls!.local[0]!;
  const page = await browser.newPage();
  await page.goto(origin);
  const actualJson = await page.evaluate(
    async ({ fixturesJson, times, moduleUrl }) => {
      const fixtures = JSON.parse(fixturesJson) as { comp: Composition }[];
      const { evaluateComp, evaluateProperty } = (await import(
        moduleUrl
      )) as Evaluator;
      return JSON.stringify(
        fixtures.map(({ comp }) => ({
          forward: times.map((time) => evaluateComp(comp, time)),
          reverse: times.toReversed().map((time) => evaluateComp(comp, time)),
          property: evaluateProperty(
            comp,
            `${comp.layers[0]!.id}.transform.position`,
            10.5,
          ),
        })),
      );
    },
    {
      fixturesJson: JSON.stringify(fixtures),
      times,
      moduleUrl:
        origin + "packages/renderer-core/src/composition/evaluate/index.ts",
    },
  );
  const actual = JSON.parse(actualJson) as {
    forward: unknown[];
    reverse: unknown[];
    property: unknown;
  }[];
  let maxNumericError = 0;
  const compare = (actual: unknown, expected: unknown, path: string): void => {
    if (typeof actual === "number" && typeof expected === "number") {
      const error = Math.abs(actual - expected);
      maxNumericError = Math.max(maxNumericError, error);
      if (
        /\.(time|frame|state|stateFrom|fps|width|height|frameCount)$/.test(path)
      )
        assert.equal(actual, expected, path);
      else assert.ok(error <= 1e-9, `${path}: ${actual} vs ${expected}`);
    } else if (
      actual !== null &&
      expected !== null &&
      typeof actual === "object" &&
      typeof expected === "object"
    ) {
      assert.equal(Array.isArray(actual), Array.isArray(expected), path);
      assert.deepEqual(Object.keys(actual), Object.keys(expected), path);
      for (const key of Object.keys(expected))
        compare(
          (actual as Record<string, unknown>)[key],
          (expected as Record<string, unknown>)[key],
          `${path}.${key}`,
        );
    } else assert.equal(actual, expected, path);
  };
  for (const [i, { name, comp }] of fixtures.entries()) {
    const expected = times.map((time) => evaluateComp(comp, time));
    // JSON is the transport shape: undefined optional fields disappear on both sides.
    compare(
      actual[i]!.forward,
      JSON.parse(JSON.stringify(expected)),
      `${name}: browser / Node state parity`,
    );
    assert.deepEqual(
      actual[i]!.reverse,
      actual[i]!.forward.toReversed(),
      `${name}: backwards seeking`,
    );
    compare(
      actual[i]!.property,
      evaluateProperty(comp, `${comp.layers[0]!.id}.transform.position`, 10.5),
      `${name}: property read`,
    );
  }
  console.log(
    `Composition evaluator: Node/browser numeric error ≤ ${maxNumericError} for ${fixtures.length} fixtures × ${times.length} frames; timing, visibility and reverse seeks match exactly.`,
  );
} finally {
  await browser.close();
  await server.close();
}
