import { z } from "zod";
import { Vector3, Triangle, Matrix4 } from "three";
import {
  MechanismFrameRequestV2Schema,
  MechanismCameraSchema,
  type MechanismSceneV2,
  type MechanismFrameResultV2,
  type MechanismCamera,
  type MechanismPackDocument,
  type MechanismPackReference,
} from "@still-shift/scene-contract";
import { prepareMechanismSceneV2 } from "../../../renderer-core/src/mechanism/prepare-v2.ts";
import { evaluateMechanismFrameV2 } from "../../../renderer-core/src/mechanism/evaluate-v2.ts";
import { projectMechanismAnchor } from "../../../renderer-core/src/mechanism/projection.ts";
import { nativeAnchorVisibilities } from "../../../renderer-core/src/native3d/physical-visibility.ts";
import { MechanismPackInvariantError } from "./pack-invariant.ts";
import { mechanismPackHash, freezeMechanismPack } from "./pack-support.ts";

type Vec = [number, number, number];
type Target = MechanismPackDocument["cameraTargets"][number];
export const MECHANISM_CAMERA_LIMITS = Object.freeze({
  frames: 64,
  regions: 8,
  proofSurfaces: 8,
  worldStorageBytes: 8 * 1024 ** 2,
  planBytes: 32768,
});
const pixel = z.number().finite().min(0).max(8192);
const rect = z
  .object({ left: pixel, top: pixel, right: pixel, bottom: pixel })
  .strict()
  .refine(
    (r) => r.right > r.left && r.bottom > r.top,
    "Rectangle must be nonempty",
  );
export const MechanismCameraRecipeRequestSchema =
  MechanismFrameRequestV2Schema.omit({ camera: true, cameraKeys: true })
    .extend({
      target: z
        .string()
        .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/)
        .max(128),
      safeInsets: z
        .object({ left: pixel, top: pixel, right: pixel, bottom: pixel })
        .strict()
        .default({ left: 12, top: 12, right: 12, bottom: 12 }),
      reservedRegions: z
        .array(z.object({ id: z.string().min(1).max(128), rect }).strict())
        .max(MECHANISM_CAMERA_LIMITS.regions)
        .default([]),
      paddingPixels: z.number().finite().min(0).max(256).default(6),
      envelopeFrames: z
        .array(MechanismFrameRequestV2Schema.shape.frame)
        .min(1)
        .max(MECHANISM_CAMERA_LIMITS.frames)
        .optional(),
      fovDegrees: z.number().finite().min(14).max(65).optional(),
      authoredCamera: MechanismCameraSchema.optional(),
      directionIndex: z.number().int().min(0).max(7).optional(),
      orbitDegrees: z.number().finite().min(-30).max(30).default(0),
    })
    .strict();
export type MechanismCameraRecipeRequest = z.input<
  typeof MechanismCameraRecipeRequestSchema
