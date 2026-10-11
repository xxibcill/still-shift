import { describe, expect, it } from "vitest";
import { MechanismNarratedCycleSchema } from "@still-shift/scene-contract";
import { compileMechanismNarratedCycle } from "../../packages/animation-engine/src/mechanism/narrated-cycle.ts";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";
import { prepareNative3DSceneV2 } from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import { narratedCycleFixture } from "../helpers/mechanism-narrated-cycle.ts";

function styled(
  family: "tape-hook" | "cable-tie" | "clothespeg",
  style: unknown,
  visibility?: unknown,
) {
  const fixture = narratedCycleFixture(family);
  return {
    ...fixture,
    document: {
      ...fixture.document,
      cues: fixture.document.cues.map((cue) => ({
        ...cue,
        annotations: cue.annotations.map((annotation) => ({
          ...annotation,
          style,
          ...(visibility ? { visibility } : {}),
        })),
      })),
    },
  };
}
function location(run: () => unknown) {
  try {
    run();
  } catch (error) {
    return (error as { location: unknown }).location;
  }
  throw Error("Expected located rejection");
}
describe("cue screen annotation recipes", () => {
  it("compiles all five styles for each family using native composition layers and unchanged recording/timeline", () => {
    for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
      const fixture = narratedCycleFixture(family);
      const styles = [
        { kind: "tab" },
        { kind: "open-callout" },
        { kind: "bracket", toAnchor: fixture.instance.scene.anchors[1]!.id },
        { kind: "arrow" },
        { kind: "highlight", sizePixels: [48, 32] },
      ];
      const legacy = compileMechanismNarratedCycle(
        fixture.instance,
        fixture.document,
      );
      for (const style of styles) {
        const input = styled(family, style);
        const result = compileMechanismNarratedCycle(
          input.instance,
          input.document,
        );
        expect(result.recording).toEqual(legacy.recording);
        expect(result.timeline).toEqual(legacy.timeline);
        expect(result.labelLayout).toEqual(legacy.labelLayout);
        const leader = result.composition.layers.find(
          (layer) =>
            layer.type === "shape" &&
            layer.metadata?.cue === "intro" &&
            layer.native3D?.role === "screen-anchor" &&
            layer.native3D.target.kind !== "visibility" &&
            layer.native3D.target.kind !== "position",
        )!;
        expect(leader.native3D).toMatchObject({
          role: "screen-anchor",
          visibilityPolicy: "hide-occluded",
          target: {
            kind:
              style.kind === "bracket"
                ? "path-vertices"
                : style.kind === "arrow"
                  ? "path-arrow"
                  : "path-endpoint",
          },
        });
        if (style.kind === "highlight")
          expect(
            result.composition.layers.some(
              (layer) =>
                layer.type === "shape" &&
                layer.native3D?.role === "screen-anchor" &&
                layer.native3D.target.kind === "position",
            ),
          ).toBe(true);
        expect(Object.isFrozen(result.composition)).toBe(true);
      }
    }
  });
  it("uses selected ink consistently for an arrow shaft and head", () => {
    for (const ink of ["#101820", "#d04020"]) {
      const input = styled("tape-hook", { kind: "arrow", ink });
      const result = compileMechanismNarratedCycle(
        input.instance,
        input.document,
      );
      const arrow = result.composition.layers.find(
        (layer) =>
          layer.type === "shape" &&
          layer.native3D?.role === "screen-anchor" &&
          layer.native3D.target.kind === "path-arrow",
      );
      expect(arrow?.type).toBe("shape");
      if (arrow?.type !== "shape") throw Error("Missing arrow");
      expect(
        arrow.contents.find((content) => content.type === "stroke"),
      ).toMatchObject({ color: ink });
      expect(
        arrow.contents.find((content) => content.type === "fill"),
      ).toMatchObject({ color: ink });
    }
  });
  it("retains exact legacy composition when tab is explicitly selected", () => {
    const fixture = narratedCycleFixture();
    const input = styled("tape-hook", { kind: "tab" });
    expect(
      compileMechanismNarratedCycle(input.instance, input.document).composition,
    ).toEqual(
      compileMechanismNarratedCycle(fixture.instance, fixture.document)
        .composition,
    );
  });
  it("authors explicit offscreen-only policy for the whole arrow label and preserves locks", () => {
    const input = styled(
      "tape-hook",
      { kind: "arrow" },
      {
        policy: "offscreen-indicator",
        visibleWhen: "indicator",
        insetPixels: 24,
      },
    );
    const result = compileMechanismNarratedCycle(
      input.instance,
      input.document,
    );
    const annotations = result.composition.layers.filter(
      (layer) => layer.metadata?.cue === "intro" && layer.native3D,
    );
    expect(annotations).toHaveLength(3);
    for (const layer of annotations)
      expect(layer.native3D).toMatchObject({
        visibilityPolicy: "offscreen-indicator",
        visibleWhen: "indicator",
        insetPixels: 24,
      });
    expect(result.labelLayout[0]!.placements[0]!.locked).toBe(true);
  });
  it("rejects unknown secondary bracket references at the cue authoring field", () => {
    const input = styled("tape-hook", { kind: "bracket", toAnchor: "missing" });
    expect(
      location(() =>
        compileMechanismNarratedCycle(input.instance, input.document),
      ),
    ).toMatchObject({
      code: "mechanism-cue-anchor",
      path: ["cues", 0, "annotations", 0, "style", "toAnchor"],
    });
  });
  it("bounds geometry dimensions and rejects styles or policies that silently discard fields", () => {
    const fixture = narratedCycleFixture();
    for (const style of [
      { kind: "unknown" },
      { kind: "arrow", headLengthPixels: 257 },
      { kind: "bracket", toAnchor: "hook.outerFace", tickPixels: 0 },
      { kind: "highlight", sizePixels: [513, 32] },
      { kind: "tab", ignored: true },
    ]) {
      const input = styled("tape-hook", style);
      expect(
        MechanismNarratedCycleSchema.safeParse(input.document).success,
      ).toBe(false);
    }
    const input = styled(
      "tape-hook",
      { kind: "tab" },
      { policy: "hide-occluded", visibleWhen: "indicator" },
    );
    expect(MechanismNarratedCycleSchema.safeParse(input.document).success).toBe(
      false,
    );
    expect(
      MechanismNarratedCycleSchema.safeParse(fixture.document).success,
    ).toBe(true);
  });
  it("rejects highlights larger than the viewport and indicator insets that cut the outline", () => {
    for (const [style, visibility, path] of [
      [
        { kind: "highlight", sizePixels: [320, 32] },
        undefined,
        ["cues", 0, "annotations", 0, "style", "sizePixels"],
      ],
      [
        { kind: "highlight", sizePixels: [48, 32] },
        { policy: "offscreen-indicator", insetPixels: 12 },
        ["cues", 0, "annotations", 0, "visibility", "insetPixels"],
      ],
    ] as const) {
      const input = styled("tape-hook", style, visibility);
      expect(
        location(() =>
          compileMechanismNarratedCycle(input.instance, input.document),
        ),
      ).toMatchObject({ code: "mechanism-cue-layout", path });
    }
  });
  it("hides a bracket and its label/backing when only its secondary anchor is behind the camera", async () => {
    const fixture = narratedCycleFixture();
    const scene = structuredClone(fixture.instance.scene);
    scene.camera = {
      ...scene.camera,
      position: [0, 0, 10],
      target: [0, 0, 0],
      near: 0.1,
      far: 100,
    };
    scene.anchors.push(
      {
        id: "test-front",
        role: "proof-target",
        source: { kind: "part-local", part: "mount", position: [0, 0, 5] },
      },
      {
        id: "test-behind",
        role: "proof-target",
        source: { kind: "part-local", part: "mount", position: [0, 0, 20] },
      },
    );
    const instance = {
      ...fixture.instance,
      scene,
      sourceSha256: mechanismPackHash(scene),
    };
    const document = {
      ...fixture.document,
      cues: fixture.document.cues.map((cue) => ({
        ...cue,
        annotations: [
          {
            ...cue.annotations[0]!,
            anchor: "test-front",
            style: { kind: "bracket", toAnchor: "test-behind" },
          },
        ],
      })),
    };
    const compiled = compileMechanismNarratedCycle(instance, document);
    const prepared = await prepareNative3DSceneV2(
      scene,
      document.source.sha256,
    );
    const states = evaluateComp(compiled.composition, 0, {
      preparedNative3D: { [document.source.id]: prepared },
    }).layers;
    const world = states.find((state) => state.layer.type === "native3d")!;
    expect(world.nativeFrame!.anchors["test-front"]!.visibility).toBe(
      "visible",
    );
    expect(world.nativeFrame!.anchors["test-behind"]!.visibility).toBe(
      "behind-camera",
    );
    const bound = states.filter(
      (state) =>
        state.layer.metadata?.cue === "intro" &&
        (state.layer.parent || state.layer.native3D),
    );
    expect(bound).toHaveLength(4);
    expect(bound.every((state) => !state.visible)).toBe(true);
    const label = bound.find((state) => state.layer.type === "text")!;
    expect([label.screenMatrix[4], label.screenMatrix[5]]).toEqual(
      document.cues[0]!.annotations[0]!.position,
    );
  });
});
