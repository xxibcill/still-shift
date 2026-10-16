import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Curve,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LineCurve3,
  Shape,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  MechanismMeshSchema,
  SolidGeometrySchema,
  type MechanismMesh,
} from "@still-shift/scene-contract";
import {
  admitMechanismPrimitive,
  MECHANISM_PRIMITIVE_LIMITS,
  MechanismPrimitiveAdmissionError,
  MechanismPrimitiveGeometryInputSchema,
  type MechanismPrimitiveAdmission,
  type MechanismPrimitiveGeometryInput,
  type MechanismPrimitiveInput,
  type MechanismPrimitiveParameters,
} from "./primitive-contract.ts";
export * from "./primitive-contract.ts";

/** Closed, rigid local meshes. Appearance and part transforms belong to the consumer. */
export function createMechanismPrimitiveMesh(
  input: MechanismPrimitiveInput,
): MechanismMesh {
  const { parameters, admission } = admitMechanismPrimitive(input);
  return serializePrimitive(parameters, admission);
}
/** Admit the complete catalogue before constructing even its first geometry. */
export function createMechanismPrimitiveGeometry(
  input: MechanismPrimitiveGeometryInput,
) {
  const parsed = MechanismPrimitiveGeometryInputSchema.parse(input);
  const definitions = parsed.meshes.map((mesh) =>
    admitMechanismPrimitive(mesh),
  );
  const totals = definitions.reduce(
    (sum, value) => ({
      vertices: sum.vertices + value.admission.verticesUpperBound,
      triangles: sum.triangles + value.admission.trianglesUpperBound,
      bytes: sum.bytes + value.admission.workingBytesUpperBound,
    }),
    { vertices: 0, triangles: 0, bytes: 0 },
  );
  if (
    totals.vertices > MECHANISM_PRIMITIVE_LIMITS.vertices ||
    totals.triangles > MECHANISM_PRIMITIVE_LIMITS.triangles ||
    totals.bytes > MECHANISM_PRIMITIVE_LIMITS.workingBytes
  )
    throw new MechanismPrimitiveAdmissionError(
      "Primitive catalogue exceeds aggregate topology or declared working storage budget",
    );
  return SolidGeometrySchema.parse({
    schemaVersion: "solid-geometry-1",
    materials: parsed.materials,
    meshes: definitions.map(({ parameters, admission }) =>
      serializePrimitive(parameters, admission),
    ),
  });
}
function serializePrimitive(
  parameters: MechanismPrimitiveParameters,
  admission: MechanismPrimitiveAdmission,
): MechanismMesh {
  const geometry = createGeometry(parameters);
  try {
    const positions = Array.from(geometry.getAttribute("position").array);
    const normals = Array.from(geometry.getAttribute("normal").array);
    const uvs = Array.from(geometry.getAttribute("uv").array);
    const indices = geometry.index
      ? Array.from(geometry.index.array)
      : Array.from({ length: positions.length / 3 }, (_, i) => i);
    if (
      positions.length / 3 > admission.verticesUpperBound ||
      indices.length / 3 > admission.trianglesUpperBound
    )
      throw Error("Primitive generator exceeded its admitted topology");
    geometry.computeBoundingBox();
    return MechanismMeshSchema.parse({
      id: parameters.id,
      partId: parameters.partId,
      materialId: parameters.materialId,
      positions,
      normals,
      uvs,
      indices,
      bounds: {
        min: geometry.boundingBox!.min.toArray(),
        max: geometry.boundingBox!.max.toArray(),
      },
    });
  } finally {
    geometry.dispose();
  }
}