>;
export interface MechanismCameraPack {
  pack: MechanismPackReference;
  scene: MechanismSceneV2;
  sourceSha256: string;
  cameraTargets: Target[];
  cameraTargetsSha256: string;
}
interface SurfaceBinding {
  id: string;
  mesh: string;
  triangleIndex: number;
  barycentric: Vec;
}
type Bounds = { min: Vec; max: Vec };
type Request = z.infer<typeof MechanismCameraRecipeRequestSchema>;
function fail(
  instance: MechanismCameraPack,
  request: Request,
  message: string,
  path: (string | number)[],
  code = "mechanism-camera-framing",
): never {
  throw new MechanismPackInvariantError(message, {
    code,
    path: ["cameraRecipes", request.target, ...path],
    frame: request.frame,
    pack: instance.pack,
  });
}
const vector = (v: ArrayLike<number>) => new Vector3(v[0]!, v[1]!, v[2]!);
const tuple = (v: Vector3): Vec => [v.x, v.y, v.z];
const emptyBounds = (): Bounds => ({
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity],
});
function include(bounds: Bounds, p: ArrayLike<number>) {
  for (let a = 0; a < 3; a++) {
    bounds.min[a] = Math.min(bounds.min[a]!, p[a]!);
    bounds.max[a] = Math.max(bounds.max[a]!, p[a]!);
  }
}
function corners(b: Bounds): Vec[] {
  return Array.from(
    { length: 8 },
    (_, i) =>
      [
        b[i & 1 ? "max" : "min"][0],
        b[i & 2 ? "max" : "min"][1],
        b[i & 4 ? "max" : "min"][2],
      ] as Vec,
  );
}
function poseRequest(request: Request, frame = request.frame) {
  return {
    frame,
    width: request.width,
    height: request.height,
    rigControls: request.rigControls,
    hiddenParts: request.hiddenParts,
    ...(request.seed === undefined ? {} : { seed: request.seed }),
  };
}
function positions(
  scene: MechanismSceneV2,
  frame: MechanismFrameResultV2,
  mesh: string,
) {
  return (
    Object.values(frame.shapeStates).find((s) => s.mesh === mesh)?.positions ??
    scene.geometry.meshes.find((m) => m.id === mesh)!.positions
  );
}
function localTriangle(
  scene: MechanismSceneV2,
  frame: MechanismFrameResultV2,
  meshId: string,
  index: number,
) {
  const mesh = scene.geometry.meshes.find((m) => m.id === meshId)!;
  const p = positions(scene, frame, meshId);
  return new Triangle(
    ...([0, 1, 2].map((n) =>
      vector(
        p.slice(
          mesh.indices[index * 3 + n]! * 3,
          mesh.indices[index * 3 + n]! * 3 + 3,
        ),
      ),
    ) as [Vector3, Vector3, Vector3]),
  );
}
function bindSurfaces(
  instance: MechanismCameraPack,
  target: Target,
  neutral: MechanismFrameResultV2,
  request: Request,
): SurfaceBinding[] {
  return target.proofSurfaces.map((s, index) => {
    const mesh = instance.scene.geometry.meshes.find((m) => m.id === s.mesh);
    const anchor = neutral.anchors[s.nearAnchor];
    if (!mesh || !anchor)
      fail(
        instance,
        request,
        "Proof surface mesh or anchor is absent",
        ["proofSurfaces", index],
        "mechanism-camera-reference",
      );
    const inverse = new Matrix4()
      .fromArray(neutral.parts[mesh.partId]!.worldMatrix)
      .invert();
    const desired = vector(anchor.world).applyMatrix4(inverse);
    for (let a = 0; a < 3; a++)
      desired.setComponent(
        a,
        desired.getComponent(a) +
          s.offsetRatio[a]! * (mesh.bounds.max[a]! - mesh.bounds.min[a]!),
      );
    let best: number | undefined,
      minimum = Infinity,
      point = new Vector3();
    for (let t = 0; t < mesh.indices.length / 3; t++) {
      const triangle = localTriangle(instance.scene, neutral, mesh.id, t);
      if (triangle.getNormal(new Vector3()).dot(vector(s.normal)) < 0.45)
        continue;
      const p = triangle.closestPointToPoint(desired, new Vector3()),
        distance = p.distanceToSquared(desired);
      if (distance < minimum) {
        best = t;
        minimum = distance;
        point = p;
      }
    }
    if (best === undefined)
      fail(
        instance,
        request,
        "No actual triangle satisfies the declared proof normal",
        ["proofSurfaces", index, "normal"],
        "mechanism-camera-surface",
      );
    const bary = localTriangle(
      instance.scene,
      neutral,
      mesh.id,
      best,
    ).getBarycoord(point, new Vector3());
    if (!bary)
      fail(
        instance,
        request,
        "Proof triangle is degenerate",
        ["proofSurfaces", index],
        "mechanism-camera-surface",
      );
    return {
      id: s.id,
      mesh: mesh.id,
      triangleIndex: best,
      barycentric: tuple(bary),
    };
  });
}
function surfaceWorld(
  instance: MechanismCameraPack,
  frame: MechanismFrameResultV2,
  s: SurfaceBinding,
): Vec {
  const mesh = instance.scene.geometry.meshes.find((m) => m.id === s.mesh)!;
  const t = localTriangle(instance.scene, frame, mesh.id, s.triangleIndex),
    b = s.barycentric;
  return tuple(
    t.a
      .clone()
      .multiplyScalar(b[0])
      .addScaledVector(t.b, b[1])
      .addScaledVector(t.c, b[2])
      .applyMatrix4(
        new Matrix4().fromArray(frame.parts[mesh.partId]!.worldMatrix),
      ),
  );
}
function selectedMeshes(instance: MechanismCameraPack, target: Target) {
  const selected = new Set(target.framing.ids);
  if (target.framing.kind === "parts") {
    for (const part of instance.scene.parts) {
      let p: typeof part | undefined = part;
      while (p) {
        if (selected.has(p.id)) {
          selected.add(part.id);
          break;
        }
        p = instance.scene.parts.find((q) => q.id === p!.parent);
      }
    }
  }
  return instance.scene.geometry.meshes.filter((m) =>
    selected.has(target.framing.kind === "parts" ? m.partId : m.id),
  );
}
function poseBounds(
  instance: MechanismCameraPack,
  target: Target,
  frame: MechanismFrameResultV2,
  surfaces: SurfaceBinding[],
): Bounds {
  const bounds = emptyBounds();
  for (const mesh of selectedMeshes(instance, target)) {
    if (!frame.parts[mesh.partId]!.visible) continue;
    const material = instance.scene.geometry.materials.find(
      (m) => m.id === mesh.materialId,
    )!;
    if (
      material.alphaMode === "mask" &&
      material.opacity < material.alphaCutoff
    )
      continue;
    const matrix = new Matrix4().fromArray(
        frame.parts[mesh.partId]!.worldMatrix,
      ),
      p = positions(instance.scene, frame, mesh.id);
    for (let i = 0; i < p.length; i += 3)
      include(bounds, tuple(vector(p.slice(i, i + 3)).applyMatrix4(matrix)));
  }
  for (const surface of surfaces)
    include(bounds, surfaceWorld(instance, frame, surface));
  return bounds;
}
function intersects(a: z.infer<typeof rect>, b: z.infer<typeof rect>) {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}
/** Exhaustive bounded edge candidates; area/center/top/left tie breaks never depend on seek history. */
function availableRegion(instance: MechanismCameraPack, request: Request) {
  const i = request.safeInsets,
    area = {
      left: i.left,
      top: i.top,
      right: request.width - i.right,
      bottom: request.height - i.bottom,
    };
  if (area.right <= area.left || area.bottom <= area.top)
    fail(instance, request, "Safe insets consume the viewport", ["safeInsets"]);
  const names = new Set<string>();
  for (const [index, r] of request.reservedRegions.entries()) {
    if (names.has(r.id))
      fail(instance, request, "Reserved region IDs must be unique", [
        "reservedRegions",
        index,
        "id",
      ]);
    names.add(r.id);
    if (r.rect.right > request.width || r.rect.bottom > request.height)
      fail(instance, request, "Reserved region exceeds viewport", [
        "reservedRegions",
        index,
        "rect",
      ]);
  }
  const xs = [
    ...new Set([
      area.left,
      area.right,
      ...request.reservedRegions.flatMap((r) => [
        Math.max(area.left, Math.min(area.right, r.rect.left)),
        Math.max(area.left, Math.min(area.right, r.rect.right)),
      ]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      area.top,
      area.bottom,
      ...request.reservedRegions.flatMap((r) => [
        Math.max(area.top, Math.min(area.bottom, r.rect.top)),
        Math.max(area.top, Math.min(area.bottom, r.rect.bottom)),
      ]),
    ]),
  ].sort((a, b) => a - b);
  const candidates = [];
  for (let x = 0; x < xs.length - 1; x++)
    for (let r = x + 1; r < xs.length; r++)
      for (let y = 0; y < ys.length - 1; y++)
        for (let b = y + 1; b < ys.length; b++) {
          const box = {
            left: xs[x]!,
            top: ys[y]!,
            right: xs[r]!,
            bottom: ys[b]!,
          };
          if (
            !request.reservedRegions.some((region) =>
              intersects(box, region.rect),
            )
          )
            candidates.push(box);
        }
  candidates.sort(
    (a, b) =>
      (b.right - b.left) * (b.bottom - b.top) -
        (a.right - a.left) * (a.bottom - a.top) ||
      Math.hypot(
        (a.left + a.right - request.width) / 2,
        (a.top + a.bottom - request.height) / 2,
      ) -
        Math.hypot(
          (b.left + b.right - request.width) / 2,
          (b.top + b.bottom - request.height) / 2,
        ) ||
      a.top - b.top ||
      a.left - b.left,
  );
  const best = candidates[0],
    p = request.paddingPixels;
  if (
    !best ||
    best.right - best.left <= 2 * p + 16 ||
    best.bottom - best.top <= 2 * p + 16
  )
    fail(
      instance,
      request,
      `No framing region remains after ${[...names].join(", ") || "safe insets"}`,
      ["reservedRegions"],
      "mechanism-camera-region",
    );
  return {
    left: best.left + p,
    top: best.top + p,
    right: best.right - p,
    bottom: best.bottom - p,
  };
}
function autoCamera(
  instance: MechanismCameraPack,
  request: Request,
  target: Target,
  bounds: Bounds,
  region: z.infer<typeof rect>,
  directionIndex: number,
  frame: MechanismFrameResultV2,
): MechanismCamera {
  const root = new Matrix4().fromArray(frame.parts.model!.worldMatrix);
  const up = new Vector3(0, 1, 0).transformDirection(root),
    eye = vector(target.viewDirections[directionIndex]!)
      .applyAxisAngle(
        new Vector3(0, 1, 0),
        (request.orbitDegrees * Math.PI) / 180,
      )
      .transformDirection(root);
  const forward = eye.clone().negate(),
    right = forward.clone().cross(up).normalize(),
    vertical = right.clone().cross(forward).normalize();
  const center = vector(bounds.min).add(vector(bounds.max)).multiplyScalar(0.5);
  const fov = request.fovDegrees ?? target.fovDegrees,
    focal = request.height / (2 * Math.tan((fov * Math.PI) / 360));
  const cx = (region.left + region.right) / 2,
    cy = (region.top + region.bottom) / 2;
  let distance = 0.05;
  for (const p of corners(bounds)) {
    const q = vector(p).sub(center),
      z = q.dot(eye),
      x = q.dot(right) * focal + (cx - request.width / 2) * z,
      y = -q.dot(vertical) * focal + (cy - request.height / 2) * z;
    distance = Math.max(
      distance,
      z + 0.05,
      z + (x >= 0 ? x / (region.right - cx) : -x / (cx - region.left)),
      z + (y >= 0 ? y / (region.bottom - cy) : -y / (cy - region.top)),
    );
  }
  distance *= 1.005;
  const shift = right
      .clone()
      .multiplyScalar(((request.width / 2 - cx) * distance) / focal)
      .addScaledVector(
        vertical,
        ((cy - request.height / 2) * distance) / focal,
      ),
    aim = center.clone().add(shift);
  return MechanismCameraSchema.parse({
    position: tuple(aim.clone().addScaledVector(eye, distance)),
    target: tuple(aim),
    up: tuple(up),
    fovDegrees: fov,
    near: Math.max(0.001, distance * 0.001),
    far: Math.max(100, distance * 10),
  });
}
/** Clip the actual near-plane triangle intersection segment against the viewport. */
function segmentInViewport(
  a: Vector3,
  b: Vector3,
  right: Vector3,
  up: Vector3,
  halfX: number,
  halfY: number,
) {
  let first = 0,
    last = 1;
  for (const [axis, half] of [
    [right, halfX],
    [up, halfY],
  ] as const) {
    const start = a.dot(axis),
      delta = b.dot(axis) - start;
    if (Math.abs(delta) < 1e-14) {
      if (Math.abs(start) > half) return false;
      continue;
    }
    const t1 = (-half - start) / delta,
      t2 = (half - start) / delta;
    first = Math.max(first, Math.min(t1, t2));
    last = Math.min(last, Math.max(t1, t2));
    if (first > last) return false;
  }
  return true;
}
/** Double-sided solid intersection queries are separate from proof visibility's front-side rays. */
function rayDistance(
  o: Vector3,
  d: Vector3,
  a: Vector3,
  b: Vector3,
  c: Vector3,
) {
  const e1 = b.clone().sub(a),
    e2 = c.clone().sub(a),
    p = d.clone().cross(e2),
    det = e1.dot(p);
  if (Math.abs(det) < 1e-14) return undefined;
  const offset = o.clone().sub(a),
    u = offset.dot(p) / det;
  if (u < 0 || u > 1) return undefined;
  const q = offset.clone().cross(e1),
    v = d.dot(q) / det;
  if (v < 0 || u + v > 1) return undefined;
  const t = e2.dot(q) / det;
  return t >= 0 ? t : undefined;
}
function validatePhysicalCamera(
  instance: MechanismCameraPack,
  request: Request,
  frame: MechanismFrameResultV2,
  camera: MechanismCamera,
) {
  const eye = vector(camera.position),
    forward = vector(camera.target).sub(eye).normalize(),
    right = forward.clone().cross(vector(camera.up)).normalize(),
    up = right.clone().cross(forward).normalize();
  const halfY = camera.near * Math.tan((camera.fovDegrees * Math.PI) / 360),
    halfX = (halfY * request.width) / request.height;
  const probe = new Vector3(0.371, 0.529, 0.763).normalize();
  for (const mesh of instance.scene.geometry.meshes) {
    if (!frame.parts[mesh.partId]!.visible) continue;
    const material = instance.scene.geometry.materials.find(
      (m) => m.id === mesh.materialId,
    )!;
    if (
      material.alphaMode === "mask" &&
      material.opacity < material.alphaCutoff
    )
      continue;
    const matrix = new Matrix4().fromArray(
        frame.parts[mesh.partId]!.worldMatrix,
      ),
      p = positions(instance.scene, frame, mesh.id);
    const storage = new Float64Array(p.length);
    for (let i = 0; i < p.length; i += 3) {
      const w = vector(p.slice(i, i + 3)).applyMatrix4(matrix);
      storage[i] = w.x;
      storage[i + 1] = w.y;
      storage[i + 2] = w.z;
    }
    const box = emptyBounds();
    for (let i = 0; i < storage.length; i += 3)
      include(box, storage.subarray(i, i + 3));
    const possibleInside =
      eye.x >= box.min[0] &&
      eye.x <= box.max[0] &&
      eye.y >= box.min[1] &&
      eye.y <= box.max[1] &&
      eye.z >= box.min[2] &&
      eye.z <= box.max[2];
    const hits: number[] = [];
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const v = [0, 1, 2].map((n) => {
        const i = mesh.indices[t + n]! * 3;
        return vector(storage.subarray(i, i + 3));
      });
      if (possibleInside) {
        const distance = rayDistance(eye, probe, v[0]!, v[1]!, v[2]!);
        if (
          distance !== undefined &&
          !hits.some((h) => Math.abs(h - distance) < 1e-7)
        )
          hits.push(distance);
      }
      const depths = v.map((x) => x.clone().sub(eye).dot(forward));
      if (
        Math.min(...depths) > camera.near ||
        Math.max(...depths) < camera.near
      )
        continue;
      const crossing: Vector3[] = [];
      for (let e = 0; e < 3; e++) {
        const a = e,
          b = (e + 1) % 3;
        if (
          (depths[a]! - camera.near) * (depths[b]! - camera.near) > 0 ||
          depths[a] === depths[b]
        )
          continue;
        crossing.push(
          v[a]!.clone()
            .lerp(v[b]!, (camera.near - depths[a]!) / (depths[b]! - depths[a]!))
            .sub(eye),
        );
      }
      if (crossing.length >= 2) {
        if (
          segmentInViewport(crossing[0]!, crossing[1]!, right, up, halfX, halfY)
        )
          fail(
            instance,
            request,
            `Near plane intersects physical mesh ${mesh.id}`,
            ["camera", "near", mesh.id],
            "mechanism-camera-near",
          );
      }
    }
    if (hits.length % 2 === 1)
      fail(
        instance,
        request,
        `Camera is inside physical mesh ${mesh.id}`,
        ["camera", "position", mesh.id],
        "mechanism-camera-intersection",
      );
  }
}
function checkFrame(
  instance: MechanismCameraPack,
  request: Request,
  target: Target,
  frame: MechanismFrameResultV2,
  camera: MechanismCamera,
  region: z.infer<typeof rect>,
  bindings: SurfaceBinding[],
) {
  validatePhysicalCamera(instance, request, frame, camera);
  const bounds = poseBounds(instance, target, frame, bindings);
  for (const [index, p] of corners(bounds).entries()) {
    const projection = projectMechanismAnchor(
      "camera-bound",
      "model",
      p,
      true,
      camera,
      request.width,
      request.height,
    );
    if (
      projection.projectionVisibility !== "in-frame" ||
      !projection.pixel ||
      projection.pixel[0] < region.left - 1e-7 ||
      projection.pixel[0] > region.right + 1e-7 ||
      projection.pixel[1] < region.top - 1e-7 ||
      projection.pixel[1] > region.bottom + 1e-7
    )
      fail(
        instance,
        request,
        "Actual posed target bounds escape the available region",
        ["bounds", index],
      );
  }
  for (const id of target.relationships) {
    const r = frame.relationships[id];
    if (!r)
      fail(
        instance,
        request,
        "Target relationship is absent",
        ["relationships", id],
        "mechanism-camera-reference",
      );
    if (r.required && r.residual > r.tolerance)
      fail(
        instance,
        request,
        `Required target relationship failed ${id}`,
        ["relationships", id],
        "mechanism-camera-relationship",
      );
  }
  const anchors = Object.fromEntries(
    bindings.map((s) => [
      s.id,
      projectMechanismAnchor(
        s.id,
        instance.scene.geometry.meshes.find((m) => m.id === s.mesh)!.partId,
        surfaceWorld(instance, frame, s),
        frame.parts[
          instance.scene.geometry.meshes.find((m) => m.id === s.mesh)!.partId
        ]!.visible,
        camera,
        request.width,
        request.height,
      ),
    ]),
  );
  const visible = nativeAnchorVisibilities(
    instance.scene.geometry,
    { camera, parts: frame.parts, anchors },
    Object.fromEntries(
      Object.values(frame.shapeStates).map((s) => [s.mesh, s.positions]),
    ),
  );
  for (const [id, p] of Object.entries(visible))
    if (p.visibility !== "visible")
      fail(
        instance,
        request,
        `Decisive surface ${id} is ${p.visibility}${p.occluderMesh ? ` by ${p.occluderMesh}` : ""}`,
        ["proofSurfaces", id],
        "mechanism-camera-occlusion",
      );
  return {
    frame: request.frame,
    status: "passed" as const,
    proofSurfaces: bindings.map((s) => ({
      id: s.id,
      mesh: s.mesh,
      triangle: s.triangleIndex,
      visibility: visible[s.id]!.visibility,
    })),
    bounds,
  };
}
/** Fresh pose/envelope evaluation; no camera, direction or visibility state survives a seek. */
export function createMechanismCameraRecipeFrame(
  instance: MechanismCameraPack,
  input: MechanismCameraRecipeRequest,
) {
  const request = MechanismCameraRecipeRequestSchema.parse(input);
  const vertices = instance.scene.geometry.meshes.reduce(
    (n, m) => n + m.positions.length / 3,
    0,
  );
  if (vertices * 3 * 8 > MECHANISM_CAMERA_LIMITS.worldStorageBytes)
    fail(
      instance,
      request,
      "Camera world-position storage exceeds its fixed budget",
      ["budget"],
      "mechanism-camera-budget",
    );
  if (
    mechanismPackHash(instance.scene) !== instance.sourceSha256 ||
    mechanismPackHash(instance.cameraTargets) !== instance.cameraTargetsSha256
  )
    fail(
      instance,
      request,
      "Pack/camera definition identity changed",
      ["identity"],
      "mechanism-camera-revision",
    );
  if (request.authoredCamera && request.orbitDegrees !== 0)
    fail(
      instance,
      request,
      "An authored camera cannot also request a generated orbit",
      ["orbitDegrees"],
      "mechanism-camera-track",
    );
  const target = instance.cameraTargets.find((t) => t.id === request.target);
  if (!target)
    fail(
      instance,
      request,
      "Unknown camera target",
      ["target"],
      "mechanism-camera-reference",
    );
  if (
    request.directionIndex !== undefined &&
    request.directionIndex >= target.viewDirections.length
  )
    fail(instance, request, "Direction index exceeds declared candidates", [
      "directionIndex",
    ]);
  const prepared = prepareMechanismSceneV2(instance.scene);
  const pose = evaluateMechanismFrameV2(prepared, poseRequest(request));
  const bindings = bindSurfaces(instance, target, pose, request),
    bounds = emptyBounds();
  const frames = [
    ...new Set([...(request.envelopeFrames ?? [request.frame]), request.frame]),
  ];
  if (frames.length > MECHANISM_CAMERA_LIMITS.frames)
    fail(
      instance,
      request,
      "Envelope frame budget exceeded",
      ["envelopeFrames"],
      "mechanism-camera-budget",
    );
  for (const frame of frames) {
    const b = poseBounds(
      instance,
      target,
      evaluateMechanismFrameV2(prepared, poseRequest(request, frame)),
      bindings,
    );
    include(bounds, b.min);
    include(bounds, b.max);
  }
  if (!Number.isFinite(bounds.min[0]))
    fail(instance, request, "No visible target geometry remains", ["framing"]);
  const region = availableRegion(instance, request);
  const candidates = request.authoredCamera
    ? [{ camera: request.authoredCamera, index: -1 }]
    : target.viewDirections
        .map((_, index) => index)
        .filter(
          (index) =>
            request.directionIndex === undefined ||
            index === request.directionIndex,
        )
        .map((index) => ({
          camera: autoCamera(
            instance,
            request,
            target,
            bounds,
            region,
            index,
            pose,
          ),
          index,
        }));
  const failures = [];
  for (const candidate of candidates) {
    try {
      const check = checkFrame(
        instance,
        request,
        target,
        pose,
        candidate.camera,
        region,
        bindings,
      );
      return freezeMechanismPack({
        version: "mechanism-camera-recipe-frame-1" as const,
        target: target.id,
        intent: target.intent,
        motionIntent: target.motionIntent,
        relationships: target.relationships,
        camera: candidate.camera,
        authored: !!request.authoredCamera,
        directionIndex: candidate.index,
        availableRegion: region,
        envelopeBounds: bounds,
        bindings,
        check,
      });
    } catch (error) {
      if (!(error instanceof MechanismPackInvariantError)) throw error;
      failures.push(error);
    }
  }
  throw failures[0]!;
}
export const MechanismCameraRecipeClipRequestSchema =
  MechanismCameraRecipeRequestSchema.omit({
    frame: true,
    envelopeFrames: true,
    orbitDegrees: true,
  })
    .extend({
      sourceFrames: z
        .array(MechanismFrameRequestV2Schema.shape.frame)
        .min(1)
        .max(MECHANISM_CAMERA_LIMITS.frames)
        .refine(
          (frames) => frames.every((f, i) => i === 0 || f > frames[i - 1]!),
          "Source frames must strictly increase",
        ),
      editing: z.enum(["cut", "hold", "transition"]),
      fromCamera: MechanismCameraSchema.optional(),
      orbitDegrees: z
        .tuple([
          z.number().finite().min(-30).max(30),
          z.number().finite().min(-30).max(30),
        ])
        .optional(),
    })
    .strict();
