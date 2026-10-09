import type {
  CompositionSemanticAssociation,
  MotionLintDiagnostic,
  ResolvedCompositionQualityPolicy,
} from "./quality-policy.ts";
import type {
  CompositionQualityFrame,
  CompositionQualitySample,
} from "./quality-samples.ts";

type SemanticFaultCode =
  | "semantic-context-required"
  | "semantic-context-incomplete"
  | "semantic-copy-changed"
  | "semantic-member-reference";

export type SemanticViolationInterval = {
  code: SemanticFaultCode;
  member?: string;
  path: string;
  /** Inclusive composition-frame interval. */
  frames: [number, number];
  measuredFrames: number;
};

export type SemanticAssociationAssessment = {
  id: string;
  purpose: string;
  kind: CompositionSemanticAssociation["kind"];
  start: number;
  end: number;
  members: string[];
  visibleValueFrames: number;
  readableValueFrames: number;
  status: "passed" | "failed";
  violationIntervals: SemanticViolationInterval[];
};

type Fault = SemanticViolationInterval & { message: string };

function readable(
  sample: CompositionQualitySample | undefined,
  policy: ResolvedCompositionQualityPolicy,
): boolean {
  if (
    !sample?.onScreen ||
    !sample.fullyOnScreen ||
    !sample.bounds ||
    !sample.clippedBounds
  )
    return false;
  const bounds = sample.bounds;
  const clipped = sample.clippedBounds;
  return (
    sample.opacity >= policy.readingOpacity &&
    sample.reveal >= policy.readingReveal &&
    typeof sample.text === "string" &&
    bounds.left === clipped.left &&
    bounds.right === clipped.right &&
    bounds.top === clipped.top &&
    bounds.bottom === clipped.bottom
  );
}

function visible(sample: CompositionQualitySample | undefined): boolean {
  return !!sample?.onScreen && sample.opacity > 0 && sample.reveal > 0;
}

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Assess only authored associations. Motion stability and reading duration belong
 * to reading declarations; rendered glyph readability and factual truth require
 * separate evidence.
 */
