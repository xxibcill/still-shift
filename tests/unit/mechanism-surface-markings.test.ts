import { resolveCueSurfaceMarking } from "../../packages/animation-engine/src/mechanism/cue-surface-markings.ts";
import { Euler, Matrix4, Quaternion, Triangle, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { MechanismNarratedCycleSchema } from "@still-shift/scene-contract";
import { compileMechanismNarratedCycle } from "../../packages/animation-engine/src/mechanism/narrated-cycle.ts";
import {
  applyMechanismCuePatch,
  inspectMechanismCueAuthoring,
} from "../../packages/animation-engine/src/mechanism/cue-authoring.ts";
import { narratedCycleFixture } from "../helpers/mechanism-narrated-cycle.ts";
const mark = (mesh: string, triangle = 0) => ({
  id: "mark",
  kind: "surface-marking" as const,
  text: "Pin",
  mesh,
  triangle,
  barycentric: [1 / 3, 1 / 3, 1 / 3],
  rollRadians: 0,
  pixelsPerUnit: 100000,
  sizePixels: [64, 32],
  fontSizePixels: 16,
  ink: "#d04020",
});
function input(family: "tape-hook" | "cable-tie" | "clothespeg" = "tape-hook") {
  const fixture = narratedCycleFixture(family);
  const mesh = fixture.instance.scene.geometry.meshes[0]!;
  let triangle = 0,
    largest = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const p = mesh.indices
      .slice(i, i + 3)
      .map((index) => mesh.positions.slice(index * 3, index * 3 + 3));
    const a = p[1]!.map((v, k) => v - p[0]![k]!),
      b = p[2]!.map((v, k) => v - p[0]![k]!);
    const area = Math.hypot(
      a[1]! * b[2]! - a[2]! * b[1]!,
      a[2]! * b[0]! - a[0]! * b[2]!,
      a[0]! * b[1]! - a[1]! * b[0]!,
    );
    if (area > largest) {
      largest = area;
      triangle = i / 3;
    }
  }
  return {
    ...fixture,
    document: {
      ...fixture.document,
      cues: fixture.document.cues.map((cue, i) => ({
        ...cue,
        ...(i ? {} : { worldAnnotations: [mark(mesh.id, triangle)] }),
      })),
    },
  };
}
function surface(f: ReturnType<typeof input>) {
  const annotation = f.document.cues[0]!.worldAnnotations![0]!;
  if (annotation.kind !== "surface-marking")
    throw Error("Expected authored surface");
  return annotation;
}
function failure(f: ReturnType<typeof input>, code: string, field: string) {
  expect(() => compileMechanismNarratedCycle(f.instance, f.document)).toThrow();
  try {
    compileMechanismNarratedCycle(f.instance, f.document);
  } catch (error) {
    expect((error as { location: unknown }).location).toMatchObject({
      code,
      path: ["cues", 0, "worldAnnotations", 0, field],
    });
  }
}
describe("rigid mesh surface marking cues", () => {
  it("derives the owning part and a front-facing plane from an actual indexed Float32 triangle in all three families", () => {
    for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
      const f = input(family),
        source = f.instance.scene.geometry.meshes[0]!;
      surface(f).rollRadians = 0.37;
      const result = compileMechanismNarratedCycle(f.instance, f.document);
      const layer = result.composition.layers.find(
        (l) => l.metadata?.track === "world-annotation",
      )!;
      expect(layer.type).toBe("text");
      expect(layer.native3D).toMatchObject({
        role: "world-graphic",
        part: source.partId,
        side: "front",
        alphaMode: "mask",
      });
      expect(layer.overlayAfter).toBeUndefined();
      expect(layer.metadata?.surface).toMatchObject({
        mesh: source.id,
        triangle: surface(f).triangle,
        precision: "gpu-float32-rigid-triangle-1",
      });
      const binding = layer.native3D!;
      if (binding.role !== "world-graphic")
        throw Error("Expected a surface plane");
      const triangle = surface(f).triangle;
      const vertices = source.indices
        .slice(triangle * 3, triangle * 3 + 3)
        .map((index) =>
          source.positions.slice(index * 3, index * 3 + 3).map(Math.fround),
        );
      const center = [0, 1, 2].map((axis) =>
        vertices.reduce((sum, p) => sum + p[axis]! / 3, 0),
      );
      const offset = binding.transform!.position.map((v, i) => v - center[i]!);
      expect(Math.hypot(...offset)).toBeGreaterThan(0);
      expect(Math.hypot(...offset)).toBeLessThan(0.001);
      const triangleShape = new Triangle(
        ...(vertices.map((v) => new Vector3(...v)) as [
          Vector3,
          Vector3,
          Vector3,
        ]),
      );
      const normal = triangleShape.getNormal(new Vector3());
      const trs = binding.transform!;
      const matrix = new Matrix4().compose(
        new Vector3(...trs.position),
        new Quaternion().setFromEuler(new Euler(...trs.rotation, "XYZ")),
        new Vector3(...trs.scale),
      );
      const planeNormal = new Vector3(0, 0, 1).transformDirection(matrix);
      expect(planeNormal.dot(normal)).toBeCloseTo(1, 10);
      const bias = new Vector3(...offset).dot(normal);
      expect(bias).toBeGreaterThan(0);
      for (const dx of [-33, 33])
        for (const dy of [-17, 17]) {
          const corner = new Vector3(
            dx / surface(f).pixelsPerUnit,
            dy / surface(f).pixelsPerUnit,
            0,
          )
            .applyMatrix4(matrix)
            .addScaledVector(normal, -bias);
          expect(triangleShape.containsPoint(corner)).toBe(true);
          expect(corner.clone().sub(triangleShape.a).dot(normal)).toBeCloseTo(
            0,
            10,
          );
        }

      expect(result.recording).toEqual(
        compileMechanismNarratedCycle(
          f.instance,
          f.document.cues.length
            ? {
                ...f.document,
                cues: f.document.cues.map(
                  ({ worldAnnotations: _, ...cue }) => cue,
                ),
              }
            : f.document,
        ).recording,
      );
    }
  });
  it("preserves the actual face basis at and near the Euler pole", () => {
    for (const tilt of [0, 0.0001]) {
      const f = input("cable-tie"),
        scene = structuredClone(f.instance.scene),
        mesh = scene.geometry.meshes[0]!;
      mesh.indices.splice(0, 3, 0, 1, 2);
      mesh.positions.splice(0, 9, 0, 0, 0, 0, 0, 4, tilt * 4, 4, 0);
      const parsed = MechanismNarratedCycleSchema.parse({
        ...f.document,
        cues: f.document.cues.map((cue, i) =>
          i
            ? cue
            : {
                ...cue,
                worldAnnotations: [
                  { ...surface(f), triangle: 0, rollRadians: 0.37 },
                ],
              },
        ),
      });
      const annotation = parsed.cues[0]!.worldAnnotations![0]!;
      if (annotation.kind !== "surface-marking")
        throw Error("Expected surface");
      const result = resolveCueSurfaceMarking(scene, annotation, (message) => {
        throw Error(message);
      });
      const rotation = new Matrix4().makeRotationFromEuler(
        new Euler(...result.annotation.transform.rotation, "XYZ"),
      );
      const normal = new Triangle(
        new Vector3(0, 0, 0),
        new Vector3(0, 0, 4),
        new Vector3(Math.fround(tilt * 4), 4, 0),
      ).getNormal(new Vector3());
      expect(
        new Vector3(0, 0, 1).transformDirection(rotation).distanceTo(normal),
      ).toBeLessThan(1e-10);
      const expectedAxis = new Vector3(0, 0, 1).applyAxisAngle(normal, 0.37);
      expect(
        new Vector3(1, 0, 0)
          .transformDirection(rotation)
          .distanceTo(expectedAxis),
      ).toBeLessThan(1e-10);
    }
  });
  it("rejects nonexistent mesh and triangle with cue-located fields", () => {
    const f = input();
    surface(f).mesh = "missing";
    failure(f, "mechanism-cue-surface", "mesh");
    const g = input();
    surface(g).triangle = 100000;
    failure(g, "mechanism-cue-surface", "triangle");
  });
  it("rejects box footprints outside the actual triangle instead of shrinking or floating the mark", () => {
    const f = input();
    f.document.cues[0]!.worldAnnotations![0]!.pixelsPerUnit = 1;
    failure(f, "mechanism-cue-surface", "sizePixels");
  });
  it("rejects deforming teaching meshes even when their template triangle is well formed", () => {
    const f = input("cable-tie");
    surface(f).mesh = f.instance.scene.teachingShapes[0]!.mesh;
    failure(f, "mechanism-cue-surface", "mesh");
  });
  it("rejects triangles that collapse after actual Float32 quantization", () => {
    const f = input("cable-tie"),
      changed = structuredClone(f.instance.scene),
      mesh = changed.geometry.meshes[0]!;
    const indices = mesh.indices.slice(
      surface(f).triangle * 3,
      surface(f).triangle * 3 + 3,
    );
    for (const [i, index] of indices.entries())
      for (let axis = 0; axis < 3; axis++)
        mesh.positions[index * 3 + axis] =
          1000000 + i * 0.000001 + axis * 0.000001;
    expect(() =>
      compileMechanismNarratedCycle(
        { ...f.instance, scene: changed },
        f.document,
      ),
    ).toThrow(/degenerates.*Float32/i);
  });
  it("rejects excessive precision bias and resolves the actual triangle group material", () => {
    const f = input(),
      changed = structuredClone(f.instance.scene);
    changed.camera.far = 10000000;
    expect(() =>
      compileMechanismNarratedCycle(
        { ...f.instance, scene: changed },
        f.document,
      ),
    ).toThrow(/placement bias/i);
    const shifted = input();
    shifted.document.cues[0]!.camera = {
      ...shifted.instance.scene.camera,
      position: [1000000, 0, 0],
    };
    expect(() =>
      compileMechanismNarratedCycle(shifted.instance, shifted.document),
    ).toThrow(/placement bias/i);
    const g = input(),
      grouped = structuredClone(g.instance.scene),
      gm = grouped.geometry.meshes[0]!,
      offset = surface(g).triangle * 3;
    const group = gm.groups!.find(
      (x) => x.start <= offset && offset < x.start + x.count,
    )!;
    grouped.geometry.materials[group.materialIndex]!.alphaMode = "mask";
    grouped.geometry.materials[group.materialIndex]!.opacity = 0.5;
    expect(() =>
      compileMechanismNarratedCycle(
        { ...g.instance, scene: grouped },
        g.document,
      ),
    ).toThrow(/opaque/i);
  });
  it("bounds barycentric authoring and forbids manual part or transform injection", () => {
    for (const extra of [
      { barycentric: [0.2, 0.2, 0.2] },
      { barycentric: [0, 0.5, 0.5] },
      { part: "hook" },
      { transform: { position: [0, 0, 20] } },
      { side: "double" },
      { triangle: -1 },
      { rollRadians: 4 },
    ]) {
      const f = input();
      Object.assign(f.document.cues[0]!.worldAnnotations![0]!, extra);
      expect(MechanismNarratedCycleSchema.safeParse(f.document).success).toBe(
        false,
      );
    }
  });
  it("rejects masked substrate or source scale outside the admitted rigid precision subset", () => {
    const f = input("cable-tie");
    const changed = structuredClone(f.instance.scene);
    const mesh = changed.geometry.meshes[0]!;
    const material = changed.geometry.materials.find(
      (m) => m.id === mesh.materialId,
    )!;
    material.alphaMode = "mask";
    material.opacity = 0.5;
    expect(() =>
      compileMechanismNarratedCycle(
        { ...f.instance, scene: changed },
        f.document,
      ),
    ).toThrow(/opaque/i);
    const g = input();
    const scaled = structuredClone(g.instance.scene);
    scaled.parts[0]!.transform.scale = [2, 1, 1];
    expect(() =>
      compileMechanismNarratedCycle(
        { ...g.instance, scene: scaled },
        g.document,
      ),
    ).toThrow(/scale/i);
  });
  it("replaces full world annotation variants by stable ID and requires native plate invalidation", () => {
    const f = input();
    const inspected = inspectMechanismCueAuthoring(f.instance, f.document);
    const { id, ...value } = {
      ...mark(f.instance.scene.geometry.meshes[0]!.id, surface(f).triangle),
    };
    expect(id).toBe("mark");
    const patched = applyMechanismCuePatch(f.instance, f.document, {
      schemaVersion: "mechanism-cue-patch-1",
      baseRevision: 0,
      baseHash: inspected.projectHash,
      operations: [
        {
          cue: "intro",
          annotation: "mark",
          property: "world-annotation",
          value,
        },
      ],
    });
    expect(patched.document.cues[0]!.worldAnnotations![0]).toMatchObject({
      id: "mark",
      triangle: value.triangle,
    });
    expect(patched.cacheEffects.nativePlates).toBe(
      "invalidate-whole-native-clip",
    );
    const before = inspectMechanismCueAuthoring(f.instance, patched.document);
    const world = {
      kind: "world-text",
      text: "Pin",
      part: f.instance.scene.parts[0]!.id,
      transform: {},
      pixelsPerUnit: 100,
      sizePixels: [64, 32],
    };
    const replaced = applyMechanismCuePatch(f.instance, patched.document, {
      schemaVersion: "mechanism-cue-patch-1",
      baseRevision: patched.document.revision,
      baseHash: before.projectHash,
      operations: [
        {
          cue: "intro",
          annotation: "mark",
          property: "world-annotation",
          value: world,
        },
      ],
    });
    expect(replaced.document.cues[0]!.worldAnnotations![0]).toMatchObject({
      id: "mark",
      kind: "world-text",
    });
    expect(replaced.document.cues[0]!.worldAnnotations![0]).not.toHaveProperty(
      "mesh",
    );
  });
});
