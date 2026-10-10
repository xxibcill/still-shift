import { describe, expect, it, afterEach, vi } from "vitest";
import {
  CompositionSchema,
  type CompositionLayer,
} from "../../packages/scene-contract/src/composition/index.ts";
import { prepareNative3DScene } from "../../packages/renderer-core/src/native3d/prepare.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import { compositionPreviewEvaluation } from "../../apps/lab/src/composition-preview-evaluation.ts";
import { createCompositionOverlay } from "../../apps/lab/src/composition-overlay.ts";
import {
  nativeInspectorContext,
  editNativeInspector,
} from "../../apps/lab/src/composition-native-edit.ts";
import {
  CompositionDocument,
  CompositionEditError,
} from "../../apps/lab/src/composition-document.ts";
import {
  nativeSolidFixture,
  nativeFixtureHash,
} from "../helpers/native3d-fixture.ts";

const layers: CompositionLayer[] = [
  {
    id: "world",
    type: "native3d",
    asset: "solid",
    sourceStartFrame: 0,
    sourceFps: 30,
    cameraKeys: [
      {
        frame: 0,
        position: [0, 0, 10],
        target: [0, 0, 0],
        fovDegrees: 60,
        easing: "hold",
      },
      {
        frame: 7,
        position: [0, 0, 10],
        target: [0, 0, 0],
        fovDegrees: 65,
        easing: "hold",
      },
    ],
  },
  {
    id: "annotation",
    type: "group",
    size: [40, 20],
    overlayAfter: "world",
    native3D: {
      role: "screen-anchor",
      sceneLayer: "world",
      anchor: "face",
      visibilityPolicy: "hide-occluded",
      target: { kind: "position" },
    },
  },
  {
    id: "copy",
    type: "text",
    parent: "annotation",
    text: "PULL",
    font: "sans-serif",
    fontSize: 12,
    color: "#ffffff",
    align: "left",
    transform: { position: [10, 10] },
  },
];
function document() {
  return CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "inspector",
    width: 320,
    height: 180,
    fps: 30,
    frameCount: 8,
    assets: [
      {
        id: "solid",
        type: "native3d",
        path: "solid.json",
        sha256: nativeFixtureHash,
        format: "solid-scene-1",
      },
    ],
    layers,
  });
}
async function ready(source = nativeSolidFixture()) {
  return { solid: await prepareNative3DScene(source, nativeFixtureHash) };
}
afterEach(() => vi.unstubAllGlobals());
describe("Lab native context and physical edits", () => {
  it("carries the actual immutable lookup and current measured bounds into evaluation and state QA without persisting them", async () => {
    const comp = document(),
      prepared = await ready(),
      textBounds = { copy: [{ left: 0, top: 0, right: 40, bottom: 12 }] },
      options = compositionPreviewEvaluation({
        evaluationOptions: { preparedNative3D: prepared, includeGuides: true },
        textBounds,
      });
    expect(options.preparedNative3D).toBe(prepared);
    expect(options.textBounds).toBe(textBounds);
    expect(
      evaluateComp(comp, 4.25, options).layers[0]!.nativeFrame!.sourceFrame,
    ).toBe(4.25);
    expect(() =>
      analyzeCompositionQuality(comp, { evaluation: options }),
    ).not.toThrow();
    expect(JSON.stringify(comp)).not.toContain("prepared-native3d");
    expect(compositionPreviewEvaluation(undefined)).toEqual({});
  });
  it("inspects declared IDs and effective metadata through a bound label's parent in its owning scope", async () => {
    const comp = document(),
      prepared = await ready(),
      context = nativeInspectorContext(comp, ["layers", 2], {
        preparedNative3D: prepared,
      })!;
    expect(context.controller.id).toBe("world");
    expect(context.controllerPath).toEqual(["layers", 0]);
    expect(context.variant.source.parts.map((part) => part.id)).toEqual([
      "root",
      "child",
    ]);
    expect(context.variant.source.anchors.map((anchor) => anchor.id)).toContain(
      "face",
    );
    expect(
      context.variant.source.geometry.materials.map((material) => material.id),
    ).toEqual(["paint"]);
    const nested = structuredClone(comp);
    nested.precomps = [
      {
        id: "nested",
        width: 320,
        height: 180,
        fps: 30,
        frameCount: 8,
        layers: nested.layers,
      },
    ];
    nested.layers = [
      { id: "instance", type: "precomp", comp: "nested" } as CompositionLayer,
    ];
    expect(
      nativeInspectorContext(nested, ["precomps", 0, "layers", 2], {
        preparedNative3D: prepared,
      })!.scope,
    ).toBe("nested");
    expect(
      nativeInspectorContext(nested, ["precomps", 0, "layers", 2], {
        preparedNative3D: prepared,
      })!.controllerPath,
    ).toEqual(["precomps", 0, "layers", 0]);
  });
  it("edits an exact camera key or base FOV without silently rewriting other camera samples", async () => {
    const comp = document(),
      prepared = await ready(),
      before = structuredClone(comp.layers[0]!);
    editNativeInspector(
      comp,
      ["layers", 0],
      { preparedNative3D: prepared },
      { kind: "camera-fov", key: 0, value: 58 },
    );
    const controller = comp.layers[0]!;
    if (controller.type !== "native3d" || before.type !== "native3d")
      throw Error("controller");
    expect(controller.cameraKeys![0]!.fovDegrees).toBe(58);
    expect(controller.cameraKeys![1]).toEqual(before.cameraKeys![1]);
    editNativeInspector(
      comp,
      ["layers", 0],
      { preparedNative3D: prepared },
      { kind: "camera-fov", key: "base", value: 57 },
    );
    expect(controller.camera!.position).toEqual(
      prepared.solid.source.camera.position,
    );
    expect(controller.camera!.fovDegrees).toBe(57);
    expect(controller.cameraKeys![0]!.fovDegrees).toBe(58);
  });
  it("retains part rotation, scale, pivot and local visibility while authoring a translation override", async () => {
    const source = nativeSolidFixture();
    source.parts[0]!.transform.rotation = [0, 0, 0.2];
    source.parts[0]!.transform.scale = [2, 1, 1];
    source.parts[0]!.transform.pivot = [0.3, 0, 0];
    const comp = document(),
      prepared = await ready(source),
      controller = comp.layers[0]!;
    if (controller.type !== "native3d") throw Error("controller");
    editNativeInspector(
      comp,
      ["layers", 0],
      { preparedNative3D: prepared },
      { kind: "part-translation", part: "root", position: [0.25, 0, 0] },
    );
    expect(controller.partOverrides!.root!.transform).toEqual({
      ...source.parts[0]!.transform,
      position: [0.25, 0, 0],
    });
    expect(prepared.solid.source.parts[0]!.transform.position).toEqual([
      0, 0, 0,
    ]);
    expect(prepared.solid.source.geometry.meshes).toBe(
      prepared.solid.variants[prepared.solid.baseSourceKey]!.source.geometry
        .meshes,
    );
  });
  it("edits current PBR and inherited native label copy through ordinary immutable proposals", async () => {
    const prepared = await ready(),
      history = new CompositionDocument(document());
    const material = history.propose("Material", (draft) =>
      editNativeInspector(
        draft,
        ["layers", 0],
        { preparedNative3D: prepared },
        {
          kind: "material-pbr",
          material: "paint",
          metalness: 0.7,
          roughness: 0.2,
        },
      ),
    )!;
    expect(history.document.layers[0]).not.toHaveProperty("materialOverrides");
    history.commit(material);
    expect(history.document.layers[0]).toMatchObject({
      materialOverrides: { paint: { metalness: 0.7, roughness: 0.2 } },
    });
    const refreshed = {
      solid: await prepareNative3DScene(
        nativeSolidFixture(),
        nativeFixtureHash,
        {
          variants: [
            {
              materialOverrides: { paint: { metalness: 0.7, roughness: 0.2 } },
            },
          ],
        },
      ),
    };
    const label = history.propose("Label", (draft) =>
      editNativeInspector(
        draft,
        ["layers", 2],
        { preparedNative3D: refreshed },
        { kind: "label-text", state: "base", text: "PULL AGAIN" },
      ),
    )!;
    history.commit(label);
    expect(history.document.layers[2]).toMatchObject({
      text: "PULL AGAIN",
      parent: "annotation",
    });
    expect(history.document.assets).toEqual(document().assets);
    history.markSaved();
    expect(history.dirty).toBe(false);
  });
  it("edits the declared visible label state while preserving base, other states and state timing", async () => {
    const comp = document(),
      prepared = await ready(),
      label = comp.layers[2]!;
    if (label.type !== "text") throw Error("label");
    label.states = [" ", "PULL"];
    label.state = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 3, value: 1 },
      ],
    };
    const before = structuredClone(label.state);
    expect(
      evaluateComp(comp, 4, { preparedNative3D: prepared }).layers[2]!.state,
    ).toBe(1);
    editNativeInspector(
      comp,
      ["layers", 2],
      { preparedNative3D: prepared },
      { kind: "label-text", state: 1, text: "PULL AGAIN" },
    );
    expect(label.text).toBe("PULL");
    expect(label.states).toEqual([" ", "PULL AGAIN"]);
    expect(label.state).toEqual(before);
    expect(() =>
      editNativeInspector(
        comp,
        ["layers", 2],
        { preparedNative3D: prepared },
        { kind: "label-text", state: 2, text: "wrong" },
      ),
    ).toThrow(/layers.2.states.2/);
  });
  it("fails closed with exact located fields for missing readiness, undeclared IDs and invalid physical bounds", async () => {
    const prepared = await ready();
    expect(() => nativeInspectorContext(document(), ["layers", 0], {})).toThrow(
      /comp-native3d-not-ready layers.0/,
    );
    const cases = [
      [
        { kind: "camera-fov", key: 8, value: 50 },
        "layers.0.cameraKeys.8.fovDegrees",
      ],
      [
        { kind: "part-translation", part: "wrong", position: [0, 0, 0] },
        "layers.0.partOverrides.wrong.transform.position",
      ],
      [
        {
          kind: "part-translation",
          part: "root",
          position: [Number.NaN, 0, 0],
        },
        "layers.0.partOverrides.root.transform.position",
      ],
      [
        {
          kind: "material-pbr",
          material: "wrong",
          metalness: 0.5,
          roughness: 0.5,
        },
        "layers.0.materialOverrides.wrong",
      ],
      [
        {
          kind: "material-pbr",
          material: "paint",
          metalness: 2,
          roughness: 0.5,
        },
        "layers.0.materialOverrides.paint.metalness",
      ],
    ] as const;
    for (const [edit, path] of cases) {
      try {
        editNativeInspector(
          document(),
          ["layers", 0],
          { preparedNative3D: prepared },
          edit as Parameters<typeof editNativeInspector>[3],
        );
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(CompositionEditError);
        expect((error as CompositionEditError).diagnostics[0]!.path).toBe(path);
      }
    }
  });
  it("keeps native readiness through cached overlay redraws and refreshes motion paths when the catalogue changes", async () => {
    class Element {
      children: Element[] = [];
      attrs = new Map<string, string>();
      checked = false;
      onchange?: () => void;
      setAttribute(key: string, value: string) {
        this.attrs.set(key, value);
      }
      replaceChildren() {
        this.children = [];
      }
      append(value: Element) {
        this.children.push(value);
      }
    }
    const nodes = Object.fromEntries(
      [
        "composition-overlay",
        "overlay-bounds",
        "overlay-paths",
        "overlay-safe",
      ].map((id) => [id, new Element()]),
    );
    nodes["overlay-bounds"]!.checked = true;
    nodes["overlay-paths"]!.checked = true;
    vi.stubGlobal("document", {
      getElementById: (id: string) => nodes[id],
      createElementNS: () => new Element(),
    });
    const comp = document(),
      prepared = await ready(),
      overlay = createCompositionOverlay();
    overlay.select({ scope: null, layer: "copy", path: ["layers", 2] });
    overlay.draw(
      comp,
      0,
      compositionPreviewEvaluation({
        evaluationOptions: { preparedNative3D: prepared },
        textBounds: {},
      }),
    );
    expect(() => nodes["overlay-safe"]!.onchange!()).not.toThrow();
    const before = nodes["composition-overlay"]!.children.find(
      (node) => node.attrs.get("data-overlay") === "motion-path",
    )!.attrs.get("points");
    const source = nativeSolidFixture();
    source.parts[0]!.transform.position[0] = 1;
    const changed = await ready(source);
    expect(() =>
      overlay.draw(comp, 0, { preparedNative3D: changed }),
    ).not.toThrow();
    const after = nodes["composition-overlay"]!.children.find(
      (node) => node.attrs.get("data-overlay") === "motion-path",
    )!.attrs.get("points");
    expect(after).not.toEqual(before);
  });
});
