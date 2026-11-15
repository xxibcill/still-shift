import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type * as ExecutionRuntime from "@still-shift/execution-runtime";

// ET2 review R2-2: a browser close that fails after an abort must not replace
// the caller's abort reason. The browser is a stand-in whose close rejects.
const controller = vi.hoisted(() => ({ current: new AbortController() }));
vi.mock("@still-shift/execution-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof ExecutionRuntime>()),
  launchRenderBrowser: async () => ({
    newPage: async () => {
      controller.current.abort(new Error("caller cancelled"));
      throw new Error("Target page, context or browser has been closed");
    },
    close: () => Promise.reject(new Error("browser close failed")),
  }),
}));

const { lintCompositionFile } = await import(
  "../../packages/animation-engine/src/composition-lint.ts"
);

describe("lintCompositionFile abort", () => {
  it("keeps the abort reason when the aborted browser fails to close", async () => {
    controller.current = new AbortController();
    await expect(
      lintCompositionFile(
        resolve(
          import.meta.dirname,
          "../../benchmarks/fixtures/composition/ce12/coStart-pass.json",
        ),
        {},
        { pixels: true, signal: controller.current.signal },
      ),
    ).rejects.toThrow("caller cancelled");
  }, 60_000);
});
