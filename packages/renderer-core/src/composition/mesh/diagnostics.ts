import {
  PassageError,
  passageDiagnostics,
  passageError,
} from "../../passage-diagnostics.ts";
// Diagnostic frame/location must travel with effects without changing visual cache keys.
export const MESH_DIAGNOSTIC_LOCATION = Symbol("mesh diagnostic location");
export type MeshDiagnosticLocation = {
  node: string;
  path: string;
  frame: number;
};

/** Keep human-readable messages compatible while exposing machine-readable codes. */
export function meshError(code: string, message: string, path?: string): never {
  passageError(code, `${code}: ${message}`, path ? { path } : {});
}

/** Preserve unrelated failures, including native draw and ownership exceptions. */
export function locateMeshError(
  error: unknown,
  location?: MeshDiagnosticLocation,
): unknown {
  if (!location) return error;
  const diagnostics = passageDiagnostics(error);
  if (
    !diagnostics.some((diagnostic) => diagnostic.code.startsWith("comp-mesh-"))
  )
    return error;
  return new PassageError(
    diagnostics.map((diagnostic) =>
      diagnostic.code.startsWith("comp-mesh-")
        ? {
            ...diagnostic,
            node: location.node,
            frame: location.frame,
            path:
              location.path + (diagnostic.path ? `.${diagnostic.path}` : ""),
          }
        : diagnostic,
    ),
  );
}
