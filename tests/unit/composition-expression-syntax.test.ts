import { describe, expect, it } from "vitest";
import {
  EXPRESSION_BUILTINS,
  EXPRESSION_LIMITS,
  checkExpression,
  expressionNodeCount,
  isExpressionFunction,
  parseExpression,
  printExpression,
  type ExpressionAst,
  type ExpressionCheckEnv,
} from "@still-shift/scene-contract";

const parse = (source: string) => parseExpression(source, isExpressionFunction);
const ast = (source: string) => {
  const parsed = parse(source);
  if ("error" in parsed) throw new Error(JSON.stringify(parsed.error));
  return parsed.ast;
};
const error = (source: string) => {
  const parsed = parse(source);
  if (!("error" in parsed)) throw new Error(`parsed: ${source}`);
  return parsed.error;
};

/** Deterministic xorshift for fuzzing; seeds are fixed so failures reproduce. */
function rng(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

describe("expression parser", () => {
  it("parses the plan's examples into the documented AST", () => {
    expect(ast("wiggle(2, 6, 7)")).toEqual({
      call: "wiggle",
      args: [{ num: 2 }, { num: 6 }, { num: 7 }],
    });
    expect(ast("ref('hero.transform.position') + [12, 18]")).toEqual({
      op: "+",
      args: [
        { call: "ref", args: [{ str: "hero.transform.position" }] },
        { vec: [{ num: 12 }, { num: 18 }] },
      ],
    });
    expect(
      ast("linear(ref('slider.transform.position.x'), 0, 100, 0, 1)"),
    ).toMatchObject({ call: "linear" });
  });

  it("follows precedence and associativity", () => {
    expect(ast("1 - 2 - 3")).toEqual({
      op: "-",
      args: [{ op: "-", args: [{ num: 1 }, { num: 2 }] }, { num: 3 }],
    });
    expect(ast("1 + 2 * 3")).toEqual({
      op: "+",
      args: [{ num: 1 }, { op: "*", args: [{ num: 2 }, { num: 3 }] }],
    });
    expect(ast("a ? b : c ? d : e".replace(/[a-e]/g, "true"))).toMatchObject({
      op: "?:",
      args: [{ bool: true }, { bool: true }, { op: "?:" }],
    });
    expect(ast("-value.x")).toEqual({
      op: "neg",
      args: [{ member: "x", of: { id: "value" } }],
    });
    expect(ast("!true || false && true")).toEqual({
      op: "||",
      args: [
        { op: "!", args: [{ bool: true }] },
        { op: "&&", args: [{ bool: false }, { bool: true }] },
      ],
    });
  });

  it("reads literals: numbers, colours, strings with escapes", () => {
    expect(ast("1.5e3")).toEqual({ num: 1500 });
    expect(ast(".25")).toEqual({ num: 0.25 });
    expect(ast("#ff00aa")).toEqual({ color: "#FF00AA" });
    expect(ast("#ff00aa80")).toEqual({ color: "#FF00AA80" });
    expect(ast("ref('a\\'b\\\\c')")).toEqual({
      call: "ref",
      args: [{ str: "a'b\\c" }],
    });
  });

  it.each([
    ["wiggle(2, 6", "comp-expression-syntax", 12],
    ["1 +", "comp-expression-syntax", 4],
    ["value..x", "comp-expression-syntax", 7],
    ["value.w", "comp-expression-syntax", 7],
    ["foo(1)", "comp-expression-unknown-function", 1],
    ["1 + bar", "comp-expression-syntax", 5],
    ["Math.random()", "comp-expression-syntax", 1],
    ["value = 1", "comp-expression-syntax", 7],
    ["#12345", "comp-expression-syntax", 1],
    ["'open", "comp-expression-syntax", 1],
    ["'\\n'", "comp-expression-syntax", 2],
    ["2x", "comp-expression-syntax", 2],
    ["1e999", "comp-expression-syntax", 1],
    ["wiggle", "comp-expression-syntax", 1],
    ["value; time", "comp-expression-syntax", 6],
    ["this.x", "comp-expression-syntax", 1],
  ])("reports %s as %s at column %i", (source, code, column) => {
    expect(error(source)).toMatchObject({ code, column });
  });

  it("enforces the length, node and nesting limits", () => {
    const long = `1${" + 1".repeat(600)}`;
    expect(error(long)).toMatchObject({
      code: "comp-expression-limit",
      column: EXPRESSION_LIMITS.maxLength + 1,
    });
    const nodes = Array.from({ length: 251 }, () => "1").join("+");
    const result = error(nodes);
    expect(result.code).toBe("comp-expression-limit");
    expect(result.message).toContain("500 AST nodes");
    expect(
      expressionNodeCount(
        ast(Array.from({ length: 250 }, () => "1").join("+")),
      ),
    ).toBe(499);
    const deep = (n: number) => `${"(".repeat(n)}1${")".repeat(n)}`;
    expect("ast" in parse(deep(EXPRESSION_LIMITS.maxNesting))).toBe(true);
    expect(error(deep(EXPRESSION_LIMITS.maxNesting + 1))).toMatchObject({
      code: "comp-expression-limit",
      column: EXPRESSION_LIMITS.maxNesting + 1,
    });
    expect(error("-".repeat(200) + "1").code).toBe("comp-expression-limit");
  });
});

describe("expression printer", () => {
  it("prints canonical text that parses back to the same AST", () => {
    for (const source of [
      "ref('hero.transform.position') + [12, 18]",
      "-(1 - 2) * 3 + [1, 2].x > 2 && !true ? #FF00AA : rgba(1, 0, 0, 1)",
      "1 - (2 - 3)",
      "(1 + 2) * 3",
      "- -value",
      "(true ? 1 : 2) + 3",
      "true ? false ? 1 : 2 : 3",
      "(-2).x",
      "valueAtTime('a\\'b', time - 1 / fps)",
      "1e-7 + 1e+21 + 0.1",
    ]) {
      const tree = ast(source);
      expect(ast(printExpression(tree))).toEqual(tree);
    }
    expect(printExpression(ast("1-(2-3)"))).toBe("1 - (2 - 3)");
    expect(printExpression(ast("( 1+2 )*3"))).toBe("(1 + 2) * 3");
  });

  it("round-trips randomly generated ASTs (fixed seed)", () => {
    const random = rng(0xce9);
    const pick = <T>(items: readonly T[]) =>
      items[Math.floor(random() * items.length)]!;
    const operators = [
      "+",
      "-",
      "*",
      "/",
      "%",
      "<",
      "<=",
      ">",
      ">=",
      "==",
      "!=",
      "&&",
      "||",
    ] as const;
    const generate = (depth: number): ExpressionAst => {
      const leaf = depth > 4 || random() < 0.3;
      if (leaf)
        return pick<ExpressionAst>([
          { num: Math.floor(random() * 1000) / 8 },
          { num: random() * 1e-6 },
          { bool: random() < 0.5 },
          {
            id: pick(["time", "frame", "value", "index", "layerCount", "fps"]),
          },
          { color: "#A0B1C2" },
          { str: "it's" },
        ]);
      switch (Math.floor(random() * 6)) {
        case 0:
          return {
            op: pick(operators),
            args: [generate(depth + 1), generate(depth + 1)],
          };
        case 1:
          return {
            op: pick(["neg", "!"] as const),
            args: [generate(depth + 1)],
          };
        case 2:
          return {
            op: "?:",
            args: [
              generate(depth + 1),
              generate(depth + 1),
              generate(depth + 1),
            ],
          };
        case 3:
          return {
            member: pick(["x", "y", "r"] as const),
            of: generate(depth + 1),
          };
        case 4:
          return { vec: [generate(depth + 1), generate(depth + 1)] };
        default:
          return {
            call: pick(Object.keys(EXPRESSION_BUILTINS)),
            args: [generate(depth + 1)],
          };
      }
    };
    for (let i = 0; i < 2_000; i++) {
      const tree = generate(0);
      const printed = printExpression(tree);
      const reparsed = parse(printed);
      expect(reparsed, printed).toHaveProperty("ast");
      expect((reparsed as { ast: unknown }).ast).toEqual(tree);
    }
  });

  it("never throws on arbitrary input (fixed-seed fuzz)", () => {
    const random = rng(20261003);
    const tokens = [
      "1",
      "2.5",
      ".",
      "x",
      "value",
      "time",
      "(",
      ")",
      "[",
      "]",
      ",",
      "+",
      "-",
      "*",
      "/",
      "%",
      "?",
      ":",
      "!",
      "&&",
      "||",
      "==",
      "<",
      "'a.b'",
      "'",
      "#ff0000",
      "#",
      "wiggle",
      "ref",
      "e",
      " ",
      "\\",
      "é",
      "\u0000",
      "1e",
    ];
    let parsed = 0;
    for (let i = 0; i < 5_000; i++) {
      const length = Math.floor(random() * 30);
      let source = "";
      for (let j = 0; j < length; j++)
        source +=
          random() < 0.1
            ? String.fromCharCode(Math.floor(random() * 0x2ff))
            : tokens[Math.floor(random() * tokens.length)];
      const result = parse(source);
      if ("ast" in result) {
        parsed++;
        expect(ast(printExpression(result.ast))).toEqual(result.ast);
      } else {
        expect(result.error.column).toBeGreaterThanOrEqual(1);
        expect(result.error.column).toBeLessThanOrEqual(source.length + 1);
        expect(result.error.code).toMatch(/^comp-expression-/);
      }
    }
    expect(parsed).toBeGreaterThan(20);
  });
});

describe("expression type checker", () => {
  const env = (
    target: ExpressionCheckEnv["target"] = "scalar",
  ): ExpressionCheckEnv => ({
    target,
    resolve: (path) =>
      path === "a.pos"
        ? { type: "vec2" }
        : path === "a.rot"
          ? { type: "scalar" }
          : path === "a.col"
            ? { type: "color" }
            : path === "a.state"
              ? { type: "discrete" }
              : path === "a.mask"
                ? { type: "path" }
                : { code: "comp-path-layer", message: `no layer for ${path}` },
    hasSignal: (id) => id === "beat",
  });
  const check = (
    source: string,
    target: ExpressionCheckEnv["target"] = "scalar",
  ) => {
    const parsed = parse(source);
    if ("error" in parsed) throw new Error(JSON.stringify(parsed.error));
    return checkExpression(parsed, env(target));
  };

  it.each([
    ["value + 1", "scalar"],
    ["ref('a.pos') + [12, 18]", "vec2"],
    ["ref('a.pos') * 2 - value / 3", "vec2"],
    ["ref('a.pos').x + ref('a.state')", "scalar"],
    ["mix(#ff0000, ref('a.col'), 0.5)", "color"],
    ["rgba(1, 0.5, 0, 1).g", "scalar"],
    ["clamp(value, 0, [10, 20])", "vec2"],
    ["linear(time, 0, 1, [0, 0], [100, 50])", "vec2"],
    ["ease(time, 0, 10)", "scalar"],
    ["wiggle(2, 6, 7, 3)", "vec2"],
    ["loopOut('pingpong', 2)", "scalar"],
    ["loopIn()", "color"],
    ["smooth(0.5, 9)", "vec2"],
    ["lookAt([0, 0], ref('a.pos'))", "scalar"],
    ["length(ref('a.pos'), [0, 0]) + length([3, 4, 12])", "scalar"],
    ["length([0, 0, 0], [0, 0, 10])", "scalar"],
    ["normalize(value) * 10", "vec2"],
    ["if(time > 1, 1, 2) + step(1, time)", "scalar"],
    ["frame >= 10 && frame < 20 ? 1 : 0", "scalar"],
    ["signal('beat') * 2", "scalar"],
    ["spring('a.pos', 2, 0.5, 0.1)", "vec2"],
    ["value + inertia(0.05, 2, 5) + anticipate(4, 0.2)", "vec2"],
    ["rove()", "vec2"],
    ["heading('a.pos')", "scalar"],
    ["value * squash(velocityAtTime('a.pos', time), 0.001, 1.5, true)", "vec2"],
    ["valueAtTime(time - 0.1) + velocityAtTime(time)", "scalar"],
    ["min(max(value, 0), 1) + pow(value, 2) + atan2(1, 2)", "scalar"],
    ["noise(1, time) + random(3, index) + layerCount", "scalar"],
  ] as const)("accepts %s", (source, target) => {
    expect(check(source, target)).not.toHaveProperty("error");
  });

  it.each([
    ["ref('a.pos')", "scalar", 1, "returns vec2"],
    ["[1, 2] + #ff0000", "vec2", 8, "cannot apply +"],
    ["[1, 2, 3] + [1, 2]", "vec2", 11, "cannot apply +"],
    ["true + 1", "scalar", 6, "cannot apply"],
    ["1 ? 2 : 3", "scalar", 1, "condition must be boolean"],
    ["true ? 1 : [1, 2]", "scalar", 6, "different types"],
    ["value.z", "vec2", 6, ".z is not a component of vec2"],
    ["value.x", "color", 6, ".x is not a component of color"],
    ["[1, 2] < 3", "scalar", 8, "compares numbers"],
    ["[1, 2] == [1, 2]", "scalar", 8, "compares two numbers"],
    ["'text'", "scalar", 1, "strings are only allowed"],
    ["ref(1)", "scalar", 5, "must be a string literal"],
    ["wiggle(1)", "scalar", 1, "takes 2 or 3 or 4"],
    ["mix([1, 2], #ff0000, 0.5)", "vec2", 13, "matching types"],
    ["clamp(value, [1, 2], 3)", "scalar", 14, "a number or scalar"],
    ["loopOut('bounce')", "scalar", 9, "loop mode"],
    ["heading('a.rot')", "scalar", 9, "2D vector"],
    ["rove()", "scalar", 1, "2D position"],
    ["[1, 2, 3, 4]", "vec2", 1, "two or three"],
    ["[true, 1]", "vec2", 2, "must be numbers"],
    ["normalize(1)", "scalar", 11, "needs a vector"],
    ["length([0, 0], [0, 0, 10])", "scalar", 1, "matching vector dimensions"],
    ["length([0, 0, 10], [0, 0])", "scalar", 1, "matching vector dimensions"],
    ["lookAt(1, [0, 0])", "scalar", 8, "2D vector"],
    ["if(1, 2, 3)", "scalar", 4, "a boolean"],
  ] as const)("rejects %s with a column", (source, target, column, message) => {
    const result = check(source, target);
    expect(result).toHaveProperty("error");
    const failure = (result as { error: { column: number; message: string } })
      .error;
    expect(failure).toMatchObject({ code: "comp-expression-type", column });
    expect(failure.message).toContain(message);
  });

  it("reports unresolved paths, missing signals and literal bounds", () => {
    expect(check("ref('b.pos')")).toMatchObject({
      error: { code: "comp-path-layer", column: 5 },
    });
    expect(check("ref('a.mask')")).toMatchObject({
      error: { code: "comp-expression-type" },
    });
    expect(check("signal('nope')")).toMatchObject({
      error: { code: "comp-signal-missing", column: 8 },
    });
    expect(check("smooth(1, 65)")).toMatchObject({
      error: { code: "comp-expression-limit", column: 11 },
    });
    expect(check("smooth(1, time)")).toMatchObject({
      error: { code: "comp-expression-type" },
    });
    expect(check("wiggle(1, 2, 3, 9)")).toMatchObject({
      error: { code: "comp-expression-limit" },
    });
  });

  it("collects every property read with its column", () => {
    const result = check(
      "ref('a.rot') + valueAtTime('a.pos', 1).x + spring('a.rot', 1, 1)",
    );
    expect(result).toMatchObject({
      reads: [
        { path: "a.rot", column: 5 },
        { path: "a.pos", column: 28 },
        { path: "a.rot", column: 51 },
      ],
    });
  });

  it("documents a summary for every built-in", () => {
    for (const [name, builtIn] of Object.entries(EXPRESSION_BUILTINS)) {
      expect(builtIn.summary.length, name).toBeGreaterThan(5);
      expect(builtIn.overloads.length, name).toBeGreaterThan(0);
    }
  });
});
