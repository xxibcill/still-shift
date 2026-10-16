import {
  prepareLoadSeatCalibrations,
  sampleLoadSeatV2,
} from "./load-seat-v2.ts";
import {
  MECHANISM_LIMITS,
  MechanismRigControlsV2Schema,
} from "@still-shift/scene-contract";
import type {
  MechanismRigControlV2,
  MechanismRigFrameV2,
  MechanismScalarKeysV2,
  MechanismKinematicSceneV2,
} from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";
import { ratchetLiftV2 } from "./ratchet-lift-v2.ts";
import { MechanismEvaluationErrorV2 } from "./types-v2.ts";
import type { PreparedMechanismRigTracksV2 } from "./types-v2.ts";

type Scene = DeepReadonly<MechanismKinematicSceneV2>;
type Rig = Scene["rigs"][number];
type Control = DeepReadonly<MechanismRigControlV2>;
type ReturnRig = Extract<Rig, { type: "spring-return" }>;
type ReturnControl = Extract<Control, { type: "spring-return" }>;
type ReturnState = ReturnControl["states"][number];
type RatchetControl = Extract<Control, { type: "ratchet" }>;
type ScalarWriter = {
  readonly value?: number | undefined;
  readonly keys?: DeepReadonly<MechanismScalarKeysV2> | undefined;
};
type Path = (string | number)[];

function fail(
  code: string,
  message: string,
  path: Path,
  frame?: number,
  interval?: { startFrame: number; endFrameExclusive: number },
): never {
  throw new MechanismEvaluationErrorV2(message, {
    code,
    path,
    ...(frame === undefined ? {} : { frame }),
    ...(interval === undefined ? {} : { interval }),
  });
}

/** Validate every authored interval once; sampling never accumulates playback state. */
export function prepareMechanismRigTracksV2(
  scene: Scene,
  input: unknown = {},
): PreparedMechanismRigTracksV2 {
  const parsed = MechanismRigControlsV2Schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    const code =
      issue.code === "custom" &&
      typeof issue.params?.diagnosticCode === "string"
        ? issue.params.diagnosticCode
        : "mechanism-rig-control";
    fail(code, issue.message, [
      "rigControls",
      ...issue.path.map((value) =>
        typeof value === "number" ? value : String(value),
      ),
    ]);
  }
  const controls = parsed.data;
  const rigs = new Map(scene.rigs.map((rig) => [rig.id, rig]));
  for (const [id, control] of Object.entries(controls)) {
    const rig = rigs.get(id);
    if (!rig)
      fail("mechanism-rig-reference", `Unknown rig ${id}`, ["rigControls", id]);
    if (control.type !== rig.type)
      fail(
        "mechanism-rig-control",
        `Writer ${control.type} cannot drive ${rig.type}`,
        ["rigControls", id, "type"],
      );
    const path: Path = ["rigControls", id];
    if (rig.type === "spring-return" && control.type === "spring-return") {
      const target = rigs.get(rig.targetRig);
      if (!target || (target.type !== "slider" && target.type !== "hinge"))
        fail(
          "mechanism-return-target",
          "Return target must be a declared slider or hinge",
          ["rigs", rig.id, "targetRig"],
        );
      if (Object.hasOwn(controls, rig.targetRig))
        fail(
          "mechanism-control-owner",
          "Return and direct controls cannot write the same scalar",
          ["rigControls", rig.targetRig],
        );
      validateReturn(rig, control, limits(target), path);
    } else if (rig.type === "load-seat" && control.type === "load-seat") {
      validateScalar(
        control.loadNewtons,
        [0, rig.maxForceNewtons],
        [...path, "loadNewtons"],
      );
    } else if (rig.type === "ratchet" && control.type === "ratchet") {
      validateScalar(control.position, rig.range, [...path, "position"]);
      if (rig.releasePolicy === "non-releasable") {
        const index = control.latchKeys.findIndex(
          (key) => key.state === "released",
        );
        if (index >= 0)
          fail(
            "mechanism-ratchet-release",
            "The declared ratchet variant has no release closure",
            [...path, "latchKeys", index, "state"],
            control.latchKeys[index]!.frame,
            {
              startFrame: control.latchKeys[index]!.frame,
              endFrameExclusive:
                control.latchKeys[index + 1]?.frame ?? MECHANISM_LIMITS.frames,
            },
          );
      }
      validateRatchetIntervals(control, path);
    } else if (
      (rig.type === "slider" && control.type === "slider") ||
      (rig.type === "hinge" && control.type === "hinge")
    ) {
      validateScalar(control, limits(rig), path);
    }
  }
  const calibrations = prepareLoadSeatCalibrations(scene);
  return freezeDeep({
    ...(Object.keys(calibrations).length
      ? { loadSeatCalibrations: calibrations }
      : {}),
    version: "prepared-mechanism-rig-tracks-2" as const,
    rigs: structuredClone(scene.rigs),
    controls,
  });
}

