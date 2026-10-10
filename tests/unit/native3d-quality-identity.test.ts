import { describe, expect, it } from "vitest";
import { MechanismEpisodeSchema } from "@still-shift/scene-contract";
import {
  assertNativeMechanismQualityPolicy,
  assertNativePreparedCheckIdentity,
} from "../../packages/animation-engine/src/mechanism/native-quality-identity.ts";
import { compileNativeMechanismComposition } from "../../packages/animation-engine/src/mechanism/overlays.ts";
import {
  createTapeHookScene,
  createTapeHookShots,
} from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import { mechanismHash } from "../../packages/animation-engine/src/mechanism/io.ts";
import type { NativePreparedMechanismEpisode } from "../../packages/animation-engine/src/mechanism/native-lifecycle.ts";
const sha = "sha256:" + "a".repeat(64);
function fixture() {
  const scene = createTapeHookScene();
  const episode = MechanismEpisodeSchema.parse({
    schemaVersion: "mechanism-episode-1",
    id: "episode",
    revision: 0,
    scene: "source",
    font: "font",
    output: { width: 1080, height: 1920, fps: 30, frameCount: 696 },
    dependencies: [
      {
        id: "source",
        type: "scene",
        path: "source.json",
        sha256: mechanismHash(JSON.stringify(scene)),
      },
      {
        id: "font",
        type: "font",
        path: "font.ttf",
        sha256: sha,
        weight: "600",
      },
    ],
    shots: createTapeHookShots(),
    captions: [],
  });
  return {
    episode,
    composition: compileNativeMechanismComposition({
      episode,
      scene,
      dependencyPaths: { source: "/tmp/source.json", font: "/tmp/font.ttf" },
    }),
  };
}
describe("native episode QA and in-flight identity guards", () => {
  it("preserves authored QA while supported saved label/camera edits remain eligible", () => {
    const f = fixture();
    const text = f.composition.layers.find((layer) => layer.type === "text")!;
    if (text.type !== "text") throw Error("fixture");
    text.text = "Current edited copy";
    const world = f.composition.layers.find(
      (layer) => layer.type === "native3d",
    )!;
    if (world.type !== "native3d") throw Error("fixture");
    world.camera!.fovDegrees += 1;
    expect(() =>
      assertNativeMechanismQualityPolicy(f.episode, f.composition),
    ).not.toThrow();
  });
  it.each([
    "maxFrozenFrames",
    "pixelMinimumChanges",
    "severities",
    "readingDeclarations",
  ])(
    "rejects refreshed saved policy weakening or declaration changes: %s",
    (key) => {
      const f = fixture();
      const policy = f.composition.metadata!.readingPolicy as Record<
        string,
        unknown
      >;
      policy[key] =
        key === "severities"
          ? { "frozen-pixels": "warning" }
          : key === "readingDeclarations"
            ? []
            : 696;
      expect(() =>
        assertNativeMechanismQualityPolicy(f.episode, f.composition),
      ).toThrow(/preserve its authored QA/);
    },
  );
  it("rejects missing QA metadata", () => {
    const f = fixture();
    delete f.composition.metadata!.readingPolicy;
    expect(() =>
      assertNativeMechanismQualityPolicy(f.episode, f.composition),
    ).toThrow(/preserve its authored QA/);
  });
  it("allows refreshed receipt bookkeeping but rejects a concurrently refreshed camera/source/code/route identity", () => {
    const receipt: Parameters<typeof assertNativePreparedCheckIdentity>[0] &
      Pick<NativePreparedMechanismEpisode, "wallSeconds"> = {
      projectHash: sha,
      compositionSourceSha256: sha,
      compositionSha256: sha,
      preparedNativeSha256: sha,
      appearanceCodeSha256: sha,
      appearanceCodeIdentity: {
        runtimeFormat: "source-ts",
        modules: [{ name: "renderer.ts", sha256: sha }],
        threeRuntime: {
          version: "0.186.0",
          sources: [{ name: "three.module.js", sha256: sha }],
        },
      },
      episodeSha256: sha,
      geometrySha256: sha,
      rigSha256: sha,
      routeSelection: {
        sourceRoute: null,
        effectiveRoute: "native3d",
        selectionOrigin: "cli-override",
      },
      backend: "webgl2",
      profile: "native-three-aces-hdr-msaa4-1",
      wallSeconds: 1,
    };
    const bookkeeping = { ...receipt, wallSeconds: 5 };
    expect(() =>
      assertNativePreparedCheckIdentity(receipt, bookkeeping),
    ).not.toThrow();
    for (const field of [
      "compositionSourceSha256",
      "compositionSha256",
      "preparedNativeSha256",
      "appearanceCodeSha256",
    ] as const) {
      expect(() =>
        assertNativePreparedCheckIdentity(receipt, {
          ...receipt,
          [field]: "sha256:" + "b".repeat(64),
        }),
      ).toThrow(/changed during final checking/);
    }
    expect(() =>
      assertNativePreparedCheckIdentity(receipt, {
        ...receipt,
        routeSelection: {
          ...receipt.routeSelection,
          selectionOrigin: "default",
        },
      }),
    ).toThrow(/changed during final checking/);
    const code = structuredClone(receipt);
    code.appearanceCodeIdentity.modules[0]!.sha256 = "sha256:" + "b".repeat(64);
    expect(() => assertNativePreparedCheckIdentity(receipt, code)).toThrow(
      /changed during final checking/,
    );
  });
});
