import type { CommerceScene, Composition } from "@still-shift/scene-contract";
import {
  createCompositionPreview,
  type CompositionResources,
} from "../../packages/renderer-core/src/composition/render/renderer.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

/** Extra inputs exercise the same full-frame parity loop without modifying CE0 fixtures. */
export function commerceTextVariants(id: string, source: CommerceScene) {
  const variants: { id: string; scene: CommerceScene }[] = [];
  if (id === "component/commerce-text-fit") {
    const scene = structuredClone(source);
    if (scene.componentData?.schemaVersion !== "scene-components-3")
      throw new Error("Expected relationship components");
    scene.textFits = scene.componentData.textFits.map((fit) => ({
      ...fit,
      padding: 24,
    }));
    scene.componentData.textFits = [];
    const node = scene.nodes.find((node) => node.id === "timing__caption")!;
    if (node.type !== "text") throw new Error("Expected caption");
    scene.componentData.states = scene.componentData.states.filter(
      (state) => state.target !== node.id,
    );
    node.align = "right";
    node.rotation = -7;
    node.states = [
      "รายละเอียดเล็กน้อยสำหรับทุกวัน",
      "ภาพเดิมในมุมมองที่แตกต่างกัน",
    ];
    node.text = node.states[0]!;
    variants.push({ id: `${id}/native-thai`, scene });
  }
  if (id === "component/commerce-value") {
    for (const rounding of ["half-away-from-zero", "truncate"] as const) {
      const scene = structuredClone(source);
      const data = scene.componentData!;
      const value = data.values[0]!;
      value.range = [-2000, 2000];
      value.from = -1234.01;
      value.to = -1233.98;
      const binding = data.bindings.find((binding) => binding.kind === "text")!;
      if (binding.kind !== "text") throw new Error("Expected numeric binding");
      binding.format = {
        decimals: 2,
        rounding,
        decimalSeparator: ",",
        groupSeparator: ".",
        prefix: "€",
        suffix: " total",
      };
      const node = scene.nodes.find((node) => node.id === binding.target)!;
      if (node.type !== "text") throw new Error("Expected numeric text");
      node.align = "center";
      node.parent = "subject-a";
      node.x = -200;
      node.y = 450;
      node.rotation = 5;
      variants.push({ id: `${id}/${rounding}`, scene });
    }
  }
  return variants;
}

/** Invalid exported payloads must fail during preparation, before any frame is drawn. */
export function assertCommerceTextPreparation(
  composition: Composition,
  resources: CompositionResources,
) {
  const index = composition.layers.findIndex(
    (layer) =>
      layer.type === "provider" && layer.provider === "commerce.text@1.1.0",
  );
  if (index < 0) return 0;
  type Provider = Extract<Composition["layers"][number], { type: "provider" }>;
  const reject = (mutate: (layer: Provider) => void, expected: string) => {
    const input = structuredClone(composition);
    mutate(input.layers[index] as Provider);
    let error: unknown;
    const canvas = document.createElement("canvas");
    try {
      createCompositionPreview(canvas, input, resources).dispose();
    } catch (caught) {
      error = caught;
    } finally {
      canvas.width = canvas.height = 0;
    }
    if (
      !error ||
      !passageDiagnostics(error).some(
        (d) => d.code === expected || d.message.includes(expected),
      )
    )
      throw new Error(
        `Expected preparation failure ${expected}: ${JSON.stringify(passageDiagnostics(error))}`,
      );
  };
  reject((layer) => {
    layer.assets = [];
  }, "comp-provider-asset");
  reject((layer) => {
    layer.provider = "commerce.text@1.0.0";
  }, "comp-provider-params");
  const layer = composition.layers[index] as Provider;
  if (layer.params.fit) {
    reject((layer) => {
      layer.params.fit = { minSize: 60, maxSize: 32 };
    }, "comp-provider-params");
    reject((layer) => {
      const node = layer.params.node as { width: number };
      node.width = 1;
    }, "Text cannot fit at minimum size");
  } else {
    reject((layer) => {
      const numeric = layer.params.numeric as { samples: string[] };
      numeric.samples = ["not a formatted value"];
    }, "comp-provider-params");
    reject((layer) => {
      // The unsampled endpoint must still overflow, as it does on the family path.
      const node = layer.params.node as {
        width: number;
        fontSize: number;
        fontAsset: string;
        textBox: { maxLines: number };
      };
      const font = resources.fonts.get(node.fontAsset)!;
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.font = `${font.weight} ${node.fontSize}px "${font.family}"`;
      const metrics = ctx.measureText("9");
      node.width =
        Math.max(
          metrics.width,
          metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
        ) + 0.1;
      node.textBox.maxLines = 1;
      layer.params.numeric = {
        value: {
          id: "overflow",
          range: [0, 10],
          from: 9,
          to: 10,
          window: { start: 0, end: 1, easing: "linear" },
        },
        format: {
          decimals: 0,
          rounding: "truncate",
          decimalSeparator: ".",
          groupSeparator: "",
          prefix: "",
          suffix: "",
        },
        samples: ["9"],
      };
    }, "text-overflow");
  }
  return 4;
}
