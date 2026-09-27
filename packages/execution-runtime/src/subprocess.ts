import { execFile } from "node:child_process";

type ProcessOptions = {
  signal?: AbortSignal | undefined;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
};

/** Cancellation settles only after the child has exited and its pipes are closed. */
export async function runProcess(
  command: string,
  args: string[],
  { signal, ...options }: ProcessOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  signal?.throwIfAborted();
  let forceKill: ReturnType<typeof setTimeout> | undefined;
  let child!: ReturnType<typeof execFile>;
  const result = new Promise<{ stdout: string; stderr: string }>(
    (accept, reject) => {
      child = execFile(
        command,
        args,
        { ...options, encoding: "utf8" },
        (error, stdout, stderr) => {
          if (error) reject(Object.assign(error, { stdout, stderr }));
          else accept({ stdout, stderr });
        },
      );
    },
  );
  const closed = new Promise<void>((accept) =>
    child.once("close", () => accept()),
  );
  const abort = () => {
    child.kill("SIGTERM");
    forceKill = setTimeout(() => child.kill("SIGKILL"), 250);
    forceKill.unref();
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const output = await result;
    signal?.throwIfAborted();
    return output;
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    await closed;
    signal?.removeEventListener("abort", abort);
    clearTimeout(forceKill);
  }
}
