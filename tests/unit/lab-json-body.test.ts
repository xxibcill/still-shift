import { describe, expect, it } from "vitest";
import { readJsonBody } from "../../apps/lab/json-body.ts";

async function* chunks(...values: Buffer[]) {
  yield* values;
}

const limits = { maxBytes: 100, limitMessage: "Import exceeds its limit" };

describe("Lab JSON request bodies", () => {
  it("preserves UTF-8 characters split across network chunks", async () => {
    const payload = { title: "ภาษาไทย — 🎬" };
    const bytes = Buffer.from(JSON.stringify(payload));
    const body = chunks(...Array.from(bytes, (byte) => Buffer.from([byte])));

    await expect(readJsonBody(body, limits)).resolves.toEqual(payload);
  });

  it("accepts a body exactly at the byte limit", async () => {
    const bytes = Buffer.from('{"title":"ไทย"}');
    await expect(
      readJsonBody(chunks(bytes), { ...limits, maxBytes: bytes.length }),
    ).resolves.toEqual({ title: "ไทย" });
  });

  it("counts bytes rather than JavaScript characters", async () => {
    const json = '{"title":"ไทย"}';
    await expect(
      readJsonBody(chunks(Buffer.from(json)), {
        ...limits,
        maxBytes: json.length,
      }),
    ).rejects.toThrow(limits.limitMessage);
  });

  it("stops consuming the upload as soon as its aggregate limit is exceeded", async () => {
    let consumed = 0;
    async function* body() {
      for (const bytes of [
        Buffer.from("[1,"),
        Buffer.from("2,"),
        Buffer.from("3]"),
      ]) {
        consumed++;
        yield bytes;
      }
    }
    await expect(
      readJsonBody(body(), { ...limits, maxBytes: 4 }),
    ).rejects.toThrow(limits.limitMessage);
    expect(consumed).toBe(2);
  });

  it.each(["", '{"title":'])("rejects invalid JSON: %j", async (json) => {
    await expect(
      readJsonBody(chunks(Buffer.from(json)), limits),
    ).rejects.toThrow(SyntaxError);
  });

  it("propagates interrupted uploads instead of parsing partial data", async () => {
    const failure = new Error("Client disconnected");
    async function* interrupted() {
      yield Buffer.from('{"title":');
      throw failure;
    }
    await expect(readJsonBody(interrupted(), limits)).rejects.toBe(failure);
  });
});
