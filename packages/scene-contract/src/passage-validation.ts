type Cue = { id: string; frame: number };
type PassageBeat = {
  id: string;
  frameCount: number;
  cues: Cue[];
  evidence?: { kind: string; reference?: string | undefined } | undefined;
};
type DeliverySlice = { start: number; end: number };
type PassageIds = {
  beats: { id: string }[];
  delivery: { id: string }[];
};

export type PassageBeatIssue =
  | { kind: "missing-supported-reference" }
  | { kind: "cue-out-of-bounds"; cueId: string };

export function checkPassageIds(
  plan: PassageIds,
  fail: (message: string) => void,
) {
  requireUniqueIds(
    plan.beats.map((beat) => beat.id),
    "beat ID",
    fail,
  );
  requireUniqueIds(
    plan.delivery.map((shot) => shot.id),
    "delivery ID",
    fail,
  );
}

export function checkPassageCueIds(
  beat: PassageBeat,
  fail: (message: string) => void,
) {
  requireUniqueIds(
    beat.cues.map((cue) => cue.id),
    "cue ID in " + beat.id,
    fail,
  );
}

export function checkPassageBeatContent(
  beat: PassageBeat,
  report: (issue: PassageBeatIssue) => void,
) {
  if (beat.evidence?.kind === "supported" && !beat.evidence.reference)
    report({ kind: "missing-supported-reference" });
  checkCueBounds(beat, (cue) =>
    report({ kind: "cue-out-of-bounds", cueId: cue.id }),
  );
}

export function requireUniqueIds(
  ids: string[],
  label: string,
  fail: (message: string) => void,
) {
  if (new Set(ids).size !== ids.length) fail("Duplicate " + label);
}

function checkCueBounds(beat: PassageBeat, fail: (cue: Cue) => void) {
  for (const cue of beat.cues) if (cue.frame >= beat.frameCount) fail(cue);
}

export function checkPassageLength(
  totalFrames: number,
  fail: (message: string) => void,
) {
  if (totalFrames > 108000) fail("A passage cannot exceed 108000 frames");
}

export function checkDeliveryCoverage(
  slices: DeliverySlice[],
  totalFrames: number,
  fail: (message: string) => void,
) {
  let end = 0;
  for (const slice of slices) {
    if (slice.start !== end || slice.end <= slice.start)
      fail("Delivery slices must cover the passage contiguously");
    end = slice.end;
  }
  if (slices.length && end !== totalFrames)
    fail("Delivery slices must cover the entire passage");
}
