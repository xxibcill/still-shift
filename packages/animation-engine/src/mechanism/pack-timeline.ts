import {
  MechanismPackTimelineSchema,
  type MechanismPackTimeline,
  type MechanismFrameRequestV2,
} from "@still-shift/scene-contract";
import { prepareMechanismSceneV2 } from "../../../renderer-core/src/mechanism/prepare-v2.ts";
import { evaluateMechanismFrameV2 } from "../../../renderer-core/src/mechanism/evaluate-v2.ts";
import { prepareMechanismRigTracksV2 } from "../../../renderer-core/src/mechanism/rig-tracks-v2.ts";
import { MechanismPackInvariantError } from "./pack-invariant.ts";
import {
  freezeMechanismPack,
  mechanismPackHash,
  type MechanismPackInstanceSource,
} from "./pack-support.ts";

export interface CompiledMechanismPackTimeline {
  version: "compiled-mechanism-pack-timeline-1";
  sourceSha256: string;
  timelineSha256: string;
  timeline: MechanismPackTimeline;
  checkedOutputFrames: number;
  checkedEventFrames: number;
  evidence: "pure-expected-state";
}
/** Compile legal authored transitions and check every output frame plus exact event boundaries.
 * This is expected-state evidence; continuous-time and GPU observations stay separate.
 */
