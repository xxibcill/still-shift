/** Authored frame offsets accumulate exactly before their absolute PCM boundary
 * is rounded. Rounding each nested placement separately adds spurious samples.
 */
export class CompositionPcmClock {
  private numerator = 0n;
  private denominator = 1n;

  place(frame: number, fps: number): CompositionPcmClock {
    if (!Number.isSafeInteger(frame) || !Number.isSafeInteger(fps) || fps < 1)
      throw Error(
        "PCM placement requires an integer frame and positive integer fps",
      );
    const rate = BigInt(fps);
    const numerator =
      this.numerator * rate + BigInt(frame) * 48000n * this.denominator;
    const denominator = this.denominator * rate;
    let divisor = numerator < 0n ? -numerator : numerator;
    let remainder = denominator;
    while (remainder) {
      const next = divisor % remainder;
      divisor = remainder;
      remainder = next;
    }
    const result = new CompositionPcmClock();
    result.numerator = numerator / divisor;
    result.denominator = denominator / divisor;
    return result;
  }

  get sample(): number {
    const rounded =
      this.numerator > 0n
        ? (this.numerator + this.denominator - 1n) / this.denominator
        : this.numerator / this.denominator;
    const sample = Number(rounded);
    if (!Number.isSafeInteger(sample))
      throw Error("PCM placement exceeds the exact integer sample range");
    return sample;
  }
}
