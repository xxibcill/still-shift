import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { readStoryPassage } from "../packages/animation-engine/src/story-passage-io.ts";
import { writeStoryWorkspace } from "../packages/animation-engine/src/story-workspace.ts";
import { passageDiagnostics } from "../packages/renderer-core/src/passage-diagnostics.ts";

try {
  const { values } = parseArgs({
    options: {
      plan: { type: "string" },
      "output-dir": { type: "string" },
      narration: { type: "string" },
    },
    strict: true,
  });
  if (!values.plan || !values["output-dir"])
    throw new Error(
      "Pass --plan <JSON> --output-dir <new directory>, plus --narration <file> for a narrated plan",
    );
  const passage = await readStoryPassage(values.plan);
  const output = resolve(values["output-dir"]);
  const manifest = await writeStoryWorkspace(
    output,
    passage,
    values.narration ? resolve(values.narration) : undefined,
  );
  console.log(
    JSON.stringify({
      status: "packaged",
      workspace: join(output, "workspace.json"),
      files: manifest.files.length,
      bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: "failed",
      diagnostics: passageDiagnostics(error),
    }),
  );
  process.exitCode = 1;
}
