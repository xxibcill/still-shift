import assert from "node:assert/strict";
import type { Page } from "playwright";
import type { Composition } from "@still-shift/scene-contract";
import type * as Render from "../../packages/renderer-core/src/index.ts";
export async function lightingFailureAcceptance(page: Page) {
  const reports = await page.evaluate(async () => {
    const url = "/packages/renderer-core/src/index.ts",
      m = (await import(url)) as typeof Render;
    const light = {
      id: "light",
      type: "light" as const,
      lightType: "ambient" as const,
      intensity: 0.5,
    };
    const plane = {
      id: "plane",
      type: "solid" as const,
      size: [128, 96] as [number, number],
      color: "#ffffff",
      threeD: true,
      receivesLight: true,
      transform: {
        anchor: [0, 0, 0] as [number, number, number],
        position: [0, 0, 0] as [number, number, number],
      },
    };
    const base: Composition = {
        schemaVersion: "composition-1",
        id: "failure",
        width: 128,
        height: 96,
        fps: 24,
        frameCount: 32,
        background: "#204060",
        assets: [],
        layers: [],
      },
      reports = [];
    const scenarios: {
      name: string;
      doc: Composition;
      good: number;
      bad: number;
    }[] = [
      {
        name: "activation",
        doc: { ...base, layers: [{ ...light, inPoint: 16 }, plane] },
        good: 0,
        bad: 16,
      },
      {
        name: "later-shutter",
        doc: {
          ...base,
          motionBlur: {
            enabled: true,
            shutterAngle: 360,
            shutterPhase: 0,
            samples: 4,
          },
          layers: [
            light,
            { id: "camera", type: "camera", nearClip: 10 },
            {
              ...plane,
              motionBlur: true,
              transform: {
                anchor: [0, 0, 0],
                position: {
                  keys: [
                    { frame: 0, value: [0, 0, -138] },
                    { frame: 31, value: [0, 0, -76], interpolation: "linear" },
                  ],
                },
              },
            },
          ],
        },
        good: 8,
        bad: 10,
      },
      {
        name: "named-input",
        doc: {
          ...base,
          layers: [
            { ...light, inPoint: 16 },
            { ...plane, enabled: false },
            {
              id: "owner",
              type: "solid",
              size: [128, 96],
              color: "#ffffff",
              transform: { anchor: [0, 0], position: [0, 0] },
              effects: [
                {
                  id: "map",
                  effect: "transition.gradient-wipe",
                  inputs: { map: "plane" },
                  params: { progress: 0.5 },
                },
              ],
            },
          ],
        },
        good: 0,
        bad: 16,
      },
      {
        name: "matte",
        doc: {
          ...base,
          layers: [
            { ...light, inPoint: 16 },
            { ...plane, enabled: false },
            {
              id: "owner",
              type: "solid",
              size: [128, 96],
              color: "#ffffff",
              trackMatte: { layer: "plane", mode: "alpha" },
            },
          ],
        },
        good: 0,
        bad: 16,
      },
    ];
    for (const scenario of scenarios) {
      const preview = m.createCompositionPreview(
        document.createElement("canvas"),
        scenario.doc,
        { images: new Map(), fonts: new Map() },
        { backend: "canvas2d" },
      );
      try {
        preview.renderFrame(scenario.good);
        const before = [...preview.readPixels()];
        let diagnostics: unknown[] = [];
        try {
          preview.renderFrame(scenario.bad);
        } catch (error) {
          diagnostics =
            (error as { diagnostics?: unknown[] }).diagnostics ?? [];
        }
        const after = preview.readPixels();
        reports.push({
          name: scenario.name,
          diagnostics,
          previousFrameUnchanged: before.every((v, i) => v === after[i]),
        });
      } finally {
        preview.dispose();
      }
    }
    return reports;
  });
  for (const report of reports) {
    assert(report.previousFrameUnchanged, report.name);
    assert(
      report.diagnostics.some(
        (x) => (x as { code: string }).code === "comp-feature-backend",
      ),
      `${report.name}: missing backend diagnostic`,
    );
  }
  return reports;
}
