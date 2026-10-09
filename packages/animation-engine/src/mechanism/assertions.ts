import { Euler, Matrix4, Vector3 } from "three";
import type { MechanismScene } from "@still-shift/scene-contract";
import type {
  MechanismFrameRequest,
  MechanismFrameResult,
} from "@still-shift/renderer-core";

export type MechanismEvidenceFrame = {
  shotId: string;
  frame: MechanismFrameResult;
  request: MechanismFrameRequest;
};
export type MechanismMechanicalFinding = {
  code: string;
  path: string;
  shotId: string;
  frames: [number, number];
  property: string;
  partIds: string[];
  measured: number;
  expected: 0;
  tolerance: number;
};
export type MechanismMechanicalReport = {
  valid: boolean;
  checkedFrames: number;
  findings: MechanismMechanicalFinding[];
};
type Rig = MechanismScene["rigs"][number];
type ExpectedRig = {
  q: number;
  travel: number;
  contactMode: "free" | "pull" | "push";
};
type ExpectedState = {
  local: Map<string, Matrix4>;
  world: Map<string, Matrix4>;
  rigs: Map<string, ExpectedRig>;
};
type TravelKey = {
  readonly frame: number;
  readonly value: number;
  readonly easing?: "linear" | "smoothstep" | "hold" | undefined;
};
const TOLERANCE = 1e-8;
const INVALID_MEASUREMENT = Number.MAX_SAFE_INTEGER;

/** Independent authored-motion evidence; evaluator assertion flags are never read. */
export function checkMechanismFrames(
  scene: MechanismScene,
  rows: readonly MechanismEvidenceFrame[],
): MechanismMechanicalReport {
  const authored = new Map(
    scene.parts.map((part) => [part.id, authoredMatrix(part.transform)]),
  );
  const findings = rows.flatMap((row) => checkFrame(scene, authored, row));
  const grouped = groupFindings(findings);
  return {
    valid: grouped.length === 0,
    checkedFrames: rows.length,
    findings: grouped,
  };
}

function authoredMatrix(
  transform: MechanismScene["parts"][number]["transform"],
): Matrix4 {
  const matrix = new Matrix4().makeTranslation(...transform.position);
  matrix.multiply(
    new Matrix4().makeRotationFromEuler(
      new Euler(...transform.rotation, "XYZ"),
    ),
  );
  matrix.multiply(new Matrix4().makeScale(...transform.scale));
  return matrix.multiply(
    new Matrix4().makeTranslation(
      -transform.pivot[0],
      -transform.pivot[1],
      -transform.pivot[2],
    ),
  );
}

function sampleTravel(keys: readonly TravelKey[], frame: number): number {
  if (frame <= keys[0]!.frame) return keys[0]!.value;
  for (let index = 1; index < keys.length; index++) {
    const right = keys[index]!,
      left = keys[index - 1]!;
    if (frame >= right.frame) continue;
    const fraction = (frame - left.frame) / (right.frame - left.frame);
    const eased =
      left.easing === "hold"
        ? 0
        : left.easing === "smoothstep"
          ? fraction * fraction * (3 - 2 * fraction)
          : fraction;
    return left.value + (right.value - left.value) * eased;
  }
  return keys.at(-1)!.value;
}

function expectedState(
  scene: MechanismScene,
  authored: Map<string, Matrix4>,
  request: MechanismFrameRequest,
): ExpectedState {
  const local = new Map(
    [...authored].map(([id, matrix]) => [id, matrix.clone()]),
  );
  const rigs = new Map<string, ExpectedRig>();
  for (const rig of scene.rigs) {
    const control = request.controls?.[rig.id];
    const travel =
      control?.travel ??
      sampleTravel(control?.travelKeys ?? rig.travelKeys, request.frame);
    const q = rig.thickness * travel;
    const contactMode = control?.contactMode ?? rig.contactMode;
    const rootDelta =
      contactMode === "pull"
        ? rig.contactDatum - q
        : contactMode === "push"
          ? rig.contactDatum + rig.thickness - q
          : 0;
    local
      .get(rig.rootPart)!
      .multiply(new Matrix4().makeTranslation(rootDelta, 0, 0));
    local.get(rig.hookPart)!.multiply(new Matrix4().makeTranslation(q, 0, 0));
    rigs.set(rig.id, { q, travel, contactMode });
  }
  return { local, world: composeHierarchy(scene, local), rigs };
}

