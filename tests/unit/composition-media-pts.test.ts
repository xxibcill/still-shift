import { describe, expect, it } from "vitest";
import {
  parseMediaRational,
  verifyConstantMediaPts,
} from "../../packages/animation-engine/src/composition-media-probe.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

describe("rational source timestamp authority", () => {
  it("accepts rounded and floored 24 fps millisecond grids with one shared phase", () => {
    const rate = { numerator: 24, denominator: 1 };
    const base = { numerator: 1, denominator: 1000 };
    expect(
      verifyConstantMediaPts(
        ["0", "42", "83", "125", "167", "208"],
        rate,
        base,
      ),
    ).toEqual({ lower: "8", upperExclusive: "16", denominator: "24" });
    expect(
      verifyConstantMediaPts(
        ["0", "41", "83", "125", "166", "208"],
        rate,
        base,
      ),
    ).toEqual({ lower: "0", upperExclusive: "8", denominator: "24" });
  });
  it("preserves 64-bit PTS origins and 30000/1001 source cadence exactly", () => {
    const origin = 2n ** 60n;
    const pts = [0n, 1001n, 2002n, 3003n].map((n) => String(origin + n));
    expect(
      verifyConstantMediaPts(
        pts,
        { numerator: 30000, denominator: 1001 },
        { numerator: 1, denominator: 30000 },
      ),
    ).toEqual({ lower: "0", upperExclusive: "30000", denominator: "30000" });
  });
  it.each(
    [["0", "42", "83", "130"], ["0", "42", "42"], ["0", "42", "40"], []].map(
      (pts) => ({ pts }),
    ),
  )("rejects unequal cadence or unusable timestamps $pts", ({ pts }) => {
    try {
      verifyConstantMediaPts(
        pts,
        { numerator: 24, denominator: 1 },
        { numerator: 1, denominator: 1000 },
      );
      expect.fail("invalid source timing must reject");
    } catch (error) {
      expect(passageDiagnostics(error)[0]!.code).toBe("comp-media-vfr");
    }
  });
  it("reduces rates and rejects nonexact or zero rational inputs", () => {
    expect(parseMediaRational("60000/2002")).toEqual({
      numerator: 30000,
      denominator: 1001,
    });
    for (const rate of [
      "0/1",
      "24/0",
      "unknown",
      "1.5/1",
      "9007199254740992/1",
    ])
      expect(() => parseMediaRational(rate)).toThrow();
    expect(() =>
      verifyConstantMediaPts(
        ["0"],
        { numerator: 0.5, denominator: 1 },
        { numerator: 1, denominator: 1000 },
      ),
    ).toThrow();
  });
});