export function compileMechanismPackTimeline(
  instance: MechanismPackInstanceSource,
  input: unknown,
): CompiledMechanismPackTimeline {
  const fail = (
    code: string,
    message: string,
    path: (string | number)[],
    frame?: number,
  ) => {
    throw new MechanismPackInvariantError(message, {
      code,
      path,
      pack: instance.pack,
      ...(frame === undefined ? {} : { frame }),
    });
  };
  if (mechanismPackHash(instance.scene) !== instance.sourceSha256)
    fail("mechanism-pack-revision", "Pack source identity changed", [
      "sourceSha256",
    ]);
  const parsed = MechanismPackTimelineSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    fail("mechanism-timeline-contract", issue.message, [
      "timeline",
      ...issue.path.map((p) => (typeof p === "number" ? p : String(p))),
    ]);
  }
  const timeline = parsed.data!;
  const states = new Map(timeline.states.map((state) => [state.id, state]));
  if (states.size !== timeline.states.length)
    fail("mechanism-timeline-state", "State IDs must be unique", [
      "timeline",
      "states",
    ]);
  if (!states.has(timeline.initialState))
    fail("mechanism-timeline-state", "Unknown initial state", [
      "timeline",
      "initialState",
    ]);
  const rigs = new Set(instance.scene.rigs.map((rig) => rig.id));
  const relationships = new Map(
    instance.scene.relationships.map((relation) => [relation.id, relation]),
  );
  for (const [index, state] of timeline.states.entries())
    for (const [ruleIndex, rule] of state.requirements.entries()) {
      const path = ["timeline", "states", index, "requirements", ruleIndex];
      if (!rigs.has(rule.rig))
        fail("mechanism-timeline-rig", "Unknown requirement rig", [
          ...path,
          "rig",
        ]);
      const relation = relationships.get(rule.relationship);
      if (!relation)
        fail(
          "mechanism-timeline-relationship",
          "Unknown required relationship",
          [...path, "relationship"],
        );
      if (
        rule.signedGap &&
        (relation?.type !== "signed-gap" ||
          rule.signedGap[0] > rule.signedGap[1])
      )
        fail(
          "mechanism-timeline-gap",
          "Ordered signed-gap bounds require a signed-gap relationship",
          [...path, "signedGap"],
        );
    }
  const transitions = new Set<string>();
  const key = (from: string, to: string, event: string) =>
    JSON.stringify([from, to, event]);
  for (const [index, transition] of timeline.transitions.entries()) {
    if (!states.has(transition.from) || !states.has(transition.to))
      fail(
        "mechanism-timeline-state",
        "Transition references an unknown state",
        ["timeline", "transitions", index],
      );
    const value = key(transition.from, transition.to, transition.event);
    if (transitions.has(value))
      fail("mechanism-timeline-transition", "Duplicate transition", [
        "timeline",
        "transitions",
        index,
      ]);
    transitions.add(value);
  }
  const ids = new Set<string>();
  for (const [index, event] of timeline.events.entries()) {
    const path = ["timeline", "events", index];
    if (ids.has(event.id))
      fail(
        "mechanism-timeline-event",
        "Event IDs must be unique",
        [...path, "id"],
        event.frame,
      );
    ids.add(event.id);
    if (!states.has(event.state))
      fail(
        "mechanism-timeline-state",
        "Event references an unknown state",
        [...path, "state"],
        event.frame,
      );
    if (event.frame >= timeline.frameCount)
      fail(
        "mechanism-timeline-event",
        "Event lies outside the output interval",
        [...path, "frame"],
        event.frame,
      );
    if (index === 0) {
      if (
        event.frame !== 0 ||
        event.kind !== "initial" ||
        event.state !== timeline.initialState
      )
        fail(
          "mechanism-timeline-initial",
          "Initial event establishes the initial state at frame zero",
          path,
          event.frame,
        );
    } else {
      const previous = timeline.events[index - 1]!;
      if (event.frame <= previous.frame)
        fail(
          "mechanism-timeline-event",
          "Event frames must strictly increase",
          [...path, "frame"],
          event.frame,
        );
      if (!transitions.has(key(previous.state, event.state, event.kind))) {
        const rule = states.get(event.state)!.requirements[0]!;
        throw new MechanismPackInvariantError(
          "Authored event is not a legal state transition",
          {
            code: "mechanism-timeline-transition",
            path,
            pack: instance.pack,
            frame: event.frame,
            rig: rule.rig,
            relationship: rule.relationship,
            parts: relationParts(instance, rule.relationship),
            interval: {
              startFrame: event.frame,
              endFrameExclusive:
                timeline.events[index + 1]?.frame ?? timeline.frameCount,
            },
          },
        );
      }
    }
  }
  // Use the same whole-interval rig validator as runtime sampling.
  prepareMechanismRigTracksV2(instance.scene, timeline.rigControls);
  const prepared = prepareMechanismSceneV2(instance.scene);
  // Merge event boundaries with output frames without retaining a frame-count-sized array.
  let outputFrame = 0,
    eventCursor = 0;
  while (
    outputFrame < timeline.frameCount ||
    eventCursor < timeline.events.length
  ) {
    const frame = Math.min(
      outputFrame < timeline.frameCount ? outputFrame : Infinity,
      timeline.events[eventCursor]?.frame ?? Infinity,
    );
    if (frame === outputFrame) outputFrame++;
    if (frame === timeline.events[eventCursor]?.frame) eventCursor++;
    const evaluated = evaluateMechanismFrameV2(prepared, {
      frame,
      width: 640,
      height: 360,
      rigControls: timeline.rigControls,
    });
    checkState(instance, timeline, frame, evaluated);
  }
  return freezeMechanismPack({
    version: "compiled-mechanism-pack-timeline-1",
    sourceSha256: instance.sourceSha256,
    timelineSha256: mechanismPackHash(timeline),
    timeline,
    checkedOutputFrames: timeline.frameCount,
    checkedEventFrames: timeline.events.length,
    evidence: "pure-expected-state",
  });
}
function checkState(
  instance: MechanismPackInstanceSource,
  timeline: MechanismPackTimeline,
  frame: number,
  evaluated: ReturnType<typeof evaluateMechanismFrameV2>,
) {
  const index = eventIndex(timeline, frame),
    event = timeline.events[index]!,
    state = timeline.states.find((state) => state.id === event.state)!;
  for (const relation of Object.values(evaluated.relationships)) {
    if (relation.required && relation.residual > relation.tolerance) {
      const source = instance.scene.relationships.find(
        (source) => source.id === relation.id,
      )!;
      throw new MechanismPackInvariantError(
        "Scene-wide required relationship failed",
        {
          code: "mechanism-pack-invariant",
          path: ["relationships", relation.id],
          pack: instance.pack,
          frame,
          ...(source.type === "engagement" ? { rig: source.rig } : {}),
          relationship: relation.id,
          parts: relationParts(instance, relation.id),
          interval: {
            startFrame: frame,
            endFrameExclusive: Math.min(
              timeline.events[index + 1]?.frame ?? timeline.frameCount,
              Math.floor(frame) + 1,
            ),
          },
        },
      );
    }
  }
  for (const [ruleIndex, rule] of state.requirements.entries()) {
    const relation = evaluated.relationships[rule.relationship]!;
    const gap = relation.measured[0]!;
    if (
      relation.residual > relation.tolerance ||
      (rule.signedGap &&
        (gap < rule.signedGap[0] - relation.tolerance ||
          gap > rule.signedGap[1] + relation.tolerance))
    )
      throw new MechanismPackInvariantError(
        "Required authored state relationship failed",
        {
          code: "mechanism-timeline-relationship",
          path: [
            "timeline",
            "states",
            timeline.states.indexOf(state),
            "requirements",
            ruleIndex,
          ],
          pack: instance.pack,
          frame,
          rig: rule.rig,
          relationship: rule.relationship,
          parts: relationParts(instance, rule.relationship),
          interval: {
            startFrame: frame,
            endFrameExclusive: Math.min(
              timeline.events[index + 1]?.frame ?? timeline.frameCount,
              Math.floor(frame) + 1,
            ),
          },
        },
      );
  }
}
function relationParts(instance: MechanismPackInstanceSource, id: string) {
  const relation = instance.scene.relationships.find(
    (relation) => relation.id === id,
  )!;
  const anchors =
    relation.type === "engagement"
      ? [relation.pawlTip, relation.toothDatum]
      : relation.anchors;
  return anchors.map((id) => {
    const source = instance.scene.anchors.find(
      (anchor) => anchor.id === id,
    )!.source;
    return source.kind === "part-local"
      ? source.part
      : instance.scene.teachingShapes.find(
          (shape) => shape.id === source.shape,
        )!.ownerPart;
  });
}
function eventIndex(timeline: MechanismPackTimeline, frame: number) {
  let low = 0,
    high = timeline.events.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (timeline.events[middle]!.frame <= frame) low = middle;
    else high = middle;
  }
  return low;
}
/** Deterministic random-seek state/request; no playback history and no mutable runtime cache. */
export function sampleMechanismPackTimeline(
  instance: MechanismPackInstanceSource,
  compiled: CompiledMechanismPackTimeline,
  frame: number,
  viewport: Pick<MechanismFrameRequestV2, "width" | "height">,
) {
  if (
    compiled.version !== "compiled-mechanism-pack-timeline-1" ||
    instance.sourceSha256 !== compiled.sourceSha256 ||
    mechanismPackHash(instance.scene) !== instance.sourceSha256 ||
    mechanismPackHash(compiled.timeline) !== compiled.timelineSha256
  )
    throw new MechanismPackInvariantError(
      "Timeline or source identity changed",
      {
        code: "mechanism-pack-revision",
        path: ["timeline"],
        pack: instance.pack,
      },
    );
  if (
    !Number.isFinite(frame) ||
    frame < 0 ||
    frame >= compiled.timeline.frameCount
  )
    throw new MechanismPackInvariantError(
      "Seek lies outside the compiled timeline",
      {
        code: "mechanism-timeline-frame",
        path: ["frame"],
        pack: instance.pack,
      },
    );
  const event = compiled.timeline.events[eventIndex(compiled.timeline, frame)]!;
  const request = {
    ...viewport,
    frame,
    rigControls: compiled.timeline.rigControls,
  };
  const evaluated = evaluateMechanismFrameV2(
    prepareMechanismSceneV2(instance.scene),
    request,
  );
  checkState(instance, compiled.timeline, frame, evaluated);
  return {
    state: event.state,
    event: event.id,
    request,
    frame: evaluated,
    evidence: "pure-expected-state" as const,
  };
}
