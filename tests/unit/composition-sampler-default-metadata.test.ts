import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  samplePremultiplied,
  type PremultipliedSampleControl,
} from "../../packages/renderer-core/src/composition/render/sampled-blur.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { releaseRenderMetadata } from "../../packages/renderer-core/src/managed-metadata.ts";
const original = [
  {
    clamped: false,
    x: -0.5,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: -0.5,
    y: 0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: -0.5,
    y: 1,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: -0.5,
    y: 1.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: -0.5,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 0,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 0,
    y: 0.5,
    output: [12, 21, 100, 107],
    sha256: "9ed29284a883ff978f6acac93e7971ae7ec4b43c0aee8f035450ad7b8e08bb49",
  },
  {
    clamped: false,
    x: 0,
    y: 1,
    output: [14, 58, 52, 91],
    sha256: "3493ae4d6ab0fd99ce3cf5ee09ef19be23d41aec8e0ae9cb831f8cfafd59be7d",
  },
  {
    clamped: false,
    x: 0,
    y: 1.5,
    output: [17, 96, 5, 76],
    sha256: "82ea0b0cda54412fe0cdfef22cfd0454652fa5f5cfbcac6471f479e0fb700288",
  },
  {
    clamped: false,
    x: 0,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 0.5,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 0.5,
    y: 0.5,
    output: [23, 41, 199, 213],
    sha256: "c2b7d46df953a29550e8ca8bd6dfb1741a61a260c30e907d313044a8398735b2",
  },
  {
    clamped: false,
    x: 0.5,
    y: 1,
    output: [28, 117, 104, 182],
    sha256: "5c06615a5109f47b7bfda7204330da4774f5a31d482c5bb94630a7d2411b030e",
  },
  {
    clamped: false,
    x: 0.5,
    y: 1.5,
    output: [33, 192, 9, 151],
    sha256: "0c27981f026e052aad170169e35ccf50e3719f06575b7c08917281ad317f7040",
  },
  {
    clamped: false,
    x: 0.5,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 0.5625,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 0.5625,
    y: 0.5,
    output: [34, 39, 196, 205],
    sha256: "6daeadf86448ed7cd19562305b6c57cbe916a9e484e6ac5c05bb966374835fcc",
  },
  {
    clamped: false,
    x: 0.5625,
    y: 1,
    output: [40, 111, 104, 173],
    sha256: "b0c14a5701a2f8cee04db508e15a274c23fef2369362bec75fe9792fcfe00298",
  },
  {
    clamped: false,
    x: 0.5625,
    y: 1.5,
    output: [46, 184, 13, 142],
    sha256: "fd0d102a3ab5e7224c0a5f99f06bc075f1541ae05b4428953c3ebdbc0092a781",
  },
  {
    clamped: false,
    x: 0.5625,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 1,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 1,
    y: 0.5,
    output: [112, 24, 171, 147],
    sha256: "657011222f265319e5b66b135ba55a81581be90af29c0ba67b237eb305d6eecb",
  },
  {
    clamped: false,
    x: 1,
    y: 1,
    output: [125, 75, 106, 111],
    sha256: "8c0b9559fdfcc9e7fdbf2b4a90bb5d4402597cabaf797acc916773a44af34785",
  },
  {
    clamped: false,
    x: 1,
    y: 1.5,
    output: [137, 126, 41, 76],
    sha256: "758c87d2a8ddeca2fa7b3b8c82ac4b8c2c1a552569a2afc290078556d2a98a8e",
  },
  {
    clamped: false,
    x: 1,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 1.5,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 1.5,
    y: 0.5,
    output: [201, 7, 143, 81],
    sha256: "693f692e2f40ea851c9c8d2f6d5edf195d5a01c3a4e3fd44e252439266e0c4f9",
  },
  {
    clamped: false,
    x: 1.5,
    y: 1,
    output: [221, 33, 108, 41],
    sha256: "ffc18ea130355bcf54653e37543ef3c7a986cbe8f53f0611f2839299b52bb2b3",
  },
  {
    clamped: false,
    x: 1.5,
    y: 1.5,
    output: [241, 59, 73, 0],
    sha256: "20669af0a9e420bfeefe00e1d304b31b78dd784e4ce2d42793b73039d72b090a",
  },
  {
    clamped: false,
    x: 1.5,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 2,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 2,
    y: 0.5,
    output: [101, 4, 72, 41],
    sha256: "00095889ae69dbbd3c6a8ea60abc57bbc0c1c73334474165c1147fce91f91ce5",
  },
  {
    clamped: false,
    x: 2,
    y: 1,
    output: [111, 17, 54, 20],
    sha256: "0d22186280ae00e6d63f1d78b2b7495734f41ea0b627df5756cd2b7eaf8539d6",
  },
  {
    clamped: false,
    x: 2,
    y: 1.5,
    output: [121, 30, 37, 0],
    sha256: "397b4ce74d156e1e190f237770c095444eaf948d320e02f94d14c1272c7de179",
  },
  {
    clamped: false,
    x: 2,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 2.5,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 2.5,
    y: 0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 2.5,
    y: 1,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 2.5,
    y: 1.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: false,
    x: 2.5,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: -0.5,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: -0.5,
    y: 0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: -0.5,
    y: 1,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: -0.5,
    y: 1.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: -0.5,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 0,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 0,
    y: 0.5,
    output: [12, 21, 100, 107],
    sha256: "9ed29284a883ff978f6acac93e7971ae7ec4b43c0aee8f035450ad7b8e08bb49",
  },
  {
    clamped: true,
    x: 0,
    y: 1,
    output: [14, 58, 52, 91],
    sha256: "3493ae4d6ab0fd99ce3cf5ee09ef19be23d41aec8e0ae9cb831f8cfafd59be7d",
  },
  {
    clamped: true,
    x: 0,
    y: 1.5,
    output: [17, 96, 5, 76],
    sha256: "82ea0b0cda54412fe0cdfef22cfd0454652fa5f5cfbcac6471f479e0fb700288",
  },
  {
    clamped: true,
    x: 0,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 0.5,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 0.5,
    y: 0.5,
    output: [23, 41, 199, 213],
    sha256: "c2b7d46df953a29550e8ca8bd6dfb1741a61a260c30e907d313044a8398735b2",
  },
  {
    clamped: true,
    x: 0.5,
    y: 1,
    output: [28, 117, 104, 182],
    sha256: "5c06615a5109f47b7bfda7204330da4774f5a31d482c5bb94630a7d2411b030e",
  },
  {
    clamped: true,
    x: 0.5,
    y: 1.5,
    output: [33, 192, 9, 151],
    sha256: "0c27981f026e052aad170169e35ccf50e3719f06575b7c08917281ad317f7040",
  },
  {
    clamped: true,
    x: 0.5,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 0.5625,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 0.5625,
    y: 0.5,
    output: [34, 39, 196, 205],
    sha256: "6daeadf86448ed7cd19562305b6c57cbe916a9e484e6ac5c05bb966374835fcc",
  },
  {
    clamped: true,
    x: 0.5625,
    y: 1,
    output: [40, 111, 104, 173],
    sha256: "b0c14a5701a2f8cee04db508e15a274c23fef2369362bec75fe9792fcfe00298",
  },
  {
    clamped: true,
    x: 0.5625,
    y: 1.5,
    output: [46, 184, 13, 142],
    sha256: "fd0d102a3ab5e7224c0a5f99f06bc075f1541ae05b4428953c3ebdbc0092a781",
  },
  {
    clamped: true,
    x: 0.5625,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 1,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 1,
    y: 0.5,
    output: [112, 24, 171, 147],
    sha256: "657011222f265319e5b66b135ba55a81581be90af29c0ba67b237eb305d6eecb",
  },
  {
    clamped: true,
    x: 1,
    y: 1,
    output: [125, 75, 106, 111],
    sha256: "8c0b9559fdfcc9e7fdbf2b4a90bb5d4402597cabaf797acc916773a44af34785",
  },
  {
    clamped: true,
    x: 1,
    y: 1.5,
    output: [137, 126, 41, 76],
    sha256: "758c87d2a8ddeca2fa7b3b8c82ac4b8c2c1a552569a2afc290078556d2a98a8e",
  },
  {
    clamped: true,
    x: 1,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 1.5,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 1.5,
    y: 0.5,
    output: [201, 7, 143, 81],
    sha256: "693f692e2f40ea851c9c8d2f6d5edf195d5a01c3a4e3fd44e252439266e0c4f9",
  },
  {
    clamped: true,
    x: 1.5,
    y: 1,
    output: [221, 33, 108, 41],
    sha256: "ffc18ea130355bcf54653e37543ef3c7a986cbe8f53f0611f2839299b52bb2b3",
  },
  {
    clamped: true,
    x: 1.5,
    y: 1.5,
    output: [241, 59, 73, 0],
    sha256: "20669af0a9e420bfeefe00e1d304b31b78dd784e4ce2d42793b73039d72b090a",
  },
  {
    clamped: true,
    x: 1.5,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 2,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 2,
    y: 0.5,
    output: [101, 4, 72, 41],
    sha256: "00095889ae69dbbd3c6a8ea60abc57bbc0c1c73334474165c1147fce91f91ce5",
  },
  {
    clamped: true,
    x: 2,
    y: 1,
    output: [111, 17, 54, 20],
    sha256: "0d22186280ae00e6d63f1d78b2b7495734f41ea0b627df5756cd2b7eaf8539d6",
  },
  {
    clamped: true,
    x: 2,
    y: 1.5,
    output: [121, 30, 37, 0],
    sha256: "397b4ce74d156e1e190f237770c095444eaf948d320e02f94d14c1272c7de179",
  },
  {
    clamped: true,
    x: 2,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 2.5,
    y: -0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 2.5,
    y: 0.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 2.5,
    y: 1,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 2.5,
    y: 1.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    clamped: true,
    x: 2.5,
    y: 2.5,
    output: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
] as const;
const bytes = [
  23, 41, 199, 213, 201, 7, 143, 81, 33, 192, 9, 151, 241, 59, 73, 0,
];
const limits = { pixels: 1024, metadata: 4096 };
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 80 complete original typed-view/edge/quantized default samples in active and inactive routes with actual result owners", async () => {
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits);
    const run = async () => {
      for (const x of original) {
        const pixels = x.clamped
          ? new Uint8ClampedArray(bytes)
          : new Uint8Array(bytes);
        const result = samplePremultiplied(pixels, 2, 2, x.x, x.y);
        expect(result).toEqual(x.output);
        expect(
          createHash("sha256").update(JSON.stringify(result)).digest("hex"),
        ).toBe(x.sha256);
        expect(memory.owns(result)).toBe(active);
        if (active) expect(memory.statistics.current.metadata).toBe(288);
        releaseRenderMetadata(result);
        expect([...pixels]).toEqual(bytes);
        empty(memory);
      }
    };
    if (active) await withManagedMemory(memory, run);
    else await run();
    memory.dispose();
  }
});
it("rejects default output working capacity before original sampling math or control factories", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 1023 });
  await withManagedMemory(memory, async () => {
    const floor = vi.spyOn(Math, "floor");
    const control: PremultipliedSampleControl = {};
    expect(() =>
      samplePremultiplied(
        new Uint8Array(bytes),
        2,
        2,
        1,
        1,
        undefined,
        control,
      ),
    ).toThrow(/metadata/);
    expect(floor).not.toHaveBeenCalled();
    expect(control.index).toBeUndefined();
    empty(memory);
  });
  memory.dispose();
});
it("holds working capacity and actual index closure through the original consumer, then shrinks to the actual result", async () => {
  const memory = new ManagedMemory(limits),
    control: PremultipliedSampleControl = {};
  await withManagedMemory(memory, async () => {
    const originalFloor = Math.floor;
    let sampled = false;
    vi.spyOn(Math, "floor").mockImplementation((value) => {
      expect(memory.statistics.current.metadata).toBe(1024);
      if (control.index) {
        sampled = true;
        expect(control.index(0, 0)).toBe(0);
        expect(control.index(2, 0)).toBe(-1);
      }
      return originalFloor(value);
    });
    const output = samplePremultiplied(
      new Uint8Array(bytes),
      2,
      2,
      1,
      1,
      undefined,
      control,
    );
    expect(sampled).toBe(true);
    expect(control.index).toBeUndefined();
    expect(memory.statistics.current.metadata).toBe(288);
    expect(memory.owns(output)).toBe(true);
    releaseRenderMetadata(output);
    empty(memory);
  });
  memory.dispose();
});
it("cleans early and mid-channel original producer nulls and clears actual index refs before retry", async () => {
  for (const failAt of [1, 6]) {
    const memory = new ManagedMemory(limits),
      control: PremultipliedSampleControl = {};
    await withManagedMemory(memory, async () => {
      const originalFloor = Math.floor;
      let calls = 0;
      vi.spyOn(Math, "floor").mockImplementation((value) => {
        if (++calls === failAt) throw null;
        return originalFloor(value);
      });
      let failure: unknown = "unset";
      try {
        samplePremultiplied(
          new Uint8Array(bytes),
          2,
          2,
          1,
          1,
          undefined,
          control,
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(control.index).toBeUndefined();
      empty(memory);
      vi.restoreAllMocks();
      const output = samplePremultiplied(new Uint8Array(bytes), 2, 2, 1, 1);
      expect(memory.owns(output)).toBe(true);
      releaseRenderMetadata(output);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears the actual completed output when metadata adoption throws null", async () => {
  const memory = new ManagedMemory(limits);
  let actual: number[] | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((value) => {
      actual = value as number[];
      throw null;
    });
    let failure: unknown = "unset";
    try {
      samplePremultiplied(new Uint8Array(bytes), 2, 2, 1, 1);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(actual).toHaveLength(0);
    empty(memory);
  });
  memory.dispose();
});
it("clears the actual adopted result after shrink null while preserving null over a secondary retirement error", async () => {
  const memory = new ManagedMemory(limits),
    reserve = memory.reserve.bind(memory),
    adopt = memory.adopt.bind(memory);
  let actual: number[] | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args),
        release = lease.release.bind(lease);
      vi.spyOn(lease, "resize").mockImplementation(() => {
        throw null;
      });
      vi.spyOn(lease, "release").mockImplementation(() => {
        release();
        throw Error("secondary retirement");
      });
      return lease;
    });
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      actual = args[0] as number[];
      return adopt(...args);
    });
    let failure: unknown = "unset";
    try {
      samplePremultiplied(new Uint8Array(bytes), 2, 2, 1, 1);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(actual).toHaveLength(0);
    empty(memory);
  });
  memory.dispose();
});
it("keeps the actual returned array owned outside render scope until its consumer releases it", async () => {
  const memory = new ManagedMemory(limits);
  let output: number[] | undefined;
  await withManagedMemory(memory, async () => {
    output = samplePremultiplied(new Uint8Array(bytes), 2, 2, 1, 1);
  });
  expect(output).toEqual([125, 75, 106, 111]);
  expect(memory.owns(output!)).toBe(true);
  expect(memory.statistics.current.metadata).toBe(288);
  releaseRenderMetadata(output!);
  expect(output).toHaveLength(0);
  empty(memory);
  memory.dispose();
});
it("retires default results at scratch or allocator cleanup while supplied outputs and borrowed bytes retain their original contents", async () => {
  for (const scratch of [false, true]) {
    const memory = new ManagedMemory(limits),
      input = new Uint8Array(bytes),
      borrowed = [0, 0, 0, 0, 9, 10];
    let output: number[] | undefined;
    if (scratch) memory.beginScratch();
    await withManagedMemory(memory, async () => {
      output = samplePremultiplied(input, 2, 2, 1, 1);
      expect(samplePremultiplied(input, 2, 2, 1, 1, borrowed)).toBe(borrowed);
      expect(memory.owns(borrowed)).toBe(false);
      expect(memory.statistics.current.metadata).toBe(288);
    });
    if (scratch) memory.endScratch();
    else memory.dispose();
    expect(output).toHaveLength(0);
    expect(borrowed).toEqual([125, 75, 106, 111, 9, 10]);
    expect([...input]).toEqual(bytes);
    empty(memory);
    releaseRenderMetadata(output!);
    memory.dispose();
  }
});