/** Editing decisions are independent of recipe intent; fixed direction selection prevents fallback jumps. */
export function compileMechanismCameraRecipeClip(
  instance: MechanismCameraPack,
  input: z.input<typeof MechanismCameraRecipeClipRequestSchema>,
) {
  const { sourceFrames, editing, fromCamera, orbitDegrees, ...options } =
    MechanismCameraRecipeClipRequestSchema.parse(input);
  const request = MechanismCameraRecipeRequestSchema.parse({
    ...options,
    frame: sourceFrames[0],
  });
  if (editing === "transition" && !fromCamera)
    fail(
      instance,
      request,
      "Transition requires its authored start camera",
      ["fromCamera"],
      "mechanism-camera-transition",
    );
  if (editing === "hold" && fromCamera) {
    if (
      orbitDegrees ||
      (options.authoredCamera &&
        mechanismPackHash(options.authoredCamera) !==
          mechanismPackHash(fromCamera))
    )
      fail(
        instance,
        request,
        "A held preceding camera cannot also request a different camera or orbit",
        ["fromCamera"],
        "mechanism-camera-track",
      );
    options.authoredCamera = fromCamera;
  }
  if (options.authoredCamera && orbitDegrees)
    fail(
      instance,
      request,
      "An authored camera cannot also request a generated orbit",
      ["orbitDegrees"],
      "mechanism-camera-track",
    );
  const target = instance.cameraTargets.find((t) => t.id === options.target);
  if (!target)
    fail(
      instance,
      request,
      "Unknown camera target",
      ["target"],
      "mechanism-camera-reference",
    );
  const failures = [];
  const directions = options.authoredCamera
    ? [0]
    : target.viewDirections
        .map((_, i) => i)
        .filter(
          (i) =>
            options.directionIndex === undefined ||
            i === options.directionIndex,
        );
  if (directions.length === 0)
    fail(instance, request, "Direction index exceeds declared candidates", [
      "directionIndex",
    ]);
  for (const direction of directions) {
    try {
      const frames = sourceFrames.map((frame) => {
        const fraction =
            sourceFrames.length === 1
              ? 0
              : (frame - sourceFrames[0]!) /
                (sourceFrames.at(-1)! - sourceFrames[0]!),
          orbit = orbitDegrees
            ? orbitDegrees[0] + (orbitDegrees[1] - orbitDegrees[0]) * fraction
            : 0;
        let generated = createMechanismCameraRecipeFrame(instance, {
          ...options,
          frame,
          envelopeFrames: sourceFrames,
          directionIndex: direction,
          orbitDegrees: orbit,
        });
        if (editing === "transition") {
          const a = fromCamera!,
            b = generated.camera,
            e = fraction * fraction * (3 - 2 * fraction),
            lerp = (x: number, y: number) => x + (y - x) * e;
          const camera = MechanismCameraSchema.parse({
            ...b,
            position: b.position.map((v, i) => lerp(a.position[i]!, v)),
            target: b.target.map((v, i) => lerp(a.target[i]!, v)),
            up: b.up,
            fovDegrees: lerp(a.fovDegrees, b.fovDegrees),
            near: Math.min(a.near, b.near),
            far: Math.max(a.far, b.far),
          });
          generated = createMechanismCameraRecipeFrame(instance, {
            ...options,
            frame,
            envelopeFrames: sourceFrames,
            authoredCamera: camera,
          });
        }
        return generated;
      });
      const up = frames[0]!.camera.up;
      if (
        frames.some(
          (f) =>
            vector(f.camera.up).normalize().distanceTo(vector(up).normalize()) >
            1e-10,
        ) ||
        (editing === "transition" &&
          fromCamera &&
          vector(fromCamera.up).normalize().distanceTo(vector(up).normalize()) >
            1e-10)
      )
        fail(
          instance,
          MechanismCameraRecipeRequestSchema.parse({
            ...options,
            frame: sourceFrames[0],
          }),
          "Camera tracks require one constant up direction",
          ["camera", "up"],
          "mechanism-camera-track",
        );
      const near = Math.min(...frames.map((f) => f.camera.near)),
        far = Math.max(...frames.map((f) => f.camera.far));
      const serialized = frames.map((f, i) =>
        createMechanismCameraRecipeFrame(instance, {
          ...options,
          frame: sourceFrames[i]!,
          envelopeFrames: sourceFrames,
          authoredCamera: { ...f.camera, up, near, far },
        }),
      );
      const result = {
        version: "mechanism-camera-recipe-clip-1" as const,
        target: target.id,
        intent: target.intent,
        editing,
        intentionalCut: editing === "cut",
        camera: serialized[0]!.camera,
        endCamera: serialized.at(-1)!.camera,
        cameraKeys: serialized.map((f, i) => ({
          frame: sourceFrames[i]!,
          position: f.camera.position,
          target: f.camera.target,
          fovDegrees: f.camera.fovDegrees,
          easing: "linear" as const,
        })),
        checks: serialized.map((f) => f.check),
      };
      if (
        new TextEncoder().encode(JSON.stringify(result)).length >
        MECHANISM_CAMERA_LIMITS.planBytes
      )
        fail(
          instance,
          request,
          "Plan exceeds 32 KiB",
          ["budget"],
          "mechanism-camera-budget",
        );
      return freezeMechanismPack(result);
    } catch (error) {
      if (!(error instanceof MechanismPackInvariantError)) throw error;
      failures.push(error);
      if (options.authoredCamera) throw error;
    }
  }
  throw failures[0]!;
}
