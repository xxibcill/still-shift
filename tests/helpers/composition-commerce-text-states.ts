import {
  PreparedNodeSchema,
  type CommerceScene,
  type Composition,
} from "../../packages/scene-contract/src/index.ts";
import {
  createCompositionPreview,
  type CompositionResources,
} from "../../packages/renderer-core/src/composition/render/renderer.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

export function assertCommerceTextStatePreparation(
  composition: Composition,
  resources: CompositionResources,
) {
  const index = composition.layers.findIndex(
    (layer) =>
      layer.type === "provider" && layer.provider === "commerce.text@1.2.0",
  );
  if (index < 0) return 0;
  type Provider = Extract<Composition["layers"][number], { type: "provider" }>;
  const mutations: ((layer: Provider) => void)[] = [
    (layer) => {
      layer.state = 99;
    },
    (layer) => {
      layer.stateFrom = 99;
      layer.stateMix = 0.5;
    },
    (layer) => {
      layer.params.blendWindows = [[20, 10]];
    },
    (layer) => {
      layer.params.animator = {
        node: "missing",
        unit: "word",
        start: 0,
        end: 20,
        stagger: 0,
        selector: { start: 0, end: 1 },
        from: {},
      };
    },
  ];
  for (const mutate of mutations) {
    const input = structuredClone(composition);
    mutate(input.layers[index] as Provider);
    const canvas = document.createElement("canvas");
    let diagnostics: ReturnType<typeof passageDiagnostics> = [];
    try {
      createCompositionPreview(canvas, input, resources).dispose();
    } catch (error) {
      diagnostics = passageDiagnostics(error);
    } finally {
      canvas.width = canvas.height = 0;
    }
    if (!diagnostics.some((d) => d.code === "comp-provider-params"))
      throw new Error(
        `Malformed animated text was accepted: ${JSON.stringify(diagnostics)}`,
      );
  }
  return mutations.length;
}

export function commerceTextStateVariants(id: string, source: CommerceScene) {
  if (id !== "commerce/atom-text") return [];
  return ["measured", "speech", "animated"].map((kind) => {
    const scene = structuredClone(source);
    scene.motionModel = "curves-1";
    const node = scene.nodes.find((node) => node.type === "text")!;
    if (node.type !== "text") throw new Error("Expected text");
    node.states = [node.text, "รายละเอียดเล็กน้อยสำหรับทุกวัน"];
    node.parent = "caption-parent";
    node.opacity = 0.65;
    node.rotation = 5;
    node.align = "center";
    scene.nodes.push(
      PreparedNodeSchema.parse({
        id: node.parent,
        type: "group",
        x: 13,
        y: -17,
        width: scene.width,
        height: scene.height,
        clip: true,
        rotation: -3,
        opacity: 0.7,
      }),
    );
    node.container = {
      kind: kind === "speech" ? "speech" : "caption",
      padding: 12,
      radius: 8,
      fill: "#dce1cf",
      stroke: "#234567",
      strokeWidth: 2,
    };
    scene.componentData = {
      schemaVersion: "scene-components-2",
      values: [],
      bindings: [],
      annotations: [],
      travels: [],
      states: [
        {
          id: "caption-state",
          target: node.id,
          initial: 0,
          cuts: [
            { id: "second", frame: 12, state: 1, ramp: 3 },
            { id: "first", frame: 30, state: 0, ramp: 2 },
            { id: "same", frame: 45, state: 0, ramp: 2 },
          ],
        },
      ],
    };
    if (kind === "animated") {
      scene.textAnimators = [
        {
          node: node.id,
          unit: "word",
          start: 0,
          end: 24,
          stagger: 2,
          selector: { start: 0, end: 1 },
          from: { opacity: 0, offset: [0, 12], rotation: -6, color: "#a8492c" },
        },
      ];
      scene.signals = [
        {
          id: "caption-pose",
          keys: [
            { frame: 0, value: 0 },
            { frame: 60, value: 1 },
          ],
        },
      ];
      scene.drivers = [
        {
          target: `${node.id}.skewX`,
          signal: "caption-pose",
          map: { scale: 12 },
        },
        {
          target: `${node.id}.skewY`,
          signal: "caption-pose",
          map: { scale: -7 },
        },
        {
          target: `${node.id}.anchorX`,
          signal: "caption-pose",
          map: { offset: 0.1, scale: 0.7 },
        },
        {
          target: `${node.id}.anchorY`,
          signal: "caption-pose",
          map: { offset: 0.2, scale: 0.3 },
        },
      ];
    }
    return { id: `${id}/${kind}-states`, scene };
  });
}
