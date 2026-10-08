/** Inspect a process listing without running or stopping any workload. */
export function findCompetingWorkloads(processes: string, currentPid: number) {
  return processes.split("\n").filter((line) => {
    const match = /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!match || Number(match[1]) === currentPid) return false;
    const executable = match[2]!.split("/").at(-1);
    const args = match[3]!;
    // Treat every package-manager invocation as competing: custom scripts,
    // optional `run` and filters can all launch a verification workload.
    if (executable === "pnpm" || executable === "vitest") return true;
    if (executable !== "node" && executable !== "tsx") return false;
    return /(?:^|[/\s])pnpm(?:\.[cm]?js)?(?:\s|$)|vitest|tests\/(?:browser|integration|runtime|unit)\/|scripts\/composition\//.test(
      args,
    );
  });
}
