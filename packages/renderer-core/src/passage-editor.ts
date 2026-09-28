import {
  parsePassagePlan,
  type PassagePlan,
} from "../../scene-contract/src/story-authoring.ts";
import { compileStoryPassage } from "./story-passage.ts";
import type { PassageTemplate } from "./story-template.ts";
import type { OutputFormat } from "../../scene-contract/src/output-format.ts";

/** Edits commit only after successful compilation; failed drafts never enter history. */
export function createPassageEditor(
  input: unknown,
  templates: ReadonlyMap<string, PassageTemplate>,
  options: { format?: OutputFormat } = {},
) {
  let format = options.format ?? "landscape";
  let passage = compileStoryPassage(input, templates, { format });
  const undo: PassagePlan[] = [],
    redo: PassagePlan[] = [];
  return {
    get passage() {
      return passage;
    },
    get format() {
      return format;
    },
    setFormat(next: OutputFormat) {
      const resolved = compileStoryPassage(passage.plan, templates, {
        format: next,
      });
      passage = resolved;
      format = next;
      return passage;
    },
    get canUndo() {
      return undo.length > 0;
    },
    get canRedo() {
      return redo.length > 0;
    },
    edit(change: (draft: PassagePlan) => void) {
      const draft = structuredClone(passage.plan);
      change(draft);
      const next = compileStoryPassage(parsePassagePlan(draft), templates, {
        format,
      });
      undo.push(passage.plan);
      if (undo.length > 100) undo.shift();
      redo.length = 0;
      passage = next;
      return passage;
    },
    undo() {
      const previous = undo.at(-1);
      if (!previous) return passage;
      const next = compileStoryPassage(previous, templates, { format });
      undo.pop();
      redo.push(passage.plan);
      passage = next;
      return passage;
    },
    redo() {
      const following = redo.at(-1);
      if (!following) return passage;
      const next = compileStoryPassage(following, templates, { format });
      redo.pop();
      undo.push(passage.plan);
      passage = next;
      return passage;
    },
  };
}
