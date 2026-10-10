import { describe, expect, it } from "vitest";
import { Group, PerspectiveCamera, Scene } from "three";
import {
  CompositionSchema,
  MechanismEpisodeSchema,
  type Composition,
  type NativeObservedOutputFrame,
} from "@still-shift/scene-contract";
import { createNativeMechanismOverlayChecker } from "../../packages/animation-engine/src/mechanism/native-overlays.ts";
import { mechanismOverlayLayerId } from "../../packages/animation-engine/src/mechanism/overlays.ts";
import {
  prepareNative3DScene,
  resolveNative3DVariant,
} from "../../packages/renderer-core/src/native3d/prepare.ts";
import { evaluateCompositionExposure } from "../../packages/renderer-core/src/composition/evaluate/exposure.ts";
import {
  compositionQualityFrame,
  compositionQualityTree,
} from "../../packages/renderer-core/src/composition/quality-samples.ts";
import { observeNativeThreeWorld } from "../../packages/renderer-core/src/native3d/three-observation.ts";
import {
  nativeSolidFixture,
  nativeFixtureHash,
} from "../helpers/native3d-fixture.ts";

const layerId = (kind: Parameters<typeof mechanismOverlayLayerId>[0]) =>
  mechanismOverlayLayerId(kind, "label");
