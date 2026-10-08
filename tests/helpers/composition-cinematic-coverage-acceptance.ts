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
      const alphaCases = [
        "mask",
        "matte",
        "matte-source",
        "ancestor-matte-source",
        "group-mask",
        "group-clip",
        "group-effect",
        "shutter-mask",
        "opaque-sibling",
        "full-mask",
        "full-matte",
        "disabled-effect",
        "identity-effect",
      ].map((id) => {
        const changed = structuredClone(doc);
        changed.motionBlur!.enabled = id === "shutter-mask";
        const layer = changed.layers[1]!;
        const hole = {
          id: "hole",
          mode: "subtract" as const,
          path: {
            closed: true,
            vertices: [
              [16, 16],
              [32, 16],
              [32, 32],
              [16, 32],
            ] as [number, number][],
          },
        };
        if (["mask", "shutter-mask", "opaque-sibling"].includes(id))
          layer.masks = [hole];
        if (id === "shutter-mask") {
          layer.masks![0]!.opacity = 0;
          changed.expressions = {
            "background.masks[hole].opacity": {
              source: "step(0.1, abs(sin(frame * 6.283185307179586)))",
            },
          };
        }
        if (id === "full-mask")
          layer.masks = [
            {
              id: "full",
              mode: "add",
              path: {
                closed: true,
                vertices: [
                  [0, 0],
                  [48, 0],
                  [48, 48],
                  [0, 48],
                ],
              },
            },
          ];
        if (id === "matte" || id === "full-matte") {
          changed.layers.push({
            id: "matte",
            type: "solid",
            size: [48, 48],
            color: "#ffffff",
            transform: { anchor: [0, 0], position: [-8, -8] },
            ...(id === "matte" ? { masks: [hole] } : {}),
          });
          layer.trackMatte = { layer: "matte", mode: "alpha" };
        }
        if (id === "ancestor-matte-source") {
          layer.parent = "paint-group";
          changed.layers.push({
            id: "paint-group",
            type: "group",
            size: [48, 48],
            transform: { anchor: [0, 0] },
          });
        }
        if (id === "matte-source" || id === "ancestor-matte-source")
          changed.layers.push({
            id: "matted-subject",
            type: "solid",
            size: [8, 8],
            color: "#ffffff",
            trackMatte: {
              layer: id === "matte-source" ? "background" : "paint-group",
              mode: "alpha",
            },
          });
        if (id.startsWith("group-")) {
          layer.parent = "paint-group";
          changed.layers.push({
            id: "paint-group",
            type: "group",
            size: id === "group-clip" ? [16, 16] : [48, 48],
            transform: { anchor: [0, 0] },
            ...(id === "group-clip" ? { clip: true } : {}),
            ...(id === "group-mask" ? { masks: [hole] } : {}),
            ...(id === "group-effect"
              ? {
                  effects: [
                    {
                      id: "wipe",
                      effect: "transition.linear-wipe",
                      params: { progress: 0.5 },
                    },
                  ],
                }
              : {}),
          });
        }
        if (id === "opaque-sibling")
          changed.layers.push({
            ...structuredClone(layer),
            id: "sibling",
            masks: [],
          });
        if (id === "disabled-effect")
          layer.effects = [
            {
              id: "wipe",
              effect: "transition.linear-wipe",
              enabled: false,
              params: { progress: 1 },
            },
          ];
        if (id === "identity-effect")
          layer.effects = [
            {
              id: "tint",
              effect: "color.tint",
              params: { amount: 0 },
            },
          ];
        return {
          id,
          doc: changed,
          valid: [
            "full-mask",
            "full-matte",
            "disabled-effect",
            "identity-effect",
          ].includes(id),
        };
      });
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
          const renderedAlpha = [];
          for (const item of alphaCases) {
            let preview:
              | ReturnType<typeof render.createCompositionPreview>
              | undefined;
            let diagnostics: ReturnType<typeof render.passageDiagnostics> = [];
            let maxValidDelta = 0;
            try {
              preview = render.createCompositionPreview(
                document.createElement("canvas"),
                JSON.parse(JSON.stringify(item.doc)) as Composition,
                await render.loadCompositionResources(item.doc, () => assetUrl),
                { backend, coverageSeverity: "warning" },
              );
              for (const frame of [0, 2, 1, 0]) {
                const result = preview.renderFrame(frame);
                if (result.diagnostics.length)
                  throw Error(`${item.id}: unexpected diagnostics`);
                maxValidDelta = Math.max(
                  maxValidDelta,
                  render.compareFrames(pixels, preview.readPixels(), 32, 32)
                    .maxChannelDelta,
                );
              }
            } catch (error) {
              diagnostics = render.passageDiagnostics(error);
            } finally {
              preview?.dispose();
            }
            if (item.valid) {
              if (diagnostics.length || maxValidDelta > 1)
                throw Error(
                  `${backend}/${item.id}: valid alpha treatment changed coverage or pixels`,
                );
            } else if (
              !diagnostics.some(
                (diagnostic) =>
                  diagnostic.code === "comp-camera-coverage" &&
                  diagnostic.node === "background" &&
                  diagnostic.path === "metadata.cinematicCoverage" &&
                  diagnostic.severity === "error",
              )
            )
              throw Error(
                `${backend}/${item.id}: uncovered rendered alpha was accepted`,
              );
            retained.renderFrame(1);
            if (
              render.compareFrames(pixels, retained.readPixels(), 32, 32)
                .maxChannelDelta !== 0
            )
              throw Error(
                `${backend}/${item.id}: failed coverage changed retained pixels`,
              );
            renderedAlpha.push({
              id: item.id,
              valid: item.valid,
              diagnostics,
              maxValidDelta,
            });
          }
          reports.push({
            backend,
            decodedPng: true,
            rejection,
            heldBackground: { frames: 4, maxChannelDelta: maxControlDelta },
            retainedPreview: { frames: 4, maxChannelDelta: maxRetainedDelta },
            renderErrors: [],
            renderedAlpha,
          });
        } finally {
          control.dispose();
          retained.dispose();
        }
      }
      return { reports, uncovered, assetUrl, alphaCases };
    },
    [...backends],
  );
}