function limits(rig: Rig): readonly [number, number] {
  if (rig.type === "spring-return")
    fail(
      "mechanism-return-target",
      "Return target must be a physical slider or hinge",
      ["rigs", rig.id, "targetRig"],
    );
  return rig.type === "hinge"
    ? rig.angleRange
    : rig.type === "load-seat"
      ? [0, rig.maxForceNewtons]
      : rig.range;
}

function validateScalar(
  writer: ScalarWriter,
  range: readonly [number, number],
  path: Path,
) {
  if (writer.value !== undefined) {
    if (writer.value < range[0] || writer.value > range[1])
      fail("mechanism-rig-range", "Scalar exceeds the declared hard stops", [
        ...path,
        "value",
      ]);
    return;
  }
  writer.keys!.forEach((key, index) => {
    if (key.value < range[0] || key.value > range[1])
      fail(
        "mechanism-rig-range",
        "Authored scalar key exceeds the declared hard stops",
        [...path, "keys", index, "value"],
        key.frame,
      );
  });
}

function validateReturn(
  rig: ReturnRig,
  control: ReturnControl,
  range: readonly [number, number],
  path: Path,
) {
  control.states.forEach((state, index) => {
    const location = [...path, "states", index];
    if (state.value < range[0] || state.value > range[1])
      fail(
        "mechanism-return-range",
        "Held/released value exceeds target hard stops",
        [...location, "value"],
        state.frame,
      );
    if (state.phase === "released") {
      if (
        state.stopValue < Math.min(state.value, rig.restValue) ||
        state.stopValue > Math.max(state.value, rig.restValue)
      )
        fail(
          "mechanism-return-stop",
          "Contact stop must lie between the loaded value and rest",
          [...location, "stopValue"],
          state.frame,
        );
    } else {
      const previous = control.states[index - 1];
      if (
        previous?.phase === "released" &&
        Math.abs(
          sampleReleased(rig, previous, state.frame).value - state.value,
        ) > 1e-8
      )
        fail(
          "mechanism-return-continuity",
          "Re-holding must begin at the evaluated return position",
          [...location, "value"],
          state.frame,
          { startFrame: previous.frame, endFrameExclusive: state.frame },
        );
    }
  });
}

function validateRatchetIntervals(control: RatchetControl, path: Path) {
  const keys = control.position.keys;
  if (!keys) return;
  for (let index = 0; index + 1 < keys.length; index++) {
    const left = keys[index]!,
      right = keys[index + 1]!;
    if (right.value >= left.value) continue;
    if (left.easing === "hold") {
      if (latchAt(control, right.frame) === "engaged")
        fail(
          "mechanism-ratchet-reverse",
          "A reverse position step requires release at that event",
          [...path, "position", "keys", index + 1, "value"],
          right.frame,
        );
      continue;
    }
    for (let latch = 0; latch < control.latchKeys.length; latch++) {
      if (control.latchKeys[latch]!.state !== "engaged") continue;
      const start = Math.max(
        left.frame,
        latch === 0 ? 0 : control.latchKeys[latch]!.frame,
      );
      const end = Math.min(
        right.frame,
        control.latchKeys[latch + 1]?.frame ?? MECHANISM_LIMITS.frames,
      );
      if (start < end)
        fail(
          "mechanism-ratchet-reverse",
          "Continuous reverse travel overlaps an engaged latch",
          [...path, "position", "keys", index + 1, "value"],
          start,
          { startFrame: start, endFrameExclusive: end },
        );
    }
  }
}

