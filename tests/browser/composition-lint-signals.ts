// ET2: `comp lint` turns SIGINT, SIGTERM and SIGHUP into its abort and leaves
// no temporary files
// (docs/editorial-typography-improvement-plan.md#et2--pixel-lint-over-native-video).
//
// The CLI runs as a child in its own process group with a private TMPDIR, and
// the signal goes to the whole group, as a terminal Ctrl-C or hangup does.
// This exercises what library-level AbortSignal tests cannot: the CLI's signal
// listeners, Chromium launched without Playwright's handlers, and the lint
// dev server in middleware mode (a listening Vite server exits on SIGTERM).
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { constants, tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import {
  editorialFixture,
  lintTemporaryEntries,
  mediaCacheTransientEntries,
} from "../helpers/editorial-video-lint.ts";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");
const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

/** Processes whose command line names `directory` (Chromium's profile path). */
async function processesUsing(directory: string): Promise<string[]> {
  try {
    const { stdout } = await run("pgrep", ["-f", directory]);
    return stdout.split("\n").filter(Boolean);
  } catch (error) {
    if ((error as { code?: number }).code === 1) return [];
    throw error;
  }
}

async function cancelCliLint(signal: (typeof signals)[number]) {
  const temporary = await mkdtemp(join(tmpdir(), "et2-lint-signal-"));
  try {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve(root, "tools/still-shift-cli/src/cli.ts"),
        "comp",
        "lint",
        "--input",
        resolve(editorialFixture("o4-video-pixel-lint.ts").pathname),
        "--pixels",
        "true",
      ],
      {
        cwd: root,
        detached: true,
        env: { ...process.env, TMPDIR: temporary },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const exited = new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((done) =>
      child.on("exit", (code, received) => done({ code, signal: received })),
    );
    const group = -child.pid!;
    try {
      // Browser phase: Chromium is up and the lint dev server owns its cache.
      const deadline = performance.now() + 120_000;
      for (;;) {
        assert.equal(
          child.exitCode,
          null,
          `${signal}: lint finished before the browser phase: ${stderr}`,
        );
        const names = await readdir(temporary);
        if (
          names.some((name) => name.startsWith("composition-lint-vite-")) &&
          names.some((name) =>
            name.startsWith("playwright_chromiumdev_profile-"),
          )
        )
          break;
        if (performance.now() > deadline)
          throw new Error(`${signal}: lint never reached the browser phase`);
        await delay(10);
      }
      process.kill(group, signal);
      const result = await Promise.race([
        exited,
        delay(60_000).then(() => {
          throw new Error(`${signal}: lint did not exit after cancellation`);
        }),
      ]);
      assert.deepEqual(
        result,
        { code: 128 + constants.signals[signal], signal: null },
        `${signal}: exit after cancellation: ${stderr}`,
      );
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          process.kill(group, "SIGKILL");
        } catch {
          // The group already exited.
        }
      }
    }
    assert.equal(stdout, "", `${signal}: no report after cancellation`);
    assert.deepEqual(JSON.parse(stderr), {
      status: "failed",
      diagnostics: [
        {
          code: "comp-program-aborted",
          severity: "error",
          path: "input",
          message: `Composition lint cancelled by ${signal}`,
        },
      ],
    });
    const left = await lintTemporaryEntries(temporary);
    assert.deepEqual(
      left,
      [],
      `${signal}: lint temporary entries ${left.join(", ")}`,
    );
    assert.deepEqual(
      await mediaCacheTransientEntries(
        join(temporary, "still-shift-composition-media"),
      ),
      [],
      `${signal}: media cache staging and lock`,
    );
    assert.deepEqual(
      await processesUsing(temporary),
      [],
      `${signal}: no browser process remains`,
    );
  } finally {
    // Retries: after a failed cancellation, an orphaned esbuild may still be
    // writing; the assertion above, not this removal, should report it.
    await rm(temporary, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}

export async function verifyLintSignalCleanup() {
  for (const signal of signals) await cancelCliLint(signal);
  return { signals: [...signals], phase: "browser" };
}
