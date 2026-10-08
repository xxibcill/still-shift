import { describe, expect, it, vi } from "vitest";
import {
  CompositionSchema,
  StorySceneSchema,
} from "@still-shift/scene-contract";
import { compilePreparedScene } from "../../packages/renderer-core/src/prepared-scene.ts";
import { createPreparedIllustratedPreview } from "../../packages/renderer-core/src/composition/adapters/illustrated-preview.ts";
import { STORY_CONTENT_PROVIDERS } from "../../packages/renderer-core/src/composition/adapters/story-providers.ts";
import { prepareCompositionPreview } from "../../packages/renderer-core/src/composition/render/renderer.ts";

function mockCanvas(properties: Record<string, unknown>) {
  const element = {
    width: 1920,
    height: 1080,
    getContext: () => context,
  };
  const context = new Proxy(
    { canvas: element, globalAlpha: 1, ...properties },
    { get: (object, key) => Reflect.get(object, key) ?? (() => {}) },
  );
  return element as unknown as HTMLCanvasElement;
}

describe("family window preparation", () => {
  it("prepares every window once and reuses text and providers across boundary seeks", () => {
    const measureText = vi.fn((text: string) => ({
      width: text.length * 8,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxAscent: 0,
      actualBoundingBoxRight: text.length * 8,
      actualBoundingBoxDescent: 16,
    }));
    const canvas = () => mockCanvas({ measureText });
    vi.stubGlobal("document", { createElement: canvas });
    const provider = STORY_CONTENT_PROVIDERS.find(
      (provider) => provider.id === "story.text@1.0.0",
    )!;
    const prepare = vi.spyOn(provider, "prepare");
    const scene = compilePreparedScene(
      StorySceneSchema.parse({
        schemaVersion: "story-scene-1",
        title: "Prepared boundary text",
        width: 1920,
        height: 1080,
        fps: 30,
        frameCount: 2101,
        background: "#ffffff",
        assets: [
          {
            id: "unused",
            path: "unused.png",
            width: 32,
            height: 32,
            sha256: "sha256:" + "0".repeat(64),
          },
        ],
        fonts: [],
        motionModel: "curves-1",
        nodes: [
          {
            id: "caption",
            type: "text",
            x: 10,
            y: 12,
            width: 32,
            height: 32,
            opacity: 1,
            rotation: 0,
            origin: [0.5, 0.5],
            text: "Prepared text",
            fontSize: 16,
            color: "#222222",
            font: "sans-serif",
            weight: "normal",
            align: "left",
          },
        ],
        recipe: { preset: "generic", moves: [] },
      }),
    );
    let preview:
      | ReturnType<typeof createPreparedIllustratedPreview>
      | undefined;
    try {
      preview = createPreparedIllustratedPreview(canvas(), scene, new Map());
      expect(preview.windows).toHaveLength(2);
      expect(prepare).toHaveBeenCalledTimes(2);
      expect(measureText).toHaveBeenCalledTimes(2);
      prepare.mockClear();
      measureText.mockClear();
      for (const frame of [0, 2000, 0, 2100, 1999, 2001, 0])
        preview.renderFrame(frame);
      expect(prepare).not.toHaveBeenCalled();
      expect(measureText).not.toHaveBeenCalled();
    } finally {
      preview?.dispose();
      prepare.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("captures immutable content and validates required coverage before any reused backend renders", () => {
    const getImageData = vi.fn((_x, _y, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }));
    const canvas = () => mockCanvas({ getImageData });
    vi.stubGlobal("document", { createElement: canvas });
    const composition = CompositionSchema.parse({
      schemaVersion: "composition-1",
      id: "prepared-coverage",
      width: 64,
      height: 64,
      fps: 30,
      frameCount: 3,
      background: "#ffffff",
      assets: [],
      layers: [
        {
          id: "cover",
          type: "solid",
          size: [64, 64],
          color: "#ffffff",
          transform: { position: [0, 0], anchor: [0, 0] },
          coverage: "required",
        },
      ],
    });
    try {
      const prepared = prepareCompositionPreview(
        composition,
        { images: new Map(), fonts: new Map() },
        { coverageSeverity: "warning" },
      );
      expect(getImageData).toHaveBeenCalledTimes(1);
      getImageData.mockClear();
      composition.frameCount = 100;
      composition.layers[0]!.transform!.position = [5000, 5000];
      for (let run = 0; run < 2; run++) {
        const preview = prepared.create(canvas());
        try {
          const report = preview.renderFrame(2);
          expect(report.culled).toEqual([]);
          expect(report.diagnostics).toEqual([
            expect.objectContaining({
              code: "comp-camera-coverage",
              severity: "warning",
              frame: 0,
            }),
          ]);
          expect(() => preview.renderFrame(3)).toThrow("outside");
          expect(getImageData).not.toHaveBeenCalled();
        } finally {
          preview.dispose();
        }
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

it("validates async coverage once across reused previews without disposing borrowed media", async () => {
  const getImageData = vi.fn((_x, _y, width: number, height: number) => ({
    data: new Uint8ClampedArray(width * height * 4),
  }));
  const canvas = () => mockCanvas({ getImageData });
  vi.stubGlobal("document", { createElement: canvas });
  const prepareFrame = vi.fn(async () => {}),
    dispose = vi.fn();
  const media = {
    prepareFrame,
    assertReady: vi.fn(),
    dispose,
  } as unknown as NonNullable<
    Parameters<typeof prepareCompositionPreview>[1]["media"]
  >;
  const composition = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "prepared-async",
    width: 64,
    height: 64,
    fps: 30,
    frameCount: 3,
    background: "#ffffff",
    assets: [],
    layers: [
      {
        id: "cover",
        type: "solid",
        size: [64, 64],
        color: "#ffffff",
        transform: { position: [0, 0], anchor: [0, 0] },
        coverage: "required",
      },
    ],
  });
  try {
    const prepared = prepareCompositionPreview(
      composition,
      { images: new Map(), fonts: new Map(), media },
      { coverageSeverity: "warning" },
    );
    expect(getImageData).not.toHaveBeenCalled();
    for (let run = 0; run < 2; run++) {
      const preview = prepared.create(canvas());
      try {
        await preview.prepareFrame(2);
        expect(preview.renderFrame(2).diagnostics).toEqual([
          expect.objectContaining({ code: "comp-camera-coverage", frame: 0 }),
        ]);
      } finally {
        preview.dispose();
      }
      expect(getImageData).toHaveBeenCalledTimes(1);
    }
    expect(prepareFrame).toHaveBeenCalledTimes(5);
    expect(dispose).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
