import { describe, expect, it, vi } from "vitest";

import { closeViteServer } from "../../packages/animation-engine/src/composition-lint.ts";

type Server = Parameters<typeof closeViteServer>[0];

/** A lint dev server whose optimizer has the given scan and bundling work. */
function server(optimizer: {
  scanProcessing?: Promise<void>;
  processing?: Promise<void>[];
}) {
  const close = vi.fn(async () => {});
  const fake = {
    environments: {
      client: {
        depsOptimizer: {
          scanProcessing: optimizer.scanProcessing,
          metadata: {
            discovered: Object.fromEntries(
              (optimizer.processing ?? []).map((processing, index) => [
                `dependency-${index}`,
                { processing },
              ]),
            ),
          },
        },
      },
      ssr: {},
    },
    close,
  } as unknown as Server;
  return { fake, close };
}

const never = () => new Promise<void>(() => {});

describe("closeViteServer", () => {
  it("closes after the dependency scan and its bundling settle", async () => {
    let finishScan!: () => void;
    const scan = new Promise<void>((resolve) => (finishScan = resolve));
    const { fake, close } = server({
      scanProcessing: scan,
      processing: [Promise.reject(new Error("bundle failed"))],
    });

    const closing = closeViteServer(fake, 60_000);
    await Promise.resolve();
    expect(close).not.toHaveBeenCalled();
    finishScan();
    await closing;

    expect(close).toHaveBeenCalledOnce();
  });

  it("bounds a dependency scan that never settles", async () => {
    const { fake, close } = server({ scanProcessing: never() });

    await closeViteServer(fake, 5);

    expect(close).toHaveBeenCalledOnce();
  });

  it("bounds the scan and the bundling with one deadline", async () => {
    const { fake, close } = server({
      scanProcessing: new Promise((resolve) => setTimeout(resolve, 30)),
      processing: [never()],
    });
    const started = performance.now();

    await closeViteServer(fake, 60);

    expect(close).toHaveBeenCalledOnce();
    expect(performance.now() - started).toBeLessThan(500);
  });
});
