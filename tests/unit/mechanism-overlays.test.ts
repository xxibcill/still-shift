import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mechanismHash,
  mechanismContentHash,
} from "../../packages/animation-engine/src/mechanism/io.ts";
import {
  createTapeHookScene,
  createTapeHookShots,
} from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import {
  MechanismEpisodeSchema,
  type MechanismSidecar,
} from "../../packages/scene-contract/src/mechanism/index.ts";
import { buildRenderGraph } from "../../packages/renderer-core/src/composition/render/graph.ts";
import { compositionRequiredCoverageGraphs } from "../../packages/renderer-core/src/composition/render/required-coverage.ts";
import { compositionMediaFrameDependencies } from "../../packages/renderer-core/src/composition/render/graphs.ts";
import { readFontIdentity } from "../../packages/renderer-core/src/font-identity.ts";
import {
  evaluateMechanismFrame,
  prepareMechanismScene,
} from "../../packages/renderer-core/src/mechanism/index.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import {
  compileMechanismOverlays,
  checkMechanismOverlays,
  mechanismOverlayLayerId,
  type MechanismOverlaySource,
} from "../../packages/animation-engine/src/mechanism/overlays.ts";

const hash = "sha256:" + "a".repeat(64);
function fixture() {
  const scene = createTapeHookScene();
  const episode = MechanismEpisodeSchema.parse({
    schemaVersion: "mechanism-episode-1",
    id: "overlay",
    revision: 0,
    scene: "scene",
    font: "font",
    output: { width: 1080, height: 1920, fps: 30, frameCount: 60 },
    dependencies: [
      { id: "scene", type: "scene", path: "scene.json", sha256: hash },
      {
        id: "font",
        type: "font",
        path: "font.ttf",
        sha256: hash,
        weight: "600",
      },
    ],
    shots: [0, 30].map((startFrame, index) => ({
      id: `shot${index}`,
      purpose: "Read contact",
      startFrame,
      endFrameExclusive: startFrame + 30,
      labels: [
        {
          id: `pull.${index}`,
          role: "PULL",
          text: "PULL",
          anchor: scene.anchors[0]!.id,
          position: [540, 150],
          readingInterval: { startFrame, endFrameExclusive: startFrame + 30 },
        },
      ],
    })),
    captions: [
      {
        id: "caption",
        text: "Read the contact",
        startFrame: 0,
        endFrameExclusive: 60,
      },
    ],
  });
  const captures = episode.shots.map((shot) => {
    const frames = Array.from({ length: 30 }, (_, frame) => ({
      frame,
      sourceFrame: shot.startFrame + frame,
      seed: 0,
      shotId: shot.id,
      plateSha256: hash,
      camera: scene.camera,
      parts: [],
      rigs: [],
      assertions: { frame: shot.startFrame + frame },
      anchors: [
        {
          anchor: scene.anchors[0]!.id,
          part: scene.anchors[0]!.part,
          world: [0, 0, 0],
          pixel: [500 + frame, 600],
          depth: 1,
          projectionVisibility: "in-frame",
          visibility: "visible",
          visibilityMethod: "scene-raycast",
          projectionErrorPixels: 0,
        },
      ],
      protectedRegions: [],
    }));
    const sidecar = {
      schemaVersion: "mechanism-sidecar-1",
      sceneId: scene.id,
      sceneSha256: mechanismContentHash(scene),
      geometrySha256: scene.geometrySha256,
      rendererProfile: "test",
      rendererVersion: "test",
      evaluatorVersion: "mechanism-evaluator-1",
      width: 1080,
      height: 1920,
      fps: 30,
      frameCount: 30,
      frames,
    } as unknown as MechanismSidecar;
    return {
      shotId: shot.id,
      outputDirectory: `/tmp/${shot.id}`,
      sequenceManifestPath: `/tmp/${shot.id}/sequence.json`,
      sidecarPath: `/tmp/${shot.id}/sidecar.json`,
      sequenceSha256: hash,
      frames: Array(30).fill(hash) as string[],
      sidecar,
    };
  });
  return {
    loaded: {
      episode,
      scene,
      dependencyPaths: { font: "/tmp/font.ttf", scene: "/tmp/scene.json" },
    },
    captures,
  };
}

