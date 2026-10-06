import type { CompositionDiagnostic } from "@still-shift/scene-contract";
export class CompositionProgramError extends Error {
  readonly diagnostics: CompositionDiagnostic[];
  readonly dependencies: string[];
  constructor(
    diagnostics: CompositionDiagnostic[],
    dependencies: string[] = [],
  ) {
    super(
      diagnostics.map((d) => `${d.code} ${d.path}: ${d.message}`).join("\n"),
    );
    this.name = "CompositionProgramError";
    this.diagnostics = diagnostics;
    this.dependencies = dependencies;
  }
}
export function programError(
  code: string,
  message: string,
  path: string,
): never {
  throw new CompositionProgramError([
    { code, severity: "error", path, message },
  ]);
}
