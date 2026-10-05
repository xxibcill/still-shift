import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SoundtrackError } from "@still-shift/scene-contract";
import {
  readSoundtrackProject,
  verifySoundtrackSources,
  saveSoundtrackEdits,
  retimeSoundtrackProject,
  packageSoundtrackProject,
  renderSoundtrackProject,
  soundtrackFromPassage,
  readStoryPassage,
} from "@still-shift/animation-engine";
/** Operations from stdin share the 8 MB bound of every soundtrack JSON input. */
async function readStdin() {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += (chunk as Buffer).length;
    if (size > 8_000_000)
      throw new SoundtrackError("request-size", "Operations exceed 8 MB");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function runSoundtrackCli(
  args: string[],
  io: {
    stdout: (value: string) => void;
    stderr: (value: string) => void;
    /** `--operations -` reads edits here; defaults to process stdin. */
    stdin?: () => Promise<string>;
  },
) {
  const [command, ...rest] = args;
  const flags = new Map<string, string>();
  const signal = new AbortController();
  const abort = () =>
    signal.abort(
      new SoundtrackError(
        "cancelled",
        "Render cancelled; retry into a fresh output directory",
      ),
    );
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    for (let i = 0; i < rest.length; i++) {
      const flag = rest[i]!;
      if (
        ![
          "--project",
          "--operations",
          "--revision",
          "--output-dir",
          "--stems",
          "--json",
          "--range",
          "--passage",
          "--narration",
          "--output",
        ].includes(flag) ||
        flags.has(flag)
      )
        throw new Error("Unknown or duplicate option: " + flag);
      if (flag === "--stems" || flag === "--json") {
        flags.set(flag, "true");
        continue;
      }
      const value = rest[++i];
      if (!value || value.startsWith("--"))
        throw new Error("Missing value for " + flag);
      flags.set(flag, value);
    }
    const required = (key: string) => {
      const value = flags.get("--" + key);
      if (!value) throw new Error("Missing --" + key);
      return value;
    };
    const revision = () => {
      const value = Number(required("revision"));
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error("--revision must be a nonnegative integer");
      return value;
    };
    let result: unknown;
    if (command === "from-passage") {
      const passage = await readStoryPassage(required("passage"));
      const narration = flags.get("--narration");
      const project = soundtrackFromPassage(
        passage,
        narration
          ? {
              path: resolve(narration),
              sha256: passage.plan.narration?.sha256 ?? "",
            }
          : undefined,
      );
      await verifySoundtrackSources(project, resolve(required("output")));
      await writeFile(
        required("output"),
        JSON.stringify(project, null, 2) + "\n",
        { flag: "wx" },
      );
      result = project;
    } else {
      const path = required("project");
      switch (command) {
        case "validate": {
          const p = await readSoundtrackProject(path);
          await verifySoundtrackSources(p, path);
          result = { valid: true, revision: p.revision };
          break;
        }
        case "inspect":
          result = await readSoundtrackProject(path);
          break;
        case "edit": {
          const source = required("operations");
          result = await saveSoundtrackEdits(
            path,
            revision(),
            JSON.parse(
              source === "-"
                ? await (io.stdin ?? readStdin)()
                : await readFile(source, "utf8"),
            ),
          );
          break;
        }
        case "retime": {
          const p = await readStoryPassage(required("passage"));
          result = await retimeSoundtrackProject(path, revision(), {
            ...p,
            fps: p.plan.fps,
          });
          break;
        }
        case "package":
          result = await packageSoundtrackProject(path, required("output-dir"));
          break;
        case "render": {
          const rangeText = flags.get("--range"),
            values = rangeText?.split(":").map(Number);
          if (values && values.length !== 2)
            throw new Error("Use --range startSample:endSample");
          result = await renderSoundtrackProject(path, required("output-dir"), {
            signal: signal.signal,
            stems: flags.has("--stems"),
            ...(values
              ? { range: { start: values[0]!, end: values[1]! } }
              : {}),
          });
          break;
        }
        default:
          throw new Error("Unknown soundtrack command: " + command);
      }
    }
    io.stdout(JSON.stringify({ ok: true, result }) + "\n");
    return 0;
  } catch (error) {
    const e =
      error instanceof SoundtrackError
        ? error
        : new SoundtrackError(
            "command-failed",
            error instanceof Error ? error.message : String(error),
          );
    io.stdout(
      JSON.stringify({
        ok: false,
        error: { code: e.code, message: e.message, context: e.context },
      }) + "\n",
    );
    return 1;
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}
