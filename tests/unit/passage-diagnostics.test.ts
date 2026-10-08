import { describe, expect, it } from "vitest";
import {
  passageDiagnostics,
  PassageError,
  type PassageDiagnostic,
} from "../../packages/renderer-core/src/passage-diagnostics.ts";

const diagnostics: PassageDiagnostic[] = [
  {
    code: "comp-schema-format",
    severity: "error",
    message: "Invalid layer id",
    beat: "reset",
    sourcePath: "/picture.json",
    path: "layers[0].id",
  },
];

describe("passage diagnostics across module boundaries", () => {
  it("retains diagnostics from a separately loaded PassageError class", () => {
    class ExternalPassageError extends Error {
      readonly diagnostics = diagnostics;
      constructor() {
        super("Invalid layer id");
        this.name = "PassageError";
      }
    }
    const error = new ExternalPassageError();
    expect(error).not.toBeInstanceOf(PassageError);
    expect(passageDiagnostics(error)).toEqual(diagnostics);
  });

  it("retains explicit beat context from either class identity", () => {
    expect(passageDiagnostics(new PassageError(diagnostics), "other")).toEqual(
      diagnostics,
    );
  });

  it("does not classify unrelated errors by a diagnostics property", () => {
    const error = Object.assign(new Error("Ordinary failure"), { diagnostics });
    expect(passageDiagnostics(error)).toEqual([
      { code: "invalid-scene", severity: "error", message: "Ordinary failure" },
    ]);
  });
});
