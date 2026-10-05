import { expect, it } from "vitest";
import {
  CompositionDocument,
  CompositionEditError,
  readJsonPath,
} from "../../apps/lab/src/composition-document.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";

const source = (): Composition => ({
  schemaVersion: "composition-1",
  id: "edit",
  width: 64,
  height: 64,
  fps: 24,
  frameCount: 24,
  assets: [],
  metadata: {
    ownerNote: { preserved: true, keys: [{ frame: 0, value: "opaque" }] },
  },
  layers: [
    {
      id: "box",
      type: "solid",
      size: [8, 8],
      color: "#c06135",
      transform: {
        position: {
          keys: [
            { frame: 0, value: [0, 0], out: { ease: 0.2, speed: [2, 3] } },
            { frame: 23, value: [30, 40] },
          ],
        },
      },
    },
  ],
});
it("retains untouched native data and defaults through proposal, commit, undo, redo and save", () => {
  const raw = source(),
    history = new CompositionDocument(raw);
  const proposal = history.propose("Change grouped speed", (draft) => {
    const handle = readJsonPath(draft, [
      "layers",
      0,
      "transform",
      "position",
      "keys",
      0,
      "out",
    ]) as { speed: number[] };
    handle.speed[0] = 4;
  })!;
  expect(history.document).toEqual(raw);
  expect(history.canUndo).toBe(false);
  expect(proposal.document.metadata).toEqual(raw.metadata);
  expect(proposal.document.layers[0]).not.toHaveProperty("enabled");
  history.commit(proposal);
  expect(
    readJsonPath(history.document, [
      "layers",
      0,
      "transform",
      "position",
      "keys",
      0,
      "out",
      "speed",
    ]),
  ).toEqual([4, 3]);
  expect(history.dirty).toBe(true);
  history.markSaved();
  expect(history.dirty).toBe(false);
  history.commit(history.undo()!);
  expect(history.document).toEqual(raw);
  expect(history.dirty).toBe(true);
  history.commit(history.redo()!);
  expect(history.dirty).toBe(false);
  expect(() => {
    history.document.layers[0]!.id = "changed";
  }).toThrow(TypeError);
});
it("rejects invalid proposals atomically and preserves redo after a rejected edit", () => {
  const history = new CompositionDocument(source());
  history.commit(
    history.propose("Opacity", (draft) => {
      draft.layers[0]!.transform!.opacity = 0.5;
    })!,
  );
  history.commit(history.undo()!);
  expect(() =>
    history.propose("Invalid", (draft) => {
      draft.layers[0]!.transform!.opacity = 2;
    }),
  ).toThrow(CompositionEditError);
  expect(history.canRedo).toBe(true);
  expect(history.dirty).toBe(false);
  expect(history.propose("No change", () => {})).toBeUndefined();
  expect(() => readJsonPath(history.document, ["constructor"])).toThrow(
    CompositionEditError,
  );
});
it("rejects stale and foreign proposals, and clears redo after a new accepted branch", () => {
  const history = new CompositionDocument(source()),
    foreign = new CompositionDocument(source());
  const first = history.propose("First", (d) => {
      d.layers[0]!.name = "First";
    })!,
    late = history.propose("Late", (d) => {
      d.layers[0]!.name = "Late";
    })!;
  expect(() => foreign.commit(first)).toThrow(/superseded/);
  history.commit(first);
  expect(() => history.commit(late)).toThrow(/superseded/);
  history.commit(history.undo()!);
  history.commit(
    history.propose("Branch", (d) => {
      d.layers[0]!.name = "Branch";
    })!,
  );
  expect(history.canRedo).toBe(false);
});
it("bounds retained entries and serialized bytes while keeping the accepted document", () => {
  const history = new CompositionDocument(source(), { entries: 3 });
  for (const name of ["One", "Two", "Three", "Four"])
    history.commit(
      history.propose(name, (d) => {
        d.layers[0]!.name = name;
      })!,
    );
  history.commit(history.undo()!);
  history.commit(history.undo()!);
  expect(history.document.layers[0]!.name).toBe("Two");
  expect(history.canUndo).toBe(false);
  expect(() => new CompositionDocument(source(), { bytes: 10 })).toThrow(
    /budget/,
  );
});
