import { describe, expect, it } from "vitest";

import {
  assertPinnedRenderEnvironment,
  RENDER_BROWSER_ARGS,
  RENDER_BROWSER_PROFILE,
  renderBrowserArgs,
  type RenderEnvironment,
} from "../../packages/execution-runtime/src/render-browser.ts";

const pinned: RenderEnvironment = {
  profile: RENDER_BROWSER_PROFILE,
  browserVersion: "151.0.7922.34",
  webglRenderer:
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)",
  rasterFingerprint: `sha256:${"0".repeat(64)}`,
  platform: "darwin",
  arch: "arm64",
};

describe("pinned render browser", () => {
  it("pins software rasterisation flags", () => {
    expect(renderBrowserArgs()).toEqual([...RENDER_BROWSER_ARGS]);
    expect(RENDER_BROWSER_ARGS).toContain("--disable-gpu");
    expect(renderBrowserArgs("hardware")).not.toContain("--disable-gpu");
  });

  it("accepts the pinned SwiftShader environment", () => {
    expect(() => assertPinnedRenderEnvironment(pinned)).not.toThrow();
  });

  it.each([
    [
      "hardware renderer",
      {
        ...pinned,
        webglRenderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro)",
      },
    ],
    ["hardware profile", { ...pinned, profile: "hardware" as const }],
  ])("rejects a %s with a stable diagnostic", (_, environment) => {
    try {
      assertPinnedRenderEnvironment(environment);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: "RENDER_FAILED",
        context: { diagnostic: "export-renderer-mismatch" },
      });
    }
  });
});