function createGeometry(input: MechanismPrimitiveParameters): BufferGeometry {
  switch (input.kind) {
    case "rounded-box":
      return input.radius === 0
        ? new BoxGeometry(...input.size)
        : new RoundedBoxGeometry(...input.size, input.segments, input.radius);
    case "cylinder":
      return new CylinderGeometry(
        input.radiusTop,
        input.radiusBottom,
        input.height,
        input.radialSegments,
        input.heightSegments,
        false,
      );
    case "torus":
      return new TorusGeometry(
        input.radius,
        input.tubeRadius,
        input.radialSegments,
        input.tubularSegments,
      );
    case "extruded-profile": {
      const shape = polygon(input.points);
      shape.holes = input.holes.map((hole) => polygon(hole));
      return new ExtrudeGeometry(shape, {
        depth: input.depth,
        steps: input.steps,
        curveSegments: 1,
        bevelEnabled: !!input.bevel,
        bevelSize: input.bevel?.size,
        bevelThickness: input.bevel?.thickness,
        bevelSegments: input.bevel?.segments,
      });
    }
    case "swept-ribbon": {
      const points = input.points.map((point) => new Vector3(...point));
      const curve =
        points.length === 2
          ? new LineCurve3(points[0]!, points[1]!)
          : new CatmullRomCurve3(points, false, "centripetal");
      const shape = polygon([
        [-input.width / 2, -input.thickness / 2],
        [input.width / 2, -input.thickness / 2],
        [input.width / 2, input.thickness / 2],
        [-input.width / 2, input.thickness / 2],
      ]);
      return new ExtrudeGeometry(shape, {
        extrudePath: curve,
        steps: input.segments,
        curveSegments: 1,
        bevelEnabled: false,
      });
    }
    case "coil":
      return cappedCoil(input);
  }
}
function polygon(points: [number, number][]): Shape {
  const shape = new Shape();
  shape.moveTo(...points[0]!);
  for (const point of points.slice(1)) shape.lineTo(...point);
  shape.closePath();
  return shape;
}
class HelixCurve extends Curve<Vector3> {
  constructor(
    private readonly parameters: Extract<
      MechanismPrimitiveParameters,
      { kind: "coil" }
    >,
  ) {
    super();
  }
  override getPoint(t: number, target = new Vector3()) {
    const input = this.parameters,
      angle = t * input.turns * 2 * Math.PI;
    return target.set(
      input.radius * Math.cos(angle),
      (t - 0.5) * input.turns * input.pitch,
      input.radius * Math.sin(angle),
    );
  }
}
function cappedCoil(
  input: Extract<MechanismPrimitiveParameters, { kind: "coil" }>,
): BufferGeometry {
  const curve = new HelixCurve(input),
    tube = new TubeGeometry(
      curve,
      input.tubularSegments,
      input.wireRadius,
      input.radialSegments,
      false,
    );
  try {
    const positions = Array.from(tube.getAttribute("position").array),
      normals = Array.from(tube.getAttribute("normal").array),
      uvs = Array.from(tube.getAttribute("uv").array),
      indices = Array.from(tube.index!.array);
    for (const end of [0, input.tubularSegments]) {
      const tangent = tube.tangents[end]!.clone().multiplyScalar(
        end === 0 ? -1 : 1,
      );
      const center = curve.getPointAt(end === 0 ? 0 : 1);
      const start = positions.length / 3;
      positions.push(...center.toArray());
      normals.push(...tangent.toArray());
      uvs.push(0.5, 0.5);
      for (let ring = 0; ring <= input.radialSegments; ring++) {
        const offset = (end * (input.radialSegments + 1) + ring) * 3;
        positions.push(
          ...Array.from(
            tube.getAttribute("position").array.slice(offset, offset + 3),
          ),
        );
        normals.push(...tangent.toArray());
        const angle = (ring / input.radialSegments) * 2 * Math.PI;
        uvs.push((Math.cos(angle) + 1) / 2, (Math.sin(angle) + 1) / 2);
      }
      const a = new Vector3().fromArray(positions, (start + 1) * 3).sub(center),
        b = new Vector3().fromArray(positions, (start + 2) * 3).sub(center);
      const forward = a.cross(b).dot(tangent) > 0;
      for (let ring = 0; ring < input.radialSegments; ring++) {
        const first = start + ring + 1,
          second = first + 1;
        indices.push(start, forward ? first : second, forward ? second : first);
      }
    }
    return new BufferGeometry()
      .setAttribute("position", new Float32BufferAttribute(positions, 3))
      .setAttribute("normal", new Float32BufferAttribute(normals, 3))
      .setAttribute("uv", new Float32BufferAttribute(uvs, 2))
      .setIndex(indices);
  } finally {
    tube.dispose();
  }
}
