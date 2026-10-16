import { describe, expect, it } from "vitest";
import { groupMechanismProductionWarnings } from "@still-shift/animation-engine";
import { analyzeCompositionQuality } from "@still-shift/renderer-core";
import {
  composition,
  solid,
} from "../../benchmarks/fixtures/composition/ce12/fixtures.ts";
const sha = "sha256:" + "2".repeat(64);
const binding = {
  inputSha256: sha,
  outputSha256: sha,
  codeSha256: sha,
  profileSha256: sha,
};
const warning = (
  start: number,
  end: number,
  measured: number,
  child = "hook",
) => ({
  diagnostic: {
    code: "velocity-discontinuity",
    severity: "warning",
    frames: [start, end],
    nodes: [child],
    measured,
    message: "Inherited parent jump",
    path: `layers.${child}.transform`,
    details: { original: "retained" },
  },
  controllingRig: "slider",
  event: "contact",
  eventInterval: { start: 0, endExclusive: 10 },
  unit: "ratio",
  parts: [child],
  badFrames: [{ path: `frame-${start}.png`, sha256: sha }],
});
const input = (warnings: ReturnType<typeof warning>[]) => ({
  binding,
  rawEvidence: { path: "raw-lint.json", sha256: sha },
  warnings,
});
describe("grouped inherited production motion warnings", () => {
  it("retains the actual late maximum, child/part/raw paths and all bad-frame evidence across connected intervals", () => {
    const original = input([
      warning(3, 4, 9, "pawl"),
      warning(1, 2, 2),
      warning(2, 3, 4, "strap"),
    ]);
    const before = JSON.stringify(original);
    const result = groupMechanismProductionWarnings(original);
    expect(result.groups).toMatchObject([
      {
        controllingRig: "slider",
        event: "contact",
        unit: "ratio",
        interval: { start: 1, endExclusive: 5 },
        maximumMeasuredChange: 9,
        maximumRawIndex: 0,
        children: ["hook", "pawl", "strap"],
        rawIndices: [1, 2, 0],
      },
    ]);
    expect(result.groups[0]?.badFrames).toHaveLength(3);
    expect(result.rawWarnings).toEqual(original.warnings);
    expect(result.binding).toEqual(binding);
    expect(JSON.stringify(original)).toBe(before);
    expect(Object.isFrozen(original.warnings[0]?.diagnostic.details)).toBe(
      false,
    );
  });
  it("does not combine separate events, rigs, units or disconnected intervals and preserves raw severity", () => {
    const rows = [
      warning(1, 1, 2),
      warning(5, 5, 8),
      warning(1, 1, 4),
      warning(1, 1, 9),
      warning(1, 1, 10),
    ];
    rows[2]!.event = "release";
    rows[3]!.controllingRig = "ratchet";
    rows[4]!.unit = "radians-per-frame";
    expect(groupMechanismProductionWarnings(input(rows)).groups).toHaveLength(
      5,
    );
    const errors = input([warning(1, 2, 2), warning(2, 3, 3)]);
    errors.warnings[1]!.diagnostic.severity = "error";
    expect(groupMechanismProductionWarnings(errors).groups[0]?.severity).toBe(
      "error",
    );
  });
  it("rejects warnings outside their controlling event and refuses unbounded/active data", () => {
    expect(() =>
      groupMechanismProductionWarnings(input([warning(8, 10, 1)])),
    ).toThrow(/controlling event/);
    expect(() =>
      groupMechanismProductionWarnings(
        input(Array.from({ length: 2049 }, () => warning(1, 1, 1))),
      ),
    ).toThrow();
    let calls = 0;
    const request = input([]);
    Object.defineProperty(request, "warnings", {
      get() {
        calls++;
        return [];
      },
      enumerable: true,
    });
    expect(() => groupMechanismProductionWarnings(request)).toThrow(/accessor/);
    expect(calls).toBe(0);
  });
  it("groups actual inherited opacity lint and reproduces the raw measured peak", () => {
    const scene = composition(
      [
        {
          id: "carrier",
          type: "group",
          size: [640, 360],
          transform: {
            opacity: {
              keys: [
                { frame: 0, value: 1 },
                { frame: 3, value: 1 },
                { frame: 4, value: 0.2 },
                { frame: 9, value: 0.2 },
              ],
            },
          },
        },
        solid("hook", { parent: "carrier" }),
        solid("strap", { parent: "carrier" }),
      ],
      { frameCount: 10 },
    );
    const diagnostics = analyzeCompositionQuality(scene).diagnostics.filter(
      (d) => d.code === "opacity-pop",
    );
    expect(diagnostics.length).toBeGreaterThan(1);
    const result = groupMechanismProductionWarnings({
      binding,
      rawEvidence: { path: "actual-lint.json", sha256: sha },
      warnings: diagnostics.map((diagnostic, i) => ({
        diagnostic,
        controllingRig: "slider",
        event: "contact",
        eventInterval: { start: 0, endExclusive: 10 },
        unit: "opacity-alpha",
        parts: diagnostic.nodes,
        badFrames: [{ path: `actual-${i}.png`, sha256: sha }],
      })),
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.maximumMeasuredChange).toBe(
      Math.max(...diagnostics.map((d) => d.measured)),
    );
    expect(result.rawWarnings.map((r) => r.diagnostic)).toEqual(diagnostics);
    expect(result.groups[0]?.children).toEqual(
      expect.arrayContaining(["hook", "strap"]),
    );
  });
});
