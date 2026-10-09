import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPreparedFonts } from "../../packages/renderer-core/src/prepared-fonts.ts";
import { PassageError } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import type { FontValidationDiagnostic } from "../../packages/renderer-core/src/font-identity.ts";
import type { TextNode } from "../../packages/renderer-core/src/typography-style.ts";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { CompositionSchema } from "../../packages/scene-contract/src/composition/composition.ts";
import { loadCompositionFonts } from "../../packages/renderer-core/src/composition/render/text.ts";
import {
  compilePreparedScene,
  evaluatePreparedNode,
} from "../../packages/renderer-core/src/prepared-scene.ts";

const input = () => {
  const scene = JSON.parse(
    readFileSync(
      "benchmarks/fixtures/story-motion/access-constraint.json",
      "utf8",
    ),
  );
  scene.fonts = [
    ...(scene.fonts ?? []),
    {
      id: "test-display",
      path: "display.otf",
      sha256: `sha256:${"a".repeat(64)}`,
      weight: "600",
    },
  ];
  scene.nodes.find((node: { type: string }) => node.type === "text").fontAsset =
    "test-display";
  return scene;
};

describe("prepared font assets", () => {
  it("accepts a pinned font referenced by editable text", () => {
    expect(StorySceneSchema.safeParse(input()).success).toBe(true);
  });
  it("rejects unresolved and colliding font assets", () => {
    const missing = input();
    missing.fonts = [];
    expect(StorySceneSchema.safeParse(missing).success).toBe(false);
    const duplicate = input();
    duplicate.fonts.push(duplicate.fonts[0]);
    expect(StorySceneSchema.safeParse(duplicate).success).toBe(false);
    const collision = input();
    collision.fonts[0].id = collision.assets[0].id;
    expect(StorySceneSchema.safeParse(collision).success).toBe(false);
  });
});

it("switches the category caption on the same exact frame as its image", () => {
  const value = JSON.parse(
    readFileSync("benchmarks/fixtures/story-motion/category-swap.json", "utf8"),
  );
  value.nodes.push({
    id: "test-caption",
    type: "text",
    text: "Before",
    states: ["Before", "After"],
    fontSize: 48,
    color: "#211F1B",
  });
  value.recipe.stateLabels = ["test-caption"];
  const scene = compilePreparedScene(StorySceneSchema.parse(value));
  if (scene.recipe.preset !== "category_swap") throw new Error("Wrong recipe");
  const label = scene.nodes.find((node) => node.id === "test-caption")!;
  expect(
    evaluatePreparedNode(scene, label, scene.recipe.swapFrame - 1).state,
  ).toBe(0);
  expect(evaluatePreparedNode(scene, label, scene.recipe.swapFrame).state).toBe(
    1,
  );
  value.nodes.at(-1).states = ["Only one"];
  expect(StorySceneSchema.safeParse(value).success).toBe(false);
});

it("accepts clipped illustrated restriction sides and rejects unbounded groups", () => {
  const value = JSON.parse(
    readFileSync(
      "benchmarks/fixtures/story-motion/access-constraint.json",
      "utf8",
    ),
  );
  for (const id of value.recipe.sides) {
    const index = value.nodes.findIndex(
      (node: { id: string }) => node.id === id,
    );
    value.nodes[index] = {
      id,
      type: "group",
      width: 350,
      height: 110,
      clip: true,
    };
  }
  expect(StorySceneSchema.safeParse(value).success).toBe(true);
  value.nodes.find(
    (node: { id: string }) => node.id === value.recipe.sides[0],
  ).clip = false;
  expect(StorySceneSchema.safeParse(value).success).toBe(false);
});

