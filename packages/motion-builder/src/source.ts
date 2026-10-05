export type SourceLocation = { file: string; line: number; column: number };
export function sourceLocation(): SourceLocation {
  const stack = new Error().stack?.split("\n").slice(1) ?? [];
  for (const line of stack) {
    if (line.includes("node:")) continue;
    const match =
      /(?:at .*?\()?((?:file:\/\/|https?:\/\/|\/).*?):(\d+):(\d+)\)?$/.exec(
        line.trim(),
      );
    if (!match || /motion-builder\/src\//.test(match[1]!)) continue;
    return {
      file: match[1]!.replace(/^file:\/\//, ""),
      line: Number(match[2]),
      column: Number(match[3]),
    };
  }
  return { file: "<builder>", line: 1, column: 1 };
}
export class BuilderError extends Error {
  readonly code: string;
  readonly location: SourceLocation;
  readonly dependencies: string[];
  constructor(
    code: string,
    message: string,
    location = sourceLocation(),
    dependencies: string[] = [],
  ) {
    super(
      `${location.file}:${location.line}:${location.column}: ${code}: ${message}`,
    );
    this.name = "BuilderError";
    this.code = code;
    this.location = location;
    this.dependencies = dependencies;
  }
}

const sites = new WeakMap<object, SourceLocation>();
export function recordSource<T extends object>(
  value: T,
  location: SourceLocation,
): T {
  sites.set(value, location);
  return value;
}
export function sourceOf(value: object): SourceLocation | undefined {
  return sites.get(value);
}
