import { createCableTiePack } from "../../packages/animation-engine/src/mechanism/cable-tie-pack.ts";
import { describe, expect, it } from "vitest";
import {
  MechanismShapeDrawEvidenceSchema,
  NativeShapeAssociationSchema,
  NativeObservedShapeSchema,
} from "@still-shift/scene-contract";
import * as browser from "../../packages/renderer-core/src/native3d/browser.ts";
import { prepareNative3DSceneV2 } from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { captureNativeUsedIndexedStreams } from "../../packages/renderer-core/src/native3d/used-indexed-streams.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { mechanismV2Fixture } from "../helpers/mechanism-v2-fixture.ts";

function fakeContext(
  options: {
    normalized?: boolean;
    size?: number;
    readError?: Error;
    restoreError?: Error;
  } = {},
) {
  const program = {} as WebGLProgram,
    vao = {} as WebGLVertexArrayObject;
  const position = {} as WebGLBuffer,
    normal = {} as WebGLBuffer,
    indices = {} as WebGLBuffer,
    previous = {} as WebGLBuffer;
  const buffers = new Map([
    [position, new Uint8Array(36)],
    [normal, new Uint8Array(36)],
    [indices, new Uint8Array(6)],
  ]);
  let bound = previous,
    reads = 0;
  const constants = {
    TRIANGLES: 4,
    UNSIGNED_SHORT: 5123,
    FLOAT: 5126,
    FLOAT_VEC3: 35665,
    NO_ERROR: 0,
    CURRENT_PROGRAM: 35725,
    VERTEX_ARRAY_BINDING: 34229,
    ELEMENT_ARRAY_BUFFER_BINDING: 34965,
    COPY_READ_BUFFER: 36662,
    COPY_READ_BUFFER_BINDING: 36662,
    BUFFER_SIZE: 34660,
    ACTIVE_ATTRIBUTES: 35721,
    VERTEX_ATTRIB_ARRAY_BUFFER_BINDING: 34975,
    VERTEX_ATTRIB_ARRAY_ENABLED: 34338,
    VERTEX_ATTRIB_ARRAY_SIZE: 34339,
    VERTEX_ATTRIB_ARRAY_TYPE: 34341,
    VERTEX_ATTRIB_ARRAY_NORMALIZED: 34922,
    VERTEX_ATTRIB_ARRAY_INTEGER: 35069,
    VERTEX_ATTRIB_ARRAY_DIVISOR: 35070,
    VERTEX_ATTRIB_ARRAY_STRIDE: 34340,
    VERTEX_ATTRIB_ARRAY_POINTER: 34373,
  };
  const implementation = {
    ...constants,
    isContextLost: () => false,
    getError: () => 0,
    getParameter(name: number) {
      if (name === constants.CURRENT_PROGRAM) return program;
      if (name === constants.VERTEX_ARRAY_BINDING) return vao;
      if (name === constants.ELEMENT_ARRAY_BUFFER_BINDING) return indices;
      if (name === constants.COPY_READ_BUFFER_BINDING) return bound;
      throw Error("Unexpected fake parameter");
    },
    getAttribLocation: (_program: WebGLProgram, name: string) =>
      name === "position" ? 0 : 1,
    getProgramParameter: () => 2,
    getActiveAttrib: (_program: WebGLProgram, index: number) => ({
      name: index === 0 ? "position" : "normal",
      size: 1,
      type: constants.FLOAT_VEC3,
    }),
    getVertexAttrib(location: number, name: number) {
      if (name === constants.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING)
        return location === 0 ? position : normal;
      if (name === constants.VERTEX_ATTRIB_ARRAY_ENABLED) return true;
      if (name === constants.VERTEX_ATTRIB_ARRAY_SIZE) return 3;
      if (name === constants.VERTEX_ATTRIB_ARRAY_TYPE) return constants.FLOAT;
      if (name === constants.VERTEX_ATTRIB_ARRAY_NORMALIZED)
        return options.normalized ?? false;
      if (name === constants.VERTEX_ATTRIB_ARRAY_INTEGER) return false;
      if (name === constants.VERTEX_ATTRIB_ARRAY_DIVISOR) return 0;
      if (name === constants.VERTEX_ATTRIB_ARRAY_STRIDE) return 12;
      throw Error("Unexpected fake vertex parameter");
    },
    getVertexAttribOffset: () => 0,
    bindBuffer(_target: number, buffer: WebGLBuffer) {
      if (buffer === previous && options.restoreError)
        throw options.restoreError;
      bound = buffer;
    },
    getBufferParameter: () => options.size ?? buffers.get(bound)!.byteLength,
    getBufferSubData(
      _target: number,
      _offset: number,
      destination: Uint8Array,
    ) {
      reads++;
      if (options.readError) throw options.readError;
      destination.set(buffers.get(bound)!);
    },
  };
  return {
    gl: implementation as unknown as WebGL2RenderingContext,
    submission: {
      mode: 4,
      count: 3,
      type: 5123,
      byteOffset: 0,
      program,
      vao,
      indexBuffer: indices,
    },
    inventory: { vertexCount: 3, indexCount: 3 },
    previous,
    bound: () => bound,
    reads: () => reads,
  };
}

