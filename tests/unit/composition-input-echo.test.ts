import { expect, it } from "vitest";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import {
  inputEchoComposition as fixture,
  inputEchoEffects as echo,
  type InputEchoSourceKind as SourceKind,
} from "../helpers/composition-input-echo-fixture.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import {
  buildRenderGraph,
  type DrawOp,
  type IsolateOp,
  type RenderOp,
} from "../../packages/renderer-core/src/composition/render/graph.ts";

function captured(comp: Composition, frame = 8): RenderOp[] {
  const owner = buildRenderGraph(comp, evaluateComp(comp, frame)).root.ops.find(
    (op) => op.layer === "owner",
  ) as IsolateOp;
  return owner.effects[0]!.layerInputs!.map!;
}
function positions(ops: RenderOp[]): number[] {
  return ops.flatMap((op) => {
    if (op.kind === "isolate") return positions(op.ops);
    if (op.kind !== "draw") return [];
    return op.content.type === "surface"
      ? positions(op.content.surface.ops)
      : [op.matrix[4]];
  });
}

it.each<SourceKind>(["solid", "group", "precomp", "collapsed"])(
  "retains the hidden %s source's own echo and random-access identity",
  (kind) => {
    const comp = fixture(kind);
    expect(validateComposition(comp).ok).toBe(true);
    const hidden = captured(comp);
    expect(positions(hidden)).toEqual([16, 24, 32]);
    comp.layers.find((layer) => layer.id === "source")!.enabled = true;
    expect(captured(comp)).toEqual(hidden);
    for (const frame of [11, 0, 8])
      buildRenderGraph(comp, evaluateComp(comp, frame));
    expect(captured(comp)).toEqual(hidden);
  },
);
it("retains child echoes inside a captured hidden group", () => {
  const comp = fixture("group");
  comp.layers.find((layer) => layer.id === "source")!.effects = [];
  comp.layers.find((layer) => layer.id === "art")!.effects = echo();
  expect(positions(captured(comp))).toEqual([16, 24, 32]);
});
it.each<SourceKind>(["solid", "group", "precomp", "collapsed"])(
  "respects the hidden %s source's historical in point",
  (kind) => {
    const comp = fixture(kind);
    comp.layers.find((layer) => layer.id === "source")!.inPoint = 5;
    expect(positions(captured(comp))).toEqual([24, 32]);
  },
);
it("retains descendant visibility and historical windows inside captured groups", () => {
  const comp = fixture("group"),
    art = comp.layers.find((layer) => layer.id === "art")!;
  art.inPoint = 5;
  expect(positions(captured(comp))).toEqual([24, 32]);
  art.enabled = false;
  expect(positions(captured(comp))).toEqual([]);
});
it.each(["guide", "solo"])(
  "retains captured source echoes hidden by %s selection",
  (selection) => {
    const comp = fixture("group");
    comp.layers.find((layer) => layer.id === "source")!.enabled = true;
    if (selection === "guide")
      comp.layers.find((layer) => layer.id === "source")!.guide = true;
    else comp.layers[0]!.solo = true;
    expect(positions(captured(comp))).toEqual([16, 24, 32]);
  },
);
it("keeps descendant out points and inactive source windows", () => {
  const comp = fixture("group");
  comp.layers.find((layer) => layer.id === "art")!.outPoint = 5;
  expect(positions(captured(comp))).toEqual([16]);
  comp.layers.find((layer) => layer.id === "source")!.outPoint = 7;
  expect(positions(captured(comp))).toEqual([]);
});
it("samples captured source echoes in a remapped precomp scope", () => {
  const comp = fixture("solid"),
    layers = comp.layers;
  comp.layers = [
    {
      id: "wrapper",
      type: "precomp",
      comp: "scope",
      timeRemap: 8,
      transform: { anchor: [0, 0] },
    },
  ];
  comp.precomps = [
    { id: "scope", width: 64, height: 32, frameCount: 12, layers },
  ];
  const outer = buildRenderGraph(comp, evaluateComp(comp, 3)).root
    .ops[0] as DrawOp;
  if (outer.content.type !== "surface") throw Error("Expected precomp surface");
  const owner = outer.content.surface.ops.find(
    (op) => op.layer === "wrapper/owner",
  ) as IsolateOp;
  expect(positions(owner.effects[0]!.layerInputs!.map!)).toEqual([16, 24, 32]);
});
