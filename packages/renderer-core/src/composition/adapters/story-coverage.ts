import { z } from "zod";
import type { Composition } from "@still-shift/scene-contract";
import {
  prepareAlphaCoverage,
  type AlphaPixels,
} from "../../alpha-coverage.ts";
import { imagePlacement } from "../../node-transform.ts";
import { passageError } from "../../passage-diagnostics.ts";
import { evaluateComp } from "../evaluate/evaluate.ts";

const coverIds = z.array(z.string().regex(/^[a-zA-Z][\w-]*$/)).max(20);

/** Validate persisted story covers from composition states, without the source evaluator. */
export function validateStoryCompositionCoverage(
  composition: Composition,
  readPixels: (assetId: string) => AlphaPixels,
) {
  const declaration = composition.metadata?.storyCameraCover;
  if (declaration === undefined) return;
  const parsed = coverIds.safeParse(declaration);
  if (!parsed.success)
    passageError(
      "comp-camera-coverage",
      "Invalid story camera cover declaration",
      {
        path: "metadata.storyCameraCover",
      },
    );
  if (!parsed.data.length) return;
  const covers = new Set(parsed.data);
  const images = new Map(
    composition.assets.flatMap((asset) =>
      asset.type === "image" ? [[asset.id, asset] as const] : [],
    ),
  );
  const transparency = new Map<
    string,
    ReturnType<typeof prepareAlphaCoverage>
  >();
  for (const id of covers)
    if (
      !composition.layers.some(
        (layer) => layer.id === id && layer.type === "image",
      )
    )
      passageError(
        "comp-camera-coverage",
        `Camera cover ${id} is not an image layer`,
        {
          path: "metadata.storyCameraCover",
          node: id,
        },
      );
  for (let frame = 0; frame < composition.frameCount; frame++) {
    for (const state of evaluateComp(composition, frame).layers) {
      if (!covers.has(state.id) || state.layer.type !== "image") continue;
      const layer = state.layer;
      const fail = (detail: string): never =>
        passageError(
          "comp-camera-coverage",
          `Camera exposes uncovered edge on ${state.id} at frame ${frame}: ${detail}`,
          { path: "metadata.storyCameraCover", node: state.id, frame },
        );
      const [a, b, c, d, x, y] = state.screenMatrix;
      if (
        !state.visible ||
        state.opacity !== 1 ||
        a <= 0 ||
        d <= 0 ||
        b !== 0 ||
        c !== 0
      )
        fail("cover must remain opaque and axis-aligned");
      const indices =
        state.stateMix === 0
          ? [state.stateFrom ?? state.state ?? 0]
          : state.stateMix !== undefined && state.stateMix < 1
            ? [state.stateFrom ?? state.state ?? 0, state.state ?? 0]
            : [state.state ?? 0];
      for (const index of new Set(indices)) {
        const source = layer.sources[index]!;
        const asset = images.get(source.asset)!;
        const crop = source.crop ?? [0, 0, asset.width, asset.height];
        const drawn = imagePlacement(
          {
            width: layer.size[0],
            height: layer.size[1],
            fit: layer.fit ?? "contain",
          },
          crop,
          source.registration?.anchor,
        );
        const left = -x / a,
          top = -y / d;
        const right = (composition.width - x) / a;
        const bottom = (composition.height - y) / d;
        if (
          left < Math.max(0, drawn.x) - 1e-6 ||
          top < Math.max(0, drawn.y) - 1e-6 ||
          right > Math.min(layer.size[0], drawn.x + drawn.width) + 1e-6 ||
          bottom > Math.min(layer.size[1], drawn.y + drawn.height) + 1e-6
        )
          fail("cover does not fill the viewport");
        let transparent = transparency.get(asset.id);
        if (!transparent) {
          transparent = prepareAlphaCoverage(readPixels(asset.id));
          transparency.set(asset.id, transparent);
        }
        if (
          transparent(
            crop[0] + ((left - drawn.x) / drawn.width) * crop[2],
            crop[1] + ((top - drawn.y) / drawn.height) * crop[3],
            crop[0] + ((right - drawn.x) / drawn.width) * crop[2],
            crop[1] + ((bottom - drawn.y) / drawn.height) * crop[3],
          )
        )
          fail("transparent image pixels");
      }
    }
  }
}