describe("actual used-stream boundary", () => {
  it("exposes the scoped browser observation owner", () => {
    expect(browser.createNativeThreeShapeObservation).toBeTypeOf("function");
  });
  it("reads all three used GPU buffers and restores the unrelated copy binding", () => {
    const f = fakeContext(),
      captured = captureNativeUsedIndexedStreams(
        f.gl,
        f.submission,
        f.inventory,
      );
    expect(f.reads()).toBe(3);
    expect(f.bound()).toBe(f.previous);
    expect(captured.position.byteLength).toBe(36);
    expect(captured.normal.byteLength).toBe(36);
    expect(captured.indices.byteLength).toBe(6);
    captured.dispose();
    captured.dispose();
  });
  it("does not accept callbacks with zero submitted indices", () => {
    const f = fakeContext();
    expect(() =>
      captureNativeUsedIndexedStreams(
        f.gl,
        { ...f.submission, count: 0 },
        f.inventory,
      ),
    ).toThrow("nonzero indexed");
    expect(f.reads()).toBe(0);
  });
  it("rejects a changed current VAO before reading", () => {
    const f = fakeContext();
    expect(() =>
      captureNativeUsedIndexedStreams(
        f.gl,
        { ...f.submission, vao: {} as WebGLVertexArrayObject },
        f.inventory,
      ),
    ).toThrow("differs from the actual submission");
    expect(f.reads()).toBe(0);
  });
  it("rejects normalized vertex layouts and unexpected buffer storage", () => {
    const layout = fakeContext({ normalized: true }),
      size = fakeContext({ size: 35 });
    expect(() =>
      captureNativeUsedIndexedStreams(
        layout.gl,
        layout.submission,
        layout.inventory,
      ),
    ).toThrow("packed profile");
    expect(() =>
      captureNativeUsedIndexedStreams(size.gl, size.submission, size.inventory),
    ).toThrow("byte length");
    expect(layout.bound()).toBe(layout.previous);
    expect(size.bound()).toBe(size.previous);
  });
  it("preserves the original read failure when binding restoration also fails", () => {
    const first = Error("original read failure"),
      f = fakeContext({
        readError: first,
        restoreError: Error("restore failure"),
      });
    try {
      captureNativeUsedIndexedStreams(f.gl, f.submission, f.inventory);
      throw Error("Expected reader failure");
    } catch (error) {
      expect(error).toBe(first);
    }
  });
  it("does not return a receipt when restoring the binding fails", () => {
    const f = fakeContext({ restoreError: Error("restore failure") });
    expect(() =>
      captureNativeUsedIndexedStreams(f.gl, f.submission, f.inventory),
    ).toThrow("restore failure");
  });
  it("admits readback backing before reading and releases it on failure", async () => {
    const memory = new ManagedMemory({ pixels: 35, metadata: 8192 }),
      f = fakeContext();
    await withManagedMemory(memory, async () => {
      expect(() =>
        captureNativeUsedIndexedStreams(f.gl, f.submission, f.inventory),
      ).toThrow();
      expect(f.reads()).toBe(0);
      expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    });
    memory.dispose();
  });
});

