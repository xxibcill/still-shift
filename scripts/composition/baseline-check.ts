import { isDeepStrictEqual } from "node:util";
import type { RenderEnvironment } from "../../packages/execution-runtime/src/render-browser.ts";
import type { TimingMachine } from "./baseline-timings.ts";

type BaselineProvenance = {
  browserArgs: readonly string[];
  renderEnvironment: Omit<RenderEnvironment, "profile"> & { profile: string };
  machine?: TimingMachine;
};

export function assertBaselineProvenance(
  previous: BaselineProvenance,
  current: BaselineProvenance,
) {
  if (
    !isDeepStrictEqual(previous.renderEnvironment, current.renderEnvironment) ||
    !isDeepStrictEqual(previous.browserArgs, current.browserArgs) ||
    !isDeepStrictEqual(previous.machine, current.machine)
  )
    throw new Error(
      "Cannot retain pixel baselines from different renderer or machine provenance; run a full --write without --only or --family",
    );
}

type Fixture = { id: string; family: string };
type FixtureFilters = {
  only?: readonly string[] | undefined;
  families?: readonly string[] | undefined;
};

export function selectBaselineFixtures<T extends Fixture>(
  fixtures: readonly T[],
  filters: FixtureFilters,
): T[] {
  for (const [requested, available, label] of [
    [filters.only, fixtures.map((fixture) => fixture.id), "ids"],
    [filters.families, fixtures.map((fixture) => fixture.family), "families"],
  ] as const) {
    const unknown = requested?.filter((value) => !available.includes(value));
    if (unknown?.length)
      throw new Error(`Unknown fixture ${label}: ${unknown.join(", ")}`);
  }
  const selected = fixtures.filter(
    (fixture) =>
      (!filters.only || filters.only.includes(fixture.id)) &&
      (!filters.families || filters.families.includes(fixture.family)),
  );
  if (!selected.length)
    throw new Error("No composition fixtures match the selection");
  return selected;
}

export function assertBaselineInventory(options: {
  storedItems: Record<string, { fixture: string; family: string }>;
  renderItems: readonly { id: string }[];
  filters?: FixtureFilters;
}) {
  const expected = new Set(
    Object.entries(options.storedItems)
      .filter(
        ([, item]) =>
          (!options.filters?.only ||
            options.filters.only.includes(item.fixture)) &&
          (!options.filters?.families ||
            options.filters.families.includes(item.family)),
      )
      .map(([id]) => id),
  );
  const actual = new Set(options.renderItems.map((item) => item.id));
  const missing = [...expected].filter((id) => !actual.has(id));
  const added = [...actual].filter((id) => !expected.has(id));
  const problems = [
    ...(missing.length ? [`missing render items: ${missing.join(", ")}`] : []),
    ...(added.length ? [`missing baseline items: ${added.join(", ")}`] : []),
  ];
  if (problems.length)
    throw new Error(`Baseline inventory mismatch: ${problems.join("; ")}`);
}

export function replaceBaselineItems<
  T extends { fixture: string; family: string },
>(
  previous: Record<string, T>,
  regenerated: Record<string, T>,
  filters: FixtureFilters = {},
): Record<string, T> {
  const retained = Object.fromEntries(
    Object.entries(previous).filter(
      ([, item]) =>
        !(
          (!filters.only || filters.only.includes(item.fixture)) &&
          (!filters.families || filters.families.includes(item.family))
        ),
    ),
  );
  return { ...retained, ...regenerated };
}
