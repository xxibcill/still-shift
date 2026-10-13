import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  CompositionSchema,
  type Composition,
} from "@still-shift/scene-contract";
import { lintCompositionFile } from "../../packages/animation-engine/src/composition-lint.ts";
import { mechanismProductionVisualPolicy } from "../../packages/animation-engine/src/mechanism/production-qa-visual.ts";
import { createCueProjectFixture } from "../helpers/mechanism-cue-project.ts";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  mechanismCueSpeechCaption,
  mechanismCueSpeechSourceHash,
} from "../../packages/animation-engine/src/mechanism/cue-speech-caption.ts";
import { PassageError } from "@still-shift/renderer-core";

describe("actual rendered production-overlay fault controls", () => {
  it("uses measured glyphs/pixels for clipped and short-visible-hold captions, rejects wrong copy before rendering, and preserves an eligible correct speech cue", async () => {
    const root = await mkdtemp("/private/tmp/production-visual-glyphs-");
    const parent = new CompositionNodeMemory();
    const foreign = parent.reserve(1024);
    const availableBefore = parent.availableBytes;
    try {
      const f = await createCueProjectFixture(join(root, "source"));
      const document = f.document;
      const speechCue = mechanismCueSpeechCaption(
        document,
        0,
        "caption",
        mechanismCueSpeechSourceHash(document),
      );
      const base: Composition = CompositionSchema.parse({
        schemaVersion: "composition-1",
        id: "overlay-control",
        width: 320,
        height: 180,
        fps: 30,
        frameCount: 60,
        background: "#ffffff",
        assets: [
          { ...document.font },
          { ...document.narration, path: join(root, "source/narration.wav") },
        ],
        layers: [
          {
            id: "caption",
            type: "text",
            text: document.cues[0]!.text,
            fontAsset: document.font.id,
            fontSize: 24,
            color: "#111111",
            textRole: "body",
            inPoint: 0,
            outPoint: 15,
            transform: { position: [40, 40] },
            metadata: { cue: "intro", track: "caption", speechCue },
          },
          {
            id: "mechanism-cycle-narration",
            type: "audio",
            asset: document.narration.id,
            role: "narration",
            inPoint: 0,
            outPoint: 60,
          },
        ],
      });
      const controls = [
        "baseline",
        "clipped",
        "wrong-copy",
        "short-hold",
      ] as const;
      for (const control of controls) {
        const comp = structuredClone(base),
          label = comp.layers[0]!;
        if (label.type !== "text") throw Error("Expected text control");
        if (control === "clipped") label.transform = { position: [-12, 40] };
        if (control === "wrong-copy") label.text = "Wrong";
        if (control === "short-hold")
          label.transform = {
            position: [40, 40],
            opacity: {
              keys: [
                { frame: 0, value: 0, interpolation: "hold" },
                { frame: 12, value: 1, interpolation: "hold" },
              ],
            },
          };
        const path = join(root, control + ".json");
        await writeFile(path, JSON.stringify(comp));
        const before = await readFile(path);
        const policy = mechanismProductionVisualPolicy(comp, document);
        expect(policy.readingDeclarations).toHaveLength(0);
        const lint = () =>
          lintCompositionFile(path, policy, {
            backend: "webgl2",
            pixels: true,
            collectTextBounds: true,
            collectStatistics: true,
            nodeMemory: parent,
          });
        if (control === "wrong-copy") {
          await lint().then(
            () => {
              throw Error("Wrong copy must fail admission");
            },
            (error: unknown) => {
              expect(error).toBeInstanceOf(PassageError);
              expect(error).toMatchObject({
                diagnostics: expect.arrayContaining([
                  expect.objectContaining({
                    code: "comp-lint-speech-caption",
                    path: "speechCaptions.0.layer",
                  }),
                ]),
              });
            },
          );
          expect(await readFile(path)).toEqual(before);
          expect(parent.availableBytes).toBe(availableBefore);
          continue;
        }
        const report = await lint();
        expect(report.measured).toMatchObject({
          pixels: true,
          textBounds: true,
        });
        expect(
          report.renderStatistics?.byLayerType.filter((r) =>
            r.type.startsWith("native3d"),
          ),
        ).toEqual([]);
        const errors = report.diagnostics.filter(
          (d) =>
            d.code === "reading-time" &&
            d.severity === "error" &&
            d.nodes.includes("caption"),
        );
        if (control === "baseline") expect(errors).toEqual([]);
        else
          expect(errors).toContainEqual(
            expect.objectContaining({ frames: [0, 14], node: "caption" }),
          );
        expect(await readFile(path)).toEqual(before);
        expect(parent.availableBytes).toBe(availableBefore);
      }
    } finally {
      foreign.release();
      parent.dispose();
      await rm(root, { recursive: true, force: true });
    }
  }, 180000);
});
