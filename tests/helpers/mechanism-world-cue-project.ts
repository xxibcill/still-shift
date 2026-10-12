import { Matrix4, Vector3, Quaternion, Euler } from "three";
import { MechanismNarratedCycleSchema } from "@still-shift/scene-contract";
import {
  compileMechanismNarratedCycle,
  readMechanismCueAuthoring,
  saveMechanismCueAuthoring,
} from "@still-shift/animation-engine";
import { createCueProjectFixture } from "./mechanism-cue-project.ts";
import { surfaceAnnotationFixture } from "./mechanism-surface-fixture.ts";
import { prepareNative3DSceneV2 } from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
/** Preserve the previously admitted world/surface pictures; ordinary caption edits remain separate. */
export async function createWorldCueProject(
  directory: string,
  family: "tape-hook" | "cable-tie" | "clothespeg",
  route: "world-text" | "surface-marking",
) {
  const fixture = await createCueProjectFixture(
    directory,
    family,
    route === "surface-marking"
      ? { width: 1440, height: 816, fps: 30 }
      : undefined,
  );
  const original = await readMechanismCueAuthoring(
    fixture.instance,
    fixture.cuePath,
  );
  const surface =
    route === "surface-marking"
      ? surfaceAnnotationFixture(fixture.instance.scene, family)
      : undefined;
  const part =
    surface?.part ??
    (family === "tape-hook"
      ? fixture.instance.scene.rigs.find((r) => r.type === "slider")!.movingPart
      : fixture.instance.scene.parts[0]!.id);
  const compiled = compileMechanismNarratedCycle(
      fixture.instance,
      fixture.document,
    ),
    native = await prepareNative3DSceneV2(
      fixture.instance.scene,
      fixture.document.source.sha256,
    );
  const first = evaluateComp(compiled.composition, 0, {
    preparedNative3D: { [fixture.document.source.id]: native },
  }).layers.find((l) => l.layer.type === "native3d")!.nativeFrame!;
  const camera = fixture.instance.scene.camera,
    eye = new Vector3(...camera.position),
    target = new Vector3(...camera.target),
    cameraWorld = new Matrix4()
      .lookAt(eye, target, new Vector3(...camera.up))
      .setPosition(eye);
  const depth = eye.distanceTo(target) * 0.4,
    focal =
      fixture.document.output.height /
      (2 * Math.tan((camera.fovDegrees * Math.PI) / 360));
  const position = eye
    .clone()
    .addScaledVector(new Vector3().setFromMatrixColumn(cameraWorld, 2), -depth)
    .addScaledVector(
      new Vector3().setFromMatrixColumn(cameraWorld, 1),
      (depth * (fixture.document.output.height / 2 - 60)) / focal,
    );
  const planeWorld = cameraWorld.clone().setPosition(position),
    local = new Matrix4()
      .fromArray(first.frame.parts[part]!.worldMatrix)
      .invert()
      .multiply(planeWorld);
  const localPosition = new Vector3(),
    localRotation = new Quaternion(),
    localScale = new Vector3();
  local.decompose(localPosition, localRotation, localScale);
  const rotation = new Euler().setFromQuaternion(localRotation, "XYZ");
  const world = {
    id: "mark",
    kind: "world-text" as const,
    text: "Pin",
    part,
    transform: {
      position: localPosition.toArray() as [number, number, number],
      rotation: [rotation.x, rotation.y, rotation.z] as [
        number,
        number,
        number,
      ],
      scale: localScale.toArray() as [number, number, number],
      pivot: [0, 0, 0] as [number, number, number],
    },
    pixelsPerUnit: (128 * focal) / (depth * 40),
    sizePixels: [128, 64] as [number, number],
    fontSizePixels: 48,
    ink: "#ff0000",
    side: "front" as const,
  };
  const document = MechanismNarratedCycleSchema.parse({
    ...fixture.document,
    revision: original.document.revision + 1,
    cues: fixture.document.cues.map((cue) => ({
      ...cue,
      annotations: [],
      worldAnnotations: [surface?.annotation ?? world],
    })),
  });
  await saveMechanismCueAuthoring(fixture.instance, document, fixture.cuePath, {
    revision: original.document.revision,
    hash: original.projectHash,
  });
  return { ...fixture, document, part, surface };
}