describe("native mechanism overlays", () => {
  it("compiles all696 physical proof samples within the unchanged metadata budget", () => {
    const { loaded, captures } = fixture();
    loaded.episode.output.frameCount = 696;
    loaded.episode.shots = createTapeHookShots();
    loaded.episode.captions = [];
    const prepared = prepareMechanismScene(loaded.scene);
    const complete = loaded.episode.shots.map((shot) => {
      const frameCount = shot.endFrameExclusive - shot.startFrame;
      const frames = Array.from({ length: frameCount }, (_, frame) => {
        const state = evaluateMechanismFrame(prepared, {
          frame: shot.startFrame + frame,
          width: 1080,
          height: 1920,
          ...(shot.camera ? { camera: shot.camera } : {}),
          ...(shot.cameraKeys ? { cameraKeys: shot.cameraKeys } : {}),
          controls: shot.controls,
          hiddenParts: shot.hiddenParts,
        });
        return {
          ...captures[0]!.sidecar.frames[0]!,
          frame,
          sourceFrame: state.frame,
          shotId: shot.id,
          camera: state.camera,
          parts: state.parts,
          rigs: state.rigs,
          assertions: state.assertions,
          anchors: Object.values(state.anchors).map((anchor) => ({
            ...anchor,
            visibility:
              anchor.projectionVisibility === "in-frame"
                ? ("visible" as const)
                : anchor.projectionVisibility,
            visibilityMethod: "scene-raycast" as const,
            projectionErrorPixels: 0,
          })),
        };
      });
      return {
        ...captures[0]!,
        shotId: shot.id,
        frames: Array(frameCount).fill(hash) as string[],
        sidecar: { ...captures[0]!.sidecar, frames, frameCount },
      };
    });
    const comp = compileMechanismOverlays(loaded, complete);
    expect(JSON.stringify(comp.metadata).length).toBeLessThanOrEqual(65536);
    expect(comp.metadata?.physicalProofDeclarations).toHaveLength(9);
    const rows = comp.layers.flatMap((layer) => {
      const proof = layer.metadata?.physicalProof;
      return proof &&
        typeof proof === "object" &&
        !Array.isArray(proof) &&
        Array.isArray(proof.frames)
        ? proof.frames
        : [];
    });
    expect(rows).toHaveLength(696);
  });
  it("aligns complete shot-local sequences with global time and stable legal IDs", () => {
    const { loaded, captures } = fixture();
    const comp = compileMechanismOverlays(loaded, captures);
    const sequences = comp.layers.filter((layer) => layer.type === "sequence");
    expect(
      sequences.map((layer) => [
        layer.inPoint,
        layer.outPoint,
        layer.startFrame,
      ]),
    ).toEqual([
      [0, 30, 0],
      [30, 60, 30],
    ]);
    expect(
      comp.assets
        .filter((asset) => asset.type === "sequence")
        .map((asset) => [asset.path, asset.sha256, asset.firstFrame]),
    ).toEqual([
      ["/tmp/shot0/%06d.png", hash, 0],
      ["/tmp/shot1/%06d.png", hash, 0],
    ]);
    expect(
      comp.layers
        .filter((layer) => layer.type === "text")
        .map((layer) => layer.textRole),
    ).toEqual(["body", "label", "label"]);
    const plateGroup = comp.layers.find((layer) => layer.type === "group")!;
    expect(plateGroup.coverage).toBe("required");
    expect(sequences.every((layer) => layer.parent === plateGroup.id)).toBe(
      true,
    );
    for (const [frame, index, ordinal] of [
      [0, 0, 0],
      [29, 0, 29],
      [30, 1, 0],
      [35, 1, 5],
      [59, 1, 29],
    ] as const) {
      expect(
        [...compositionRequiredCoverageGraphs(comp, frame)].map(
          (graph) => graph.node,
        ),
      ).toEqual([plateGroup.id]);
      expect(
        [...compositionMediaFrameDependencies(comp, frame)].map(
          ([asset, frames]) => [asset, [...frames]],
        ),
      ).toEqual([[sequences[index]!.asset, [ordinal]]]);
    }
    const caption = comp.layers.find(
      (layer) => layer.type === "text" && layer.metadata?.mechanismCaption,
    )!;
    expect(caption.transform).toMatchObject({
      anchor: [0, 0],
      position: [86.4, 1670.4],
    });
    const paint = buildRenderGraph(comp, evaluateComp(comp, 0)).root.ops.map(
      (op) => op.layer,
    );
    expect(paint.indexOf(sequences[0]!.id)).toBeLessThan(
      paint.indexOf(mechanismOverlayLayerId("caption-panel", "caption")),
    );
    expect(
      paint.indexOf(mechanismOverlayLayerId("caption-panel", "caption")),
    ).toBeLessThan(paint.indexOf(caption.id));
    const id = mechanismOverlayLayerId("label", "pull.1");
    expect(id).toMatch(/^[A-Za-z][\w-]*$/);
    const evaluated = evaluateComp(comp, 35);
    const activePlate = evaluated.layers.find(
      (layer) =>
        layer.layer.type === "sequence" && layer.id === sequences[1]!.id,
    )!;
    expect(activePlate.screenMatrix).toEqual([1, 0, 0, 1, 0, 0]);
    expect(activePlate.bounds).toEqual({
      left: 0,
      right: 1080,
      top: 0,
      bottom: 1920,
    });
    expect(activePlate.media?.pair?.first).toBe(5);
    const leader = evaluated.layers.find(
      (layer) => layer.id === mechanismOverlayLayerId("leader", "pull.1"),
    )!;
    expect(leader.layer.type).toBe("shape");
    const source = comp.layers.find((layer) => layer.id === id)!;
    expect(source.metadata).toMatchObject({
      mechanismLabel: "pull.1",
      anchor: loaded.scene.anchors[0]!.id,
    });
  });
  it("rejects reordered captures and mismatched plate identities before compilation", () => {
    const { loaded, captures } = fixture();
    captures[0]!.sidecar.frames[4]!.sourceFrame = 9;
    expect(() => compileMechanismOverlays(loaded, captures)).toThrow(
      /source frame/i,
    );
    captures[0]!.sidecar.frames[4]!.sourceFrame = 4;
    captures[0]!.frames[4] = "sha256:" + "b".repeat(64);
    expect(() => compileMechanismOverlays(loaded, captures)).toThrow(/plate/i);
  });
  it("hides an occluded projected target and reports a broken 30-frame hold", () => {
    const { loaded, captures } = fixture();
    captures[0]!.sidecar.frames[10]!.anchors[0]!.visibility = "occluded";
    const comp = compileMechanismOverlays(loaded, captures);
    const label = mechanismOverlayLayerId("label", "pull.0");
    expect(
      evaluateComp(comp, 10).layers.find((layer) => layer.id === label)!
        .opacity,
    ).toBe(0);
    expect(
      evaluateComp(comp, 11).layers.find((layer) => layer.id === label)!
        .opacity,
    ).toBe(1);
    const report = checkMechanismOverlays(loaded.episode, captures);
    expect(report.measurement).toBe("estimated");
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "mechanism-label-hold",
        label: "pull.0",
        measured: 19,
      }),
    );
  });
  it("groups overlap and offscreen failures with exact locations and maxima", () => {
    const { loaded, captures } = fixture();
    loaded.episode.shots[0]!.labels.push({
      ...loaded.episode.shots[0]!.labels[0]!,
      id: "push",
      role: "PUSH",
      text: "PUSH",
    });
    loaded.episode.shots[1]!.labels[0]!.position = [-10, 10];
    const report = checkMechanismOverlays(loaded.episode, captures);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "mechanism-label-overlap",
        path: "shots.0.labels.0.position",
        frames: [0, 29],
      }),
    );
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "mechanism-label-offscreen",
        path: "shots.1.labels.0.position",
        frames: [30, 59],
      }),
    );
    expect(report.layoutAccepted).toBe(false);
  });
  it("requires actual text bounds and retains separately placed qualification/captions", () => {
    const { loaded, captures } = fixture();
    loaded.episode.shots[0]!.labels[0]!.qualification = "Illustrative";
    const comp = compileMechanismOverlays(loaded, captures);
    expect(
      comp.layers
        .filter((layer) => layer.type === "text")
        .map((layer) => layer.textRole),
    ).toEqual(["body", "label", "qualification", "label"]);
    const bounds = Object.fromEntries(
      comp.layers
        .filter((layer) => layer.type === "text")
        .map((layer) => [
          layer.id,
          Array(60).fill({ left: -80, right: 80, top: 0, bottom: 40 }),
        ]),
    );
    const report = checkMechanismOverlays(loaded.episode, captures, {
      textBounds: bounds,
    });
    expect(report.measurement).toBe("measured");
    expect(report.layoutAccepted).toBe(true);
  });
});