const controllerId = mechanismOverlayLayerId("plate", "shot");
const textBounds = {
  [layerId("label")]: [
    { left: -20, top: 0, right: 20, bottom: 10 },
    { left: -20, top: 0, right: 20, bottom: 10 },
  ],
  [layerId("qualification")]: [{ left: -20, top: 0, right: 20, bottom: 10 }],
};
async function fixture(anchor = "face", indicator = false) {
  const source = nativeSolidFixture(),
    table = { source: await prepareNative3DScene(source, nativeFixtureHash) };
  const episode = MechanismEpisodeSchema.parse({
    schemaVersion: "mechanism-episode-1",
    id: "episode",
    revision: 0,
    scene: "source",
    font: "font",
    output: { width: 320, height: 180, fps: 30, frameCount: 40 },
    dependencies: [
      {
        id: "source",
        type: "scene",
        path: "source.json",
        sha256: nativeFixtureHash,
      },
      {
        id: "font",
        type: "font",
        path: "font.ttf",
        sha256: nativeFixtureHash,
        weight: "600",
      },
    ],
    shots: [
      {
        id: "shot",
        purpose: "CPU current binding fixture",
        startFrame: 0,
        endFrameExclusive: 40,
        labels: [
          {
            id: "label",
            role: "SLIDES",
            text: "SLIDES",
            qualification: "complete",
            anchor,
            position: [60, 20],
            readingInterval: { startFrame: 0, endFrameExclusive: 40 },
            visibilityPolicy: indicator
              ? "offscreen-indicator"
              : "hide-occluded",
          },
        ],
      },
    ],
    captions: [],
  });
  const binding = {
    role: "screen-anchor",
    sceneLayer: controllerId,
    anchor,
    visibilityPolicy: indicator ? "offscreen-indicator" : "hide-occluded",
  };
  const composition = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "evidence",
    width: 320,
    height: 180,
    fps: 30,
    frameCount: 40,
    assets: [
      {
        id: "source",
        type: "native3d",
        path: "source.json",
        sha256: nativeFixtureHash,
        format: "solid-scene-1",
      },
      {
        id: "font",
        type: "font",
        path: "font.ttf",
        sha256: nativeFixtureHash,
        weight: "600",
      },
    ],
    layers: [
      {
        id: controllerId,
        type: "native3d",
        asset: "source",
        sourceFps: 30,
        sourceStartFrame: 0,
      },
      {
        id: layerId("annotation"),
        type: "group",
        size: [320, 180],
        transform: { anchor: [0, 0] },
        overlayAfter: controllerId,
        native3D: { ...binding, target: { kind: "visibility" } },
      },
      {
        id: layerId("leader"),
        type: "shape",
        parent: layerId("annotation"),
        native3D: {
          ...binding,
          target: {
            kind: "path-endpoint",
            contentId: "path",
            endpoint: "last",
          },
        },
        contents: [
          {
            id: "path",
            type: "path",
            path: {
              closed: false,
              vertices: [
                [60, 80],
                [60, 80],
              ],
            },
          },
          { id: "stroke", type: "stroke", color: "#ffffff", width: 2 },
        ],
      },
      {
        id: layerId("label"),
        type: "text",
        parent: layerId("annotation"),
        text: "SLIDES",
        fontAsset: "font",
        fontSize: 20,
        color: "#ffffff",
        transform: { anchor: [0, 0], position: [60, 20] },
      },
      {
        id: layerId("qualification"),
        type: "text",
        parent: layerId("annotation"),
        text: "complete",
        fontAsset: "font",
        fontSize: 16,
        color: "#ffffff",
        transform: { anchor: [0, 0], position: [60, 45] },
      },
    ],
  });
  /** Actual CPU Object3D/camera observations; no GPU or encoded readability claim. */
  const packet = (frame: number): NativeObservedOutputFrame => ({
    version: "native3d-observed-output-frame-1",
    outputFrame: frame,
    executionSha256: nativeFixtureHash,
    passes: [
      ...evaluateCompositionExposure(composition, frame, {
        preparedNative3D: table,
        nativeObservationRequired: true,
      }),
    ].map((tree, sampleIndex) => {
      const snapshot = tree.layers.find(
          (state) => state.id === controllerId,
        )!.nativeFrame!,
        effective = resolveNative3DVariant(table, snapshot).source;
      const world = new Scene(),
        parts = new Map(effective.parts.map((part) => [part.id, new Group()]));
      for (const definition of effective.parts) {
        const object = parts.get(definition.id)!;
        object.name = definition.id;
        object.matrixAutoUpdate = false;
        object.matrix.fromArray(
          snapshot.frame.parts[definition.id]!.localMatrix,
        );
        object.visible = snapshot.localVisibility[definition.id]!;
        (definition.parent === undefined
          ? world
          : parts.get(definition.parent)!
        ).add(object);
      }
      const c = snapshot.frame.camera,
        camera = new PerspectiveCamera(c.fovDegrees, 320 / 180, c.near, c.far);
      camera.position.fromArray(c.position);
      camera.up.fromArray(c.up);
      camera.lookAt(...c.target);
      camera.updateMatrixWorld(true);
      world.updateMatrixWorld(true);
      return {
        sampleIndex,
        sampleFrame: tree.sampleFrame!,
        observed: observeNativeThreeWorld(
          {
            world,
            camera,
            parts,
            source: effective,
            meshes: [],
            applyFrame() {},
            dispose() {},
          },
          snapshot,
          nativeFixtureHash,
          { calls: 0, triangles: 0 },
        ),
      };
    }),
  });
  return { source, table, episode, composition, packet };
}
function layer(composition: Composition, id: string) {
  return composition.layers.find((layer) => layer.id === id)!;
}

