import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { loadProgram } from "../../tools/still-shift-cli/src/composition/program.ts";
import {
  saveCompositionDocument,
  sourceHash,
} from "../../tools/still-shift-cli/src/composition/save.ts";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";
const source: Composition = {
  schemaVersion: "composition-1",
  id: "save",
  width: 64,
  height: 64,
  fps: 24,
  frameCount: 24,
  assets: [],
  metadata: { untouched: { nested: [1, 2, 3] } },
  layers: [
    {
      id: "box",
      type: "solid",
      size: [8, 8],
      color: "#ffffff",
      transform: {
        opacity: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 23, value: 1 },
          ],
        },
      },
    },
  ],
};
it("keeps source bytes for no-op saves, raw fields for edited saves and rejects external conflicts", async () => {
  const root = await mkdtemp(join(tmpdir(), "composition-save-")),
    input = join(root, "source.json");
  const text = " \n" + JSON.stringify(source) + "\n\n";
  try {
    await writeFile(input, text, { mode: 0o640 });
    const loaded = await loadProgram(input);
    expect(loaded.document).toEqual(source);
    expect(loaded.sourceSha256).toBe(sourceHash(Buffer.from(text)));
    expect(
      await saveCompositionDocument(
        input,
        source,
        loaded.sourceSha256!,
        source,
      ),
    ).toMatchObject({ unchanged: true });
    expect(await readFile(input, "utf8")).toBe(text);
    const changed = structuredClone(source);
    changed.name = "Edited";
    const saved = await saveCompositionDocument(
      input,
      source,
      loaded.sourceSha256!,
      changed,
    );
    expect(JSON.parse(await readFile(input, "utf8"))).toEqual(changed);
    expect((await stat(input)).mode & 0o777).toBe(0o640);
    expect(changed.layers[0]).not.toHaveProperty("enabled");
    await writeFile(input, text);
    await expect(
      saveCompositionDocument(input, changed, saved.sourceSha256, changed),
    ).rejects.toMatchObject({ status: 409 });
    expect(await readFile(input, "utf8")).toBe(text);
    await expect(
      saveCompositionDocument(input, source, loaded.sourceSha256!, {
        ...source,
        fps: 13,
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      saveCompositionDocument(input, source, loaded.sourceSha256!, {
        ...source,
        assets: [
          {
            id: "escape",
            type: "image",
            path: "/etc/passwd",
            width: 1,
            height: 1,
            sha256: `sha256:${"0".repeat(64)}`,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "comp-edit-assets" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("saves only the fixed JSON input through the local API and serializes conflicting requests", async () => {
  const root = await mkdtemp(join(tmpdir(), "composition-save-api-")),
    input = join(root, "source.json");
  await writeFile(input, JSON.stringify(source));
  const app = await createProgramPreview(input);
  try {
    const endpoint = new URL("/composition/program-save", app.url),
      snapshot = app.snapshot()!,
      edited = structuredClone(source);
    edited.name = "Saved through API";
    const body = JSON.stringify({
      revision: snapshot.revision,
      sourceSha256: snapshot.sourceSha256,
      document: edited,
    });
    expect((await fetch(endpoint, { method: "POST", body })).status).toBe(403);
    expect(
      (
        await fetch(endpoint, {
          method: "POST",
          headers: {
            "x-still-shift-composition": "1",
            origin: "https://elsewhere.example",
          },
          body,
        })
      ).status,
    ).toBe(403);
    const replies = await Promise.all(
      [1, 2].map(() =>
        fetch(endpoint, {
          method: "POST",
          headers: { "x-still-shift-composition": "1" },
          body,
        }),
      ),
    );
    expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(JSON.parse(await readFile(input, "utf8"))).toEqual(edited);
    expect(app.snapshot()!.document).toEqual(edited);
    expect(app.snapshot()!.revision).toBe(snapshot.revision + 1);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("builder preview rejects save without modifying source", async () => {
  const root = await mkdtemp(join(tmpdir(), "composition-readonly-")),
    input = join(root, "source.ts"),
    text = `export default ${JSON.stringify(source)};`;
  await writeFile(input, text);
  const app = await createProgramPreview(input);
  try {
    expect(app.snapshot()!.source).toBe("builder");
    expect(app.snapshot()).not.toHaveProperty("document");
    const response = await fetch(
      new URL("/composition/program-save", app.url),
      {
        method: "POST",
        headers: { "x-still-shift-composition": "1" },
        body: JSON.stringify({ document: source }),
      },
    );
    expect(response.status).toBe(403);
    expect(await readFile(input, "utf8")).toBe(text);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
