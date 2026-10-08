import { afterEach, expect, it, vi } from "vitest";
import { createPreviewSession } from "../../apps/lab/src/preview-session.ts";

vi.mock("../../packages/renderer-core/src/illustrated-renderer.ts", () => ({
  createIllustratedPreview: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const page = new EventTarget();
  vi.stubGlobal("window", page);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const play = Object.assign(new EventTarget(), {
    disabled: false,
    textContent: "Play",
  }) as unknown as HTMLButtonElement;
  const scrub = Object.assign(new EventTarget(), {
    disabled: false,
    value: "0",
    max: "2",
  }) as unknown as HTMLInputElement;
  const session = createPreviewSession<{
    scene: { fps: number; frameCount: number };
    id: string;
  }>({
    controls: {
      play,
      scrub,
      export: { disabled: false } as HTMLButtonElement,
      downloads: [],
    },
    status: vi.fn(),
    ready: vi.fn(),
    retainValidOnFailure: true,
  });
  const snapshot = (id: string) => ({ scene: { fps: 24, frameCount: 3 }, id });
  return { session, snapshot, page };
}
it("retains active capture ownership across failed replacements and releases failed candidates", async () => {
  const { session, snapshot } = fixture();
  const active = vi.fn();
  await session.load(async (ownership) => {
    ownership.onDispose(active);
    return { snapshot: snapshot("active"), initialFrame: 0 };
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    const release = vi.fn();
    expect(
      await session.load(async (ownership) => {
        ownership.onDispose(release);
        ownership.renderer(
          {
            prepareFrame: async () => {
              throw new Error("Candidate frame unavailable");
            },
            renderFrame() {},
            dispose() {},
          },
          () => {},
        );
        return { snapshot: snapshot("failed"), initialFrame: 0 };
      }),
    ).toBe(false);
    expect(release).toHaveBeenCalledOnce();
    expect(active).not.toHaveBeenCalled();
    expect(session.snapshot?.id).toBe("active");
  }
  session.clear();
  session.clear();
  expect(active).toHaveBeenCalledOnce();
});
it("releases a late capture immediately after its candidate was superseded", async () => {
  const { session, snapshot } = fixture();
  const late = vi.fn(),
    replacement = vi.fn();
  let finish!: () => void;
  const pending = session.load(async (ownership) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    ownership.onDispose(late);
    return { snapshot: snapshot("late"), initialFrame: 0 };
  });
  await session.load(async (ownership) => {
    ownership.onDispose(replacement);
    return { snapshot: snapshot("replacement"), initialFrame: 0 };
  });
  finish();
  expect(await pending).toBe(false);
  expect(late).toHaveBeenCalledOnce();
  expect(replacement).not.toHaveBeenCalled();
  session.clear();
  expect(replacement).toHaveBeenCalledOnce();
});
it("releases replaced and unloaded active captures once", async () => {
  const { session, snapshot, page } = fixture();
  const previous = vi.fn(),
    next = vi.fn();
  await session.load(async (ownership) => {
    ownership.onDispose(previous);
    return { snapshot: snapshot("previous"), initialFrame: 0 };
  });
  await session.load(async (ownership) => {
    ownership.onDispose(next);
    return { snapshot: snapshot("next"), initialFrame: 0 };
  });
  expect(previous).toHaveBeenCalledOnce();
  expect(next).not.toHaveBeenCalled();
  page.dispatchEvent(
    Object.assign(new Event("pagehide"), { persisted: false }),
  );
  expect(next).toHaveBeenCalledOnce();
});

it("releases every capture even when audio or a renderer throws during disposal", async () => {
  const { session, snapshot } = fixture();
  const first = vi.fn(),
    last = vi.fn(),
    nextRenderer = vi.fn();
  await session.load(async (ownership) => {
    ownership.onDispose(first);
    ownership.audio({
      frame: undefined,
      play: async () => true,
      stop() {},
      dispose() {
        throw new Error("Audio dispose failed");
      },
    });
    ownership.renderer(
      {
        renderFrame() {},
        dispose() {
          throw new Error("Renderer dispose failed");
        },
      },
      () => {},
    );
    ownership.renderer({ renderFrame() {}, dispose: nextRenderer }, () => {});
    ownership.onDispose(last);
    return { snapshot: snapshot("active"), initialFrame: 0 };
  });
  expect(() => session.clear()).toThrow(AggregateError);
  expect(first).toHaveBeenCalledOnce();
  expect(last).toHaveBeenCalledOnce();
  expect(nextRenderer).toHaveBeenCalledOnce();
});
