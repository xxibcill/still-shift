import { describe, expect, it } from "vitest";
import { parseNativePlateRenderResult } from "../../packages/animation-engine/src/mechanism/cue-native-plates.ts";

describe("native plate render result version", () => {
  it("rejects a plate captured before composition-output-2 with a located recapture message", () => {
    let error: unknown;
    try {
      parseNativePlateRenderResult({
        metrics: { output: { version: "composition-output-1" } },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      message: expect.stringMatching(/composition-output-1.*recapture/),
      context: {
        diagnosticCode: "mechanism-cue-native-plate-identity",
        path: "renderResult.metrics.output.version",
      },
    });
  });

  it("leaves other malformed results to the schema", () => {
    expect(() => parseNativePlateRenderResult({ metrics: {} })).toThrow();
  });
});
