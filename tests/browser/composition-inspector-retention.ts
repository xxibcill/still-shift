import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";

export async function verifyCompositionInspectorRetention() {
  const run = promisify(execFile),
    root = await mkdtemp(join(tmpdir(), "composition-retained-draft-")),
    input = join(root, "source.json"),
    art = (fill: string) =>
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="${fill}"/></svg>`,
      ),
    originalArt = art("red"),
    hash = (bytes: Buffer) =>
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const source: Composition = {
    schemaVersion: "composition-1",
    id: "retained",
    width: 64,
    height: 64,
    fps: 24,
    frameCount: 8,
    background: "#333333",
    assets: [
      {
        id: "art",
        type: "image",
        path: "art.svg",
        width: 4,
        height: 4,
        sha256: hash(originalArt),
      },
    ],
    layers: [
      {
        id: "box",
        type: "image",
        size: [16, 16],
        sources: [{ asset: "art" }],
        transform: {
          position: [32, 32],
          rotation: {
            keys: [
              { frame: 0, value: 0 },
              { frame: 7, value: 90 },
            ],
          },
        },
      },
    ],
  };
  let app: Awaited<ReturnType<typeof createProgramPreview>> | undefined,
    browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
  try {
    await writeFile(join(root, "art.svg"), originalArt);
    await writeFile(input, JSON.stringify(source));
    app = await createProgramPreview(input, { watch: true });
    browser = await launchRenderBrowser();
    const page = await browser.newPage(),
      assetRequests: string[] = [],
      startupErrors: string[] = [];
    page.on("pageerror", (error) => startupErrors.push(error.message));
    page.on("requestfailed", (request) =>
      startupErrors.push(
        `${request.url()}: ${request.failure()?.errorText ?? "Request failed"}`,
      ),
    );
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/composition/program-asset")
        assetRequests.push(request.url());
    });
    await page.goto(app.url);
    await page
      .waitForFunction(
        () => Number(document.getElementById("status")?.dataset.revision) > 0,
      )
      .catch(async (error) => {
        console.error({
          sourceRevision: app!.snapshot()?.revision,
          previewStatus: await page.locator("#status").textContent(),
          previewError: await page.locator("#error").textContent(),
          startupErrors,
        });
        throw error;
      });
    await page.locator("#frame").fill("4");
    await page.locator("#frame").dispatchEvent("input");
    const edit = async (ease: string) => {
      await page.getByLabel("out ease", { exact: true }).fill(ease);
      await page.getByLabel("out speed", { exact: true }).fill("0");
      await page
        .getByRole("button", { name: "Apply out handle", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          !document.querySelector<HTMLFieldSetElement>("#inspector-edit")!
            .disabled,
      );
      assert.equal(
        await page.locator("#error").textContent(),
        "",
        "Retained draft edits must keep their captured assets",
      );
      assert.match(
        await page.locator("#edited-keys").inputValue(),
        new RegExp(`"ease": ${ease}`),
      );
    };
    await edit("0.85");
    const draftRevision = await page
      .locator("#status")
      .getAttribute("data-revision");
    assert.ok(draftRevision);
    for (const [index, fill] of ["blue", "green", "yellow"].entries()) {
      const bytes = art(fill),
        updated = structuredClone(source);
      updated.name = `External ${index + 1}`;
      updated.assets[0]!.sha256 = hash(bytes);
      await writeFile(join(root, "art.svg"), bytes);
      await writeFile(input, JSON.stringify(updated));
      const deadline = Date.now() + 6000;
      while (
        app.snapshot()?.composition.name !== updated.name &&
        Date.now() < deadline
      )
        await new Promise((resolve) => setTimeout(resolve, 25));
      assert.equal(app.snapshot()?.composition.name, updated.name);
    }
    await page.waitForFunction(() =>
      document
        .getElementById("edit-message")!
        .textContent!.includes("externally"),
    );
    assert.equal(
      await page.locator("#status").getAttribute("data-revision"),
      draftRevision,
    );
    assert.ok(app.snapshot()!.revision >= Number(draftRevision) + 3);
    const waitReleased = async (url: string) => {
      const deadline = Date.now() + 6000;
      let status = (await fetch(url)).status;
      while (status !== 404 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        status = (await fetch(url)).status;
      }
      assert.equal(
        status,
        404,
        "Retired draft leases must release their assets",
      );
    };
    await page.route("**/composition/program-asset?*", (route) =>
      route.fulfill({ status: 503, body: "Unavailable" }),
    );
    await page.locator("#reload-source").click();
    await page.waitForFunction(() =>
      document
        .getElementById("error")!
        .textContent!.includes("Asset unavailable"),
    );
    const rejectedAsset = assetRequests.at(-1)!;
    await page.unroute("**/composition/program-asset?*");
    await waitReleased(rejectedAsset);
    assert.equal(
      await page.locator("#document-state").textContent(),
      "Unsaved motion edits",
    );
    await edit("0.4");
    for (const direction of ["undo", "redo"]) {
      await page.locator(`#${direction}`).click();
      await page.waitForFunction(
        () =>
          !document.querySelector<HTMLFieldSetElement>("#inspector-edit")!
            .disabled,
      );
      assert.equal(await page.locator("#error").textContent(), "");
    }
    for (const backend of ["webgl2", "canvas2d"]) {
      await page.locator("#backend").selectOption(backend);
      await page.waitForFunction(
        () =>
          !document.querySelector<HTMLFieldSetElement>("#inspector-edit")!
            .disabled,
      );
      assert.equal(
        await page.locator("#status").getAttribute("data-backend"),
        backend,
      );
      assert.equal(await page.locator("#error").textContent(), "");
      assert.equal(await page.locator("#frame").inputValue(), "4");
    }
    const download = page.waitForEvent("download");
    await page.locator("#export-composition").click();
    const exported = join(root, "retained.mp4");
    await (await download).saveAs(exported);
    await page.waitForFunction(
      () =>
        !document.querySelector<HTMLFieldSetElement>("#inspector-edit")!
          .disabled,
    );
    const independent = join(root, "independent");
    await mkdir(independent);
    await writeFile(join(independent, "art.svg"), originalArt);
    const expected = structuredClone(source);
    (
      expected.layers[0]!.transform!.rotation as {
        keys: { out?: { ease: number; speed: number } }[];
      }
    ).keys[0]!.out = { ease: 0.4, speed: 0 };
    await writeFile(join(independent, "source.json"), JSON.stringify(expected));
    await run(
      process.execPath,
      [
        "--import",
        "tsx",
        "tools/still-shift-cli/src/cli.ts",
        "comp",
        "render",
        "--input",
        join(independent, "source.json"),
        "--output",
        join(independent, "expected.mp4"),
      ],
      { cwd: process.cwd() },
    );
    assert.deepEqual(
      await readFile(exported),
      await readFile(join(independent, "expected.mp4")),
      "Retained export must use the original captured asset bytes",
    );
    await page.locator("#save-document").click();
    await page.waitForFunction(() =>
      document
        .getElementById("error")!
        .textContent!.includes("comp-edit-conflict"),
    );
    await page.locator("#reload-source").click();
    await page.waitForFunction(() =>
      document.getElementById("status")!.textContent!.includes("External 3"),
    );
    await waitReleased(assetRequests[0]!);
    const currentAsset = assetRequests.at(-1)!;
    const otherPage = await browser.newPage(),
      otherAssets: string[] = [];
    otherPage.on("request", (request) => {
      if (new URL(request.url()).pathname === "/composition/program-asset")
        otherAssets.push(request.url());
    });
    await otherPage.goto(app.url);
    await otherPage.waitForFunction(() =>
      document.getElementById("status")!.textContent!.includes("External 3"),
    );
    await otherPage.close();
    await waitReleased(otherAssets.at(-1)!);
    assert.equal(
      (await fetch(currentAsset)).status,
      200,
      "Closing another browser must retain this page's assets",
    );
    console.log(
      "Retained draft: repeated source and asset updates, edit/history/backend ownership, captured MP4 bytes, stale-save conflict, rejected reload, draft retirement and socket cleanup passed",
    );
  } finally {
    await browser?.close();
    await app?.close();
    await rm(root, { recursive: true, force: true });
  }
}
