import {
  validateComposition,
  type Composition,
  type CompositionDiagnostic,
} from "../../../packages/scene-contract/src/index.ts";

export type JsonPath = readonly (string | number)[];
export class CompositionEditError extends Error {
  constructor(readonly diagnostics: CompositionDiagnostic[]) {
    super(
      diagnostics.map((d) => `${d.code} ${d.path}: ${d.message}`).join("\n"),
    );
    this.name = "CompositionEditError";
  }
}
function fail(code: string, message: string): never {
  throw new CompositionEditError([
    { code, message, path: "document", severity: "error" },
  ]);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function validated(value: Composition) {
  const result = validateComposition(value);
  if (!result.ok) throw new CompositionEditError(result.diagnostics);
  // Validation may add defaults; the original document remains the editable data.
  return freeze(value);
}
export function readJsonPath(value: unknown, path: JsonPath): unknown {
  for (const part of path) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part))
      fail(
        "comp-inspector-path",
        "The selected native property no longer exists",
      );
    value = (value as Record<string | number, unknown>)[part];
  }
  return value;
}
export type DocumentProposal = Readonly<{
  document: Composition;
  label: string;
  version: number;
  kind: "edit" | "undo" | "redo";
  index: number;
}>;
type Entry = {
  document: Composition;
  label: string;
  serialized: string;
  bytes: number;
};

/** Accepted documents stay immutable; proposals enter history only after preview accepts them. */
export class CompositionDocument {
  private entries: Entry[];
  private cursor = 0;
  private generation = 0;
  private saved: string;
  private proposals = new WeakSet<object>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  constructor(
    document: Composition,
    limits: { entries?: number; bytes?: number } = {},
  ) {
    this.maxEntries = limits.entries ?? 64;
    this.maxBytes = limits.bytes ?? 16 * 1024 * 1024;
    if (
      !Number.isInteger(this.maxEntries) ||
      this.maxEntries < 2 ||
      !Number.isSafeInteger(this.maxBytes) ||
      this.maxBytes < 1
    )
      fail(
        "comp-inspector-limit",
        "History needs at least two entries and a positive serialized-byte budget",
      );
    const initial = this.entry(structuredClone(document), "Loaded source");
    this.entries = [initial];
    this.saved = initial.serialized;
  }
  private entry(document: Composition, label: string): Entry {
    const serialized = JSON.stringify(document),
      bytes = new TextEncoder().encode(serialized).byteLength;
    if (bytes > this.maxBytes)
      fail(
        "comp-inspector-limit",
        "Document exceeds the editable history's serialized-byte budget",
      );
    return { document: validated(document), label, serialized, bytes };
  }
  get document() {
    return this.entries[this.cursor]!.document;
  }
  get version() {
    return this.generation;
  }
  get dirty() {
    return this.entries[this.cursor]!.serialized !== this.saved;
  }
  get canUndo() {
    return this.cursor > 0;
  }
  get canRedo() {
    return this.cursor < this.entries.length - 1;
  }
  get label() {
    return this.entries[this.cursor]!.label;
  }
  private proposal(
    document: Composition,
    label: string,
    kind: DocumentProposal["kind"],
    index: number,
  ): DocumentProposal {
    const proposal = Object.freeze({
      document,
      label,
      kind,
      index,
      version: this.generation,
    });
    this.proposals.add(proposal);
    return proposal;
  }
  propose(
    label: string,
    edit: (draft: Composition) => void,
  ): DocumentProposal | undefined {
    const draft = structuredClone(this.document);
    edit(draft);
    const candidate = this.entry(draft, label);
    if (candidate.serialized === this.entries[this.cursor]!.serialized)
      return undefined;
    return this.proposal(candidate.document, label, "edit", this.cursor + 1);
  }
  undo(): DocumentProposal | undefined {
    if (!this.canUndo) return;
    const index = this.cursor - 1,
      entry = this.entries[index]!;
    return this.proposal(entry.document, `Undo ${this.label}`, "undo", index);
  }
  redo(): DocumentProposal | undefined {
    if (!this.canRedo) return;
    const index = this.cursor + 1,
      entry = this.entries[index]!;
    return this.proposal(entry.document, `Redo ${entry.label}`, "redo", index);
  }
  accepts(proposal: DocumentProposal) {
    return this.proposals.has(proposal) && proposal.version === this.generation;
  }
  commit(proposal: DocumentProposal) {
    if (!this.accepts(proposal))
      fail(
        "comp-inspector-stale",
        "A newer accepted edit superseded this proposal",
      );
    if (proposal.kind === "edit") {
      this.entries.splice(this.cursor + 1);
      this.entries.push(this.entry(proposal.document, proposal.label));
      this.cursor = this.entries.length - 1;
      let bytes = this.entries.reduce((sum, entry) => sum + entry.bytes, 0);
      while (this.entries.length > this.maxEntries || bytes > this.maxBytes) {
        bytes -= this.entries.shift()!.bytes;
        this.cursor--;
      }
    } else this.cursor = proposal.index;
    this.generation++;
    return this.document;
  }
  markSaved() {
    this.saved = this.entries[this.cursor]!.serialized;
  }
}
