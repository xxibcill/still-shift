import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import type { Page } from "playwright";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as Diagnostics from "../../packages/renderer-core/src/passage-diagnostics.ts";

/** Required alpha includes ancestor processing, but siblings cannot conceal a hole. */
export async function cameraAncestorCoverageAcceptance(page: Page) {
  return page.evaluate(async () => {
    const renderUrl = "/packages/renderer-core/src/index.ts",
      diagnosticUrl = "/packages/renderer-core/src/passage-diagnostics.ts",
      m = (await import(renderUrl)) as typeof Render,
      d = (await import(diagnosticUrl)) as typeof Diagnostics,
      reports = [];
    for (const backend of ["canvas2d", "webgl2"] as const)
      for (const threeD of [false, true])
        for (const kind of [
          "mask",
          "nested-mask",
          "matte",
          "effect",
          "sibling",
          "full-matte",
          "named-input",
          "required-group",
          "exposure-mask",
          "echo-out-point",
          "echo-opacity",
        ] as const) {
          const group: Extract<CompositionLayer, { type: "group" }> = {
              id: "group",
              type: "group",
              size: [100, 100],
              transform: { anchor: [0, 0] },
            },
            cover: Extract<CompositionLayer, { type: "solid" }> = {
              id: "cover",
              type: "solid",
              size: [100, 100],
              color: "#ffffff",
              parent: "group",
              coverage: "required",
              threeD,
              transform: {
                anchor: [0, 0],
                position: threeD ? [0, 0, 0] : [0, 0],
              },
            },
            doc: Composition = {
              schemaVersion: "composition-1",
              id: `ancestor-${kind}`,
              width: 100,
              height: 100,
              fps: 24,
              frameCount: 3,
              assets: [],
              layers: [{ id: "camera", type: "camera" }, group, cover],
            },
            hole = {
              id: "hole",
              mode: "subtract" as const,
              path: {
                closed: true,
                vertices: [
                  [40, 40],
                  [60, 40],
                  [60, 60],
                  [40, 60],
                ] as [number, number][],
              },
              opacity: {
                keys: [
                  { frame: 0, value: 0 },
                  { frame: 1, value: 1 },
                  { frame: 2, value: 0 },
                ],
              },
            };
          if (["mask", "exposure-mask"].includes(kind)) group.masks = [hole];
          if (["nested-mask", "required-group"].includes(kind)) {
            group.parent = "outer";
            group.effects = [
              { id: "tint", effect: "color.tint", params: { amount: 0 } },
            ];
            doc.layers.push({
              id: "outer",
              type: "group",
              size: [100, 100],
              transform: { anchor: [0, 0] },
              masks: [hole],
            });
          }
          if (kind === "required-group") {
            group.coverage = "required";
            cover.coverage = "optional";
          }
          if (kind === "exposure-mask") {
            group.motionBlur = true;
            doc.motionBlur = {
              enabled: true,
              shutterAngle: 360,
              shutterPhase: 0,
              samples: 4,
            };
          }
          if (kind === "effect")
            group.effects = [
              {
                id: "wipe",
                effect: "transition.linear-wipe",
                params: {
                  progress: {
                    keys: [
                      { frame: 0, value: 0 },
                      { frame: 1, value: 0.5 },
                    ],
                  },
                },
              },
            ];
          if (kind === "sibling") {
            cover.masks = [{ ...hole, opacity: 1 }];
            group.effects = [
              { id: "tint", effect: "color.tint", params: { amount: 0 } },
            ];
            doc.layers.push({
              ...cover,
              id: "sibling",
              coverage: "optional",
              masks: [],
            });
          }
          if (["matte", "full-matte", "named-input"].includes(kind)) {
            doc.layers.push(
              {
                id: "source",
                type: "group",
                size: [100, 100],
                enabled: false,
                transform: { anchor: [0, 0] },
              },
              {
                id: "source-art",
                type: "solid",
                size: [kind === "matte" ? 80 : 100, 100],
                color: "#ffffff",
                parent: "source",
                transform: { anchor: [0, 0] },
              },
            );
            if (kind === "named-input")
              group.effects = [
                {
                  id: "map",
                  effect: "distort.displacement-map",
                  inputs: { map: "source" },
                  params: {
                    amount: [10, 0],
                    channelX: 4,
                    channelY: 4,
                    midpoint: 1,
                  },
                },
              ];
            else group.trackMatte = { layer: "source", mode: "alpha" };
          }
          if (kind.startsWith("echo-")) {
            doc.frameCount = 2;
            group.effects = [
              {
                id: "history",
                effect: "time.echo",
                params: { count: 1, spacing: 1, decay: 1 },
              },
            ];
            if (kind === "echo-out-point") cover.outPoint = 1;
            else
              cover.transform!.opacity = {
                keys: [
                  { frame: 0, value: 1 },
                  { frame: 1, value: 0 },
                ],
              };
          }
          const accepted = [
              "full-matte",
              "named-input",
              "echo-out-point",
              "echo-opacity",
            ].includes(kind),
            expectedFrame = [
              "mask",
              "nested-mask",
              "effect",
              "required-group",
            ].includes(kind)
              ? 1
              : 0,
            node = kind === "required-group" ? "group" : "cover";
          for (const severity of accepted
            ? (["error"] as const)
            : (["error", "warning"] as const)) {
            let preview:
              | ReturnType<typeof m.createCompositionPreview>
              | undefined;
            let diagnostics: ReturnType<typeof d.passageDiagnostics> = [];
            try {
              preview = m.createCompositionPreview(
                document.createElement("canvas"),
                doc,
                { images: new Map(), fonts: new Map() },
                { backend, coverageSeverity: severity },
              );
              diagnostics = preview.renderFrame(0).diagnostics;
              if (accepted) preview.renderFrame(1);
              if (
                accepted &&
                preview.readPixels().some((channel) => channel !== 255)
              )
                throw Error("Valid full coverage was not opaque white");
            } catch (error) {
              if (severity === "warning" || accepted) throw error;
              diagnostics = d.passageDiagnostics(error);
            } finally {
              preview?.dispose();
            }
            const failure = diagnostics.find(
              (diagnostic) => diagnostic.code === "comp-camera-coverage",
            );
            if (
              accepted
                ? diagnostics.length > 0
                : !failure ||
                  failure.node !== node ||
                  failure.frame !== expectedFrame ||
                  failure.severity !== severity
            )
              throw Error(
                `${backend}/${threeD}/${kind}/${severity}: ${JSON.stringify(diagnostics)}`,
              );
            reports.push({
              backend,
              threeD,
              kind,
              severity,
              accepted,
              diagnostics,
            });
          }
        }
    return reports;
  });
}
