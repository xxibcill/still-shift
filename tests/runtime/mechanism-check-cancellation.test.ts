import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { lintCompositionFile } from "../../packages/animation-engine/src/composition-lint.ts";
import { checkMechanismEpisode } from "../../packages/animation-engine/src/mechanism/lifecycle.ts";

it("rejects an already cancelled check before reading unavailable inputs", async () => {
  const controller = new AbortController();
  const reason = new Error("stop-check");
  controller.abort(reason);
  await expect(
    checkMechanismEpisode("/missing/episode.json", {
      signal: controller.signal,
    }),
  ).rejects.toBe(reason);
  await expect(
    lintCompositionFile(
      "/missing/composition.json",
      {},
      { pixels: true, signal: controller.signal },
    ),
  ).rejects.toBe(reason);
});

it("interrupts a long native pixel check and removes its owned browser/server cache", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mechanism-check-cancel-"));
  const path = join(directory, "composition.json");
  const existing = new Set(
    (await readdir(tmpdir())).filter((name) =>
      name.startsWith("composition-lint-vite-"),
    ),
  );
  await writeFile(
    path,
    JSON.stringify({
      schemaVersion: "composition-1",
      id: "long-pixel-check",
      width: 320,
      height: 192,
      fps: 30,
      frameCount: 10000,
      background: "#fff4df",
      assets: [],
      layers: [
        {
          id: "background",
          type: "solid",
          color: "#305c70",
          size: [320, 192],
          coverage: "required",
          inPoint: 0,
          outPoint: 10000,
        },
      ],
    }),
  );
  const controller = new AbortController();
  const reason = new Error("stop-active-pixel-check");
  const started = performance.now();
  const timer = setTimeout(() => controller.abort(reason), 1000);
  try {
    await expect(
      lintCompositionFile(
        path,
        {},
        { pixels: true, signal: controller.signal },
      ),
    ).rejects.toBe(reason);
    expect(performance.now() - started).toBeLessThan(15000);
    expect(
      (await readdir(tmpdir())).filter(
        (name) =>
          name.startsWith("composition-lint-vite-") && !existing.has(name),
      ),
    ).toEqual([]);
  } finally {
    clearTimeout(timer);
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
