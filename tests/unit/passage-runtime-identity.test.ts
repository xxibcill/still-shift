import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as RenderBrowser from "../../packages/execution-runtime/src/render-browser.ts";

import {
  passageRenderRuntime,
  passageRuntimeIdentity,
} from "../../packages/animation-engine/src/passage-cache.ts";
import {
  RENDER_BROWSER_PROFILE,
  type RenderEnvironment,
} from "../../packages/execution-runtime/src/render-browser.ts";

const browser = vi.hoisted(() => ({
  page: {},
  launch: vi.fn(),
  newPage: vi.fn(),
  close: vi.fn(),
  probe: vi.fn(),
}));

vi.mock(
  "@still-shift/execution-runtime/render-browser",
  async (importOriginal) => {
    const actual = await importOriginal<typeof RenderBrowser>();
    return {
      ...actual,
      launchRenderBrowser: browser.launch,
      probeRenderEnvironment: browser.probe,
    };
  },
);

vi.mock("@still-shift/execution-runtime/subprocess", () => ({
  runProcess: async () => ({ stdout: "fixed tool version", stderr: "" }),
}));

const environment: RenderEnvironment = {
  profile: RENDER_BROWSER_PROFILE,
  browserVersion: "151.0.7922.34",
  webglRenderer: "ANGLE (Google, SwiftShader driver)",
  rasterFingerprint: `sha256:${"0".repeat(64)}`,
  platform: process.platform,
  arch: process.arch,
};

beforeEach(() => {
  vi.clearAllMocks();
  browser.newPage.mockResolvedValue(browser.page);
  browser.close.mockResolvedValue(undefined);
  browser.launch.mockResolvedValue({
    newPage: browser.newPage,
    close: browser.close,
  });
  browser.probe.mockResolvedValue(environment);
});

describe("passage runtime render identity", () => {
  it("returns report provenance alongside the compatible cache identity", async () => {
    const runtime = await passageRenderRuntime();
    expect(runtime.renderEnvironment).toEqual(environment);
    expect(runtime.identity).toMatch(/^[a-f0-9]{64}$/);
    expect(browser.probe).toHaveBeenCalledOnce();
    expect(await passageRuntimeIdentity()).toBe(runtime.identity);
  });

  it("measures the renderer even when configuration and tool versions are unchanged", async () => {
    const first = await passageRuntimeIdentity();
    expect(await passageRuntimeIdentity()).toBe(first);
    expect(browser.probe).toHaveBeenCalledTimes(2);
    expect(browser.close).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "renderer",
      { webglRenderer: "ANGLE (Google, another SwiftShader driver)" },
    ],
    ["raster", { rasterFingerprint: `sha256:${"1".repeat(64)}` }],
    ["browser", { browserVersion: "151.0.7922.35" }],
  ])(
    "invalidates cached clips when the observed %s changes",
    async (_, change) => {
      const first = await passageRuntimeIdentity();
      browser.probe.mockResolvedValue({ ...environment, ...change });
      expect(await passageRuntimeIdentity()).not.toBe(first);
    },
  );

  it("rejects an unpinned renderer before returning a cache identity", async () => {
    browser.probe.mockResolvedValue({
      ...environment,
      webglRenderer: "ANGLE (Apple, Metal)",
    });
    await expect(passageRuntimeIdentity()).rejects.toMatchObject({
      code: "RENDER_FAILED",
      context: { diagnostic: "export-renderer-mismatch" },
    });
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("does not launch a browser for an already cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      passageRuntimeIdentity(controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(browser.launch).not.toHaveBeenCalled();
  });

  it("closes the browser and preserves cancellation during the probe", async () => {
    const controller = new AbortController();
    browser.probe.mockImplementationOnce(async () => {
      controller.abort();
      throw new Error("Browser closed during the probe");
    });
    await expect(
      passageRuntimeIdentity(controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(browser.close).toHaveBeenCalled();
  });
});
