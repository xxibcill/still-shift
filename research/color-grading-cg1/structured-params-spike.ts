/**
 * CG1 spike: structured effect parameters (plan decision 4).
 *
 *   node --import tsx research/color-grading-cg1/structured-params-spike.ts
 *
 * Question: can grade operators use today's flat scalar effect parameters
 * (as CGA's color.matrix does: rr … bo, strength) with paths, drivers,
 * expressions and validation, and what does a nested path
 * (`effects[look].nodes[skin].primary.gain`) need?
 *
 * Writes research/color-grading-cg1/structured-params-spike.json.
 */
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { format } from "prettier";
import {
  resolvePropertyPath,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";

const root = resolve(import.meta.dirname, "../..");

const base = (extra: Partial<Composition> = {}): Composition =>
  ({
    schemaVersion: "composition-1",
    id: "cg1-params",
    width: 64,
    height: 64,
    fps: 24,
    frameCount: 24,
    background: "#000000",
    assets: [],
    layers: [
      {
        id: "card",
        type: "solid",
        color: "#808080",
        size: [64, 64],
        effects: [
          {
            id: "grade",
            effect: "color.matrix",
            params: { rr: 1.1, strength: 0.5 },
          },
        ],
      },
      {
        id: "knob",
        type: "solid",
        color: "#000000",
        size: [1, 1],
        transform: {
          opacity: {
            keys: [
              { frame: 0, value: 0 },
              { frame: 23, value: 1 },
            ],
          },
        },
      },
    ],
    ...extra,
  }) as unknown as Composition;

const paths = [
  "card.effects[grade].rr",
  "card.effects[grade].strength",
  "card.effects[grade].lift",
  "card.effects[grade].lift.r",
  "card.effects[grade].nodes[skin].primary.gain",
];
const resolved = Object.fromEntries(
  paths.map((p) => [p, resolvePropertyPath(base(), p)]),
);

// A driver and an expression writing flat grade parameters.
const driven = base({
  drivers: [
    {
      target: "card.effects[grade].strength",
      source: "knob.transform.opacity",
    },
  ],
} as Partial<Composition>);
const drivenValidation = validateComposition(driven);
const strengths = drivenValidation.ok
  ? [0, 12, 23].map((frame) => {
      const state = evaluateComp(driven, frame) as unknown as {
        layers: {
          id: string;
          effects?: { id: string; params: Record<string, number> }[];
        }[];
      };
      return state.layers.find((l) => l.id === "card")!.effects![0]!.params
        .strength;
    })
  : null;
const nestedDriver = validateComposition(
  base({
    drivers: [
      {
        target: "card.effects[grade].nodes[skin].primary.gain",
        source: "knob.transform.opacity",
      },
    ],
  } as Partial<Composition>),
);

const touchpoints = execFileSync(
  "git",
  [
    "grep",
    "-l",
    "-E",
    'EffectProperty\\b|property\\.type === "(curve|vec2|points)"|type === "points"',
    "--",
    "packages",
    "apps",
    "tools",
  ],
  { cwd: root, encoding: "utf8" },
)
  .trim()
  .split("\n");

const result = {
  schema: "still-shift-color-cg1-spike-1",
  command:
    "node --import tsx research/color-grading-cg1/structured-params-spike.ts",
  pathResolution: resolved,
  flatDriver: {
    target: "card.effects[grade].strength",
    valid: drivenValidation.ok,
    strengthAtFrames0_12_23: strengths,
  },
  nestedDriver: {
    target: "card.effects[grade].nodes[skin].primary.gain",
    valid: nestedDriver.ok,
    diagnostics: nestedDriver.ok
      ? []
      : (
          nestedDriver as { diagnostics: { code: string; message: string }[] }
        ).diagnostics
          .slice(0, 3)
          .map((d) => ({ code: d.code, message: d.message })),
  },
  nestedContractTouchpoints: { files: touchpoints.length, list: touchpoints },
};
await writeFile(
  join(root, "research/color-grading-cg1/structured-params-spike.json"),
  await format(JSON.stringify(result), { parser: "json" }),
);
console.log(
  JSON.stringify(
    {
      resolved: Object.fromEntries(
        Object.entries(resolved).map(([k, v]) => [
          k,
          "code" in v ? v.code : v.type,
        ]),
      ),
      flat: result.flatDriver,
      nested: result.nestedDriver.valid,
      files: touchpoints.length,
    },
    null,
    1,
  ),
);
