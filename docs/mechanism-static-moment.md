# Ideal static moment behavior

`solveMechanismStaticMomentBalance` and `evaluateMechanismStaticMomentFrame`
are exported from `still-shift/renderer`. Their strict model, input and result
schemas are exported from `still-shift/schema` and registered as
`static-moment-model`, `static-moment-input` and `static-moment-result` in the
mechanism schema registry.

The solver balances a prescribed signed resistance about one fixed axis:

`arm = axis · ((applicationPoint − pivot) × forceDirection) × scaleToMeters`

`requiredForceNewtons = −resistingTorqueNewtonMeters / arm`

Directions are normalized. Coordinates are in scene units; `scaleToMeters`
converts their displacement to meters. Resistance accepts `N*m` or `N*mm`.
Forces are nonnegative magnitudes along the declared force direction. A direction
that cannot oppose the resistance rejects instead of changing sign silently.
Zero resistance gives zero force when the arm remains valid.

```ts
import { solveMechanismStaticMomentBalance } from "still-shift/renderer";

const input = {
  pivot: [0, 0, 0] as [number, number, number],
  applicationPoint: [1, 0.86, 0.4] as [number, number, number],
  axis: [0, 0, 1] as [number, number, number],
  forceDirection: [0, -1, 0] as [number, number, number],
  scaleToMeters: 0.01,
  resistingTorque: { value: 0.01, unit: "N*m" as const },
};
const near = solveMechanismStaticMomentBalance(input); // 1 N
const far = solveMechanismStaticMomentBalance({
  ...input,
  applicationPoint: [2.4, 0.8133333333333334, 0.4],
}); // approximately 0.416667 N
```

The posed adapter accepts a prepared mechanism pose, its normal frame request,
and at most 16 distinct model declarations. Each declaration identifies a pivot
anchor, force application anchor, reference part, unit axis, unit force direction
and resistance. It evaluates the normal frame once, transforms the reference
axis/direction to world space and solves from the actual posed anchors with the
scene's calibration. It returns that unchanged frame and an immutable `moments`
dictionary. Invalid references and balance failures retain model/frame locations.

The minimum admitted perpendicular arm is `1e-9` meters and the maximum force
is `1e12` newtons. Result admission also checks the signed torque balance. Input
and model schemas reject unknown fields and nonfinite values. These numeric
bounds are software limits, not product ratings.

The behavior assumes a fixed pivot/axis, rigid geometry and prescribed resistance.
It calculates expected static states; it does not simulate a spring, friction,
contact, deformation or motion. A peg application is an idealized inference from
[OpenStax's lever and equilibrium explanation](https://openstax.org/books/college-physics-ap-courses/pages/9-5-simple-machines).
Its easing/return track supplies no measured resistance torque. Scene calibration
and resistance must be declared explicitly before reporting a force.

The `ideal-lever-press-points` clothespeg candidate provides separate physical
near/far pads and anchors. Its saved-family input retains the legacy dimension
parameters; the resistance is a separate pinned QA model. The production
`static-moment-balance` selector derives the same ideal quantities from original
native captured positions/matrices and calibration, with at most16 distinct models
per plan. See [production QA](./mechanism-production-qa.md) for quantities and units.

Native/episode evidence and whole reviews remain separate gates. This API and
candidate do not admit E10 or alter the frozen ten-question denominator.
