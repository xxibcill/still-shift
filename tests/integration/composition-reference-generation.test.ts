import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { generateCompositionReference } from "../../scripts/generate-composition-reference.ts";
it("generates both authoring artifacts and detects drift without writing during checks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "composition-reference-"));
  try {
    await mkdir(join(directory, "docs"));
    const notes = join(directory, "docs/composition-reference-notes.md");
    await writeFile(notes, "# Contract notes\n\nA maintained convention.\n");
    await generateCompositionReference(directory);
    await generateCompositionReference(directory, true);
    const skill = join(directory, "skills/compose-with-still-shift/SKILL.md"),
      reference = join(directory, "docs/composition-reference.md");
    const original = await readFile(skill, "utf8");
    expect(original).toBe(
      await readFile(
        resolve("skills/compose-with-still-shift/SKILL.md"),
        "utf8",
      ),
    );
    await writeFile(skill, original + "\nStale local edit.\n");
    await expect(generateCompositionReference(directory, true)).rejects.toThrow(
      "skills/compose-with-still-shift/SKILL.md",
    );
    expect(await readFile(skill, "utf8")).toBe(
      original + "\nStale local edit.\n",
    );
    await generateCompositionReference(directory);
    const before = await readFile(reference, "utf8");
    await writeFile(notes, "# Contract notes\n\nA changed convention.\n");
    await expect(generateCompositionReference(directory, true)).rejects.toThrow(
      "docs/composition-reference.md",
    );
    expect(await readFile(reference, "utf8")).toBe(before);
    await generateCompositionReference(directory);
    await generateCompositionReference(directory, true);
    expect(await readFile(reference, "utf8")).not.toBe(before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
