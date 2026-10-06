import {
  parseExpression,
  isExpressionFunction,
  printExpression,
  parsePropertyPath,
  isPropertyPathError,
  type ExpressionAst,
} from "@still-shift/scene-contract";
import { BuilderError, sourceLocation, type SourceLocation } from "./source.ts";
export type Expression = {
  source: string;
  ast: ExpressionAst;
  location: SourceLocation;
};
export function expression(source: string): Expression {
  const location = sourceLocation();
  const parsed = parseExpression(source, isExpressionFunction);
  if ("error" in parsed)
    throw new BuilderError(
      parsed.error.code,
      `${parsed.error.message} (expression column ${parsed.error.column})`,
      location,
    );
  return { source, ast: parsed.ast, location };
}
export function expr(
  strings: TemplateStringsArray,
  ...values: (number | Expression)[]
): Expression {
  const source = strings.reduce(
    (all, part, index) =>
      all +
      part +
      (index < values.length
        ? typeof values[index] === "number"
          ? printExpression({ num: values[index] as number })
          : `(${(values[index] as Expression).source})`
        : ""),
    "",
  );
  return expression(source);
}
export function ref(path: string): Expression {
  const parsed = parsePropertyPath(path);
  if (isPropertyPathError(parsed))
    throw new BuilderError(parsed.code, parsed.message);
  return expression(`ref(${printExpression({ str: path })})`);
}
export function instance(...layers: ({ id: string } | string)[]) {
  const scope = layers
    .map((layer) => (typeof layer === "string" ? layer : layer.id))
    .join("/");
  return {
    path: (property: string) => {
      const path = `${scope}.${property}`;
      const parsed = parsePropertyPath(path);
      if (isPropertyPathError(parsed))
        throw new BuilderError(parsed.code, parsed.message);
      return path;
    },
    ref: (property: string) => ref(`${scope}.${property}`),
  };
}
