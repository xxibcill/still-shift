type BodyLimit = {
  maxBytes: number;
  limitMessage: string;
};

export async function readJsonBody(
  body: AsyncIterable<Uint8Array>,
  { maxBytes, limitMessage }: BodyLimit,
): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error(limitMessage);
    chunks.push(chunk);
  }
  // Decode once so UTF-8 characters remain intact across network chunks.
  return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
}
