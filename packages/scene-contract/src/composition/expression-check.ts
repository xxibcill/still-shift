import type { ExpressionAst, ParsedExpression } from "./expression-ast.ts";
import type { PropertyValueType } from "./resolve.ts";

export type ExpressionType =
  | "scalar"
  | "vec2"
  | "vec3"
  | "color"
  | "bool"
  | "string";
export type ExpressionNumericType = "scalar" | "vec2" | "vec3" | "color";
export type ExpressionTargetType = ExpressionNumericType;

export const LOOP_MODES = ["cycle", "pingpong", "offset", "continue"] as const;
export type LoopMode = (typeof LOOP_MODES)[number];

/** Upper bounds for literal arguments that control sampling work. */
export const EXPRESSION_SAMPLE_LIMITS = {
  smoothSamples: 64,
  wiggleOctaves: 8,
  loopKeys: 2_000,
} as const;

export type ExpressionCheckEnv = {
  /** Type of the property that receives the expression's result (and `value`). */
  target: ExpressionTargetType;
  /** Resolve a property path argument (`ref`, `valueAtTime`, …). */
  resolve: (
    path: string,
  ) => { type: PropertyValueType } | { code: string; message: string };
  hasSignal: (id: string) => boolean;
};

/** A property read by `ref`, `valueAtTime`, `velocityAtTime`, `spring` or `heading`. */
export type ExpressionRead = { path: string; column: number };

export type ExpressionCheck =
  | { type: ExpressionType; reads: ExpressionRead[]; signals: string[] }
  | { error: { code: string; message: string; column: number } };

type Param =
  | "path"
  | "signal"
  | "loop-mode"
  | "scalar"
  | "bool"
  | "T"
  | "Tb"
  | "vector"
  | "vec2"
  | "any"
  | { literal: [number, number] };
type Result =
  | ExpressionType
  | "T"
  | "path"
  | "value"
  | "arg0"
  | ((types: ExpressionType[]) => ExpressionType | string);
type Signature = { params: Param[]; result: Result };
type BuiltIn = { overloads: Signature[]; summary: string };

const sig = (params: Param[], result: Result): Signature => ({
  params,
  result,
});
const componentwise = (summary: string): BuiltIn => ({
  overloads: [sig(["T"], "T")],
  summary,
});

