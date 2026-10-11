import type * as ThreeModule from "three";
import type * as RoomModule from "three/addons/environments/RoomEnvironment.js";
import type { WebGLRenderer, BufferGeometry, Material } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SolidSceneSchema } from "@still-shift/scene-contract";
import {
  createNativeThreeGeometry,
  createNativeThreeWorld,
  createNativeThreeWorldV3,
} from "../../packages/renderer-core/src/native3d/three-world.ts";
import { nativeSolidFixture } from "../helpers/native3d-fixture.ts";
import { nativePbrSceneFixture } from "../helpers/native-pbr-scene-fixture.ts";
import { prepareNative3DSceneV3 } from "../../packages/renderer-core/src/native3d/prepare-v3.ts";
import * as pbr from "../../packages/renderer-core/src/native3d/pbr-resources.ts";

const controls = vi.hoisted(() => ({
  constructorFailure: undefined as undefined | { value: unknown },
  fromSceneFailure: undefined as undefined | { value: unknown },
  roomFailure: undefined as undefined | { value: unknown },
  generatorFailure: undefined as undefined | { value: unknown },
  environmentFailure: undefined as undefined | { value: unknown },
  hemisphereFailure: undefined as undefined | { value: unknown },
  roomDisposals: 0,
  generatorDisposals: 0,
  environmentDisposals: 0,
  roomOwners: [] as { disposed: boolean }[],
}));
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof ThreeModule>();
  class Generator {
    constructor() {
      if (controls.constructorFailure) throw controls.constructorFailure.value;
    }
    fromScene() {
      if (controls.fromSceneFailure) throw controls.fromSceneFailure.value;
      const environment = new actual.WebGLRenderTarget(16, 16);
      environment.addEventListener(
        "dispose",
        () => controls.environmentDisposals++,
      );
      const dispose = environment.dispose.bind(environment);
      vi.spyOn(environment, "dispose").mockImplementation(() => {
        dispose();
        if (controls.environmentFailure)
          throw controls.environmentFailure.value;
      });
      return environment;
    }
    dispose() {
      controls.generatorDisposals++;
      if (controls.generatorFailure) throw controls.generatorFailure.value;
    }
  }
  class Hemisphere extends actual.HemisphereLight {
    constructor(...args: ConstructorParameters<typeof actual.HemisphereLight>) {
      if (controls.hemisphereFailure) throw controls.hemisphereFailure.value;
      super(...args);
    }
  }
  return { ...actual, PMREMGenerator: Generator, HemisphereLight: Hemisphere };
});
vi.mock(
  "three/addons/environments/RoomEnvironment.js",
  async (importOriginal) => {
    const actual = await importOriginal<typeof RoomModule>();
    class Room extends actual.RoomEnvironment {
      constructor() {
        super();
        const owners = new Set<BufferGeometry | Material>();
        this.traverse((object) => {
          const mesh = object as ThreeModule.Mesh;
          if (!mesh.isMesh) return;
          owners.add(mesh.geometry);
          for (const material of Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material])
            owners.add(material);
        });
        for (const owner of owners) {
          const record = { disposed: false };
          controls.roomOwners.push(record);
          owner.addEventListener("dispose", () => {
            record.disposed = true;
          });
        }
      }
      override dispose() {
        controls.roomDisposals++;
        super.dispose();
        if (controls.roomFailure) throw controls.roomFailure.value;
      }
    }
    return { ...actual, RoomEnvironment: Room };
  },
);
afterEach(() => {
  for (const key of [
    "constructorFailure",
    "fromSceneFailure",
    "roomFailure",
    "generatorFailure",
    "environmentFailure",
    "hemisphereFailure",
  ] as const)
    controls[key] = undefined;
  controls.roomDisposals = 0;
  controls.generatorDisposals = 0;
  controls.environmentDisposals = 0;
  controls.roomOwners = [];
});
const renderer = () =>
  ({
    setClearColor: vi.fn(),
    shadowMap: { enabled: false, type: 0 },
  }) as unknown as WebGLRenderer;
