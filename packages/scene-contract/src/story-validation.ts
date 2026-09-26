import type { PreparedNode } from "./prepared.ts";
import type { StoryScene, StoryWindow } from "./story.ts";

export function validateStoryBindings(
  scene: StoryScene,
  nodes: Map<string, PreparedNode>,
  fail: (message: string) => void,
) {
  const node = (id: string, type?: PreparedNode["type"]) => {
    const value = nodes.get(id);
    if (!value || (type && value.type !== type))
      fail(`Story requires ${type ?? "node"} ${id}`);
    return value;
  };
  const distinct = (ids: string[]) => {
    if (new Set(ids).size !== ids.length)
      fail("Story roles must bind distinct nodes");
    ids.forEach((id) => node(id));
  };
  const within = (frame: number) => {
    if (frame >= scene.frameCount)
      fail("Event frame must be inside the rendered timeline");
  };
  const window = (value: StoryWindow) => {
    within(value.start);
    within(value.end);
  };
  const ancestors = (id: string) => {
    const found = new Set<string>();
    let current = nodes.get(id);
    while (current && !found.has(current.id)) {
      found.add(current.id);
      current = current.parent ? nodes.get(current.parent) : undefined;
    }
    return found;
  };
  const visible = (id: string) => {
    node(id);
    for (const parent of ancestors(id))
      if (nodes.get(parent)!.opacity < 1)
        fail(`Persistent context must be fully visible: ${id}`);
  };
  const separate = (ids: string[]) => {
    distinct(ids);
    for (const id of ids)
      if (ids.some((other) => other !== id && ancestors(id).has(other)))
        fail("Independently animated roles cannot contain each other");
  };
  const recipe = scene.recipe;
  const persistent: string[] = [];
  switch (recipe.preset) {
    case "unequal_margins": {
      separate([
        ...recipe.households,
        recipe.reference,
        ...recipe.pressures.map((p) => p.node),
        ...recipe.labels,
      ]);
      recipe.labels.forEach((id) => node(id, "text"));
      const [a, b] = recipe.households.map((id) => node(id));
      if (
        a &&
        b &&
        (a.width !== b.width ||
          a.height !== b.height ||
          a.y + a.height !== b.y + b.height ||
          a.parent !== b.parent)
      )
        fail(
          "Households must share visual dimensions, ground baseline and coordinate space",
        );
      if (recipe.pressures[0].condition === recipe.pressures[1].condition)
        fail("Comparison needs different qualitative conditions");
      for (const pressure of recipe.pressures) {
        const part = node(pressure.node);
        if (part && part.x === pressure.to[0] && part.y === pressure.to[1])
          fail("Pressure must visibly move");
      }
      persistent.push(...recipe.households, recipe.reference);
      window(recipe.strain);
      for (const labelWindow of recipe.labelWindows ?? []) {
        window(labelWindow);
        if (labelWindow.start < recipe.strain.start)
          fail("Consequence labels must follow the start of strain");
      }
      break;
    }
    case "access_constraint": {
      separate([recipe.source, ...recipe.connections, ...recipe.sides]);
      recipe.connections.forEach((id) => node(id, "path"));
      const route = node(recipe.route, "path");
      const sides = recipe.sides.map((id) => node(id));
      for (const side of sides) {
        if (
          side &&
          side.type !== "rect" &&
          !(side.type === "group" && side.clip)
        )
          fail(
            "Restriction sides require rectangles or clipped illustration groups",
          );
        if (side && (side.width <= 0 || side.height <= 0))
          fail("Restriction sides need positive bounds");
      }
      if (!recipe.connections.includes(recipe.route))
        fail("Restricted route must be one of the connections");
      if (route?.type === "path") {
        if (route.endArrow)
          fail("A restricted route must remain an unmarked open connection");
        if (route.points.length !== 2 || route.rotation !== 0)
          fail("Restriction requires a straight unrotated local route");
        if (recipe.constrainedWidth <= route.lineWidth + 2 * recipe.clearance)
          fail("Narrowed corridor must remain visibly open");
        if (
          sides.some(
            (side) =>
              side &&
              (side.parent !== route.parent ||
                side.origin[0] !== 0.5 ||
                side.origin[1] !== 0.5),
          )
        )
          fail("Restriction sides must share route space and centered origins");
      }
      if (recipe.constrainedWidth >= recipe.openWidth)
        fail("Constraint must narrow the opening");
      if (recipe.narrow.start < recipe.reveal.end)
        fail("Connections must be revealed before narrowing");
      window(recipe.reveal);
      window(recipe.narrow);
      persistent.push(recipe.source);
      break;
    }
    case "relationship_build":
      separate([
        recipe.anchor,
        ...recipe.branches.flatMap((b) => [b.path, b.destination]),
      ]);
      recipe.branches.forEach((branch) => {
        node(branch.path, "path");
        window(branch.window);
        if (branch.arrival) {
          window(branch.arrival);
          if (branch.arrival.start < branch.window.start)
            fail("A destination arrival must follow its connection reveal");
        }
        visible(branch.path);
        visible(branch.destination);
      });
      persistent.push(recipe.anchor);
      break;
    case "evidence_boundary": {
      separate([
        recipe.boundary,
        recipe.qualifier,
        recipe.unknown.node,
        recipe.composite.node,
        ...recipe.supported.map((e) => e.node),
      ]);
      node(recipe.qualifier, "text");
      for (const event of [
        ...recipe.supported,
        recipe.unknown,
        recipe.composite,
      ])
        window(event.window);
      for (const event of [
        ...recipe.supported,
        recipe.unknown,
        recipe.composite,
      ])
        visible(event.node);
      if (
        recipe.unknown.window.start <
          Math.max(...recipe.supported.map((e) => e.window.end)) ||
        recipe.composite.window.start < recipe.unknown.window.end
      )
        fail("Evidence must establish support before unknowns and comparison");
      persistent.push(recipe.qualifier, recipe.boundary);
      break;
    }
    case "dated_system_break": {
      node(recipe.system, "group");
      node(recipe.context, "text");
      distinct(recipe.breaks.map((b) => b.path));
      visible(recipe.system);
      visible(recipe.context);
      if (!ancestors(recipe.context).has(recipe.system))
        fail("Context must belong to the crisis system");
      within(recipe.contextReadyFrame);
      let previousEnd = recipe.contextReadyFrame;
      for (const event of recipe.breaks) {
        node(event.path, "path");
        window(event.window);
        if (!ancestors(event.path).has(recipe.system))
          fail("Break paths must belong to the dated system");
        if (event.window.start < previousEnd)
          fail(
            "Breaks must follow readable context and ordered preceding breaks",
          );
        previousEnd = event.window.end;
      }
      if (recipe.reset) {
        const reset = recipe.reset;
        within(reset.atFrame);
        node(reset.group, "group");
        node(reset.context, "text");
        separate([recipe.system, reset.group]);
        visible(reset.group);
        visible(reset.context);
        if (
          reset.atFrame <= previousEnd ||
          reset.contextId === recipe.contextId
        )
          fail("Reset needs a later frame and distinct historical context");
        if (!ancestors(reset.context).has(reset.group))
          fail("Reset context must belong to its separate group");
      }
      break;
    }
    case "category_swap": {
      separate([
        recipe.subject,
        recipe.qualifier,
        ...recipe.stableAnchors,
        ...(recipe.stateLabels ?? []),
      ]);
      node(recipe.qualifier, "text");
      const subject = node(recipe.subject, "image");
      for (const id of recipe.stateLabels ?? []) {
        const label = node(id, "text");
        if (
          label?.type === "text" &&
          (!label.states ||
            recipe.fromState >= label.states.length ||
            recipe.toState >= label.states.length)
        )
          fail("Category caption references a missing authored state");
        persistent.push(id);
      }
      if (
        subject?.type === "image" &&
        (recipe.fromState >= subject.states.length ||
          recipe.toState >= subject.states.length)
      )
        fail("Category references a missing authored state");
      if (recipe.fromState === recipe.toState)
        fail("Category swap needs distinct states");
      within(recipe.swapFrame);
      persistent.push(
        recipe.subject,
        recipe.qualifier,
        ...recipe.stableAnchors,
      );
      break;
    }
    case "motif_resolve":
      separate([...recipe.motifs, recipe.outgoing, recipe.qualifier]);
      node(recipe.outgoing, "path");
      node(recipe.qualifier, "text");
      if (recipe.moves.some((move) => !recipe.motifs.includes(move.node)))
        fail("Resolve moves must refer to declared motifs");
      if (
        recipe.resolve.start <
        Math.max(...recipe.moves.map((move) => move.window.end))
      )
        fail("Resolve follows the motif regrouping");
      window(recipe.resolve);
      persistent.push(recipe.qualifier);
      break;
  }
  persistent.forEach(visible);
  if ("moves" in recipe) {
    for (const move of recipe.moves) {
      node(move.node);
      window(move.window);
      if (persistent.some((id) => ancestors(id).has(move.node)))
        fail("Persistent anchors/context cannot move");
    }
    for (const event of recipe.emphasis) {
      node(event.node);
      window(event.window);
      if (persistent.some((id) => ancestors(id).has(event.node)))
        fail("Persistent context cannot change emphasis");
    }
  }
  const connected = new Set<string>();
  for (const binding of scene.connectors) {
    const path = node(binding.path, "path");
    if (connected.has(binding.path)) fail("Connector bindings must be unique");
    connected.add(binding.path);
    if (
      path &&
      (path.parent || path.x !== 0 || path.y !== 0 || path.rotation !== 0)
    )
      fail("Bound connectors must use root coordinates without transforms");
    for (const end of [binding.from, binding.to]) {
      const target = node(end.node);
      if (target?.type === "path")
        fail("Connector anchors must refer to objects, not paths");
      if (
        target &&
        (end.point[0] < 0 ||
          end.point[1] < 0 ||
          end.point[0] > target.width ||
          end.point[1] > target.height)
      )
        fail("Connector anchor exceeds object bounds");
    }
    if (recipe.preset === "access_constraint")
      fail("Access constraint uses fixed local routes, not bound connectors");
    if (
      "moves" in recipe &&
      recipe.moves.some((move) => move.node === binding.path)
    )
      fail("Bound connector geometry cannot also have transform events");
  }
}
