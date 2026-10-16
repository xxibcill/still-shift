import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CompositionSchema } from "@still-shift/scene-contract";
import { createNativeObservationRequest } from "../../packages/animation-engine/src/native-observation.ts";
import { compositionScene } from "../../packages/renderer-core/src/composition/render/renderer.ts";
import { readCompositionSource } from "../../packages/animation-engine/src/composition-source.ts";
import { prepareCompositionNative3DVersions } from "../../packages/renderer-core/src/native3d/prepare.ts";
import { compositionNativePasses } from "../../packages/renderer-core/src/composition/render/graphs.ts";
import { nativeCompositionObservationCapacityV2 } from "../../packages/renderer-core/src/native3d/observation-capacity-v2.ts";
import * as browser from "../../packages/renderer-core/src/native3d/browser.ts";
import { mechanismV2Fixture } from "../helpers/mechanism-v2-fixture.ts";
const hash = (text: string) =>
  "sha256:" + createHash("sha256").update(text).digest("hex");
async function fixture() {
  const source = mechanismV2Fixture(),
    text = JSON.stringify(source),
    sourceSha256 = hash(text);
  const composition = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "scene2",
    width: 320,
    height: 180,
    fps: 30,
    frameCount: 4,
    assets: [
      {
        id: "mechanism",
        type: "native3d",
        path: "mechanism.json",
        sha256: sourceSha256,
        format: "mechanism-scene-2",
      },
    ],
    layers: [
      {
        id: "world",
        type: "native3d",
        asset: "mechanism",
        sourceStartFrame: 0.25,
        sourceFps: 30,
        rigControls: { slide: { type: "slider", value: 2 } },
      },
    ],
  });
  const directory = await mkdtemp(
    join(tmpdir(), "still-shift-ms2-composition-routing-unit-"),
  );
  await writeFile(join(directory, "mechanism.json"), text);
  await writeFile(
    join(directory, "composition.json"),
    JSON.stringify(composition),
  );
  const transport = {
    version: "composition-prepared-native3d-2",
    assets: { mechanism: { sourceSha256, source } },
  };
  return { composition, transport, directory };
}
describe("scene2 normal composition routing", () => {
  it("loads verified original scene2 bytes through the normal composition source reader", async () => {
    const f = await fixture();
    const loaded = await readCompositionSource(
      join(f.directory, "composition.json"),
      { backend: "webgl2" },
    );
    expect(loaded.preparedNative3D?.version).toBe(
      "composition-prepared-native3d-2",
    );
    expect(loaded.native3D?.mechanism?.version).toBe(
      "prepared-native3d-scene-2",
    );
  });
  it("samples scene2 through the normal composition graph without falling back to a v1 frame", async () => {
    const f = await fixture(),
      catalogue = await prepareCompositionNative3DVersions(
        f.composition,
        f.transport,
      );
    const passes = compositionNativePasses(f.composition, 0, {
      preparedNative3D: catalogue,
      nativeObservationRequired: true,
    });
    expect([...passes].map((pass) => pass.frame.version)).toEqual([
      "native3d-frame-2",
    ]);
  });
  it("does not route declared scene2 sources through the original export ledger", async () => {
    const f = await fixture();
    const loaded = await readCompositionSource(
      join(f.directory, "composition.json"),
      { backend: "webgl2" },
    );
    await expect(
      createNativeObservationRequest({
        ...loaded,
        scene: compositionScene(loaded.composition, "webgl2"),
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        {
          code: "comp-native3d-protocol",
          path: "nativeObservations.execution",
        },
      ],
    });
  });
  it("rejects changed raw bytes before preparing a scene2 catalogue", async () => {
    const f = await fixture();
    await writeFile(
      join(f.directory, "mechanism.json"),
      JSON.stringify(f.transport.assets.mechanism.source) + "\n",
    );
    await expect(
      readCompositionSource(join(f.directory, "composition.json"), {
        backend: "webgl2",
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        { code: "comp-native3d-checksum", path: "assets.mechanism.sha256" },
      ],
    });
  });
  it("rejects expanded contributing graphs before any native GPU owner exists", async () => {
    const f = await fixture();
    const composition = CompositionSchema.parse({
      ...f.composition,
      motionBlur: {
        enabled: true,
        shutterAngle: 360,
        shutterPhase: 0,
        samples: 64,
      },
      precomps: [
        {
          id: "nested",
          width: 320,
          height: 180,
          frameCount: 4,
          layers: [{ ...f.composition.layers[0], motionBlur: true }],
        },
      ],
      layers: [
        { id: "a", type: "precomp", comp: "nested", motionBlur: true },
        { id: "b", type: "precomp", comp: "nested", motionBlur: true },
      ],
    });
    const catalogue = await prepareCompositionNative3DVersions(
      composition,
      f.transport,
    );
    expect(() =>
      nativeCompositionObservationCapacityV2(composition, 2, {
        preparedNative3D: catalogue,
        nativeObservationRequired: true,
      }),
    ).toThrow("admission");
  });
  it("exposes a queued owner that seals synchronous color passes before asynchronous finalization", () => {
    expect(
      Reflect.get(browser, "createNativeThreeQueuedFrameObservationV2"),
    ).toBeTypeOf("function");
  });
});
