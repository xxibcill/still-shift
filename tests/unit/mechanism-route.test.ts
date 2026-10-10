import { describe, expect, it } from "vitest";
import {
  followPreparedMechanismRoute,
  mechanismRouteBackend,
  recordedMechanismRoute,
  selectMechanismRoute,
} from "../../packages/animation-engine/src/mechanism/route.ts";
import { MechanismEpisodeSchema } from "../../packages/scene-contract/src/mechanism/episode.ts";

describe("mechanism execution route provenance", () => {
  it("preserves absent source routes and records explicit overrides even when equal", () => {
    const source = {};
    expect(selectMechanismRoute(source)).toEqual({
      sourceRoute: null,
      effectiveRoute: "bridge",
      selectionOrigin: "default",
    });
    expect(
      recordedMechanismRoute(selectMechanismRoute(source)),
    ).toBeUndefined();
    expect(selectMechanismRoute({ route: "native3d" }, "native3d")).toEqual({
      sourceRoute: "native3d",
      effectiveRoute: "native3d",
      selectionOrigin: "cli-override",
    });
    expect(source).not.toHaveProperty("route");
    const parsed = MechanismEpisodeSchema.parse({
      schemaVersion: "mechanism-episode-1",
      id: "route",
      revision: 0,
      scene: "scene",
      font: "font",
      output: { width: 320, height: 180, fps: 30, frameCount: 30 },
      dependencies: [
        {
          id: "scene",
          type: "scene",
          path: "scene.json",
          sha256: `sha256:${"a".repeat(64)}`,
        },
        {
          id: "font",
          type: "font",
          path: "font.ttf",
          sha256: `sha256:${"b".repeat(64)}`,
        },
      ],
      shots: [
        {
          id: "one",
          purpose: "route schema",
          startFrame: 0,
          endFrameExclusive: 30,
        },
      ],
    });
    const bytes = JSON.stringify(parsed);
    selectMechanismRoute(parsed);
    expect(parsed).not.toHaveProperty("route");
    expect(JSON.stringify(parsed)).toBe(bytes);
  });
  it("follows prepared overrides without reselection or changing origin", () => {
    const selected = selectMechanismRoute({ route: "bridge" }, "native3d");
    expect(followPreparedMechanismRoute({ route: "bridge" }, selected)).toEqual(
      selected,
    );
    expect(
      followPreparedMechanismRoute({ route: "bridge" }, selected, "native3d"),
    ).toEqual(selected);
    expect(() =>
      followPreparedMechanismRoute({ route: "bridge" }, selected, "bridge"),
    ).toThrow(/assertion/);
    expect(() =>
      followPreparedMechanismRoute({ route: "native3d" }, selected),
    ).toThrow(/authored route changed/);
  });
  it("rejects inconsistent provenance and native source with a legacy receipt", () => {
    expect(() => followPreparedMechanismRoute({ route: "native3d" })).toThrow(
      /route-aware/,
    );
    expect(() =>
      followPreparedMechanismRoute(
        {},
        {
          sourceRoute: null,
          effectiveRoute: "native3d",
          selectionOrigin: "default",
        },
      ),
    ).toThrow(/inconsistent/);
    expect(followPreparedMechanismRoute({})).toEqual(selectMechanismRoute({}));
  });
  it("requires native WebGL2 before rendering while retaining bridge backend defaults", () => {
    const native = selectMechanismRoute({}, "native3d");
    expect(mechanismRouteBackend(native)).toBe("webgl2");
    expect(() => mechanismRouteBackend(native, "canvas2d")).toThrow(/WebGL2/);
    expect(mechanismRouteBackend(selectMechanismRoute({}))).toBe("canvas2d");
    expect(mechanismRouteBackend(selectMechanismRoute({}), "webgl2")).toBe(
      "webgl2",
    );
  });
});
