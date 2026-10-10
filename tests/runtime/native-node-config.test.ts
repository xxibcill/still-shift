import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const execute = promisify(execFile);

test("loads the native sink and Lab configuration through Node's ordinary TypeScript loader", async () => {
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.NODE_PATH;
  delete environment.TSX_TSCONFIG_PATH;
  const { stdout, stderr } = await execute(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import assert from "node:assert/strict";
       import { NativeObservationSink } from "./packages/execution-runtime/src/native-observation-sink.ts";
       import { createServer } from "vite";
       assert.equal(typeof NativeObservationSink, "function");
       const server = await createServer({configFile: "apps/lab/vite.config.ts", server: {port: 0}});
       await server.close();
       console.log("Native sink and Lab configuration loaded without a TypeScript transformer");`,
    ],
    {
      cwd: resolve(import.meta.dirname, "../.."),
      env: environment,
      timeout: 30_000,
      maxBuffer: 512 * 1024,
    },
  );
  expect(stderr).toBe("");
  expect(stdout.trim()).toBe(
    "Native sink and Lab configuration loaded without a TypeScript transformer",
  );
}, 35_000);
