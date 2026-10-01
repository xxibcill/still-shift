import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPOSITION_LIMITS,
  validateComposition,
} from "@still-shift/scene-contract";
import {
  DriverMapSchema,
  OscillatorSchema,
} from "../../packages/scene-contract/src/motion-craft.ts";
import { StoryCameraSchema } from "../../packages/scene-contract/src/story-motion.ts";

const fixture = () =>
  JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        "../../benchmarks/fixtures/composition/ce1/every-field.json",
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;

function setPath(doc: unknown, path: string, value: unknown) {
  const parts = path.split(".");
  let object = doc as Record<string, unknown>;
  for (const part of parts.slice(0, -1))
    object = object[part] as Record<string, unknown>;
  object[parts.at(-1)!] = value;
}

const numericPaths = [
  "periodic.0.oscillate.amplitude",
  "periodic.0.oscillate.phase",
  "periodic.1.noise.amplitude",
  "drivers.1.map.offset",
  "drivers.1.map.scale",
  "drivers.0.map.to.1",
  "camera2d.keys.0.x",
  "camera2d.keys.0.y",
  "camera2d.keys.0.zoom",
  "camera2d.startTangent.x",
  "camera2d.endTangent.zoom",
  "camera2d.jolts.0.dx",
  "signals.0.keys.0.value",
  "constraints.1.offset.0",
  "precomps.0.constraints.0.inset",
  "textAnimators.0.from.offset.0",
  "textAnimators.0.from.rotation",
  "textAnimators.0.from.baselineShift",
  "textAnimators.0.selector.end",
  "layers.0.decorations.0.offset",
] as const;

describe("composition-specific bounds on reused schemas", () => {
  it.each(numericPaths)("rejects oversized %s with its JSON path", (path) => {
    const doc = fixture();
    setPath(doc, path, 1e308);
    const result = validateComposition(doc);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "comp-schema-range",
        path: path.replace(/\.(\d+)/g, "[$1]"),
      }),
    );
  });

  it.each([
    "periodic.0.oscillate.period",
    "periodic.1.noise.period",
    "drivers.1.map.delay",
    "signals.0.keys.2.frame",
    "camera2d.jolts.0.decayFrames",
    "textAnimators.0.end",
    "layers.0.decorations.0.reveal.1.frame",
  ])("bounds imported frame field %s", (path) => {
    const doc = fixture();
    setPath(doc, path, COMPOSITION_LIMITS.maxKeyFrame + 1);
    expect(validateComposition(doc)).toMatchObject({ ok: false });
  });

  it("bounds temporal speeds and easing control points", () => {
    for (const key of [
      { out: { ease: 0.5, speed: 1e308 } },
      { easing: { bezier: [0.25, 1e308, 0.75, 1] } },
    ]) {
      const doc = fixture();
      setPath(doc, "layers.2.transform.rotation", {
        keys: [
          { frame: 0, value: 0, ...key },
          { frame: 24, value: 1 },
        ],
      });
      expect(validateComposition(doc)).toMatchObject({ ok: false });
    }
  });

  it("rejects values below the lower bound", () => {
    const doc = fixture();
    setPath(doc, "periodic.0.oscillate.amplitude", -1e308);
    setPath(doc, "drivers.1.map.offset", -1e308);
    expect(validateComposition(doc)).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: "comp-schema-range" }),
        expect.objectContaining({ code: "comp-schema-range" }),
      ],
    });
  });

  it("preserves reused curve and driver-map semantic checks", () => {
    const unordered = fixture();
    setPath(unordered, "signals.0.keys.1.frame", 0);
    expect(validateComposition(unordered)).toMatchObject({ ok: false });
    const incompleteMap = fixture();
    setPath(incompleteMap, "drivers.0.map", { range: [0, 1] });
    expect(validateComposition(incompleteMap)).toMatchObject({ ok: false });
  });

  it("bounds nested signal generators and animator selector sources", () => {
    const doc = fixture();
    setPath(doc, "signals.0.add", [
      { oscillate: { period: 24, amplitude: 1e308 } },
    ]);
    setPath(doc, "textAnimators.0.selector.offset", {
      signal: "pressure",
      scale: 1e308,
    });
    const result = validateComposition(doc);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(2);
  });

  it("accepts the numeric boundary and the full noise seed range", () => {
    const doc = fixture();
    for (const path of numericPaths)
      setPath(doc, path, COMPOSITION_LIMITS.maxCoordinate);
    setPath(doc, "periodic.1.noise.seed", 2147483647);
    setPath(doc, "metadata.authoredNumber", 1e308);
    expect(validateComposition(doc)).toMatchObject({ ok: true });
  });

  it("preserves the legacy motion and camera schemas", () => {
    expect(
      OscillatorSchema.safeParse({ period: 24, amplitude: 1e308 }).success,
    ).toBe(true);
    expect(DriverMapSchema.safeParse({ scale: 1e308 }).success).toBe(true);
    expect(
      StoryCameraSchema.safeParse({
        keys: [
          { frame: 0, x: 1e308, y: 0, zoom: 1 },
          { frame: 24, x: 0, y: 0, zoom: 1 },
        ],
        depth: {},
      }).success,
    ).toBe(true);
  });
});