function composeHierarchy(
  scene: MechanismScene,
  local: Map<string, Matrix4>,
): Map<string, Matrix4> {
  const world = new Map<string, Matrix4>();
  const definitions = new Map(scene.parts.map((part) => [part.id, part]));
  function compose(id: string): Matrix4 {
    const existing = world.get(id);
    if (existing) return existing;
    const part = definitions.get(id)!;
    const matrix = part.parent
      ? compose(part.parent).clone().multiply(local.get(id)!)
      : local.get(id)!.clone();
    world.set(id, matrix);
    return matrix;
  }
  for (const part of scene.parts) compose(part.id);
  return world;
}

function checkFrame(
  scene: MechanismScene,
  authored: Map<string, Matrix4>,
  row: MechanismEvidenceFrame,
): MechanismMechanicalFinding[] {
  const findings: MechanismMechanicalFinding[] = [];
  function check(
    code: string,
    path: string,
    property: string,
    measured: number,
    partIds: string[],
  ) {
    if (Number.isFinite(measured) && measured <= TOLERANCE) return;
    findings.push({
      code,
      path,
      property,
      shotId: row.shotId,
      frames: [row.request.frame, row.request.frame],
      partIds,
      measured: Number.isFinite(measured)
        ? Math.abs(measured)
        : INVALID_MEASUREMENT,
      expected: 0,
      tolerance: TOLERANCE,
    });
  }
  check(
    "mechanism-source-frame",
    "frame",
    "sourceFrame",
    scalarError(row.frame.frame, row.request.frame),
    [],
  );
  const expected = expectedState(scene, authored, row.request);
  for (const definition of scene.parts) {
    const actual = row.frame.parts[definition.id];
    check(
      "mechanism-local-transform",
      `parts.${definition.id}.localMatrix`,
      "localMatrix",
      matrixError(actual?.localMatrix, expected.local.get(definition.id)!),
      [definition.id],
    );
    check(
      "mechanism-world-transform",
      `parts.${definition.id}.worldMatrix`,
      "worldMatrix",
      matrixError(actual?.worldMatrix, expected.world.get(definition.id)!),
      [definition.id],
    );
    check(
      "mechanism-part-hierarchy",
      `parts.${definition.id}.parent`,
      "parent",
      actual?.parent === definition.parent ? 0 : 1,
      [definition.id],
    );
  }
  for (const definition of scene.anchors) {
    const point = new Vector3(...definition.position).applyMatrix4(
      expected.world.get(definition.part)!,
    );
    check(
      "mechanism-anchor-world",
      `anchors.${definition.id}.world`,
      "world",
      vectorError(row.frame.anchors[definition.id]?.world, point),
      [definition.part],
    );
    const actualPart = actualMatrix(
      row.frame.parts[definition.part]?.worldMatrix,
    );
    if (actualPart)
      check(
        "mechanism-anchor-transform",
        `anchors.${definition.id}.world`,
        "declaredPartLocalPosition",
        vectorError(
          row.frame.anchors[definition.id]?.world,
          new Vector3(...definition.position).applyMatrix4(actualPart),
        ),
        [definition.part],
      );
  }
  for (const rig of scene.rigs)
    checkRig(scene, authored, row, expected, rig, check);
  return findings;
}

