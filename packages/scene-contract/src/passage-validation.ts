type Cue = { id: string; frame: number };
type BeatWithCues = { frameCount: number; cues: Cue[] };
type DeliverySlice = { start: number; end: number };

export function requireUniqueIds(
  ids: string[],
  label: string,
  fail: (message: string) => void,
) {
  if (new Set(ids).size !== ids.length) fail("Duplicate " + label);
}

export function checkCueBounds(beat: BeatWithCues, fail: (cue: Cue) => void) {
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