function indexAt(keys: readonly { frame: number }[], frame: number) {
  if (frame <= keys[0]!.frame) return 0;
  let lower = 0,
    upper = keys.length;
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (keys[middle]!.frame <= frame) lower = middle;
    else upper = middle;
  }
  return lower;
}
function eased(fraction: number, easing: "linear" | "smoothstep" | "hold") {
  return easing === "hold"
    ? 0
    : easing === "smoothstep"
      ? fraction * fraction * (3 - 2 * fraction)
      : fraction;
}
function sampleScalar(
  writer: ScalarWriter | undefined,
  neutral: number,
  frame: number,
) {
  if (!writer) return neutral;
  if (writer.value !== undefined) return writer.value;
  const keys = writer.keys!;
  const index = indexAt(keys, frame);
  const left = keys[index]!,
    right = keys[index + 1];
  if (!right || frame <= left.frame) return left.value;
  const fraction = eased(
    (frame - left.frame) / (right.frame - left.frame),
    left.easing,
  );
  return left.value + (right.value - left.value) * fraction;
}
function latchAt(control: RatchetControl, frame: number) {
  return control.latchKeys[indexAt(control.latchKeys, frame)]!.state;
}
function sampleReleased(
  rig: ReturnRig,
  state: Extract<ReturnState, { phase: "released" }>,
  frame: number,
) {
  const elapsed = Math.max(
    0,
    Math.min(1, (frame - state.frame) / rig.returnFrames),
  );
  if (elapsed === 1 || state.value === rig.restValue)
    return {
      value: state.stopValue,
      phase: state.stopValue === rig.restValue ? "rest" : "contact",
    } as const;
  const raw =
    state.value + (rig.restValue - state.value) * eased(elapsed, rig.easing);
  const value =
    state.value >= rig.restValue
      ? Math.max(state.stopValue, raw)
      : Math.min(state.stopValue, raw);
  const phase =
    value === state.stopValue
      ? state.stopValue === rig.restValue
        ? "rest"
        : "contact"
      : "returning";
  return { value, phase } as const;
}
function sampleReturn(rig: ReturnRig, control: ReturnControl, frame: number) {
  const index = indexAt(control.states, frame),
    state = control.states[index]!;
  if (state.phase === "released") return sampleReleased(rig, state, frame);
  const next = control.states[index + 1];
  const value =
    next?.phase === "held" && frame > state.frame
      ? state.value +
        ((next.value - state.value) * (frame - state.frame)) /
          (next.frame - state.frame)
      : state.value;
  return { value, phase: "held" } as const;
}

export function evaluateMechanismRigTracksV2(
  prepared: PreparedMechanismRigTracksV2,
  frame: number,
): Record<string, MechanismRigFrameV2> {
  if (!Number.isFinite(frame) || frame < 0 || frame > MECHANISM_LIMITS.frames)
    fail("mechanism-frame", "Source frame is outside the supported interval", [
      "frame",
    ]);
  const output: Record<string, MechanismRigFrameV2> = {};
  for (const rig of prepared.rigs) {
    const control = prepared.controls[rig.id];
    if (rig.type === "slider")
      output[rig.id] = {
        id: rig.id,
        type: rig.type,
        position: sampleScalar(
          control?.type === "slider" ? control : undefined,
          rig.neutral,
          frame,
        ),
      };
    else if (rig.type === "hinge")
      output[rig.id] = {
        id: rig.id,
        type: rig.type,
        angleRadians: sampleScalar(
          control?.type === "hinge" ? control : undefined,
          rig.neutralAngle,
          frame,
        ),
      };
    else if (rig.type === "load-seat") {
      const calibration = prepared.loadSeatCalibrations?.[rig.id];
      if (!calibration)
        fail(
          "mechanism-load-scale",
          "Load seating lacks its prepared calibration",
          ["rigs", rig.id],
        );
      output[rig.id] = sampleLoadSeatV2(
        rig,
        sampleScalar(
          control?.type === "load-seat" ? control.loadNewtons : undefined,
          0,
          frame,
        ),
        calibration,
      );
    } else if (rig.type === "ratchet") {
      const position = sampleScalar(
        control?.type === "ratchet" ? control.position : undefined,
        rig.range[0] + rig.neutralTooth * rig.pitch,
        frame,
      );
      const tooth = (position - rig.range[0]) / rig.pitch;
      const seated = Math.abs(tooth - Math.round(tooth)) < 1e-8;
      const released =
        control?.type === "ratchet" && latchAt(control, frame) === "released";
      output[rig.id] = {
        id: rig.id,
        type: rig.type,
        position,
        toothIndex: seated ? Math.round(tooth) : Math.floor(tooth),
        phase: released ? "released" : seated ? "seated" : "advancing",
        pawlDeflection: released
          ? 1
          : seated
            ? 0
            : ratchetLiftV2(tooth - Math.floor(tooth)),
      };
    }
  }
  for (const rig of prepared.rigs) {
    if (rig.type !== "spring-return") continue;
    const control = prepared.controls[rig.id],
      target = output[rig.targetRig]!;
    const current =
      target.type === "hinge"
        ? target.angleRadians
        : target.type === "slider"
          ? target.position
          : 0;
    const returned =
      control?.type === "spring-return"
        ? sampleReturn(rig, control, frame)
        : { value: current, phase: "held" as const };
    output[rig.id] = {
      id: rig.id,
      type: rig.type,
      targetRig: rig.targetRig,
      ...returned,
    };
    if (target.type === "hinge")
      output[rig.targetRig] = { ...target, angleRadians: returned.value };
    if (target.type === "slider")
      output[rig.targetRig] = { ...target, position: returned.value };
  }
  return output;
}

function freezeDeep<T extends object>(root: T): T {
  const pending: object[] = [root];
  while (pending.length) {
    const item = pending.pop()!;
    for (const value of Object.values(item))
      if (value !== null && typeof value === "object") pending.push(value);
    Object.freeze(item);
  }
  return root;
}
