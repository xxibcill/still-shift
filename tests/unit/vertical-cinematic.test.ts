import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CinematicSceneSchema } from "../../packages/scene-contract/src/cinematic.ts";
import {
  CinematicCoverageError,
  CinematicSourceResolutionError,
  compileCinematicScene,
  projectCinematicNode,
  resolveCinematicFormat,
} from "../../packages/renderer-core/src/cinematic-scene.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

const fixtureRoot = "benchmarks/fixtures/cinematic-illustrated";
const verticalFixture = join(
  fixtureRoot,
  "vertical/ci-vertical-rising-vista.json",
);
const loadFixture = (path: string) =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

describe("vertical cinematic reframe", () => {
  it("resolves a landscape source into a validated vertical prepared scene", () => {
    const source = loadFixture(verticalFixture);
    delete source.format;
    source.width = 1920;
    source.height = 1080;
    const landscape = CinematicSceneSchema.parse(source);
    expect(resolveCinematicFormat(landscape, "landscape")).toBe(landscape);
    const vertical = resolveCinematicFormat(landscape, "vertical");
    expect(vertical).toMatchObject({
      format: "vertical",
      width: 1080,
      height: 1920,
    });
    expect(landscape.format).toBeUndefined();
    expect(
      compileCinematicScene(vertical).cameraValidation.minimumCoverageMargin,
    ).toBeGreaterThan(0);
  });

  it("returns the structured coverage failure for an unpainted source variant", () => {
    const source = CinematicSceneSchema.parse(
      loadFixture(join(fixtureRoot, "ci-01-threshold-push.json")),
    );
    let caught: unknown;
    try {
      resolveCinematicFormat(source, "vertical");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CinematicCoverageError);
    expect((caught as CinematicCoverageError).report).toMatchObject({
      kind: "background",
      node: "far",
      gaps: [{ edge: "bottom" }],
    });
    expect(source.format).toBeUndefined();
  });

  it("uses frame-relative camera limits while preserving landscape limits", () => {
    const landscape = loadFixture(verticalFixture);
    landscape.format = "landscape";
    landscape.width = 1920;
    landscape.height = 1080;
    landscape.camera = { travel: [0, -41] };
    expect(CinematicSceneSchema.safeParse(landscape).success).toBe(false);

    const vertical = loadFixture(verticalFixture);
    vertical.camera = { travel: [0, -192] };
    expect(CinematicSceneSchema.safeParse(vertical).success).toBe(true);
    vertical.camera = { travel: [0, -193] };
    expect(CinematicSceneSchema.safeParse(vertical).success).toBe(false);
  });

  it("reframes a high-resolution Rising Vista kit around its protected subject", () => {
    const source = CinematicSceneSchema.parse(loadFixture(verticalFixture));
    const scene = compileCinematicScene(source);
    expect(scene.rendererVersion).toBe("cinematic-canvas-1.0.0");
    expect(scene.canvas).toEqual({ width: 1080, height: 1920 });
    expect(scene.cameraValidation.checkedFrames).toBe(96);
    expect(scene.cameraValidation.minimumCoverageMargin).toBeGreaterThan(0);
    expect(scene.cameraValidation.sourcePixelsPerOutputPixel).toBeGreaterThan(
      2 / 3,
    );
    const far = scene.nodes.find((node) => node.id === "far")!;
    expect(far.height).toBeCloseTo((source.nodes[0]!.height * 1920) / 1080);
    expect(far.x).toBeLessThan(0);
    expect(far.x + far.width).toBeGreaterThan(1080);
    expect(projectCinematicNode(scene, far, 95).scale).toBe(1);
  });

  it("reports the missing edge, pixels, layer and frame for a vertical coverage gap", () => {
    const source = loadFixture(verticalFixture);
    const layers = source.layers as { paintedBounds?: number[] }[];
    layers[0]!.paintedBounds = [0, 0, 2280, 1150];
    let caught: unknown;
    try {
      compileCinematicScene(CinematicSceneSchema.parse(source));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CinematicCoverageError);
    const error = caught as CinematicCoverageError;
    expect(error.report).toMatchObject({
      kind: "background",
      node: "far",
      frame: 0,
      gaps: [{ edge: "bottom" }],
    });
    expect(error.report.gaps[0]!.missingPixels).toBeGreaterThan(0);
    expect(passageDiagnostics(error)[0]).toMatchObject({
      code: "cinematic-background-coverage",
      node: "far",
      frame: 0,
      path: "bottom",
    });
  });

  it("records why each existing painted kit needs vertical work", () => {
    const findings = readdirSync(fixtureRoot)
      .filter((name) => /^ci-.*\.json$/.test(name))
      .sort()
      .map((name) => {
        const source = loadFixture(join(fixtureRoot, name));
        const scene = CinematicSceneSchema.parse({
          ...source,
          format: "vertical",
          width: 1080,
          height: 1920,
        });
        try {
          compileCinematicScene(scene);
          return { fixture: name, result: "ready" };
        } catch (error) {
          if (error instanceof CinematicCoverageError)
            return {
              fixture: name,
              result: "coverage",
              node: error.report.node,
              edge: error.report.gaps[0]!.edge,
              missingPixels: Math.ceil(error.report.gaps[0]!.missingPixels),
            };
          if (error instanceof CinematicSourceResolutionError)
            return {
              fixture: name,
              result: "repaint",
              asset: error.report.assetPath.split("/").at(-1),
              sampledSize: error.report.minimumSampledSize,
            };
          return {
            fixture: name,
            result: "other",
            message: error instanceof Error ? error.message : String(error),
          };
        }
      });
    expect(findings).toMatchSnapshot();
  });
});
