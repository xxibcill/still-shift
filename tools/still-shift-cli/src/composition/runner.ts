import { registerHooks } from "node:module";
import { subscribe } from "node:diagnostics_channel";
import { appendFileSync } from "node:fs";
import { initialize, resolve } from "./trace.ts";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const [input, output, trace] = process.argv.slice(2);
subscribe("still-shift.motion.asset-read", (path) => {
  if (typeof path === "string")
    appendFileSync(trace!, JSON.stringify(path) + "\n");
});
initialize({
  trace: trace!,
  motion: new URL("../../../../packages/motion-builder/src/", import.meta.url)
    .href,
});
registerHooks({ resolve });
try {
  const module = await import(pathToFileURL(input!).href);
  let result = await module.default;
  if (
    result &&
    typeof result === "object" &&
    !("schemaVersion" in result) &&
    "default" in result
  )
    result = await result.default;
  if (!result || typeof result !== "object")
    throw new Error(
      "comp-program-export: default export must be a composition",
    );
  await writeFile(output!, JSON.stringify({ ok: true, input: result }));
} catch (error) {
  await writeFile(
    output!,
    JSON.stringify({
      ok: false,
      dependencies:
        typeof error === "object" && error && "dependencies" in error
          ? error.dependencies
          : [],
      diagnostic: {
        code:
          typeof error === "object" && error && "code" in error
            ? error.code
            : "comp-program-load",
        message: error instanceof Error ? error.message : String(error),
        path:
          typeof error === "object" &&
          error &&
          "location" in error &&
          error.location &&
          typeof error.location === "object" &&
          "file" in error.location &&
          "line" in error.location
            ? `${error.location.file}:${error.location.line}`
            : input,
      },
    }),
  );
  process.exitCode = 1;
}
