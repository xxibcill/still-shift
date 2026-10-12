import { describe, expect, it } from "vitest";
import { CompositionSchema } from "../../packages/scene-contract/src/composition/composition.ts";
import { native3DEditDiagnostics } from "../../packages/scene-contract/src/composition/native3d-edit.ts";
import { CompositionDocument } from "../../apps/lab/src/composition-document.ts";
import { editableDocument } from "../../tools/still-shift-cli/src/composition/save.ts";
import { nativeFixtureHash } from "../helpers/native3d-fixture.ts";

function source() {
  return CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "edited",
    width: 320,
    height: 180,
    fps: 30,
    frameCount: 30,
    assets: [
      {
        id: "source-a",
        type: "native3d",
        format: "solid-scene-1",
        path: "solid.json",
        sha256: nativeFixtureHash,
      },
    ],
    layers: [
      { id: "group-a", type: "group", size: [320, 180] },
      { id: "group-b", type: "group", size: [320, 180] },
      {
        id: "world-a",
        type: "native3d",
        asset: "source-a",
        parent: "group-a",
        sourceStartFrame: 0,
        sourceFps: 30,
        inPoint: 0,
        outPoint: 30,
      },
      {
        id: "label-a",
        type: "null",
        overlayAfter: "world-a",
        native3D: {
          role: "screen-anchor",
          sceneLayer: "world-a",
          anchor: "face.inner",
          visibilityPolicy: "hide-occluded",
          target: { kind: "position" },
          offsetPixels: [0, 0],
        },
      },
    ],
  });
}
describe("authored native source topology guard", () => {
  it("blocks physical source, parent and anchor substitutions before trusted rebinding", () => {
    const base = source();
    for (const edit of [
      (draft: typeof base) => {
        draft.layers[2]!.parent = "group-b";
      },
      (draft: typeof base) => {
        draft.layers[2]!.id = "world-b";
      },
      (draft: typeof base) => {
        draft.assets[0]!.sha256 = `sha256:${"b".repeat(64)}`;
      },
      (draft: typeof base) => {
        const binding = draft.layers[3]!.native3D!;
        if (binding.role === "screen-anchor") binding.anchor = "behind";
      },
      (draft: typeof base) => {
        draft.layers.splice(2, 1);
      },
    ]) {
      const draft = structuredClone(base);
      edit(draft);
      expect(native3DEditDiagnostics(base, draft).length).toBeGreaterThan(0);
      expect(() => editableDocument(draft, base)).toThrow();
    }
  });
  it("admits part appearance and label layout edits with literal dotted identities", () => {
    const base = source(),
      draft = structuredClone(base);
    const controller = draft.layers[2]!;
    if (controller.type === "native3d")
      controller.partOverrides = { root: { visible: false } };
    const binding = draft.layers[3]!.native3D!;
    if (binding.role === "screen-anchor") binding.offsetPixels = [30, 20];
    expect(native3DEditDiagnostics(base, draft)).toEqual([]);
    expect(editableDocument(draft, base)).toEqual(draft);
  });
  it("guards the retained authored base after bounded history evicts its first entry", () => {
    const history = new CompositionDocument(source(), { entries: 2 });
    for (const offset of [1, 2, 3])
      history.commit(
        history.propose(`Move ${offset}`, (draft) => {
          const binding = draft.layers[3]!.native3D!;
          if (binding.role === "screen-anchor")
            binding.offsetPixels = [offset, 0];
        })!,
      );
    const retained = history.document;
    expect(() =>
      history.propose("Redirect physical source", (draft) => {
        draft.layers[2]!.parent = "group-b";
      }),
    ).toThrow(/comp-native3d-topology/);
    expect(history.document).toBe(retained);
  });
  it("protects precomp references that introduce native controllers", () => {
    const base = source();
    base.precomps = [
      {
        id: "nested-a",
        width: 320,
        height: 180,
        fps: 30,
        frameCount: 30,
        layers: base.layers,
      },
    ];
    base.layers = [
      {
        id: "instance",
        type: "precomp",
        comp: "nested-a",
      } as (typeof base.layers)[number],
    ];
    const draft = structuredClone(base);
    if (draft.layers[0]!.type === "precomp") draft.layers[0]!.comp = "nested-b";
    expect(
      native3DEditDiagnostics(base, draft).map((item) => item.path),
    ).toContain("layers[0].comp");
  });
});