/** Registered built-ins. Add a built-in here rather than an escape hatch to code. */
export const EXPRESSION_BUILTINS: Record<string, BuiltIn> = {
  ref: {
    overloads: [sig(["path"], "path")],
    summary: "The referenced property's value at the current time.",
  },
  valueAtTime: {
    overloads: [sig(["path", "scalar"], "path"), sig(["scalar"], "value")],
    summary:
      "A property's value at a root time in seconds; with one argument, this property's pre-expression value.",
  },
  velocityAtTime: {
    overloads: [sig(["path", "scalar"], "path"), sig(["scalar"], "value")],
    summary:
      "Central-difference velocity per second (±1 frame); with one argument, of this property's pre-expression value.",
  },
  clamp: {
    overloads: [sig(["T", "Tb", "Tb"], "T")],
    summary: "Component-wise clamp.",
  },
  mix: {
    overloads: [sig(["T", "T", "scalar"], "T")],
    summary: "Linear blend a + (b − a)·t.",
  },
  linear: {
    overloads: [
      sig(["scalar", "scalar", "scalar", "T", "T"], "T"),
      sig(["scalar", "T", "T"], "T"),
    ],
    summary: "Map t from [tMin, tMax] (or [0, 1]) to [v1, v2], clamped.",
  },
  ease: {
    overloads: [
      sig(["scalar", "scalar", "scalar", "T", "T"], "T"),
      sig(["scalar", "T", "T"], "T"),
    ],
    summary: "As linear, with easeInOut.",
  },
  easeIn: {
    overloads: [
      sig(["scalar", "scalar", "scalar", "T", "T"], "T"),
      sig(["scalar", "T", "T"], "T"),
    ],
    summary: "As linear, with easeIn.",
  },
  easeOut: {
    overloads: [
      sig(["scalar", "scalar", "scalar", "T", "T"], "T"),
      sig(["scalar", "T", "T"], "T"),
    ],
    summary: "As linear, with easeOut.",
  },
  wiggle: {
    overloads: [
      sig(["scalar", "scalar"], "value"),
      sig(["scalar", "scalar", "scalar"], "value"),
      sig(
        [
          "scalar",
          "scalar",
          "scalar",
          { literal: [1, EXPRESSION_SAMPLE_LIMITS.wiggleOctaves] },
        ],
        "value",
      ),
    ],
    summary:
      "value plus seeded smooth noise: wiggle(frequency Hz, amplitude, seed = 0, octaves = 1).",
  },
  noise: {
    overloads: [sig(["scalar", "scalar"], "scalar")],
    summary: "Seeded smooth noise in [−1, 1]: noise(seed, t).",
  },
  random: {
    overloads: [sig(["scalar", "scalar"], "scalar")],
    summary: "Seeded hash in [0, 1): random(seed, index).",
  },
  loopIn: {
    overloads: [
      sig([], "value"),
      sig(["loop-mode"], "value"),
      sig(
        ["loop-mode", { literal: [0, EXPRESSION_SAMPLE_LIMITS.loopKeys] }],
        "value",
      ),
    ],
    summary: "Repeat this property's keys before its first key.",
  },
  loopOut: {
    overloads: [
      sig([], "value"),
      sig(["loop-mode"], "value"),
      sig(
        ["loop-mode", { literal: [0, EXPRESSION_SAMPLE_LIMITS.loopKeys] }],
        "value",
      ),
    ],
    summary: "Repeat this property's keys after its last key.",
  },
  smooth: {
    overloads: [
      sig([], "value"),
      sig(["scalar"], "value"),
      sig(
        ["scalar", { literal: [1, EXPRESSION_SAMPLE_LIMITS.smoothSamples] }],
        "value",
      ),
    ],
    summary:
      "Mean of this property's pre-expression value over a window: smooth(width s = 0.2, samples = 5).",
  },
  lookAt: {
    overloads: [sig(["vec2", "vec2"], "scalar")],
    summary: "Clockwise angle in degrees from `from` towards `to`.",
  },
  length: {
    overloads: [
      sig(["vector"], "scalar"),
      sig(["vector", "vector"], (types) =>
        types[0] === types[1]
          ? "scalar"
          : `length() needs matching vector dimensions (${types[0]} and ${types[1]})`,
      ),
    ],
    summary: "Vector length, or the distance between two points.",
  },
  normalize: {
    overloads: [sig(["vector"], "arg0")],
    summary: "Unit vector (zero stays zero).",
  },
  step: {
    overloads: [sig(["scalar", "scalar"], "scalar")],
    summary: "0 when x < edge, otherwise 1: step(edge, x).",
  },
  if: {
    overloads: [
      sig(["bool", "any", "any"], (types) => sameType(types[1]!, types[2]!)),
    ],
    summary: "if(condition, a, b), equivalent to condition ? a : b.",
  },
  abs: componentwise("Absolute value."),
  floor: componentwise("Round down."),
  ceil: componentwise("Round up."),
  round: componentwise("Round half away from zero."),
  sign: componentwise("−1, 0 or 1."),
  sqrt: componentwise("Square root."),
  exp: componentwise("e to the power x."),
  log: componentwise("Natural logarithm."),
  sin: componentwise("Sine of radians."),
  cos: componentwise("Cosine of radians."),
  tan: componentwise("Tangent of radians."),
  degrees: componentwise("Radians to degrees."),
  radians: componentwise("Degrees to radians."),
  min: {
    overloads: [sig(["T", "Tb"], "T")],
    summary: "Component-wise minimum.",
  },
  max: {
    overloads: [sig(["T", "Tb"], "T")],
    summary: "Component-wise maximum.",
  },
  pow: {
    overloads: [sig(["T", "scalar"], "T")],
    summary: "Component-wise power.",
  },
  atan2: {
    overloads: [sig(["scalar", "scalar"], "scalar")],
    summary: "atan2(y, x) in radians.",
  },
  rgba: {
    overloads: [sig(["scalar", "scalar", "scalar", "scalar"], "color")],
    summary: "A colour from 0–1 channels.",
  },
  signal: {
    overloads: [sig(["signal"], "scalar")],
    summary: "A composition signal sampled at the root time.",
  },
  spring: {
    overloads: [
      sig(["path", "scalar", "scalar"], "path"),
      sig(["path", "scalar", "scalar", "scalar"], "path"),
    ],
    summary:
      "Damped spring response to a property: spring(path, frequency Hz, damping ratio, delay s = 0).",
  },
  inertia: {
    overloads: [sig(["scalar", "scalar", "scalar"], "value")],
    summary:
      "Offset that overshoots after each keyed stop: inertia(amplitude, frequency Hz, decay).",
  },
  anticipate: {
    overloads: [sig(["scalar", "scalar"], "value")],
    summary:
      "Offset pulling back before each keyed move: anticipate(amount, duration s).",
  },
  rove: {
    overloads: [sig([], "value")],
    summary:
      "This property's keyed path traversed at constant speed between its first and last keys.",
  },
  heading: {
    overloads: [sig(["path"], "scalar")],
    summary: "Clockwise direction of travel in degrees of a 2D position path.",
  },
  squash: {
    overloads: [
      sig(["vec2", "scalar", "scalar"], "vec2"),
      sig(["vec2", "scalar", "scalar", "bool"], "vec2"),
    ],
    summary:
      "Area-preserving scale factors from a velocity: squash(velocity, amount, limit, aligned = false).",
  },
};

