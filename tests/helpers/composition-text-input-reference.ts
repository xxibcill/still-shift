import {
  createCompositionPreview,
  loadCompositionResources,
  registerCompositionEffect,
} from "../../packages/renderer-core/src/index.ts";
import {
  defineCompositionEffect,
  type Composition,
  type CompositionLayer,
} from "../../packages/scene-contract/src/index.ts";

/** Hidden animated sources must prepare exactly the glyph clocks they draw. */
export async function checkAnimatedTextInputRendering() {
  const release = registerCompositionEffect({
    id: "test.animated-text-input",
    definition: defineCompositionEffect({
      version: "1.0.0",
      properties: {},
      requiresLayers: ["map"],
    }),
    renderGpu: (context) => context.layers.get("map")!,
    renderCanvas: (context) => context.layers!.get("map")!,
  });
  const rows = [];
  try {
    for (const source of ["text", "group", "precomp"] as const) {
      const label: CompositionLayer = {
        id: "map",
        type: "text",
        text: "Aa",
        fontSize: 32,
        fontAsset: "font",
        color: "#ffffff",
        transform: { anchor: [0, 0], position: [4, 4] },
      };
      const animator = {
        node: "map",
        unit: "glyph" as const,
        start: 0,
        end: 11,
        stagger: 0,
        selector: { start: 0, end: 1 },
        from: { strokeWidth: 1 },
        to: { strokeWidth: 5 },
      };
      const comp: Composition = {
        schemaVersion: "composition-1",
        id: "animated-text-input",
        width: 96,
        height: 64,
        fps: 24,
        frameCount: 12,
        background: "#000000",
        assets: [
          {
            id: "font",
            type: "font",
            path: "/assets/story-motion/fonts/plex-sans-medium.ttf",
            sha256:
              "sha256:331c8639d7598b2cde62a911a71db195e30cb655cd6bdf2e324a7e984955f907",
            weight: "500",
          },
        ],
        layers: [
          {
            id: "owner",
            type: "solid",
            size: [96, 64],
            color: "#ffffff",
            transform: { anchor: [0, 0] },
            effects: [
              {
                id: "input",
                effect: "test.animated-text-input",
                inputs: { map: "map" },
              },
            ],
          },
        ],
      };
      if (source === "precomp") {
        comp.layers.push({
          id: "map",
          type: "precomp",
          comp: "child",
          enabled: false,
          timeRemap: 4,
          transform: { anchor: [0, 0] },
        });
        comp.precomps = [
          {
            id: "child",
            width: 96,
            height: 64,
            frameCount: 12,
            layers: [label],
            textAnimators: [animator],
          },
        ];
      } else {
        if (source === "group") {
          label.id = "label";
          label.parent = "map";
          animator.node = "label";
          comp.layers.push({
            id: "map",
            type: "group",
            enabled: false,
            size: [96, 64],
            transform: { anchor: [0, 0] },
          });
        } else label.enabled = false;
        comp.layers.push(label);
        comp.textAnimators = [animator];
      }
      const control = structuredClone(comp);
      control.layers.shift();
      control.layers.find((layer) => layer.id === "map")!.enabled = true;
      const resources = await loadCompositionResources(
        comp,
        () => comp.assets[0]!.path,
      );
      for (const backend of ["canvas2d", "webgl2"] as const) {
        const hidden = createCompositionPreview(
          document.createElement("canvas"),
          comp,
          resources,
          { backend },
        );
        const visible = createCompositionPreview(
          document.createElement("canvas"),
          control,
          resources,
          { backend },
        );
        let maxDelta = 0;
        try {
          for (const frame of [4, 8, 1, 4]) {
            hidden.renderFrame(frame);
            visible.renderFrame(frame);
            const actual = hidden.readPixels(),
              expected = visible.readPixels();
            for (let i = 0; i < actual.length; i++)
              maxDelta = Math.max(
                maxDelta,
                Math.abs(actual[i]! - expected[i]!),
              );
          }
          if (maxDelta > 1)
            throw Error(
              `Animated ${source}/${backend} input differs from visible source: ${maxDelta}`,
            );
          rows.push({ source, backend, frames: 4, maxDelta });
        } finally {
          hidden.dispose();
          visible.dispose();
        }
      }
    }
    return rows;
  } finally {
    release();
  }
}