export function analyzeCompositionSemantics(
  frames: readonly CompositionQualityFrame[],
  fps: number,
  policy: ResolvedCompositionQualityPolicy,
): {
  status: "unassessed" | "passed" | "failed";
  profile: "legacy" | "require-declared-context";
  associations: SemanticAssociationAssessment[];
  diagnostics: MotionLintDiagnostic[];
} {
  const profile = policy.semanticProfile;
  const declarations = policy.semanticAssociations ?? [];
  if (!declarations.length) {
    const required = profile === "require-declared-context";
    return {
      status: required ? "failed" : "unassessed",
      profile,
      associations: [],
      diagnostics: required
        ? [
            {
              code: "semantic-context-required",
              severity: "error",
              path: "semanticAssociations",
              nodes: [],
              frames: [0, Math.max(0, frames.length - 1)],
              measured: frames.length,
              message:
                "The strict semantic profile requires explicitly authored context associations.",
            },
          ]
        : [],
    };
  }

  const diagnostics: MotionLintDiagnostic[] = [];
  const referencedLayers = new Set(
    declarations.flatMap((declaration) =>
      declaration.members.map((member) => member.layer),
    ),
  );
  const firstSamples = new Map<string, CompositionQualitySample>();
  for (const frame of frames) {
    for (const [id, sample] of frame.layers)
      if (referencedLayers.has(id) && !firstSamples.has(id))
        firstSamples.set(id, sample);
    if (firstSamples.size === referencedLayers.size) break;
  }
  const associations = declarations.map((declaration, index) => {
    const base = `semanticAssociations.${index}`;
    const faults = new Map<string, Fault[]>();
    const record = (
      code: SemanticFaultCode,
      member: string,
      path: string,
      start: number,
      end: number,
      message: string,
    ) => {
      const key = `${code}:${path}`;
      let intervals = faults.get(key);
      if (!intervals) faults.set(key, (intervals = []));
      const prior = intervals.at(-1);
      if (prior && prior.frames[1] + 1 === start) {
        prior.frames[1] = end;
        prior.measuredFrames += end - start + 1;
      } else
        intervals.push({
          code,
          member,
          path,
          frames: [start, end],
          measuredFrames: end - start + 1,
          message,
        });
    };

    const invalidReferences = new Set<string>();
    for (const [memberIndex, member] of declaration.members.entries()) {
      const sample = firstSamples.get(member.layer);
      if (
        sample &&
        (sample.state.layer.type === "text" ||
          typeof sample.text === "string" ||
          sample.textCopies !== undefined)
      )
        continue;
      invalidReferences.add(member.layer);
      record(
        "semantic-member-reference",
        member.layer,
        `${base}.members.${memberIndex}.layer`,
        declaration.start,
        declaration.end - 1,
        `${declaration.id} references ${sample ? "a non-text" : "a missing"} member: ${member.layer}.`,
      );
    }

    let visibleValueFrames = 0;
    let readableValueFrames = 0;
    for (let at = declaration.start; at < declaration.end; at++) {
      const layers = frames[at]?.layers;
      const valueVisible = declaration.members.some(
        (member) =>
          member.kind === "value" &&
          !invalidReferences.has(member.layer) &&
          visible(layers?.get(member.layer)),
      );
      const valueReadable = declaration.members.some(
        (member) =>
          member.kind === "value" &&
          !invalidReferences.has(member.layer) &&
          readable(layers?.get(member.layer), policy),
      );
      if (valueVisible) visibleValueFrames++;
      if (valueReadable) readableValueFrames++;
      for (const [memberIndex, member] of declaration.members.entries()) {
        if (invalidReferences.has(member.layer)) continue;
        const sample = layers?.get(member.layer);
        const exactCopy = sample?.text === member.text;
        if (visible(sample) && !exactCopy) {
          record(
            "semantic-copy-changed",
            member.layer,
            `${base}.members.${memberIndex}.text`,
            at,
            at,
            `${declaration.id} member ${member.layer} changes its declared ${member.kind} copy.`,
          );
        } else if (valueReadable && (!exactCopy || !readable(sample, policy))) {
          record(
            "semantic-context-incomplete",
            member.layer,
            `${base}.members.${memberIndex}.layer`,
            at,
            at,
            `${declaration.id} requires exact readable ${member.kind} context from ${member.layer} whenever its value is readable.`,
          );
        }
      }
    }

    if (!readableValueFrames) {
      const memberIndex = declaration.members.findIndex(
        (member) => member.kind === "value",
      );
      const member = declaration.members[memberIndex]!;
      record(
        "semantic-context-incomplete",
        member.layer,
        `${base}.members.${memberIndex}.layer`,
        declaration.start,
        declaration.end - 1,
        `${declaration.id} has no measured readable value within its declared interval.`,
      );
    }

    const intervals = [...faults.values()]
      .flat()
      .sort(
        (left, right) =>
          left.frames[0] - right.frames[0] ||
          lexicalCompare(left.path, right.path) ||
          lexicalCompare(left.code, right.code),
      );
    for (const interval of intervals)
      diagnostics.push({
        code: interval.code,
        severity: "error",
        path: interval.path,
        nodes: interval.member ? [interval.member] : [],
        frames: [...interval.frames],
        measured: interval.measuredFrames,
        message: `${interval.message} Frames ${interval.frames[0]}–${interval.frames[1]} (${(interval.measuredFrames / fps).toFixed(2)} s).`,
      });

    return {
      id: declaration.id,
      purpose: declaration.purpose,
      kind: declaration.kind,
      start: declaration.start,
      end: declaration.end,
      members: declaration.members.map((member) => member.layer),
      visibleValueFrames,
      readableValueFrames,
      status: intervals.length ? ("failed" as const) : ("passed" as const),
      violationIntervals: intervals.map(
        ({ message: _message, ...interval }) => interval,
      ),
    };
  });

  return {
    status: diagnostics.length ? "failed" : "passed",
    profile,
    associations,
    diagnostics,
  };
}
