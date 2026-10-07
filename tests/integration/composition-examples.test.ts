import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { readCompositionSource } from "@still-shift/animation-engine";
import { PassageCompositionBindingsSchema } from "@still-shift/scene-contract";
import { loadProgram } from "../../tools/still-shift-cli/src/composition/program.ts";
import { withProgramFile } from "../../tools/still-shift-cli/src/composition/files.ts";
it("all eleven small programs compile and validate their pinned assets", async () => {
  const root = resolve("examples/composition"),
    files = (await readdir(root)).filter((file) => /^\d\d-.*\.ts$/.test(file));
  expect(files).toHaveLength(11);
  for (const file of files) {
    const input = resolve(root, file),
      program = await loadProgram(input);
    const source = await withProgramFile(program, input, readCompositionSource);
    expect(source.composition.layers.length).toBeGreaterThan(0);
    expect(source.systemFontLayers).toEqual([]);
    if (file.startsWith("08-"))
      expect(
        PassageCompositionBindingsSchema.parse(
          program.composition.metadata?.passage,
        ).subjectLayers.subject,
      ).toBe("picture/subject");
  }
}, 10000);