type Check = (
  code: string,
  path: string,
  property: string,
  measured: number,
  partIds: string[],
) => void;
function checkRig(
  scene: MechanismScene,
  authored: Map<string, Matrix4>,
  row: MechanismEvidenceFrame,
  expected: ExpectedState,
  rig: Rig,
  check: Check,
): void {
  const intended = expected.rigs.get(rig.id)!;
  const actual = row.frame.rigs[rig.id];
  const rigPath = `rigs.${rig.id}`;
  check(
    "mechanism-travel-thickness",
    `${rigPath}.thickness`,
    "thickness",
    Math.max(
      scalarError(
        rig.thickness,
        Number(scene.geometry.dimensions.hookThickness),
      ),
      scalarError(rig.thickness, Number(scene.geometry.dimensions.hookTravel)),
      scalarError(actual?.thickness, rig.thickness),
    ),
    [rig.hookPart],
  );
  check(
    "mechanism-travel-control",
    `${rigPath}.q`,
    "q",
    scalarError(actual?.q, intended.q),
    [rig.hookPart],
  );
  check(
    "mechanism-travel-control",
    `${rigPath}.travel`,
    "travel",
    scalarError(actual?.travel, intended.travel),
    [rig.hookPart],
  );
  check(
    "mechanism-travel-range",
    `${rigPath}.q`,
    "qRange",
    Math.max(0, -intended.q, intended.q - rig.thickness),
    [rig.hookPart],
  );
  check(
    "mechanism-contact-mode",
    `${rigPath}.contactMode`,
    "contactMode",
    actual?.contactMode === intended.contactMode ? 0 : 1,
    [rig.rootPart, rig.hookPart],
  );
  const selected =
    intended.contactMode === "pull"
      ? rig.innerFaceAnchor
      : intended.contactMode === "push"
        ? rig.outerFaceAnchor
        : null;
  check(
    "mechanism-contact-face",
    `${rigPath}.selectedContactFace`,
    "selectedContactFace",
    actual?.selectedContactFace === selected ? 0 : 1,
    [rig.hookPart],
  );
  const hookMatrix = actualMatrix(row.frame.parts[rig.hookPart]?.localMatrix);
  if (hookMatrix) {
    const motion = authored
      .get(rig.hookPart)!
      .clone()
      .invert()
      .multiply(hookMatrix);
    check(
      "mechanism-hook-displacement",
      `parts.${rig.hookPart}.localMatrix`,
      "localXDisplacement",
      matrixError(
        motion.elements,
        new Matrix4().makeTranslation(intended.q, 0, 0),
      ),
      [rig.hookPart],
    );
  }
  check(
    "mechanism-fixed-rivet",
    `parts.${rig.bladePart}.localMatrix`,
    "bladeLocalMatrix",
    matrixError(
      row.frame.parts[rig.bladePart]?.localMatrix,
      authored.get(rig.bladePart)!,
    ),
    [rig.bladePart],
  );
  checkRivetMounts(scene, row, authored, rig, check);
  if (selected)
    checkContact(scene, row, authored, expected, rig, selected, check);
}

function checkRivetMounts(
  scene: MechanismScene,
  row: MechanismEvidenceFrame,
  authored: Map<string, Matrix4>,
  rig: Rig,
  check: Check,
) {
  const root = actualMatrix(row.frame.parts[rig.rootPart]?.worldMatrix);
  for (const id of rig.rivetMeshIds) {
    const mesh = scene.geometry.meshes.find((item) => item.id === id);
    check(
      "mechanism-fixed-rivet",
      `rigs.${rig.id}.rivetMeshIds.${id}`,
      "rivetMount",
      mesh?.partId === rig.bladePart ? 0 : 1,
      [rig.bladePart],
    );
    if (!mesh || !root) continue;
    const actual = actualMatrix(row.frame.parts[mesh.partId]?.worldMatrix);
    if (!actual) continue;
    const center = new Vector3(...mesh.bounds.min)
      .add(new Vector3(...mesh.bounds.max))
      .multiplyScalar(0.5);
    const expectedPoint = center
      .clone()
      .applyMatrix4(root.clone().multiply(authored.get(rig.bladePart)!));
    check(
      "mechanism-fixed-rivet",
      `geometry.meshes.${id}`,
      "rivetWorldPosition",
      center.applyMatrix4(actual).distanceTo(expectedPoint),
      [rig.bladePart],
    );
  }
}

