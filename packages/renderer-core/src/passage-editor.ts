import {
  parsePassagePlan,
  type PassagePlan,
} from "../../scene-contract/src/story-authoring.ts";
import { compileStoryPassage } from "./story-passage.ts";
import type { PassageTemplate } from "./story-template.ts";

/** Edits commit only after successful compilation; failed drafts never enter history. */
export function createPassageEditor(
  input: unknown,
  templates: ReadonlyMap<string, PassageTemplate>,
) {
  let passage = compileStoryPassage(input, templates);
  const undo: PassagePlan[] = [],
    redo: PassagePlan[] = [];
  return {
    get passage() {
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
      const next = compileStoryPassage(parsePassagePlan(draft), templates);
      undo.push(passage.plan);
      if (undo.length > 100) undo.shift();
      redo.length = 0;
      passage = next;
      return passage;
    },
    undo() {
      const previous = undo.at(-1);
      if (!previous) return passage;
      const next = compileStoryPassage(previous, templates);
      undo.pop();
      redo.push(passage.plan);
      passage = next;
      return passage;
    },
    redo() {
      const following = redo.at(-1);
      if (!following) return passage;
      const next = compileStoryPassage(following, templates);
      redo.pop();
      undo.push(passage.plan);
      passage = next;
      return passage;
    },
  };
}
