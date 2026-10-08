import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";

/** Resolve original filenames for authorization and decoding with the same bounded pattern. */
export function compositionSequenceFramePath(
  source: string,
  frameNumber: number,
) {
  const pattern = /^(.*)%0([1-9]\d?)d(.*\.png)$/.exec(source);
  if (
    !pattern ||
    source.match(/%/g)?.length !== 1 ||
    !Number.isSafeInteger(frameNumber) ||
    frameNumber < 0
  )
    passageError(
      "comp-media-format",
      "Sequence requires one bounded numbered PNG pattern and an integer original frame",
      { path: source },
    );
  return (
    pattern[1]! +
    String(frameNumber).padStart(Number(pattern[2]), "0") +
    pattern[3]!
  );
}