function checkContact(
  scene: MechanismScene,
  row: MechanismEvidenceFrame,
  authored: Map<string, Matrix4>,
  expected: ExpectedState,
  rig: Rig,
  faceId: string,
  check: Check,
) {
  const face = scene.anchors.find((anchor) => anchor.id === faceId)!;
  const hook = scene.parts.find((part) => part.id === rig.hookPart)!;
  const root = scene.parts.find((part) => part.id === rig.rootPart)!;
  const authoredRootWorld = (
    root.parent ? expected.world.get(root.parent)!.clone() : new Matrix4()
  ).multiply(authored.get(rig.rootPart)!);
  const actualHook = actualMatrix(row.frame.parts[rig.hookPart]?.worldMatrix);
  if (!actualHook) return;
  const actualFace = new Vector3(...face.position)
    .applyMatrix4(actualHook)
    .applyMatrix4(authoredRootWorld.invert());
  const target = new Vector3(
    rig.contactDatum,
    hook.transform.position[1] + face.position[1],
    hook.transform.position[2] + face.position[2],
  );
  check(
    "mechanism-contact",
    `anchors.${faceId}.world`,
    "contactGapInAuthoredRoot",
    actualFace.distanceTo(target),
    [rig.rootPart, rig.hookPart],
  );
}

function actualMatrix(
  values: readonly number[] | undefined,
): Matrix4 | undefined {
  return values?.length === 16 && values.every(Number.isFinite)
    ? new Matrix4().fromArray(values)
    : undefined;
}
function matrixError(
  values: readonly number[] | undefined,
  expected: Matrix4,
): number {
  if (!actualMatrix(values)) return INVALID_MEASUREMENT;
  return Math.max(
    ...values!.map((value, index) =>
      Math.abs(value - expected.elements[index]!),
    ),
  );
}
function vectorError(
  values: readonly number[] | undefined,
  expected: Vector3,
): number {
  return values?.length === 3 && values.every(Number.isFinite)
    ? new Vector3(...(values as [number, number, number])).distanceTo(expected)
    : INVALID_MEASUREMENT;
}
function scalarError(actual: number | undefined, expected: number): number {
  return actual !== undefined &&
    Number.isFinite(actual) &&
    Number.isFinite(expected)
    ? Math.abs(actual - expected)
    : INVALID_MEASUREMENT;
}
function groupFindings(
  findings: MechanismMechanicalFinding[],
): MechanismMechanicalFinding[] {
  const groups = new Map<string, MechanismMechanicalFinding[]>();
  for (const finding of findings) {
    const key = JSON.stringify([
      finding.shotId,
      finding.code,
      finding.path,
      finding.property,
    ]);
    const group = groups.get(key) ?? [];
    group.push(finding);
    groups.set(key, group);
  }
  return [...groups.values()]
    .flatMap((group) => {
      const intervals: MechanismMechanicalFinding[] = [];
      for (const finding of group.sort((a, b) => a.frames[0] - b.frames[0])) {
        const last = intervals.at(-1);
        if (last && finding.frames[0] <= last.frames[1] + 1) {
          last.frames[1] = Math.max(last.frames[1], finding.frames[1]);
          last.measured = Math.max(last.measured, finding.measured);
        } else intervals.push({ ...finding, frames: [...finding.frames] });
      }
      return intervals;
    })
    .sort(
      (a, b) =>
        a.frames[0] - b.frames[0] ||
        a.shotId.localeCompare(b.shotId) ||
        a.code.localeCompare(b.code) ||
        a.path.localeCompare(b.path),
    );
}