export const isExpressionFunction = (name: string) =>
  Object.hasOwn(EXPRESSION_BUILTINS, name);

const NUMERIC = new Set<ExpressionType>(["scalar", "vec2", "vec3", "color"]);
const COMPONENTS: Record<string, ExpressionType[]> = {
  x: ["vec2", "vec3"],
  y: ["vec2", "vec3"],
  z: ["vec3"],
  r: ["color"],
  g: ["color"],
  b: ["color"],
  a: ["color"],
};

function sameType(
  a: ExpressionType,
  b: ExpressionType,
): ExpressionType | string {
  return a === b ? a : `branches have different types (${a} and ${b})`;
}

/** Type of `a op b` for component-wise arithmetic with scalar broadcast. */
function arithmetic(
  a: ExpressionType,
  b: ExpressionType,
): ExpressionType | undefined {
  if (!NUMERIC.has(a) || !NUMERIC.has(b)) return undefined;
  if (a === b || b === "scalar") return a;
  if (a === "scalar") return b;
  return undefined;
}

class CheckFailure {
  readonly error: { code: string; message: string; column: number };
  constructor(error: { code: string; message: string; column: number }) {
    this.error = error;
  }
}

/** Type-check a parsed expression and collect the property paths it reads. */
export function checkExpression(
  parsed: ParsedExpression,
  env: ExpressionCheckEnv,
): ExpressionCheck {
  const reads: ExpressionRead[] = [];
  const signals: string[] = [];
  const columnOf = (node: ExpressionAst) => parsed.columns.get(node) ?? 1;
  const fail = (code: string, node: ExpressionAst, message: string): never => {
    throw new CheckFailure({ code, message, column: columnOf(node) });
  };
  const typeError = (node: ExpressionAst, message: string): never =>
    fail("comp-expression-type", node, message);

  const literalString = (node: ExpressionAst, what: string) =>
    "str" in node
      ? node.str
      : typeError(node, `${what} must be a string literal`);

  const visit = (node: ExpressionAst): ExpressionType => {
    if ("num" in node) return "scalar";
    if ("bool" in node) return "bool";
    if ("str" in node)
      return typeError(
        node,
        "strings are only allowed as property paths, signal ids and loop modes",
      );
    if ("color" in node) return "color";
    if ("id" in node) return node.id === "value" ? env.target : "scalar";
    if ("vec" in node) {
      if (node.vec.length !== 2 && node.vec.length !== 3)
        typeError(node, "vectors have two or three components");
      for (const item of node.vec)
        if (visit(item) !== "scalar")
          typeError(item, "vector components must be numbers");
      return node.vec.length === 2 ? "vec2" : "vec3";
    }
    if ("member" in node) {
      const of = visit(node.of);
      if (!COMPONENTS[node.member]!.includes(of))
        typeError(node, `.${node.member} is not a component of ${of}`);
      return "scalar";
    }
    if ("call" in node) return call(node);
    const [a, b, c] = node.args;
    switch (node.op) {
      case "neg": {
        const type = visit(a!);
        if (!NUMERIC.has(type)) typeError(node, `cannot negate ${type}`);
        return type;
      }
      case "!":
        if (visit(a!) !== "bool") typeError(node, "! needs a boolean");
        return "bool";
      case "?:": {
        if (visit(a!) !== "bool") typeError(a!, "a condition must be boolean");
        const result = sameType(visit(b!), visit(c!));
        return result.includes(" ")
          ? typeError(node, result)
          : (result as ExpressionType);
      }
      case "&&":
      case "||":
        if (visit(a!) !== "bool" || visit(b!) !== "bool")
          typeError(node, `${node.op} needs booleans`);
        return "bool";
      case "<":
      case "<=":
      case ">":
      case ">=":
        if (visit(a!) !== "scalar" || visit(b!) !== "scalar")
          typeError(node, `${node.op} compares numbers`);
        return "bool";
      case "==":
      case "!=": {
        const left = visit(a!),
          right = visit(b!);
        if (left !== right || (left !== "scalar" && left !== "bool"))
          typeError(node, `${node.op} compares two numbers or two booleans`);
        return "bool";
      }
      default: {
        const left = visit(a!),
          right = visit(b!);
        return (
          arithmetic(left, right) ??
          typeError(node, `cannot apply ${node.op} to ${left} and ${right}`)
        );
      }
    }
  };

  const readType = (node: ExpressionAst) => {
    const path = literalString(node, "a property path");
    const resolved = env.resolve(path);
    if ("code" in resolved) return fail(resolved.code, node, resolved.message);
    if (resolved.type === "path")
      typeError(node, `"${path}" is a bezier path; expressions cannot read it`);
    reads.push({ path, column: columnOf(node) });
    return resolved.type === "discrete"
      ? "scalar"
      : (resolved.type as ExpressionType);
  };

  const call = (node: Extract<ExpressionAst, { call: string }>) => {
    const builtIn = EXPRESSION_BUILTINS[node.call]!;
    const signature = builtIn.overloads.find(
      (overload) => overload.params.length === node.args.length,
    );
    if (!signature)
      typeError(
        node,
        `${node.call}() takes ${[...new Set(builtIn.overloads.map((o) => o.params.length))].join(" or ")} argument(s)`,
      );
    const types: ExpressionType[] = [];
    let generic: ExpressionType | undefined;
    let pathType: ExpressionType | undefined;
    signature!.params.forEach((param, i) => {
      const arg = node.args[i]!;
      if (param === "path") {
        const type = readType(arg);
        pathType ??= type;
        types.push(type);
        return;
      }
      if (param === "signal") {
        const id = literalString(arg, "a signal id");
        if (!env.hasSignal(id))
          fail("comp-signal-missing", arg, `no signal "${id}"`);
        signals.push(id);
        types.push("string");
        return;
      }
      if (param === "loop-mode") {
        const mode = literalString(arg, "a loop mode");
        if (!(LOOP_MODES as readonly string[]).includes(mode))
          typeError(arg, `loop mode must be one of ${LOOP_MODES.join(", ")}`);
        types.push("string");
        return;
      }
      if (typeof param === "object") {
        const [min, max] = param.literal;
        if (!("num" in arg) || !Number.isInteger(arg.num))
          typeError(arg, `${node.call}() needs an integer literal here`);
        else if (arg.num < min || arg.num > max)
          fail(
            "comp-expression-limit",
            arg,
            `${node.call}() accepts ${min}–${max} here`,
          );
        types.push("scalar");
        return;
      }
      const type = visit(arg);
      types.push(type);
      const expect = (ok: boolean, what: string) => {
        if (!ok) typeError(arg, `${node.call}() needs ${what}, not ${type}`);
      };
      switch (param) {
        case "scalar":
          return expect(type === "scalar", "a number");
        case "bool":
          return expect(type === "bool", "a boolean");
        case "vec2":
          return expect(type === "vec2", "a 2D vector");
        case "vector":
          return expect(type === "vec2" || type === "vec3", "a vector");
        case "any":
          return expect(type !== "string", "a value");
        case "T":
          expect(NUMERIC.has(type), "a number, vector or colour");
          if (generic && generic !== type)
            typeError(
              arg,
              `${node.call}() needs matching types (${generic} and ${type})`,
            );
          generic = type;
          return;
        case "Tb":
          expect(NUMERIC.has(type), "a number, vector or colour");
          return;
      }
    });
    // Broadcast arguments must be scalar or match the generic type.
    signature!.params.forEach((param, i) => {
      if (param === "Tb" && types[i] !== "scalar" && types[i] !== generic)
        typeError(
          node.args[i]!,
          `${node.call}() needs a number or ${generic}, not ${types[i]}`,
        );
    });
    const result = signature!.result;
    if (typeof result === "function") {
      const type = result(types);
      return (type as string).includes(" ")
        ? typeError(node, type)
        : (type as ExpressionType);
    }
    if (result === "T") return generic!;
    if (result === "path") {
      if (node.call === "spring" && !NUMERIC.has(pathType!))
        typeError(node, "spring() needs a numeric property");
      if (node.call === "velocityAtTime" && pathType === "bool")
        typeError(node, "velocity needs a numeric property");
      return pathType!;
    }
    if (result === "value") {
      if (node.call === "rove" && env.target !== "vec2")
        typeError(node, "rove() applies to 2D position-like properties");
      return env.target;
    }
    if (result === "arg0") return types[0]!;
    if (node.call === "heading" && pathType !== "vec2")
      typeError(node.args[0]!, "heading() needs a 2D vector property");
    return result;
  };

  try {
    const type = visit(parsed.ast);
    if (type !== env.target)
      typeError(
        parsed.ast,
        `expression returns ${type}, but the property is ${env.target}`,
      );
    return { type, reads, signals };
  } catch (error) {
    if (error instanceof CheckFailure) return { error: error.error };
    return {
      error: {
        code: "comp-expression-limit",
        message: "expression is too complex to check",
        column: 1,
      },
    };
  }
}
