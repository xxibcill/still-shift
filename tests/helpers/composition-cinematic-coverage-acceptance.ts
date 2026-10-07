import type { Composition } from "@still-shift/scene-contract";
import type { Page } from "playwright";
import type * as Render from "../../packages/renderer-core/src/index.ts";

/** Persisted coverage must protect decoded-image previews at their actual shutter clocks. */
export async function compositionCinematicCoverageAcceptance(
  page: Page,
  backends: readonly Render.CompositionBackend[] = ["canvas2d", "webgl2"],
) {
  return page.evaluate(
    async (backends) => {
      const renderUrl = "/packages/renderer-core/src/index.ts",
        render = (await import(renderUrl)) as typeof Render,
        source = document.createElement("canvas");
      source.width = source.height = 48;
      const context = source.getContext("2d")!;
      context.fillStyle = "#d08040";
      context.fillRect(0, 0, 48, 48);
      context.fillStyle = "#204080";
      context.fillRect(16, 0, 16, 48);
      const assetUrl = source.toDataURL("image/png"),
        png = await (await fetch(assetUrl)).arrayBuffer(),
        hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", png)),
        )
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
      const doc: Composition = {
        schemaVersion: "composition-1",
        id: "cinematic-shutter-coverage",
        width: 32,
        height: 32,
        fps: 24,
        frameCount: 3,
        assets: [
          {
            id: "painted",
            type: "image",
            path: "painted.png",
            width: 48,
            height: 48,
            sha256: `sha256:${hash}`,
          },
        ],
        layers: [
          { id: "camera", type: "camera", motionBlur: true },
          {
            id: "background",
            type: "image",
            threeD: true,
            motionBlur: true,
            size: [48, 48],
            sources: [{ asset: "painted" }],
            fit: "stretch",
            transform: { anchor: [0, 0, 0], position: [-8, -8, 0] },
          },
        ],
        motionBlur: {
          enabled: true,
          shutterAngle: 360,
          shutterPhase: 0,
          samples: 2,
        },
        metadata: {
          cinematicCoverage: {
            background: "background",
            paintedBounds: [0, 0, 48, 48],
          },
        },
      };
      const uncovered = JSON.parse(JSON.stringify(doc)) as Composition;
      uncovered.expressions = {
        "camera.viewOffset.x": {
          source: "64 * step(0.1, abs(sin(frame * 6.283185307179586)))",
        },
      };
      const held = JSON.parse(JSON.stringify(uncovered)) as Composition;
      held.layers[1]!.motionBlur = false;
      const reports = [];
      for (const backend of backends) {
        const resources = await render.loadCompositionResources(
          doc,
          () => assetUrl,
        );
        if (!resources.pngImages?.has("painted"))
          throw Error(
            "Coverage acceptance requires a SHA-verified decoded PNG",
          );
        const retained = render.createCompositionPreview(
          document.createElement("canvas"),
          doc,
          resources,
          { backend },
        );
        const control = render.createCompositionPreview(
          document.createElement("canvas"),
          held,
          await render.loadCompositionResources(held, () => assetUrl),
          { backend },
        );
        try {
          const original = retained.renderFrame(1);
          if (original.diagnostics.some((item) => item.severity === "error"))
            throw Error(`${backend}: safe background produced render errors`);
          const pixels = retained.readPixels().slice();
          if (
            !pixels.some((value, index) => index % 4 === 0 && value === 208) ||
            !pixels.some((value, index) => index % 4 === 0 && value === 32)
          )
            throw Error(`${backend}: safe background lost its painted pattern`);
          let rejection: ReturnType<typeof render.passageDiagnostics> = [];
          try {
            const invalid = render.createCompositionPreview(
              document.createElement("canvas"),
              uncovered,
              await render.loadCompositionResources(uncovered, () => assetUrl),
              { backend },
            );
            invalid.dispose();
          } catch (error) {
            rejection = render.passageDiagnostics(error);
          }
          if (
            !rejection.some(
              (item) =>
                item.code === "comp-camera-coverage" &&
                item.node === "background" &&
                item.frame === 0 &&
                item.path === "metadata.cinematicCoverage",
            )
          )
            throw Error(
              `${backend}: uncovered shutter preview was not rejected`,
            );
          let maxControlDelta = 0,
            maxRetainedDelta = 0;
          for (const frame of [0, 1, 2, 1]) {
            const output = control.renderFrame(frame);
            if (output.diagnostics.some((item) => item.severity === "error"))
              throw Error(`${backend}: held background produced render errors`);
            maxControlDelta = Math.max(
              maxControlDelta,
              render.compareFrames(pixels, control.readPixels(), 32, 32)
                .maxChannelDelta,
            );
            retained.renderFrame(frame);
            maxRetainedDelta = Math.max(
              maxRetainedDelta,
              render.compareFrames(pixels, retained.readPixels(), 32, 32)
                .maxChannelDelta,
            );
          }
          if (maxControlDelta > 1 || maxRetainedDelta !== 0)
            throw Error(
              `${backend}: coverage rejection changed valid pixels (${maxControlDelta}, ${maxRetainedDelta})`,
            );
          reports.push({
            backend,
            decodedPng: true,
            rejection,
            heldBackground: { frames: 4, maxChannelDelta: maxControlDelta },
            retainedPreview: { frames: 4, maxChannelDelta: maxRetainedDelta },
            renderErrors: [],
          });
        } finally {
          control.dispose();
          retained.dispose();
        }
      }
      return { reports, uncovered, assetUrl };
    },
    [...backends],
  );
}
