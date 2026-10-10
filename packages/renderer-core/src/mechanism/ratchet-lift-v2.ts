const coefficients = [
  1,
  -1 / 6,
  1 / 120,
  -1 / 5040,
  1 / 362880,
  -1 / 39916800,
  1 / 6227020800,
  -1 / 1307674368000,
  1 / 355687428096000,
  -1 / 121645100408832000,
  1 / 51090942171709440000,
];

/** Deterministic sine lift on one tooth. Basic IEEE-754 arithmetic avoids host Math.sin differences in exact driver keys. */
export function ratchetLiftV2(phase: number): number {
  if (!Number.isFinite(phase) || phase < 0 || phase > 1)
    throw RangeError("Ratchet phase must lie on one tooth");
  if (phase === 0 || phase === 1) return 0;
  if (phase === 0.5) return 1;
  // Reflect to [0, pi/2]. The degree-21 sine remainder is below 1.3e-18 here;
  // ordinary floating arithmetic contributes the separately tested rounding error.
  const angle = Math.PI * (phase <= 0.5 ? phase : 1 - phase);
  const squared = angle * angle;
  let polynomial = coefficients[10]!;
  for (let index = 9; index >= 0; index--)
    polynomial = coefficients[index]! + squared * polynomial;
  return Math.max(0, Math.min(1, angle * polynomial));
}
