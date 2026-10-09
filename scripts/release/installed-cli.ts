import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

async function command(
  program: string,
  args: string[],
  cwd?: string,
): Promise<number> {
  return new Promise((done, reject) => {
    const child = spawn(program, args, {
      stdio: "inherit",
      ...(cwd ? { cwd } : {}),
    });
    child.once("error", reject);
    child.once("exit", (code) => done(code ?? 1));
  });
}

async function setup(args: string[]): Promise<number> {
  if (
    args.length !== 1 ||
    !["browser", "soundtrack", "depth"].includes(args[0]!)
  )
    throw new Error("Usage: still-shift setup browser|soundtrack|depth");
  if (args[0] === "browser") {
    const manifestPath = fileURLToPath(
      import.meta.resolve("playwright/package.json"),
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      bin: { playwright: string };
    };
    return command(process.execPath, [
      resolve(dirname(manifestPath), manifest.bin.playwright),
      "install",
      "chromium",
    ]);
  }
  if (args[0] === "depth")
    return command(
      "uv",
      ["sync", "--frozen", "--no-dev", "--python", "3.12.11"],
      root,
    );
  const runtime = resolve(
    process.env.STILL_SHIFT_SOUNDTRACK_ENV ??
      resolve(homedir(), ".cache/still-shift/soundtrack"),
  );
  const python = resolve(runtime, "bin/python");
  if (!existsSync(python)) {
    const code = await command("uv", ["venv", "--python", "3.12.11", runtime]);
    if (code) return code;
  }
  const code = await command("uv", [
    "pip",
    "install",
    "--python",
    python,
    "--require-hashes",
    "-r",
    resolve(root, "scripts/soundtrack/requirements.txt"),
  ]);
  if (!code)
    console.log(
      JSON.stringify({
        ok: true,
        python,
        environment: { STILL_SHIFT_SOUNDTRACK_PYTHON: python },
      }),
    );
  return code;
}

export async function runInstalledCli(args: string[]): Promise<number> {
  try {
    if (args[0] === "setup") return await setup(args.slice(1));
    const showHelp = !args.length || args.includes("--help");
    if (showHelp || args.includes("--version")) {
      const manifest = JSON.parse(
        await readFile(resolve(root, "package.json"), "utf8"),
      ) as { version: string };
      if (!showHelp) {
        console.log(manifest.version);
        return 0;
      }
      console.log(
        "Install optional runtimes: still-shift setup browser|soundtrack|depth\n",
      );
      return await runCli(args, {
        stdout: (text) =>
          process.stdout.write(
            text
              .replace(
                /^Still Shift v[^\n]+/,
                `Still Shift v${manifest.version}`,
              )
              .replace(/pnpm(?: --silent)? still-shift/g, "npx still-shift")
              .replace("show the engine version", "show the package version"),
          ),
        stderr: (text) => process.stderr.write(text),
      });
    }
    return await runCli(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
