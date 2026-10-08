import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { depthAlphaProfileAcceptance } from "./depth-alpha.ts";

const directory = await mkdtemp(join(tmpdir(), "ce4d-alpha-")),
  server = await createServer({
    root: process.cwd(),
    configFile: false,
    cacheDir: join(directory, "vite-cache"),
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  });
try {
  await server.listen();
  console.log(
    JSON.stringify(
      await depthAlphaProfileAcceptance(server.resolvedUrls!.local[0]!),
      null,
      2,
    ),
  );
} finally {
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
