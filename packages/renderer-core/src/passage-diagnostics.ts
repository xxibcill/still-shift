import { ZodError } from "zod";

export type PassageDiagnostic = {
  code: string;
  severity: "error" | "warning";
  message: string;
  beat?: string;
  node?: string;
  event?: string;
  frame?: number;
  path?: string;
};
export class PassageError extends Error {
  constructor(readonly diagnostics: PassageDiagnostic[]) {
    super(diagnostics.map((d) => d.message).join("\n"));
    this.name = "PassageError";
  }
}
export function passageError(
  code: string,
  message: string,
  location: Omit<PassageDiagnostic, "code" | "message" | "severity"> = {},
): never {
  throw new PassageError([{ code, severity: "error", message, ...location }]);
}
export function passageDiagnostics(
  error: unknown,
  beat?: string,
): PassageDiagnostic[] {
  if (error instanceof PassageError)
    return error.diagnostics.map((d) => ({ ...(beat ? { beat } : {}), ...d }));
  if (error instanceof ZodError)
    return error.issues.map((issue) => ({
      code: "invalid-contract",
      severity: "error",
      message: issue.message,
      path: issue.path.join("."),
      ...(beat ? { beat } : {}),
    }));
  const message = error instanceof Error ? error.message : String(error);
  const conflict = /Conflicting story events on ([^.]+)\.(\w+)/.exec(message);
  return [
    {
      code: conflict ? "property-conflict" : "invalid-scene",
      severity: "error",
      message,
      ...(beat ? { beat } : {}),
      ...(conflict ? { node: conflict[1]!, path: conflict[2]! } : {}),
    },
  ];
}
