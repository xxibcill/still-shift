# Shared mechanism geometry primitives

The public Node API is exported from `@still-shift/animation-engine`. It feeds
the existing `solid-geometry-1`/mechanism mesh contract, with local right-handed
coordinates, actual indexed triangles, unit normals, UVs and measured bounds.
Appearance, units and part transforms belong to the consuming scene.

```ts
import {
  admitMechanismPrimitive,
  createMechanismPrimitiveGeometry,
} from "@still-shift/animation-engine";

const coil = {
  kind: "coil" as const,
  id: "spring",
  partId: "spring-seat",
  materialId: "steel",
  radius: 0.9,
  wireRadius: 0.1,
  pitch: 0.35,
  turns: 3.5,
};
const { admission } = admitMechanismPrimitive(coil);
const geometry = createMechanismPrimitiveGeometry({
  meshes: [coil],
  materials: [
    { id: "steel", color: "#b7c2c5", roughness: 0.3, metalness: 0.8 },
  ],
});
```

`createMechanismPrimitiveMesh(input)` constructs one strict mesh.
`createMechanismPrimitiveGeometry(input)` validates the full catalogue and
admits its cumulative budget **before constructing the first mesh**. Duplicate
IDs and unknown material references fail before construction. Material changes
preserve mesh arrays. The returned geometry has no file/source checksum; the
consumer must bind its canonical geometry hash and actual serialized asset bytes
through the existing scene and composition routes.

## Supported treatments

| Kind               | Parameters and behavior                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rounded-box`      | Three positive side lengths, explicit radius, 1–8 corner segments. Radius zero produces a normal box; positive radius must leave planar spans.                    |
| `cylinder`         | Top/bottom radii, height, 8–96 radial and 1–8 height segments. Both caps are closed; one zero radius permits a cone.                                              |
| `torus`            | Major/tube radii, 6–32 radial and 12–128 tubular segments. Tube must leave a central opening.                                                                     |
| `extruded-profile` | Polygon in local XY, extrusion along positive Z, optional holes and straight depth steps. Optional size/thickness/segments produce simple bevels.                 |
| `swept-ribbon`     | Rectangular cross section along 2–16 local 3D control points, 8–128 segments, with closed end caps. Two points use a line; longer paths use a centripetal spline. |
| `coil`             | Radius, wire radius, pitch, turn count, radial/tubular resolution. Rigid helix around local Y with explicitly capped ends.                                        |

Profile loops contain distinct corners without a repeated closing point or
collinear corners. The outer loop permits at most 64 points; up to eight holes
permit 32 points each. Reject crossings, external/touching/nested/overlapping
holes and bevels that remove positive corner/boundary or straight-depth
clearance. Ribbon spans must exceed half the cross section and may not reverse
through their previous span. Coil pitch must exceed wire diameter, the bore
must remain open, and resolution must provide at least twelve segments per turn.

## Admission and evidence

`admitMechanismPrimitive()` returns parsed parameters and a
`mechanism-primitive-admission-1` receipt. Conservative nonindexed topology
upper bounds, including end caps, are checked before Three construction.
Limits are 100,000 prospective vertices, 200,000 triangles and 16 MiB of
declared geometry number storage. The storage estimate accounts conservatively
for construction/serialization copies; it is not process/SDK/driver RSS.
Catalogue admission adds every individual upper bound, including its fixed
overhead. High-resolution inputs may fail that budget even within individual
parameter ranges. Complete scene, GPU textures, PMREM, world clones and expected
frame graphs still need their separate MS2 allocation preflight.

The coil is a rigid primitive. Seated, deflected torsion springs and fixed-root
pawls use the existing `seated-torsion-spring-1` and `fixed-root-pawl-curve-1`
teaching-shape routes; do not replace their constraints with a stretched mesh.
These generators explain authored geometry, not manufacturing tolerances or a
general collision/physics solver. Unsupported geometry requires the separately
validated import route; the expanded MS2 glTF/GLB importer remains open.

`pnpm test:browser:mechanism-primitives` renders seven example treatments
(including separate plain/beveled profiles) twice through the real native
solid-source renderer. Independent physical observation packet checks and
exact repeat RGBA hashes accompany the retained images. Thirteen focused tests
check closed geometric edge membership at fixed1e-5 positional quantization,
outward triangles/holes/caps/UVs/determinism, rejected controls and admissions,
and style-only stable meshes. They are evidence on those authored cases, not
proof of every possible non-self-intersecting swept surface. Full family, camera,
installed-package and human acceptance remain separate. See
[MS2 records](./mechanism-shorts-ms2-results.json) and the
[owning milestone](./mechanism-shorts-production-plan.md#ms2-reusable-mechanism-families-and-authoring).
