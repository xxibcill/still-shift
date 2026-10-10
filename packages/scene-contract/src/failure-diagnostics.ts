export type FailureCause = { name: string; code?: string; message: string };
export type FailureDiagnostic = {
  stage: string;
  path?: string;
  nextAction: string;
  causes: FailureCause[];
};

const MAX_TEXT = 1024;
const MAX_CAUSES = 8;
const sensitiveKey =
  /password|passwd|secret|token|api[_-]?key|authorization|cookie|environment|env$|^stack$/i;

/** Public diagnostics retain causes, never stacks, credentials or environment objects. */
export function sanitizeDiagnosticText(value: string): string {
  return value
    .slice(0, 8192)
    .replace(
      /Traceback \(most recent call last\):[\s\S]*/g,
      (trace) =>
        trace
          .split(/\r?\n/)
          .reverse()
          .find((line) => /^[\w.]+(?:Error|Exception):/.test(line)) ??
        "Subprocess failed",
    )
    .replace(/\r?\n[ \t]+at [^\r\n]*/g, "")
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
    .replace(/(bearer\s+)[\w.+/=-]+/gi, "$1[redacted]")
    .replace(
      /((?:password|passwd|secret|token|api[_-]?key|authorization|cookie)["']?\s*[=:]\s*)["'][^"']*["']/gi,
      "$1[redacted]",
    )
    .replace(
      /((?:password|passwd|secret|token|api[_-]?key|authorization|cookie)\s*[=:]\s*)[^\s&,;]+/gi,
      "$1[redacted]",
    )
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16})\b/g, "[redacted]")
    .slice(0, MAX_TEXT);
}

export function sanitizeDiagnosticContext(
  context: Record<string, string | number | boolean> | undefined,
): typeof context {
  if (!context) return undefined;
  return Object.fromEntries(
    Object.entries(context)
      .filter(([key]) => !sensitiveKey.test(key))
      .map(([key, value]) => [
        key,
        typeof value === "string" ? sanitizeContextValue(key, value) : value,
      ]),
  );
}

function sanitizeContextValue(key: string, value: string): string {
  if (!key.endsWith("Json")) return sanitizeDiagnosticText(value);
  try {
    return JSON.stringify(JSON.parse(value), (name, entry: unknown) =>
      sensitiveKey.test(name)
        ? undefined
        : typeof entry === "string"
          ? sanitizeDiagnosticText(entry)
          : entry,
    );
  } catch {
    return sanitizeDiagnosticText(value);
  }
}

const knownCauses: Record<string, [string, string]> = {
  EPERM: [
    "Permission denied by the operating environment",
    "Allow the required local server/process operation and rerun the affected command.",
  ],
  EACCES: [
    "Permission denied for the requested resource",
    "Check access to the located source/output and rerun the affected command.",
  ],
  EADDRINUSE: [
    "The requested local port is already in use",
    "Use an available port or close the conflicting local server.",
  ],
  ENOENT: [
    "A required resource was not found",
    "Restore the located dependency and run dependency inspection before rendering.",
  ],
  EEXIST: [
    "The output already exists or changed",
    "Choose a fresh output version; retain previous deliveries.",
  ],
  ABORT_ERR: [
    "The operation was cancelled",
    "Resume from validated receipts when ready.",
  ],
};

function errorObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

export function failureDiagnostic(error: unknown): FailureDiagnostic {
  const causes: FailureCause[] = [];
  const seen = new Set<unknown>();
  let value = error;
  let recovery =
    "Inspect the located diagnostic and complete dependency validation before rerunning the affected stage.";
  for (
    let index = 0;
    index < MAX_CAUSES && value !== undefined && !seen.has(value);
    index++
  ) {
    seen.add(value);
    const entry = errorObject(value);
    const code =
      typeof entry?.code === "string" &&
      /^[A-Z][A-Z0-9_-]{0,63}$/.test(entry.code)
        ? entry.code
        : undefined;
    const name =
      typeof entry?.name === "string"
        ? sanitizeDiagnosticText(entry.name).slice(0, 64)
        : "UnknownFailure";
    const message =
      code && knownCauses[code]
        ? knownCauses[code]![0]
        : name === "ZodError"
          ? "Schema validation failed"
          : typeof entry?.message === "string" && entry?.context !== undefined
            ? sanitizeDiagnosticText(entry.message)
            : "Unexpected failure; diagnostic details are unavailable";
    causes.push({ name, ...(code ? { code } : {}), message });
    if (code && knownCauses[code]) recovery = knownCauses[code]![1];
    value = entry?.cause;
  }
  const context = errorObject(errorObject(error)?.context);
  const rawPath = context?.path ?? context?.inputPath ?? context?.asset;
  return {
    stage:
      typeof context?.stage === "string"
        ? sanitizeDiagnosticText(context.stage)
        : "command",
    ...(typeof rawPath === "string"
      ? { path: sanitizeDiagnosticText(rawPath) }
      : {}),
    nextAction:
      typeof context?.nextAction === "string"
        ? sanitizeDiagnosticText(context.nextAction)
        : recovery,
    causes,
  };
}