describe("sealed teaching shape evidence", () => {
  it("seals each shape's rest mesh, topology, declaration and material groups separately", async () => {
    const prepared = await prepareNative3DSceneV2(
      mechanismV2Fixture(),
      "sha256:" + "a".repeat(64),
    );
    const variant = prepared.variants[prepared.baseSourceKey]!;
    expect(Object.keys(variant.shapeAssociations)).toEqual(["pawl", "spring"]);
    for (const association of Object.values(variant.shapeAssociations)) {
      expect(NativeShapeAssociationSchema.safeParse(association).success).toBe(
        true,
      );
      expect(
        association.groups.reduce((sum, group) => sum + group.count, 0),
      ).toBe(association.indexCount);
    }
  });
  it("does not relabel a style change as a geometry or template change", async () => {
    const source = mechanismV2Fixture();
    const prepared = await prepareNative3DSceneV2(
      source,
      "sha256:" + "a".repeat(64),
      {
        variants: [
          {
            materialOverrides: {
              [source.geometry.materials[0]!.id]: { roughness: 0.25 },
            },
          },
        ],
      },
    );
    const variants = Object.values(prepared.variants);
    const a = variants[0]!.shapeAssociations.pawl!,
      b = variants[1]!.shapeAssociations.pawl!;
    expect(a.topologySha256).toBe(b.topologySha256);
    expect(a.templateSha256).toBe(b.templateSha256);
    expect(a.templateMeshDataSha256).toBe(b.templateMeshDataSha256);
    expect(a.groups[0]!.materialSha256).not.toBe(b.groups[0]!.materialSha256);
  });
  it("admits fractional ordered half-open intervals and rejects empty/overlapping policies", () => {
    const policy = {
      version: "mechanism-shape-draw-evidence-1",
      requiredIntervals: [{ startFrame: 0.25, endFrameExclusive: 1.5 }],
      allowedOutsideProof: ["authored-hidden"],
    };
    expect(MechanismShapeDrawEvidenceSchema.safeParse(policy).success).toBe(
      true,
    );
    expect(
      MechanismShapeDrawEvidenceSchema.safeParse({
        ...policy,
        requiredIntervals: [],
      }).success,
    ).toBe(false);
    expect(
      MechanismShapeDrawEvidenceSchema.safeParse({
        ...policy,
        requiredIntervals: [
          policy.requiredIntervals[0],
          { startFrame: 1, endFrameExclusive: 2 },
        ],
      }).success,
    ).toBe(false);
  });
  it("cannot attach GPU positions or landmarks to a not-drawn receipt", async () => {
    const prepared = await prepareNative3DSceneV2(
      mechanismV2Fixture(),
      "sha256:" + "a".repeat(64),
    );
    const association =
      prepared.variants[prepared.baseSourceKey]!.shapeAssociations.pawl!;
    const receipt = {
      association,
      driverStateKey: "held",
      status: "not-drawn",
      reason: "authored-hidden",
    };
    expect(NativeObservedShapeSchema.safeParse(receipt).success).toBe(true);
    expect(
      NativeObservedShapeSchema.safeParse({
        ...receipt,
        landmarks: { tip: [0, 0, 0] },
      }).success,
    ).toBe(false);
  });
});

describe("sealed optional trigger observation", () => {
  it("seals the source's trigger flag and rejects missing or invented used landmarks", async () => {
    const source = createCableTiePack({
        variant: "inside-serrated-extended-trigger-cutaway",
      }).scene,
      prepared = await prepareNative3DSceneV2(
        source,
        "sha256:" + "a".repeat(64),
      ),
      association =
        prepared.variants[prepared.baseSourceKey]!.shapeAssociations.pawl!;
    expect(association.triggerLandmark).toBe(true);
    const layout = {
        location: 0,
        byteLength: association.vertexCount * 12,
        components: 3,
        type: 5126,
        enabled: true,
        normalized: false,
        integer: false,
        divisor: 0,
        stride: 12,
        byteOffset: 0,
      },
      point = {
        local: [0, 0, 0],
        world: [0, 0, 0],
        positionMethod: "used-position-landmark-1",
      },
      hash = "sha256:" + "b".repeat(64);
    const receipt = {
      association,
      driverStateKey: "pawl:1",
      status: "drawn",
      ownerWorldMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      positionSha256: hash,
      normalSha256: hash,
      indexSha256: hash,
      positionLayout: layout,
      normalLayout: { ...layout, location: 1 },
      landmarks: { root: point, tip: point, trigger: point },
      submissions: association.groups.map((group) => ({
        ...group,
        drawOrdinal: group.groupIndex,
        readbackOrdinal: group.groupIndex,
        streamSet: 0,
        mode: 4,
        type: 5123,
        byteOffset: group.start * 2,
      })),
    };
    expect(NativeObservedShapeSchema.safeParse(receipt).success).toBe(true);
    expect(
      NativeObservedShapeSchema.safeParse({
        ...receipt,
        landmarks: { root: point, tip: point },
      }).success,
    ).toBe(false);
    expect(
      NativeObservedShapeSchema.safeParse({
        ...receipt,
        landmarks: { ...receipt.landmarks, invented: point },
      }).success,
    ).toBe(false);
    const unextended = { ...association };
    delete unextended.triggerLandmark;
    expect(
      NativeObservedShapeSchema.safeParse({
        ...receipt,
        association: unextended,
      }).success,
    ).toBe(false);
    expect(
      NativeShapeAssociationSchema.safeParse({
        ...association,
        generator: "seated-torsion-spring-1",
      }).success,
    ).toBe(false);
  });
});
