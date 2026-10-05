import { isAbsolute } from "node:path";
import { typescriptCandidates } from "./dependency-candidates.ts";
import { appendFileSync } from "node:fs";
import type { ResolveHookSync } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
let trace: string;
let motion: string;
export function initialize(data: { trace: string; motion: string }) {
  trace = data.trace;
  motion = data.motion;
}
export const resolve: ResolveHookSync = (specifier, context, nextResolve) => {
  const alias =
    specifier === "@still-shift/motion"
      ? "index.ts"
      : specifier === "@still-shift/motion/node"
        ? "node.ts"
        : undefined;
  const requested = alias ? new URL(alias, motion).href : specifier;
  let requestedPath: string | undefined;
  if (
    trace &&
    context.parentURL &&
    (requested.startsWith(".") ||
      requested.startsWith("file:") ||
      isAbsolute(requested))
  ) {
    const candidate = isAbsolute(requested)
      ? pathToFileURL(requested)
      : new URL(requested, context.parentURL);
    if (candidate.protocol === "file:") {
      requestedPath = fileURLToPath(candidate);
      appendFileSync(trace, JSON.stringify(requestedPath) + "\n");
    }
  }
  let result: ReturnType<typeof nextResolve>;
  try {
    result = nextResolve(requested, context);
  } catch (error) {
    if (trace && requestedPath)
      for (const candidate of typescriptCandidates(requestedPath))
        appendFileSync(trace, JSON.stringify(candidate) + "\n");
    throw error;
  }
  if (
    trace &&
    result.url.startsWith("file:") &&
    !result.url.includes("/node_modules/")
  )
    appendFileSync(trace, JSON.stringify(fileURLToPath(result.url)) + "\n");
  return !context.conditions.includes("require") &&
    !result.url.includes("/node_modules/") &&
    /\.m?ts(?:[?#]|$)/.test(result.url)
    ? { ...result, format: "module" }
    : result;
};
