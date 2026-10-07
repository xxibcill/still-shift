import type {
  RenderGraph,
  RenderOp,
  TextContent,
  ProviderContent,
} from "./graph.ts";

/** Visit all evaluated local sources before requesting parent cache leases. */
export function prepareGraphSources(
  graph: RenderGraph,
  text: (content: TextContent) => void,
  provider: (content: ProviderContent) => void,
) {
  const visited = new Set<RenderOp[]>(),
    active = new Set<RenderOp[]>();
  const visit = (ops: RenderOp[]) => {
    if (active.has(ops))
      throw Error("Composition source operation dependency cycle");
    if (visited.has(ops)) return;
    active.add(ops);
    try {
      for (const op of ops) {
        if (op.kind === "draw") {
          if (op.content.type === "text") text(op.content);
          else if (op.content.type === "provider") provider(op.content);
          else if (op.content.type === "surface") visit(op.content.surface.ops);
          continue;
        }
        if (op.kind === "project") visit(op.surface.ops);
        if (op.kind === "isolate") visit(op.ops);
        if (op.kind === "adjust")
          for (const sample of op.history ?? []) visit(sample.ops);
        for (const effect of op.effects)
          for (const input of Object.values(effect.layerInputs ?? {}))
            visit(input);
        if (op.matte) visit(op.matte.ops);
      }
      visited.add(ops);
    } finally {
      active.delete(ops);
    }
  };
  visit(graph.root.ops);
}
