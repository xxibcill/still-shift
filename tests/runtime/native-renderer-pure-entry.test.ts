import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
const run = promisify(execFile);
it("loads the public pure renderer without resolving Three.js", async () => {
  const loader = new URL("../helpers/reject-three-loader.mjs", import.meta.url)
      .href,
    entry = new URL(
      "../../packages/renderer-core/src/index.ts",
      import.meta.url,
    ).href;
  const script = `import { register } from "node:module"; register(${JSON.stringify(loader)}, import.meta.url); let blocked = false; try { await import("three"); } catch (error) { if (!String(error).includes("Unexpected eager Three.js")) throw error; blocked = true; } if (!blocked) throw Error("Import guard was not active"); await import(${JSON.stringify(entry)}); console.log("pure-renderer-loaded");`;
  const result = await run(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", script],
    { cwd: fileURLToPath(new URL("../../", import.meta.url)), timeout: 15000 },
  );
  expect(result.stdout.trim()).toBe("pure-renderer-loaded");
}, 20000);
