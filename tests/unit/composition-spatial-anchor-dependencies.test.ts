import { expect, it } from "vitest";
import { validateComposition } from "@still-shift/scene-contract";
import {
  evaluateComp,
  evaluateProperty,
  evaluateStageProperty,
} from "../../packages/renderer-core/src/composition/evaluate/index.ts";

function document(
  type: "null" | "camera" | "light",
  expressions: Record<string, string>,
  lightType: "ambient" | "point" | "spot" = "point",
) {
  return {
    schemaVersion: "composition-1",
    id: "main",
    width: 200,
    height: 200,
    fps: 30,
    frameCount: 60,
    assets: [],
    layers: [
      { id: "reader", type: "null", threeD: true },
      {
        id: "control",
        type,
        ...(type === "light" ? { lightType } : { threeD: true }),
      },
    ],
    expressions: Object.fromEntries(
      Object.entries(expressions).map(([target, source]) => [
        target,
        { source },
      ]),
    ),
  };
}

it.each(["null", "camera"] as const)(
  "resolves implicit xyz anchor expressions on %s layers independently of layer order and seeks",
  (type) => {
    for (const reversed of [false, true]) {
      const doc = document(type, {
        "control.transform.anchor": "[20 + frame, 30 + frame, 40 + frame]",
        "reader.transform.position": "ref('control.constraintReference')",
        "reader.transform.rotation": "ref('control.constraintReference.z')",
      });
      if (reversed) doc.layers.reverse();
      const result = validateComposition(doc);
      expect(result.diagnostics).toEqual([]);
      if (!result.ok) throw new Error("expected a valid spatial composition");
      for (const frame of [0, 12, 4]) {
        const expected = [20 + frame, 30 + frame, 40 + frame];
        expect(
          evaluateProperty(
            result.composition,
            "reader.transform.position",
            frame,
          ),
        ).toEqual(expected);
        expect(
          evaluateProperty(
            result.composition,
            "reader.transform.rotation",
            frame,
          ),
        ).toBe(expected[2]);
        const reader = evaluateComp(result.composition, frame).layers.find(
          (layer) => layer.id === "reader",
        )!;
        expect(reader.transform.position).toEqual(expected);
        expect(reader.transform.rotation).toBe(expected[2]);
      }
    }
  },
);

it("preserves written z references while inheriting unwritten x and y", () => {
  const result = validateComposition(
    document("null", {
      "control.constraintReference.z": "99",
      "control.transform.anchor.x": "20 + frame",
      "control.transform.anchor.y": "30 + frame",
      "control.transform.anchor.z": "ref('control.constraintReference.z') + 1",
      "reader.transform.position": "ref('control.constraintReference')",
    }),
  );
  expect(result.diagnostics).toEqual([]);
  if (!result.ok) throw new Error("expected a valid spatial composition");
  expect(
    evaluateProperty(result.composition, "reader.transform.position", 4),
  ).toEqual([24, 34, 99]);
  expect(
    evaluateProperty(result.composition, "control.transform.anchor.z", 4),
  ).toBe(100);
});

it.each([
  { "control.transform.anchor.z": "ref('control.constraintReference.z')" },
  {
    "control.constraintReference.z": "99",
    "control.transform.anchor.x": "ref('control.constraintReference.x')",
  },
  {
    "control.transform.anchor.z": "ref('reader.transform.rotation')",
    "reader.transform.rotation": "ref('control.constraintReference.z')",
  },
])(
  "rejects cycles through unwritten spatial reference axes (%j)",
  (expressions) => {
    const result = validateComposition(document("null", expressions));
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "comp-expression-cycle",
    );
  },
);

it.each(["ambient", "point", "spot"] as const)(
  "resolves implicit %s light z references independently of layer order and seek history",
  (lightType) => {
    for (const reversed of [false, true]) {
      const doc = document(
        "light",
        {
          "control.transform.anchor.z": "40 + frame",
          "reader.transform.position.z": "ref('control.constraintReference.z')",
        },
        lightType,
      );
      if (reversed) doc.layers.reverse();
      const result = validateComposition(doc);
      expect(result.diagnostics).toEqual([]);
      if (!result.ok) throw new Error("expected a valid light composition");
      for (const frame of [0, 12, 4, 0]) {
        const expected = 40 + frame;
        expect(
          evaluateProperty(
            result.composition,
            "reader.transform.position.z",
            frame,
          ),
        ).toBe(expected);
        expect(
          evaluateStageProperty(
            result.composition,
            "control.constraintReference.z",
            frame,
          ).value,
        ).toBe(expected);
        const reader = evaluateComp(result.composition, frame).layers.find(
          (layer) => layer.id === "reader",
        )!;
        expect(reader.transform.position[2]).toBe(expected);
      }
    }
  },
);

it.each(["ambient", "point", "spot"] as const)(
  "rejects cycles through implicit %s light z references",
  (lightType) => {
    for (const expressions of [
      {
        "control.transform.anchor.z":
          "ref('control.constraintReference.z') + 1",
      },
      {
        "control.transform.anchor.z": "ref('reader.transform.position.z')",
        "reader.transform.position.z": "ref('control.constraintReference.z')",
      },
    ]) {
      const result = validateComposition(
        document("light", expressions, lightType),
      );
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        "comp-expression-cycle",
      );
    }
  },
);

it.each(["ambient", "point", "spot"] as const)(
  "retains explicitly written %s light z references without a false anchor cycle",
  (lightType) => {
    const result = validateComposition(
      document(
        "light",
        {
          "control.constraintReference.z": "99",
          "control.transform.anchor.z":
            "ref('control.constraintReference.z') + 1",
          "reader.transform.position.z": "ref('control.constraintReference.z')",
        },
        lightType,
      ),
    );
    expect(result.diagnostics).toEqual([]);
    if (!result.ok)
      throw new Error("expected a valid explicit light reference");
    expect(
      evaluateProperty(result.composition, "reader.transform.position.z", 4),
    ).toBe(99);
    expect(
      evaluateStageProperty(
        result.composition,
        "control.constraintReference.z",
        4,
      ).value,
    ).toBe(99);
    expect(
      evaluateProperty(result.composition, "control.transform.anchor.z", 4),
    ).toBe(100);
  },
);
