import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";
import { createNativePbrCompositionFixture } from "../helpers/native-pbr-composition-fixture.ts";

const sessions: Awaited<ReturnType<typeof createProgramPreview>>[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

it("serves exact opaque PBR bytes for original and edited preview captures", async () => {
  const { directory } = await createNativePbrCompositionFixture();
  directories.push(directory);
  const session = await createProgramPreview(
    join(directory, "composition.json"),
    { watch: false },
  );
  sessions.push(session);
  const snapshot = session.snapshot()!;
  const base = new URL(session.url).origin;
  const resources = Object.entries(snapshot.assets).filter(([id]) =>
    id.startsWith("native-pbr/"),
  );
  expect(resources).toHaveLength(1);
  const [id, url] = resources[0]!;
  const expected = await readFile(join(directory, "surface.rgba"));
  const check = async (path: string) => {
    const response = await fetch(base + path);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    expect(response.headers.get("content-length")).toBe(
      String(expected.length),
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(expected);
  };
  await check(url);
  const document = structuredClone(snapshot.document!);
  document.layers[0]!.name = "edited native preview";
  const capture = randomUUID();
  const response = await fetch(base + "/composition/program-prepare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-still-shift-composition": "1",
    },
    body: JSON.stringify({ revision: snapshot.revision, capture, document }),
  });
  expect(response.status).toBe(200);
  const prepared = (await response.json()) as {
    assets: Record<string, string>;
  };
  await check(prepared.assets[id]!);
  for (const wrong of [
    url.replace("revision=1", "revision=999"),
    prepared.assets[id]!.replace(capture, randomUUID()),
    url.replace(
      encodeURIComponent(id),
      encodeURIComponent("native-pbr/" + "0".repeat(64)),
    ),
  ])
    expect((await fetch(base + wrong)).status).toBe(404);
  const released = await fetch(base + "/composition/program-capture-release", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-still-shift-composition": "1",
    },
    body: JSON.stringify({ revision: snapshot.revision, capture }),
  });
  expect(released.ok).toBe(true);
  expect((await fetch(base + prepared.assets[id]!)).status).toBe(404);
  await check(url);
}, 20000);
