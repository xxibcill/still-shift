import { afterEach, expect, it, vi } from "vitest";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";

afterEach(() => vi.unstubAllEnvs());
it("exposes SFX generation in help and reports missing server credentials", async () => {
  vi.stubEnv("ELEVENLABS_API_KEY", "");
  const io = { stdout: vi.fn(), stderr: vi.fn() };
  expect(await runCli(["sfx", "generate", "--help"], io)).toBe(0);
  expect(io.stdout.mock.calls.flat().join("")).toContain("sfx generate");
  expect(
    await runCli(
      [
        "sfx",
        "generate",
        "--provider",
        "elevenlabs",
        "--id",
        "tap",
        "--prompt",
        "One wooden tap",
        "--duration",
        "1",
        "--output-dir",
        "unused-test-sfx",
      ],
      io,
    ),
  ).toBe(1);
  expect(io.stderr.mock.calls.flat().join("")).toContain("ELEVENLABS_API_KEY");
});
it("rejects ambiguous loop values before generation", async () => {
  const io = { stdout: vi.fn(), stderr: vi.fn() };
  expect(await runCli(["sfx", "generate", "--loop", "maybe"], io)).toBe(1);
  expect(io.stderr.mock.calls.flat().join("")).toContain(
    "--loop must be true or false",
  );
});
