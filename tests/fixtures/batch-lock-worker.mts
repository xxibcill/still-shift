import { acquireBatchLock } from "../../tools/still-shift-cli/src/batch-recovery.ts";

const [lockPath, outputDir] = process.argv.slice(2);
process.chdir(outputDir);

process.once("message", async (message) => {
  if (message !== "acquire") return;
  try {
    const release = await acquireBatchLock(lockPath, outputDir);
    process.send?.("acquired");
    process.once("message", async () => {
      await release();
      process.exit(0);
    });
  } catch (error) {
    const result =
      error instanceof Error && error.message.includes("already in use")
        ? "rejected"
        : `error: ${String(error)}`;
    process.send?.(result, () => process.exit(0));
  }
});

process.send?.("ready");