function thrown(work: () => unknown) {
  try {
    work();
  } catch (error) {
    return { caught: true, error };
  }
  return { caught: false, error: undefined };
}
function roomClosed() {
  expect(controls.roomDisposals).toBe(1);
  expect(controls.roomOwners.length).toBeGreaterThan(0);
  expect(controls.roomOwners.every((owner) => owner.disposed)).toBe(true);
}
describe("shared native world construction and owner retirement", () => {
  it("closes actual room geometries/materials when the generator constructor fails", () => {
    const reason = Error("generator constructor");
    controls.constructorFailure = { value: reason };
    expect(
      thrown(() => createNativeThreeWorld(renderer(), nativeSolidFixture())),
    ).toEqual({ caught: true, error: reason });
    roomClosed();
    expect(controls.generatorDisposals).toBe(0);
    expect(controls.environmentDisposals).toBe(0);
  });
  it("preserves a null generation failure through both temporary destructor failures", () => {
    controls.fromSceneFailure = { value: null };
    controls.roomFailure = { value: Error("room cleanup") };
    controls.generatorFailure = { value: Error("generator cleanup") };
    expect(
      thrown(() => createNativeThreeWorld(renderer(), nativeSolidFixture())),
    ).toEqual({ caught: true, error: null });
    roomClosed();
    expect(controls.generatorDisposals).toBe(1);
    expect(controls.environmentDisposals).toBe(0);
  });
  it("retires the completed environment if temporary cleanup prevents its ownership transfer", () => {
    const reason = Error("room cleanup");
    controls.roomFailure = { value: reason };
    controls.environmentFailure = { value: Error("environment cleanup") };
    expect(
      thrown(() => createNativeThreeWorld(renderer(), nativeSolidFixture())),
    ).toEqual({ caught: true, error: reason });
    roomClosed();
    expect(controls.generatorDisposals).toBe(1);
    expect(controls.environmentDisposals).toBe(1);
  });
  it("closes the transferred environment on later real scene setup failure", () => {
    const reason = Error("hemisphere setup");
    controls.hemisphereFailure = { value: reason };
    expect(
      thrown(() => createNativeThreeWorld(renderer(), nativeSolidFixture())),
    ).toEqual({ caught: true, error: reason });
    roomClosed();
    expect(controls.generatorDisposals).toBe(1);
    expect(controls.environmentDisposals).toBe(1);
  });
  it("retires all remaining material/shadow/environment/graph owners after a geometry destructor throws, then closes idempotently", () => {
    const source = SolidSceneSchema.parse({
      ...nativeSolidFixture(),
      lights: [
        {
          id: "sun",
          type: "directional",
          color: "#ffffff",
          intensity: 1,
          position: [0, 5, 0],
          target: [0, 0, 0],
        },
      ],
    });
    const world = createNativeThreeWorld(renderer(), source),
      mesh = world.meshes[0]!;
    const geometryDispose = mesh.geometry.dispose.bind(mesh.geometry);
    const geometry = vi
      .spyOn(mesh.geometry, "dispose")
      .mockImplementation(() => {
        geometryDispose();
        throw null;
      });
    const material = mesh.material as Material,
      materialDispose = material.dispose.bind(material);
    const materials = vi.spyOn(material, "dispose").mockImplementation(() => {
      materialDispose();
      throw Error("material cleanup");
    });
    const light = world.world.children.find(
      (object) => object.type === "DirectionalLight",
    ) as ThreeModule.DirectionalLight;
    const shadows = vi.spyOn(light.shadow, "dispose");
    controls.environmentFailure = { value: Error("environment cleanup") };
    expect(thrown(() => world.dispose())).toEqual({
      caught: true,
      error: null,
    });
    expect(geometry).toHaveBeenCalledOnce();
    expect(materials).toHaveBeenCalledOnce();
    expect(shadows).toHaveBeenCalledOnce();
    expect(controls.environmentDisposals).toBe(1);
    expect(world.world.children).toHaveLength(0);
    expect(world.parts.size).toBe(0);
    expect(world.meshes).toHaveLength(0);
    expect(() => world.dispose()).not.toThrow();
    expect(controls.environmentDisposals).toBe(1);
    roomClosed();
  });
  it("keeps borrowed rest geometry with its separate owner after a successful world close", () => {
    const source = nativeSolidFixture(),
      geometry = createNativeThreeGeometry(source),
      mesh = [...geometry.geometries.values()][0]!;
    const retired = vi.spyOn(mesh, "dispose"),
      world = createNativeThreeWorld(renderer(), source, { geometry });
    world.dispose();
    expect(retired).not.toHaveBeenCalled();
    expect(controls.environmentDisposals).toBe(1);
    geometry.dispose();
    expect(retired).toHaveBeenCalledOnce();
    roomClosed();
  });
  it("preserves a source3 world constructor failure through its nested PBR retirement failure", async () => {
    const prepared = await prepareNative3DSceneV3(
      nativePbrSceneFixture(),
      "sha256:" + "a".repeat(64),
    );
    const resources = await pbr.prepareNativePbrResources(
        prepared.source.geometry,
        [],
      ),
      create = pbr.createNativePbrResources;
    const reason = Error("source3 generator constructor");
    controls.constructorFailure = { value: reason };
    const views: ArrayBufferView[] = [];
    const spy = vi
      .spyOn(pbr, "createNativePbrResources")
      .mockImplementation((input) => {
        const owner = create(input),
          dispose = owner.dispose;
        for (const geometry of owner.geometries.values()) {
          for (const attribute of Object.values(geometry.attributes))
            views.push(attribute.array);
          views.push(geometry.index!.array);
        }
        owner.dispose = () => {
          dispose();
          throw Error("secondary nested PBR cleanup");
        };
        return owner;
      });
    try {
      expect(
        thrown(() => createNativeThreeWorldV3(renderer(), prepared, resources)),
      ).toEqual({ caught: true, error: reason });
      expect(views.length).toBeGreaterThan(0);
      expect(views.every((view) => view.byteLength === 0)).toBe(true);
      roomClosed();
    } finally {
      spy.mockRestore();
      pbr.releasePreparedNativePbrResources(resources);
    }
  });
});
