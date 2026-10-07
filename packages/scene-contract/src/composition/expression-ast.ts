/**
 * CE9 expressions: a small text syntax that parses into a serialisable AST. The AST is
 * what the engine validates, evaluates, caches by and emits in normalised output; the
 * source text is kept for display and editing. No JavaScript is evaluated.
 */
import { COMPOSITION_LIMITS } from "./primitives.ts";

export const EXPRESSION_IDENTIFIERS = [
  "time",
  "frame",
  "value",
  "index",
  "layerCount",
  "fps",
] as const;
export type ExpressionIdentifier = (typeof EXPRESSION_IDENTIFIERS)[number];

export const EXPRESSION_COMPONENTS = [
  "x",
  "y",
  "z",
  "r",
  "g",
  "b",
  "a",
] as const;
export type ExpressionComponent = (typeof EXPRESSION_COMPONENTS)[number];

export const EXPRESSION_BINARY_OPERATORS = [
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
/** Grammar summary shared with generated authoring references. */
export const EXPRESSION_GRAMMAR = `expression  ::= conditional
conditional ::= logicalOr ["?" expression ":" expression]
logicalOr   ::= logicalAnd {"||" logicalAnd}
logicalAnd  ::= equality {"&&" equality}
equality    ::= comparison {("==" | "!=") comparison}
comparison  ::= sum {("<" | "<=" | ">" | ">=") sum}
sum         ::= product {("+" | "-") product}
product     ::= unary {("*" | "/" | "%") unary}
unary       ::= ("-" | "!") unary | postfix
postfix     ::= primary {"." component}
primary     ::= number | boolean | colour | pathString | identifier
              | "[" expression "," expression ["," expression] "]"
              | builtIn "(" [expression {"," expression}] ")"
              | "(" expression ")"`;

export type ExpressionBinaryOperator =
  (typeof EXPRESSION_BINARY_OPERATORS)[number];
export type ExpressionOperator = ExpressionBinaryOperator | "neg" | "!" | "?:";

/** Canonical AST. Number literals are finite and never negative (`-2` is `neg 2`). */
export type ExpressionAst =
  | { num: number }
  | { bool: boolean }
  | { str: string }
  | { color: string }
  | { vec: ExpressionAst[] }
  | { id: ExpressionIdentifier }
  | { call: string; args: ExpressionAst[] }
  | { op: ExpressionOperator; args: ExpressionAst[] }
  | { member: ExpressionComponent; of: ExpressionAst };

const MAX_AST_NODES = 500;
export const EXPRESSION_LIMITS = {
  maxLength: COMPOSITION_LIMITS.maxExpressionLength,
  maxNodes: MAX_AST_NODES,
  /** Node objects and intervening args/vec arrays, for serialised AST input. */
  maxJsonDepth: 2 * (MAX_AST_NODES - 1),
  /** Nested parentheses, brackets, calls and unary operators. */
  maxNesting: 64,
} as const;

export type ExpressionError = {
  code:
    | "comp-expression-syntax"
    | "comp-expression-unknown-function"
    | "comp-expression-type"
    | "comp-expression-limit";
  message: string;
  /** 1-based character column in the source text. */
  column: number;
};

const PRECEDENCE: Record<ExpressionBinaryOperator, number> = {
  "||": 2,
  "&&": 3,
  "==": 4,
  "!=": 4,
  "<": 5,
  "<=": 5,
  ">": 5,
  ">=": 5,
  "+": 6,
  "-": 6,
  "*": 7,
  "/": 7,
  "%": 7,
};
const UNARY = 8;
const POSTFIX = 9;

export function expressionNodeCount(ast: ExpressionAst): number {
  let count = 0;
  const stack: ExpressionAst[] = [ast];
  while (stack.length) {
    const node = stack.pop()!;
    count++;
    if ("vec" in node) stack.push(...node.vec);
    else if ("args" in node) stack.push(...node.args);
    else if ("member" in node) stack.push(node.of);
  }
  return count;
}

/** Print canonical source text. `parseExpression(printExpression(ast))` returns `ast`. */
export function printExpression(ast: ExpressionAst, minimum = 1): string {
  const readable = printNode(ast, minimum, false);
  return readable.length <= EXPRESSION_LIMITS.maxLength
    ? readable
    : printNode(ast, minimum, true);
}

/** Keep numeric spelling as short as accepted decimal or exponent literals. */
function compactNumber(value: number): string {
  const decimal = String(value).replace(/^0\./, ".").replace("e+", "e");
  const exponential = value.toExponential().replace("e+", "e");
  return exponential.length < decimal.length ? exponential : decimal;
}

function printNode(
  ast: ExpressionAst,
  minimum: number,
  compact: boolean,
): string {
  const print = (node: ExpressionAst, precedence = 1) =>
    printNode(node, precedence, compact);
  const wrap = (text: string, precedence: number) =>
    precedence < minimum ? `(${text})` : text;
  if ("num" in ast) {
    const negative = ast.num < 0 || Object.is(ast.num, -0);
    const absolute = negative ? -ast.num : ast.num;
    const text = compact ? compactNumber(absolute) : String(absolute);
    return negative ? wrap(`-${text}`, UNARY) : text;
  }
  if ("bool" in ast) return String(ast.bool);
  if ("str" in ast)
    return `'${ast.str.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
  if ("color" in ast) return ast.color;
  if ("vec" in ast)
    return `[${ast.vec.map((item) => print(item)).join(compact ? "," : ", ")}]`;
  if ("id" in ast) return ast.id;
  if ("call" in ast)
    return `${ast.call}(${ast.args.map((arg) => print(arg)).join(compact ? "," : ", ")})`;
  if ("member" in ast) return `${print(ast.of, POSTFIX)}.${ast.member}`;
  const [a, b, c] = ast.args;
  if (ast.op === "neg" || ast.op === "!")
    return wrap(`${ast.op === "neg" ? "-" : "!"}${print(a!, UNARY)}`, UNARY);
  if (ast.op === "?:")
    return wrap(
      `${print(a!, 2)}${compact ? "?" : " ? "}${print(b!)}${compact ? ":" : " : "}${print(c!)}`,
      1,
    );
  const precedence = PRECEDENCE[ast.op];
  return wrap(
    `${print(a!, precedence)}${compact ? ast.op : ` ${ast.op} `}${print(b!, precedence + 1)}`,
    precedence,
  );
}

type Token =
  | { kind: "num"; value: number; column: number; text: string }
  | { kind: "str"; value: string; column: number }
  | { kind: "color"; value: string; column: number }
  | { kind: "ident"; value: string; column: number }
  | { kind: "punct"; value: string; column: number }
  | { kind: "end"; column: number };

class ExpressionParseFailure {
  readonly error: ExpressionError;
  constructor(error: ExpressionError) {
    this.error = error;
  }
}
function fail(
  code: ExpressionError["code"],
  column: number,
  message: string,
): never {
  throw new ExpressionParseFailure({ code, column, message });
}

const PUNCTUATION = [
  "<=",
  ">=",
  "==",
  "!=",
  "&&",
  "||",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "!",
  "?",
  ":",
  "(",
  ")",
  "[",
  "]",
  ",",
  ".",
];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    const column = i + 1;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    const number = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(
      source.slice(i, i + 400),
    );
    if (number) {
      const value = Number(number[0]);
      if (!Number.isFinite(value))
        fail(
          "comp-expression-syntax",
          column,
          `number ${number[0]} is out of range`,
        );
      tokens.push({ kind: "num", value, column, text: number[0] });
      i += number[0].length;
      if (/[A-Za-z_]/.test(source[i] ?? ""))
        fail(
          "comp-expression-syntax",
          i + 1,
          "identifiers cannot start immediately after a number",
        );
      continue;
    }
    if (ch === "'") {
      let value = "";
      let j = i + 1;
      for (;;) {
        const next = source[j];
        if (next === undefined)
          fail("comp-expression-syntax", column, "unterminated string");
        if (next === "'") break;
        if (next === "\\") {
          const escaped = source[j + 1];
          if (escaped !== "\\" && escaped !== "'")
            fail(
              "comp-expression-syntax",
              j + 1,
              "only \\\\ and \\' escapes are allowed in strings",
            );
          value += escaped;
          j += 2;
        } else {
          value += next;
          j++;
        }
      }
      tokens.push({ kind: "str", value, column });
      i = j + 1;
      continue;
    }
    if (ch === "#") {
      const color = /^#[\da-fA-F]+/.exec(source.slice(i, i + 12));
      if (!color || (color[0].length !== 7 && color[0].length !== 9))
        fail(
          "comp-expression-syntax",
          column,
          "colours are written #RRGGBB or #RRGGBBAA",
        );
      tokens.push({ kind: "color", value: color![0].toUpperCase(), column });
      i += color![0].length;
      continue;
    }
    const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i, i + 200));
    if (ident) {
      tokens.push({ kind: "ident", value: ident[0], column });
      i += ident[0].length;
      continue;
    }
    const punct = PUNCTUATION.find((p) => source.startsWith(p, i));
    if (!punct)
      fail("comp-expression-syntax", column, `unexpected character "${ch}"`);
    tokens.push({ kind: "punct", value: punct!, column });
    i += punct!.length;
  }
  tokens.push({ kind: "end", column: source.length + 1 });
  return tokens;
}

export type ParsedExpression = {
  ast: ExpressionAst;
  /** 1-based source column of each node, for type diagnostics. */
  columns: WeakMap<ExpressionAst, number>;
};

/**
 * Parse expression text. Never throws: invalid input returns a diagnostic with a
 * 1-based column. `isFunction` decides which call names are registered built-ins.
 */
export function parseExpression(
  source: string,
  isFunction: (name: string) => boolean,
): ParsedExpression | { error: ExpressionError } {
  if (source.length > EXPRESSION_LIMITS.maxLength)
    return {
      error: {
        code: "comp-expression-limit",
        column: EXPRESSION_LIMITS.maxLength + 1,
        message: `expressions are limited to ${EXPRESSION_LIMITS.maxLength} characters`,
      },
    };
  const columns = new WeakMap<ExpressionAst, number>();
  try {
    const tokens = tokenize(source);
    let position = 0;
    let depth = 0;
    let nodes = 0;
    const peek = () => tokens[position]!;
    const isPunct = (value: string) => {
      const token = peek();
      return token.kind === "punct" && token.value === value;
    };
    const describe = (token: Token) =>
      token.kind === "end"
        ? "end of expression"
        : token.kind === "str"
          ? "string"
          : `"${token.kind === "num" ? token.text : String(token.value)}"`;
    const expect = (value: string) => {
      if (!isPunct(value))
        fail(
          "comp-expression-syntax",
          peek().column,
          `expected "${value}" but found ${describe(peek())}`,
        );
      position++;
    };
    const node = <T extends ExpressionAst>(value: T, column: number): T => {
      if (++nodes > EXPRESSION_LIMITS.maxNodes)
        fail(
          "comp-expression-limit",
          column,
          `expressions are limited to ${EXPRESSION_LIMITS.maxNodes} AST nodes`,
        );
      columns.set(value, column);
      return value;
    };
    const nest = (column: number) => {
      if (++depth > EXPRESSION_LIMITS.maxNesting)
        fail(
          "comp-expression-limit",
          column,
          `expressions may nest at most ${EXPRESSION_LIMITS.maxNesting} levels`,
        );
    };

    const expression = (): ExpressionAst => {
      const condition = binary(2);
      if (!isPunct("?")) return condition;
      const column = peek().column;
      nest(column);
      position++;
      const then = expression();
      expect(":");
      const otherwise = expression();
      depth--;
      return node({ op: "?:", args: [condition, then, otherwise] }, column);
    };
    const binary = (precedence: number): ExpressionAst => {
      if (precedence > 7) return unary();
      let left = binary(precedence + 1);
      for (;;) {
        const token = peek();
        if (
          token.kind !== "punct" ||
          PRECEDENCE[token.value as ExpressionBinaryOperator] !== precedence
        )
          return left;
        position++;
        const right = binary(precedence + 1);
        left = node(
          {
            op: token.value as ExpressionBinaryOperator,
            args: [left, right],
          },
          token.column,
        );
      }
    };
    const unary = (): ExpressionAst => {
      const token = peek();
      if (
        token.kind === "punct" &&
        (token.value === "-" || token.value === "!")
      ) {
        nest(token.column);
        position++;
        const operand = unary();
        depth--;
        return node(
          { op: token.value === "-" ? "neg" : "!", args: [operand] },
          token.column,
        );
      }
      let value = primary();
      while (isPunct(".")) {
        const dot = peek();
        position++;
        const name = peek();
        if (
          name.kind !== "ident" ||
          !EXPRESSION_COMPONENTS.includes(name.value as ExpressionComponent)
        )
          fail(
            "comp-expression-syntax",
            name.column,
            `only .x, .y, .z, .r, .g, .b and .a component access is allowed`,
          );
        position++;
        value = node(
          { member: name.value as ExpressionComponent, of: value },
          dot.column,
        );
      }
      return value;
    };
    const list = (close: string): ExpressionAst[] => {
      const items: ExpressionAst[] = [];
      if (isPunct(close)) {
        position++;
        return items;
      }
      for (;;) {
        items.push(expression());
        if (isPunct(",")) {
          position++;
          continue;
        }
        expect(close);
        return items;
      }
    };
    const primary = (): ExpressionAst => {
      const token = peek();
      switch (token.kind) {
        case "num":
          position++;
          return node({ num: token.value }, token.column);
        case "str":
          position++;
          return node({ str: token.value }, token.column);
        case "color":
          position++;
          return node({ color: token.value }, token.column);
        case "ident": {
          position++;
          if (token.value === "true" || token.value === "false")
            return node({ bool: token.value === "true" }, token.column);
          if (isPunct("(")) {
            if (!isFunction(token.value))
              fail(
                "comp-expression-unknown-function",
                token.column,
                `unknown function "${token.value}"`,
              );
            nest(token.column);
            position++;
            const args = list(")");
            depth--;
            return node({ call: token.value, args }, token.column);
          }
          if (
            !EXPRESSION_IDENTIFIERS.includes(
              token.value as ExpressionIdentifier,
            )
          )
            fail(
              "comp-expression-syntax",
              token.column,
              isFunction(token.value)
                ? `"${token.value}" is a function; call it with parentheses`
                : `unknown identifier "${token.value}"`,
            );
          return node(
            { id: token.value as ExpressionIdentifier },
            token.column,
          );
        }
        case "punct":
          if (token.value === "(") {
            nest(token.column);
            position++;
            const inner = expression();
            expect(")");
            depth--;
            return inner;
          }
          if (token.value === "[") {
            nest(token.column);
            position++;
            const items = list("]");
            depth--;
            return node({ vec: items }, token.column);
          }
          return fail(
            "comp-expression-syntax",
            token.column,
            `unexpected ${describe(token)}`,
          );
        case "end":
          return fail(
            "comp-expression-syntax",
            token.column,
            "unexpected end of expression",
          );
      }
    };

    const ast = expression();
    if (peek().kind !== "end")
      fail(
        "comp-expression-syntax",
        peek().column,
        `unexpected ${describe(peek())}`,
      );
    return { ast, columns };
  } catch (error) {
    if (error instanceof ExpressionParseFailure) return { error: error.error };
    // Guard the never-throw contract against an unexpected engine limit.
    return {
      error: {
        code: "comp-expression-limit",
        column: 1,
        message: "expression is too complex to parse",
      },
    };
  }
}

/** Structural equality of two JSON values; object key order is irrelevant. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  const stack: [unknown, unknown][] = [[a, b]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x === y) continue;
    if (
      typeof x !== "object" ||
      typeof y !== "object" ||
      x === null ||
      y === null ||
      Array.isArray(x) !== Array.isArray(y)
    )
      return false;
    if (Array.isArray(x)) {
      const other = y as unknown[];
      if (x.length !== other.length) return false;
      x.forEach((item, i) => stack.push([item, other[i]]));
      continue;
    }
    const left = Object.keys(x),
      right = Object.keys(y);
    if (left.length !== right.length) return false;
    for (const key of left) {
      if (!Object.hasOwn(y, key)) return false;
      stack.push([
        (x as Record<string, unknown>)[key],
        (y as Record<string, unknown>)[key],
      ]);
    }
  }
  return true;
}