describe("streamed actual native overlay holds", () => {
  it("retains 40 exact anchored and measured readable output frames without inventing glyph acceptance", async () => {
    const f = await fixture(),
      checker = createNativeMechanismOverlayChecker(
        f.episode,
        f.composition,
        f.table,
        { textBounds },
      );
    for (let frame = 0; frame < 40; frame++) checker.onFrame(f.packet(frame));
    expect(checker.finish()).toMatchObject({
      checkedOutputFrames: 40,
      checkedPasses: 40,
      physicalHoldsValid: true,
      layoutMeasurement: "measured",
      layoutAccepted: true,
      findings: [],
      renderedGlyphReadability: "requires-encoded-review",
      holds: [
        {
          longestAnchoredFrames: 40,
          longestReadableFrames: 40,
          anchoredInterval: [0, 39],
          readableInterval: [0, 39],
        },
      ],
    });
  });
  it("validates physical holds with retained recipe data while unmeasured layout stays unassessed", async () => {
    const f = await fixture(),
      checker = createNativeMechanismOverlayChecker(
        f.episode,
        f.composition,
        f.table,
      );
    for (let frame = 0; frame < 40; frame++) checker.onFrame(f.packet(frame));
    expect(checker.finish()).toMatchObject({
      physicalHoldsValid: true,
      layoutMeasurement: "unassessed",
      layoutAccepted: null,
      holds: [
        {
          longestAnchoredFrames: 40,
          longestReadableFrames: null,
          readableInterval: null,
        },
      ],
    });
  });
  it("keeps empty overlays unassessed when no measured bounds were supplied", async () => {
    const f = await fixture();
    f.episode.shots[0]!.labels = [];
    f.composition.layers = f.composition.layers.filter(
      (layer) => layer.type === "native3d",
    );
    const checker = createNativeMechanismOverlayChecker(
      f.episode,
      f.composition,
      f.table,
    );
    for (let frame = 0; frame < 40; frame++) checker.onFrame(f.packet(frame));
    expect(checker.finish()).toMatchObject({
      checkedOutputFrames: 40,
      physicalHoldsValid: true,
      layoutMeasurement: "unassessed",
      layoutAccepted: null,
      findings: [],
      holds: [],
    });
  });
  it("takes supported current saved text edits over an older authored reading declaration", async () => {
    const f = await fixture(),
      value = layer(f.composition, layerId("label"));
    if (value.type !== "text") throw Error("Expected value text");
    value.text = "RENAMED";
    f.composition.metadata = {
      readingPolicy: {
        readingDeclarations: [
          {
            id: "old",
            purpose: "Original label",
            start: 0,
            end: 40,
            members: [{ layer: value.id, text: "SLIDES", kind: "value" }],
          },
        ],
      },
    };
    const checker = createNativeMechanismOverlayChecker(
      f.episode,
      f.composition,
      f.table,
      { textBounds },
    );
    for (let frame = 0; frame < 40; frame++) checker.onFrame(f.packet(frame));
    expect(checker.finish()).toMatchObject({
      physicalHoldsValid: true,
      holds: [{ longestAnchoredFrames: 40, longestReadableFrames: 40 }],
    });
  });
  it("detects actual anchor displacement instead of certifying expected snapshot endpoints", async () => {
    const f = await fixture(),
      checker = createNativeMechanismOverlayChecker(
        f.episode,
        f.composition,
        f.table,
        { textBounds },
      );
    for (let frame = 0; frame < 40; frame++) {
      const packet = f.packet(frame);
      if (frame === 20) packet.passes[0]!.observed.anchors.face!.pixel![0] += 2;
      checker.onFrame(packet);
    }
    const report = checker.finish();
    expect(report.physicalHoldsValid).toBe(false);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "mechanism-native-leader",
        frames: [20, 20],
        measured: expect.closeTo(2, 10),
      }),
    );
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "mechanism-label-hold",
        frames: [0, 39],
        measured: 20,
      }),
    );
  });
  it("never counts correct outside-frame indicators as fully readable physical proof", async () => {
    const f = await fixture("outside", true),
      checker = createNativeMechanismOverlayChecker(
        f.episode,
        f.composition,
        f.table,
        { textBounds },
      );
    for (let frame = 0; frame < 40; frame++) checker.onFrame(f.packet(frame));
    const report = checker.finish();
    expect(report.physicalHoldsValid).toBe(false);
    expect(report.holds[0]!.longestAnchoredFrames).toBe(0);
    expect(
      report.findings.some((finding) =>
        finding.code.startsWith("mechanism-native-"),
      ),
    ).toBe(false);
  });
  it("uses actual displayed copies so a completed retype can earn only its complete 30-frame hold", async () => {
    const f = await fixture(),
      value = layer(f.composition, layerId("label"));
    if (value.type !== "text") throw Error("Expected value text");
    value.states = ["SLI", "SLIDES"];
    value.transition = { kind: "retype", window: { start: 0, end: 10 } };
    const checker = createNativeMechanismOverlayChecker(
      f.episode,
      f.composition,
      f.table,
      { textBounds },
    );
    for (let frame = 0; frame < 40; frame++) checker.onFrame(f.packet(frame));
    expect(checker.finish()).toMatchObject({
      physicalHoldsValid: true,
      holds: [
        {
          longestAnchoredFrames: 30,
          longestReadableFrames: 30,
          anchoredInterval: [10, 39],
        },
      ],
    });
    value.transition.window.end = 11;
    const short = createNativeMechanismOverlayChecker(
      f.episode,
      f.composition,
      f.table,
      { textBounds },
    );
    for (let frame = 0; frame < 40; frame++) short.onFrame(f.packet(frame));
    expect(short.finish()).toMatchObject({
      physicalHoldsValid: false,
      holds: [{ longestAnchoredFrames: 29 }],
    });
  });
  it("consumes settled mixed exposure trees and requires every actual contributing pass to remain attached", async () => {
    const f = await fixture();
    f.composition.motionBlur = {
      enabled: true,
      samples: 3,
      shutterAngle: 180,
      shutterPhase: 0,
    };
    for (const item of f.composition.layers) item.motionBlur = true;
    f.composition.layers.push({
      id: "center-copy",
      type: "text",
      text: "center",
      fontSize: 16,
      color: "#ffffff",
      motionBlur: false,
      transform: {
        position: {
          keys: [
            { frame: 0, value: [0, 0] },
            { frame: 39, value: [39, 0] },
          ],
        },
      },
    });
    const center = compositionQualityFrame(f.composition, 20, {
      preparedNative3D: f.table,
    });
    for (const tree of evaluateCompositionExposure(f.composition, 20, {
      preparedNative3D: f.table,
      nativeObservationRequired: true,
    })) {
      const actual = compositionQualityTree(f.composition, tree);
      expect(actual.layers.get("center-copy")!.state.time).toBe(
        center.layers.get("center-copy")!.state.time,
      );
      expect(actual.layers.get("center-copy")!.matrix).toEqual(
        center.layers.get("center-copy")!.matrix,
      );
    }
    const checker = createNativeMechanismOverlayChecker(
      f.episode,
      f.composition,
      f.table,
      { textBounds },
    );
    for (let frame = 0; frame < 40; frame++) {
      const packet = f.packet(frame);
      if (frame === 20) packet.passes[2]!.observed.anchors.face!.pixel![0] += 1;
      checker.onFrame(packet);
    }
    const report = checker.finish();
    expect(report.checkedPasses).toBe(120);
    expect(report.physicalHoldsValid).toBe(false);
    expect(report.holds[0]!.longestAnchoredFrames).toBe(20);
  });
  it("fails missing coverage, repeated packets and nonzero physical leader attachment offsets", async () => {
    const f = await fixture(),
      incomplete = createNativeMechanismOverlayChecker(
        f.episode,
        f.composition,
        f.table,
      );
    incomplete.onFrame(f.packet(0));
    expect(() => incomplete.finish()).toThrow("complete output coverage");
    expect(() => incomplete.onFrame(f.packet(0))).toThrow("once in order");
    const leader = layer(f.composition, layerId("leader"));
    if (leader.native3D?.role !== "screen-anchor")
      throw Error("Expected binding");
    leader.native3D.offsetPixels = [2, 0];
    const checker = createNativeMechanismOverlayChecker(
      f.episode,
      f.composition,
      f.table,
      { textBounds },
    );
    for (let frame = 0; frame < 40; frame++) checker.onFrame(f.packet(frame));
    expect(checker.finish().findings).toContainEqual(
      expect.objectContaining({
        code: "mechanism-native-leader-offset",
        frames: [0, 39],
      }),
    );
  });
});
