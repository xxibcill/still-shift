import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runProcess } from "@still-shift/execution-runtime/subprocess";

describe("subprocess lifecycle", () => {
  it.each([false, true])(
    "reaps a cancelled child before rejecting (ignores SIGTERM: %s)",
    async (ignoreTermination) => {
      const directory = await mkdtemp(
        join(tmpdir(), "still-shift-subprocess-"),
      );
      const readyPath = join(directory, "child.pid");
      const controller = new AbortController();
      const result = runProcess(
        process.execPath,
        [
          "-e",
          `${ignoreTermination ? 'process.on("SIGTERM",()=>{});' : ""}require("node:fs").writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000);`,
          readyPath,
        ],
        { signal: controller.signal },
      ).catch((error: unknown) => error);
      try {
        let pid = 0;
        await vi.waitFor(
          async () => {
            pid = Number(await readFile(readyPath, "utf8"));
            expect(pid).toBeGreaterThan(0);
          },
          { timeout: 2_000, interval: 20 },
        );
        const reason = new Error("Cancelled child");
        const started = performance.now();
        controller.abort(reason);
        expect(await result).toBe(reason);
        expect(performance.now() - started).toBeLessThan(2_000);
        expect(() => process.kill(pid, 0)).toThrow(
          expect.objectContaining({ code: "ESRCH" }),
        );
      } finally {
        controller.abort();
        await result;
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it("preserves stderr/stdout on ordinary nonzero exits", async () => {
    await expect(
      runProcess(process.execPath, [
        "-e",
        'process.stdout.write("output");process.stderr.write("diagnostic");process.exit(7);',
      ]),
    ).rejects.toMatchObject({
      code: 7,
      stdout: "output",
      stderr: "diagnostic",
    });
  });

  it("rejects pre-aborted work with the original reason", async () => {
    const controller = new AbortController();
    const reason = new Error("Already cancelled");
    controller.abort(reason);
    await expect(
      runProcess("unavailable-executable", [], { signal: controller.signal }),
    ).rejects.toBe(reason);
  });
});