it("preserves declared axes using actual pinned font ranges, and rejects missing preparation", () => {
  const { loaded, captures } = fixture();
  const font = loaded.episode.dependencies.find(
    (dependency) => dependency.type === "font",
  )!;
  if (font.type !== "font") throw new Error("fixture");
  font.axes = { wght: 600, wdth: 75 };
  expect(() => compileMechanismOverlays(loaded, captures)).toThrow(
    /prepared ranges/,
  );
  const bytes = readFileSync(
    "assets/ecommerce-motion/fonts/noto-sans-thai.ttf",
  );
  const identity = readFontIdentity(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  font.sha256 = mechanismHash(bytes);
  font.weight = String(identity.weight);
  font.style = identity.style;
  const prepared: MechanismOverlaySource = {
    ...loaded,
    dependencyPaths: {
      ...loaded.dependencyPaths,
      [font.id]: resolve("assets/ecommerce-motion/fonts/noto-sans-thai.ttf"),
    },
    fontAxes: { [font.id]: identity.axes },
  };
  const comp = compileMechanismOverlays(prepared, captures);
  expect(comp.assets.find((asset) => asset.type === "font")).toMatchObject({
    variable: identity.axes,
  });
  const text = comp.layers.find((layer) => layer.type === "text")!;
  if (text.type !== "text") throw new Error("fixture");
  expect(comp.textStyles?.[text.style!]).toMatchObject({
    fontAsset: text.fontAsset,
    axes: { wght: 600, wdth: 75 },
  });
});

it("uses an explicit offscreen indicator without counting it as visible target proof", () => {
  const { loaded, captures } = fixture();
  loaded.episode.shots[0]!.labels[0]!.visibilityPolicy = "offscreen-indicator";
  const anchor = captures[0]!.sidecar.frames[10]!.anchors[0]!;
  anchor.visibility = "outside-frame";
  anchor.projectionVisibility = "outside-frame";
  anchor.pixel = [1200, 600];
  const comp = compileMechanismOverlays(loaded, captures);
  const frame = evaluateComp(comp, 10);
  expect(
    frame.layers.find(
      (layer) => layer.id === mechanismOverlayLayerId("indicator", "pull.0"),
    )!.opacity,
  ).toBe(1);
  expect(
    frame.layers.find(
      (layer) => layer.id === mechanismOverlayLayerId("label", "pull.0"),
    )!.opacity,
  ).toBe(1);
  const leader = frame.layers.find(
    (layer) => layer.id === mechanismOverlayLayerId("leader", "pull.0"),
  )!;
  const path = leader.contents!.find((content) => content.type === "path")!;
  if (path.type !== "path") throw new Error("fixture");
  expect(path.path.vertices.at(-1)).toEqual([1068, 600]);
  expect(
    checkMechanismOverlays(loaded.episode, captures).holds[0]!
      .longestReadableFrames,
  ).toBe(19);
});

it("rejects wrong physical parts and avoids ID encoding collisions", () => {
  const { loaded, captures } = fixture();
  captures[0]!.sidecar.frames[0]!.anchors[0]!.part = "wrong-part";
  expect(() => compileMechanismOverlays(loaded, captures)).toThrow(
    /physical part/,
  );
  expect(mechanismOverlayLayerId("label", "pull.1")).not.toBe(
    mechanismOverlayLayerId("label", "pull-1"),
  );
});
