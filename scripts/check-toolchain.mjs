import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { URL } from "node:url";

const require = createRequire(import.meta.url);
const expected = JSON.parse(
  readFileSync(new URL("../toolchain.json", import.meta.url), "utf8"),
);

const commandVersion = (command, args = ["--version"]) =>
  execFileSync(command, args, { encoding: "utf8" }).trim();

const assertEqual = (label, actual, wanted) => {
  if (actual !== wanted) {
    throw new Error(`${label} mismatch: expected ${wanted}, received ${actual}`);
  }
};

assertEqual("Node.js", process.versions.node, expected.node);
assertEqual("pnpm", commandVersion("pnpm"), expected.pnpm);
assertEqual(
  "Python",
  commandVersion("uv", ["run", "python", "--version"]),
  `Python ${expected.python}`,
);
assertEqual(
  "uv",
  commandVersion("uv").split(" ").slice(0, 2).join(" "),
  `uv ${expected.uv}`,
);
assertEqual(
  "FFmpeg",
  commandVersion("ffmpeg", ["-version"]).split("\n")[0].split(" ")[2],
  expected.ffmpeg,
);
assertEqual(
  "ffprobe",
  commandVersion("ffprobe", ["-version"]).split("\n")[0].split(" ")[2],
  expected.ffmpeg,
);

const playwrightPackage = require("playwright/package.json");
const playwrightCorePackagePath = require.resolve("playwright-core/package.json", {
  paths: [dirname(require.resolve("playwright/package.json"))],
});
const browserManifest = require(join(dirname(playwrightCorePackagePath), "browsers.json"));
const chromium = browserManifest.browsers.find(
  (browser) => browser.name === "chromium",
);

assertEqual("Playwright", playwrightPackage.version, expected.playwright);
assertEqual("Chromium revision", chromium?.revision, expected.chromiumRevision);
assertEqual("Chromium version", chromium?.browserVersion, expected.chromiumVersion);

const { chromium: chromiumLauncher } = await import("playwright");
const launchedBrowser = await chromiumLauncher.launch({ headless: true });
assertEqual("launched Chromium", launchedBrowser.version(), expected.chromiumVersion);
await launchedBrowser.close();

process.stdout.write(
  `Toolchain verified: Node ${expected.node}, pnpm ${expected.pnpm}, Python ${expected.python}, Playwright ${expected.playwright}/Chromium ${expected.chromiumRevision}, FFmpeg ${expected.ffmpeg}\n`,
);