describe("opt-in prepared font validation", () => {
  afterEach(() => vi.unstubAllGlobals());
  const pinned = {
    id: "plex",
    path: "assets/story-motion/fonts/plex-sans-semibold.ttf",
    sha256:
      "sha256:a20caf8286023a6a7a85e40b1d2a4ae9fc3e3b1f9eda8f4c542dd4986af67bb1",
    weight: "600",
  };
  const text = (value: string) =>
    ({
      id: "phrase",
      type: "text",
      text: value,
      fontAsset: "plex",
      fontSize: 48,
      color: "#ffffff",
    }) as TextNode;
  function mockBrowser() {
    let constructions = 0;
    class Face {
      family: string;
      weight: string;
      style: string;
      constructor(
        family: string,
        _bytes: ArrayBuffer,
        descriptors: FontFaceDescriptors,
      ) {
        constructions++;
        this.family = family;
        this.weight = descriptors.weight ?? "normal";
        this.style = descriptors.style ?? "normal";
      }
      async load() {
        return this;
      }
    }
    vi.stubGlobal("FontFace", Face);
    vi.stubGlobal("document", { fonts: new Set<Face>() });
    vi.stubGlobal("fetch", async () => new Response(readFileSync(pinned.path)));
    return () => constructions;
  }
  it("keeps unspecified validation compatible with historical wrong-cut and Thai inputs", async () => {
    mockBrowser();
    const fonts = await loadPreparedFonts(
      { fonts: [{ ...pinned, weight: "400" }], nodes: [text("คำ")] },
      (id) => id,
    );
    expect(fonts.get("plex")!.weight).toBe("400");
    expect(fonts.get("plex")!.identity).toBeUndefined();
    expect(fonts.get("plex")!.fontDiagnostics).toBeUndefined();
  });
  it("reports explicit legacy warnings without replacing the pinned face", async () => {
    mockBrowser();
    const reports: FontValidationDiagnostic[] = [];
    const fonts = await loadPreparedFonts(
      { fonts: [pinned], nodes: [text("คำ")] },
      (id) => id,
      { profile: "legacy", onDiagnostics: (items) => reports.push(...items) },
    );
    expect(reports[0]).toMatchObject({
      code: "font-coverage",
      severity: "warning",
      fontId: "plex",
    });
    expect(fonts.get("plex")!.family).toBe(
      "StillShift-a20caf8286023a6a7a85e40b1d2a4ae9fc3e3b1f9eda8f4c542dd4986af67bb1",
    );
    expect(fonts.get("plex")!.fontDiagnostics).toEqual(reports);
  });
  it("rejects generated unsupported states before creating native font handles", async () => {
    const constructions = mockBrowser();
    let error: unknown;
    try {
      await loadPreparedFonts(
        {
          fonts: [pinned],
          nodes: [{ ...text("ASCII"), states: ["ASCII", "คำ"] }],
        },
        (id) => id,
        { profile: "strict" },
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PassageError);
    expect((error as PassageError).diagnostics[0]).toMatchObject({
      code: "font-coverage",
      path: "nodes.0.states.1",
      node: "phrase",
    });
    expect(constructions()).toBe(0);
  });
  it("retains the actual native composition path for correction-only unsupported copy", async () => {
    const constructions = mockBrowser();
    const comp = CompositionSchema.parse({
      schemaVersion: "composition-1",
      id: "native-fonts",
      width: 1080,
      height: 1920,
      fps: 30,
      frameCount: 90,
      assets: [{ type: "font", ...pinned }],
      layers: [
        { id: "backdrop", type: "solid", size: [1080, 1920], color: "#000000" },
        {
          id: "phrase",
          type: "text",
          text: "ASCII",
          fontAsset: "plex",
          fontSize: 48,
          color: "#ffffff",
          corrections: [{ start: 1, end: 3, replacement: "คำ" }],
        },
      ],
    });
    await expect(
      loadCompositionFonts(comp, (id) => id, { profile: "strict" }),
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: "font-coverage",
          node: "phrase",
          path: "layers.1.corrections.0.replacement",
        }),
      ],
    });
    expect(constructions()).toBe(0);
  });
  it("accepts exact E01 copy in strict mode and rejects a false static cut", async () => {
    mockBrowser();
    const fonts = await loadPreparedFonts(
      {
        fonts: [pinned],
        nodes: [text("PULL PUSH THICKNESS TRAVEL INSIDE OUTSIDE SLIDES")],
      },
      (id) => id,
      { profile: "strict" },
    );
    expect(fonts.get("plex")!.identity?.weight).toBe(600);
    await expect(
      loadPreparedFonts({ fonts: [{ ...pinned, weight: "400" }] }, (id) => id, {
        profile: "strict",
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: "font-cut-identity",
          fontId: "plex",
          path: "fonts.0",
        }),
      ],
    });
  });
});
