import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import type { Page } from "playwright";
import type * as Contract from "../../packages/scene-contract/src/index.ts";
import type * as Render from "../../packages/renderer-core/src/index.ts";

/** Reveal declarations must describe the rendered subject and foreground after JSON reload. */
export async function compositionCinematicRevealAcceptance(
  page: Page,
  backends: readonly Render.CompositionBackend[] = ["canvas2d", "webgl2"],
) {
  return page.evaluate(
    async (backends) => {
      const renderUrl = "/packages/renderer-core/src/index.ts",
        contractUrl = "/packages/scene-contract/src/index.ts",
        render = (await import(renderUrl)) as typeof Render,
        contract = (await import(contractUrl)) as typeof Contract;
      const assetUrls: Record<string, string> = {};
      const asset = async (
        id: string,
        width: number,
        height: number,
        color: string,
      ): Promise<Composition["assets"][number]> => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d")!;
        context.fillStyle = color;
        context.fillRect(0, 0, width, height);
        const url = canvas.toDataURL("image/png"),
          bytes = await (await fetch(url)).arrayBuffer(),
          hash = Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          )
            .map((value) => value.toString(16).padStart(2, "0"))
            .join("");
        assetUrls[id] = url;
        return {
          id,
          type: "image",
          width,
          height,
          path: `${id}.png`,
          sha256: `sha256:${hash}`,
        };
      };
      const validated = (value: Composition) => {
        const result = contract.validateComposition(
          JSON.parse(JSON.stringify(value)),
        );
        if (!result.ok)
          throw Error(
            `Invalid reveal fixture: ${JSON.stringify(result.diagnostics)}`,
          );
        return result.composition;
      };
      const doc = validated({
        schemaVersion: "composition-1",
        id: "cinematic-rendered-reveal",
        width: 80,
        height: 80,
        fps: 24,
        frameCount: 3,
        assets: await Promise.all([
          asset("back-art", 120, 120, "#202040"),
          asset("subject-art", 80, 80, "#40d080"),
          asset("wall-art", 24, 80, "#d04040"),
        ]),
        layers: [
          { id: "camera", type: "camera" },
          {
            id: "wall",
            type: "image",
            threeD: true,
            size: [24, 80],
            fit: "stretch",
            rasterize: "natural-size",
            sources: [{ asset: "wall-art" }],
            transform: {
              anchor: [0, 0, 0],
              position: {
                x: {
                  keys: [
                    { frame: 0, value: 56, interpolation: "hold" },
                    { frame: 1, value: 100 },
                  ],
                },
                y: 0,
                z: 0,
              },
            },
          },
          {
            id: "subject",
            type: "image",
            threeD: true,
            size: [80, 80],
            fit: "stretch",
            rasterize: "natural-size",
            sources: [{ asset: "subject-art" }],
            transform: { anchor: [0, 0, 0], position: [0, 0, 0] },
          },
          {
            id: "background",
            type: "image",
            threeD: true,
            size: [120, 120],
            fit: "stretch",
            rasterize: "natural-size",
            sources: [{ asset: "back-art" }],
            transform: { anchor: [0, 0, 0], position: [-20, -20, 0] },
          },
        ],
        metadata: {
          cinematicCoverage: {
            background: "background",
            paintedBounds: [0, 0, 120, 120],
            reveal: {
              subject: "subject",
              occluders: ["wall"],
              region: [
                [0, 0],
                [80, 0],
                [80, 80],
                [0, 80],
              ],
              settleFrame: 1,
            },
          },
        },
      });
      const cases: {
        id: string;
        doc: Composition;
        valid: boolean;
        node: string;
        frame?: number;
        controlDoc?: Composition;
      }[] = [];
      for (const node of ["subject", "wall"]) {
        for (const treatment of [
          "subtract-mask",
          "track-matte",
          "linear-wipe",
          "ancestor-mask",
          "ancestor-clip",
          "ancestor-effect",
          "matte-source",
          "ancestor-matte-source",
          "full-mask",
          "full-matte",
          "disabled-effect",
          "identity-effect",
          "ancestor-full-mask",
          "ancestor-full-matte",
          "ancestor-full-clip",
          "ancestor-disabled-effect",
          "ancestor-identity-effect",
        ]) {
          const changed = structuredClone(doc),
            target = changed.layers.find((layer) => layer.id === node)!;
          if (target.type !== "image")
            throw Error("Reveal target must be an image");
          const fullPath = (width: number, height: number) => ({
            closed: true,
            vertices: [
              [0, 0],
              [width, 0],
              [width, height],
              [0, height],
            ] as [number, number][],
          });
          if (treatment === "subtract-mask" || treatment === "full-mask")
            target.masks = [
              {
                id: "coverage",
                mode: treatment === "full-mask" ? "add" : "subtract",
                path: fullPath(...target.size),
              },
            ];
          if (treatment === "track-matte" || treatment === "full-matte") {
            changed.layers.push({
              id: "reveal-matte",
              type: "solid",
              threeD: true,
              size: target.size,
              color: "#ffffff",
              transform: structuredClone(target.transform),
            });
            target.trackMatte = {
              layer: "reveal-matte",
              mode: treatment === "full-matte" ? "alpha" : "alpha-inverted",
            };
          }
          if (
            ["linear-wipe", "disabled-effect", "identity-effect"].includes(
              treatment,
            )
          )
            target.effects =
              treatment === "identity-effect"
                ? [
                    {
                      id: "identity",
                      effect: "color.tint",
                      params: { amount: 0 },
                    },
                  ]
                : [
                    {
                      id: "erase",
                      effect: "transition.linear-wipe",
                      enabled: treatment !== "disabled-effect",
                      params: { progress: 1 },
                    },
                  ];
          if (treatment.startsWith("ancestor-")) {
            target.parent = "reveal-group";
            const group: CompositionLayer = {
              id: "reveal-group",
              type: "group",
              size: treatment === "ancestor-clip" ? [1, 1] : [160, 120],
              transform: { anchor: [0, 0] },
            };
            if (["ancestor-mask", "ancestor-full-mask"].includes(treatment))
              group.masks = [
                {
                  id: "coverage",
                  mode: treatment === "ancestor-full-mask" ? "add" : "subtract",
                  path: fullPath(160, 120),
                },
              ];
            if (["ancestor-clip", "ancestor-full-clip"].includes(treatment))
              group.clip = true;
            if (treatment === "ancestor-full-matte") {
              changed.layers.push({
                id: "ancestor-matte",
                type: "solid",
                size: [160, 120],
                color: "#ffffff",
                transform: { anchor: [0, 0] },
              });
              group.trackMatte = { layer: "ancestor-matte", mode: "alpha" };
            }
            if (
              [
                "ancestor-effect",
                "ancestor-disabled-effect",
                "ancestor-identity-effect",
              ].includes(treatment)
            )
              group.effects =
                treatment === "ancestor-identity-effect"
                  ? [
                      {
                        id: "identity",
                        effect: "color.tint",
                        params: { amount: 0 },
                      },
                    ]
                  : [
                      {
                        id: "erase",
                        effect: "transition.linear-wipe",
                        enabled: treatment !== "ancestor-disabled-effect",
                        params: { progress: 1 },
                      },
                    ];
            changed.layers.splice(changed.layers.indexOf(target), 0, group);
          }
          if (
            treatment === "matte-source" ||
            treatment === "ancestor-matte-source"
          )
            changed.layers.unshift({
              id: "matte-consumer",
              type: "solid",
              size: [1, 1],
              color: "#ffffff",
              transform: { anchor: [0, 0], position: [-100, -100] },
              trackMatte: {
                layer: treatment === "matte-source" ? node : "reveal-group",
                mode: "alpha",
              },
            });
          cases.push({
            id: `${node}/${treatment}`,
            doc: validated(changed),
            valid: [
              "full-mask",
              "full-matte",
              "disabled-effect",
              "identity-effect",
              "ancestor-full-mask",
              "ancestor-full-matte",
              "ancestor-full-clip",
              "ancestor-disabled-effect",
              "ancestor-identity-effect",
            ].includes(treatment),
            node,
            ...(node === "subject" || treatment.endsWith("matte-source")
              ? { frame: 0 }
              : {}),
          });
        }
      }
      const later = structuredClone(doc);
      later.layers.find((layer) => layer.id === "subject")!.masks = [
        {
          id: "later-erase",
          mode: "subtract",
          path: {
            closed: true,
            vertices: [
              [0, 0],
              [80, 0],
              [80, 80],
              [0, 80],
            ],
          },
          opacity: {
            keys: [
              { frame: 0, value: 0, interpolation: "hold" },
              { frame: 1, value: 1 },
            ],
          },
        },
      ];
      cases.push({
        id: "subject/later-mask",
        doc: validated(later),
        valid: false,
        node: "subject",
        frame: 1,
      });
      // The source card covers 40%; its rendered mask leaves a valid 20% occlusion.
      const reduced = structuredClone(doc),
        reducedWall = reduced.layers.find((layer) => layer.id === "wall")!;
      if (reducedWall.type !== "image")
        throw Error("Fixture wall must be an image");
      reducedWall.size = [32, 80];
      reducedWall.transform = {
        anchor: [0, 0, 0],
        position: {
          x: {
            keys: [
              { frame: 0, value: 48, interpolation: "hold" },
              { frame: 1, value: 100 },
            ],
          },
          y: 0,
          z: 0,
        },
      };
      reducedWall.masks = [
        {
          id: "reduce-occlusion",
          mode: "subtract",
          path: {
            closed: true,
            vertices: [
              [16, 0],
              [32, 0],
              [32, 80],
              [16, 80],
            ],
          },
        },
      ];
      const reducedControl = structuredClone(reduced),
        controlWall = reducedControl.layers.find(
          (layer) => layer.id === "wall",
        )!;
      if (controlWall.type !== "image")
        throw Error("Fixture wall must be an image");
      controlWall.size = [16, 80];
      controlWall.masks = [];
      cases.push({
        id: "wall/mask-reduces-raw-occlusion",
        doc: validated(reduced),
        valid: true,
        node: "wall",
        controlDoc: validated(reducedControl),
      });
      const shutter = structuredClone(doc);
      shutter.motionBlur = {
        enabled: true,
        shutterAngle: 360,
        shutterPhase: 0,
        samples: 2,
      };
      for (const layer of shutter.layers)
        layer.motionBlur = layer.id === "subject";
      shutter.layers.find((layer) => layer.id === "subject")!.masks = [
        {
          id: "shutter-erase",
          mode: "subtract",
          path: {
            closed: true,
            vertices: [
              [0, 0],
              [80, 0],
              [80, 80],
              [0, 80],
            ],
          },
        },
      ];
      shutter.expressions = {
        "subject.masks[shutter-erase].opacity": {
          source: "step(0.1, abs(sin(frame * 6.283185307179586)))",
        },
      };
      cases.push({
        id: "subject/shutter-mask",
        doc: validated(shutter),
        valid: false,
        node: "subject",
        frame: 0,
      });
      const heldShutter = structuredClone(shutter);
      heldShutter.layers.find((layer) => layer.id === "subject")!.motionBlur =
        false;
      cases.push({
        id: "subject/held-shutter-mask",
        doc: validated(heldShutter),
        valid: true,
        node: "subject",
      });
      const shutterWall = structuredClone(doc);
      shutterWall.motionBlur = {
        enabled: true,
        shutterAngle: 360,
        shutterPhase: 0,
        samples: 2,
      };
      for (const layer of shutterWall.layers)
        layer.motionBlur = layer.id === "wall";
      shutterWall.layers.find((layer) => layer.id === "wall")!.transform = {
        anchor: [0, 0, 0],
        position: {
          x: {
            keys: [
              { frame: 0, value: 56 },
              { frame: 1, value: 100, interpolation: "hold" },
            ],
          },
          y: 0,
          z: 0,
        },
      };
      cases.push({
        id: "wall/shutter-settle",
        doc: validated(shutterWall),
        valid: false,
        node: "subject",
      });
      // Both walls disappear together. Their shared shutter leaves 25% occlusion,
      // matching one half-opacity foreground card rather than independent flicker.
      const correlated = structuredClone(shutterWall),
        firstWall = correlated.layers.find((layer) => layer.id === "wall")!;
      if (firstWall.type !== "image")
        throw Error("Fixture wall must be an image");
      firstWall.size = [40, 80];
      firstWall.transform = {
        anchor: [0, 0, 0],
        position: {
          x: {
            keys: [
              { frame: 0, value: 40, interpolation: "hold" },
              { frame: 1, value: 100, interpolation: "hold" },
            ],
          },
          y: 0,
          z: 0,
        },
      };
      firstWall.masks = [
        {
          id: "blink",
          mode: "subtract",
          path: {
            closed: true,
            vertices: [
              [0, 0],
              [40, 0],
              [40, 80],
              [0, 80],
            ],
          },
        },
      ];
      correlated.layers.splice(correlated.layers.indexOf(firstWall), 0, {
        ...structuredClone(firstWall),
        id: "wall-twin",
      });
      const blink = "step(0.1, abs(sin(frame * 6.283185307179586)))";
      correlated.expressions = {
        "wall.masks[blink].opacity": { source: blink },
        "wall-twin.masks[blink].opacity": { source: blink },
      };
      correlated.metadata!.cinematicCoverage = {
        background: "background",
        paintedBounds: [0, 0, 120, 120],
        reveal: {
          subject: "subject",
          occluders: ["wall", "wall-twin"],
          region: [
            [0, 0],
            [80, 0],
            [80, 80],
            [0, 80],
          ],
          settleFrame: 2,
        },
      };
      const correlatedControl = structuredClone(correlated);
      correlatedControl.layers = correlatedControl.layers.filter(
        (layer) => layer.id !== "wall-twin",
      );
      for (const layer of correlatedControl.layers) layer.motionBlur = false;
      const controlForeground = correlatedControl.layers.find(
        (layer) => layer.id === "wall",
      )!;
      controlForeground.masks = [];
      controlForeground.transform!.opacity = {
        keys: [
          { frame: 0, value: 0.5, interpolation: "hold" },
          { frame: 1, value: 0 },
        ],
      };
      delete correlatedControl.metadata;
      delete correlatedControl.expressions;
      cases.push({
        id: "wall/correlated-shutter-occluders",
        doc: validated(correlated),
        valid: true,
        node: "wall",
        controlDoc: validated(correlatedControl),
      });
      const sharedMask = structuredClone(correlated);
      delete sharedMask.motionBlur;
      delete sharedMask.expressions;
      for (const layer of sharedMask.layers) {
        layer.motionBlur = false;
        if (["wall", "wall-twin"].includes(layer.id)) {
          layer.parent = "shared-foreground";
          layer.masks = [];
        }
      }
      sharedMask.layers.splice(1, 0, {
        id: "shared-foreground",
        type: "group",
        size: [160, 120],
        transform: { anchor: [0, 0] },
        masks: [
          {
            id: "half-opacity",
            mode: "add",
            opacity: 0.5,
            path: {
              closed: true,
              vertices: [
                [0, 0],
                [160, 0],
                [160, 120],
                [0, 120],
              ],
            },
          },
        ],
      });
      cases.push({
        id: "wall/shared-ancestor-mask",
        doc: validated(sharedMask),
        valid: true,
        node: "wall",
        controlDoc: validated(correlatedControl),
      });
      for (const [id, position, valid] of [
        ["in-viewport-start-edge", -1.9, true],
        ["in-viewport-end-edge", 1.9, true],
        ["outside-start-edge", -2.1, false],
        ["outside-end-edge", 2.1, false],
      ] as const) {
        const edge = structuredClone(doc),
          subject = edge.layers.find((layer) => layer.id === "subject")!;
        subject.transform = {
          anchor: [0, 0, 0],
          position: [position, position, 0],
        };
        subject.masks = [
          {
            id: "full",
            mode: "add",
            path: {
              closed: true,
              vertices: [
                [0, 0],
                [80, 0],
                [80, 80],
                [0, 80],
              ],
            },
          },
        ];
        const edgeControl = structuredClone(edge);
        edgeControl.layers.find((layer) => layer.id === "subject")!.masks = [];
        cases.push({
          id: `subject/${id}`,
          doc: validated(edge),
          valid,
          node: "subject",
          frame: 0,
          ...(valid ? { controlDoc: validated(edgeControl) } : {}),
        });
      }
      const reports = [];
      for (const backend of backends) {
        const resources = await render.loadCompositionResources(
          doc,
          (id) => assetUrls[id]!,
        );
        if (!doc.assets.every((asset) => resources.pngImages?.has(asset.id)))
          throw Error(
            "Reveal acceptance requires SHA-verified decoded PNG assets",
          );
        const retained = render.createCompositionPreview(
          document.createElement("canvas"),
          doc,
          resources,
          { backend },
        );
        try {
          const control = new Map<number, Uint8ClampedArray>();
          for (const frame of [0, 1, 2]) {
            if (retained.renderFrame(frame).diagnostics.length)
              throw Error(`${backend}: untreated reveal produced diagnostics`);
            control.set(frame, retained.readPixels().slice());
          }
          const pixel = (frame: number, x: number, y: number) =>
            Array.from(
              control.get(frame)!.slice((y * 80 + x) * 4, (y * 80 + x) * 4 + 4),
            );
          if (
            String(pixel(0, 40, 40)) !== "64,208,128,255" ||
            String(pixel(0, 70, 40)) !== "208,64,64,255" ||
            String(pixel(1, 70, 40)) !== "64,208,128,255"
          )
            throw Error(
              `${backend}: control did not render the declared reveal`,
            );
          const treatments = [];
          for (const item of cases) {
            let preview:
              | ReturnType<typeof render.createCompositionPreview>
              | undefined;
            let reference:
              | ReturnType<typeof render.createCompositionPreview>
              | undefined;
            let diagnostics: ReturnType<typeof render.passageDiagnostics> = [];
            let maxValidDelta = 0;
            try {
              if (item.controlDoc)
                reference = render.createCompositionPreview(
                  document.createElement("canvas"),
                  item.controlDoc,
                  await render.loadCompositionResources(
                    item.controlDoc,
                    (id) => assetUrls[id]!,
                  ),
                  { backend },
                );
              preview = render.createCompositionPreview(
                document.createElement("canvas"),
                item.doc,
                await render.loadCompositionResources(
                  item.doc,
                  (id) => assetUrls[id]!,
                ),
                { backend, coverageSeverity: "warning" },
              );
              for (const frame of [0, 2, 1, 0]) {
                if (preview.renderFrame(frame).diagnostics.length)
                  throw Error(
                    `${backend}/${item.id}: unexpected render diagnostics`,
                  );
                if (reference?.renderFrame(frame).diagnostics.length)
                  throw Error(
                    `${backend}/${item.id}: control produced render diagnostics`,
                  );
                maxValidDelta = Math.max(
                  maxValidDelta,
                  render.compareFrames(
                    reference?.readPixels() ?? control.get(frame)!,
                    preview.readPixels(),
                    80,
                    80,
                  ).maxChannelDelta,
                );
              }
            } catch (error) {
              diagnostics = render.passageDiagnostics(error);
            } finally {
              preview?.dispose();
              reference?.dispose();
            }
            if (item.valid) {
              if (diagnostics.length || maxValidDelta !== 0)
                throw Error(
                  `${backend}/${item.id}: valid treatment changed reveal pixels (${maxValidDelta})`,
                );
            } else if (
              !diagnostics.some(
                (diagnostic) =>
                  diagnostic.code === "comp-camera-coverage" &&
                  diagnostic.severity === "error" &&
                  diagnostic.path === "metadata.cinematicCoverage" &&
                  diagnostic.node ===
                    (item.node === "subject" || item.id.endsWith("matte-source")
                      ? item.node
                      : "subject") &&
                  (item.frame === undefined || diagnostic.frame === item.frame),
              )
            )
              throw Error(
                `${backend}/${item.id}: invalid rendered reveal was accepted`,
              );
            retained.renderFrame(1);
            if (
              render.compareFrames(
                control.get(1)!,
                retained.readPixels(),
                80,
                80,
              ).maxChannelDelta !== 0
            )
              throw Error(
                `${backend}/${item.id}: failed preview changed retained reveal pixels`,
              );
            treatments.push({
              id: item.id,
              valid: item.valid,
              diagnostics,
              maxValidDelta,
            });
          }
          reports.push({
            backend,
            decodedPng: true,
            treatments,
            retainedPreviewDelta: 0,
          });
        } finally {
          retained.dispose();
        }
      }
      return { reports, doc, assetUrls, cases };
    },
    [...backends],
  );
}
