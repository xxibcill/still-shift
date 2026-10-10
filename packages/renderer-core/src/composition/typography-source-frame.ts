/** Indexed provider sample frame; baked inputs preserve their separate source clock. */
export function typographySourceFrame(
  time: number,
  frameCount: number,
  sourceTime?: number,
): number {
  return Math.max(
    0,
    sourceTime === undefined
      ? Math.min(frameCount - 1, Math.floor(time))
      : Math.floor(time),
  );
}
