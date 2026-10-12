import type {
  MechanismNarratedCycle,
  MechanismRigControlsV2,
  MechanismCameraKeys,
} from "@still-shift/scene-contract";
import { prepareMechanismSceneV2 } from "../../../renderer-core/src/mechanism/prepare-v2.ts";
import { evaluateMechanismFrameV2 } from "../../../renderer-core/src/mechanism/evaluate-v2.ts";
import { MechanismPackInvariantError } from "./pack-invariant.ts";
import type { MechanismPackInstanceSource } from "./pack-support.ts";
type Position = [number, number];
export type MechanismLabelRectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export function mechanismLabelRectanglesOverlap(
  a: MechanismLabelRectangle,
  b: MechanismLabelRectangle,
  gap = 0,
) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}
/** The backing encloses the fixed annotation text box. Actual glyph fit remains render QA. */
export function mechanismCueLabelRectangle(
  position: Position,
  width: number,
  height: number,
): MechanismLabelRectangle {
  return {
    x: position[0] - width * 0.01,
    y: position[1] - height * 0.005,
    width: width * 0.34,
    height: height * 0.17,
  };
}
export function planMechanismCueLayout(
  instance: MechanismPackInstanceSource,
  document: MechanismNarratedCycle,
  intervals: readonly { startFrame: number; endFrameExclusive: number }[],
  rigControls: MechanismRigControlsV2,
  cameraKeys: MechanismCameraKeys,
) {
  const { width, height } = document.output;
  const prepared = document.cues.some(
    (cue) => cue.layout?.protectedAnchors.length,
  )
    ? prepareMechanismSceneV2(instance.scene)
    : undefined;
  return document.cues.map((cue, cueIndex) => {
    const timing = intervals[cueIndex]!,
      safe = cue.layout?.safeInsetPixels ?? 8,
      gap = cue.layout?.gapPixels ?? 4;
    const fail = (
      code: string,
      message: string,
      frame = timing.startFrame,
    ): never => {
      throw new MechanismPackInvariantError(message, {
        code,
        pack: instance.pack,
        path: ["cues", cueIndex, "layout"],
        frame,
      });
    };
    const protectedAnchors = cue.layout?.protectedAnchors ?? [];
    if (
      new Set(protectedAnchors.map((a) => a.anchor)).size !==
        protectedAnchors.length ||
      protectedAnchors.some(
        (a) => !instance.scene.anchors.some((source) => source.id === a.anchor),
      )
    )
      fail(
        "mechanism-cue-layout-anchor",
        "Protected contact anchors must be known and unique",
      );
    const caption = {
      x: width * 0.05,
      y: height * 0.79,
      width: width * 0.9,
      height: height * 0.2,
    };
    const labels = cue.annotations.map((annotation) => {
      const locked = annotation.layout?.locked ?? true;
      const positions: Position[] = [
        annotation.position,
        ...(locked ? [] : (annotation.layout?.candidates ?? [])),
      ];
      const seen = new Set<string>();
      const candidates = positions.flatMap((position, index) => {
        const key = JSON.stringify(position);
        if (seen.has(key)) return [];
        seen.add(key);
        const rectangle = mechanismCueLabelRectangle(position, width, height);
        const blocked =
          rectangle.x < safe ||
          rectangle.y < safe ||
          rectangle.x + rectangle.width > width - safe ||
          rectangle.y + rectangle.height > height - safe ||
          mechanismLabelRectanglesOverlap(rectangle, caption, gap);
        return [
          {
            position,
            rectangle,
            candidate: index,
            blocked,
            obstacle: blocked ? "safe-area/caption" : "",
            frame: timing.startFrame,
          },
        ];
      });
      return {
        annotation: annotation.id,
        locked,
        priority: annotation.layout?.priority ?? 0,
        candidates,
      };
    });
    let projectedFrames = 0;
    if (protectedAnchors.length) {
      for (
        let frame = timing.startFrame;
        frame < timing.endFrameExclusive;
        frame++
      ) {
        const actual = evaluateMechanismFrameV2(prepared!, {
          frame,
          width,
          height,
          rigControls,
          cameraKeys,
        });
        projectedFrames++;
        for (const region of protectedAnchors) {
          const anchor = actual.anchors[region.anchor]!;
          if (!anchor.pixel || anchor.projectionVisibility !== "in-frame")
            continue;
          const obstacle = {
            x: anchor.pixel[0] - region.radiusPixels,
            y: anchor.pixel[1] - region.radiusPixels,
            width: region.radiusPixels * 2,
            height: region.radiusPixels * 2,
          };
          for (const label of labels)
            for (const candidate of label.candidates)
              if (
                !candidate.blocked &&
                mechanismLabelRectanglesOverlap(
                  candidate.rectangle,
                  obstacle,
                  gap,
                )
              ) {
                candidate.blocked = true;
                candidate.obstacle = region.anchor;
                candidate.frame = frame;
              }
        }
      }
    }
    const order = [...labels].sort(
      (a, b) =>
        Number(b.locked) - Number(a.locked) ||
        b.priority - a.priority ||
        (a.annotation < b.annotation
          ? -1
          : a.annotation > b.annotation
            ? 1
            : 0),
    );
    type Placement = {
      annotation: string;
      priority: number;
      locked: boolean;
      position: Position;
      rectangle: MechanismLabelRectangle;
      candidate: number;
    };
    const chosen: Placement[] = [];
    let visited = 0;
    const search = (index: number): boolean => {
      if (index === order.length) return true;
      const label = order[index]!;
      for (const candidate of label.candidates) {
        if (++visited > 65536)
          fail(
            "mechanism-cue-layout-budget",
            `Layout search exceeds 65536 candidates for labels ${order.map((a) => a.annotation).join(", ")}; reduce candidates`,
          );
        if (
          candidate.blocked ||
          chosen.some((other) =>
            mechanismLabelRectanglesOverlap(
              candidate.rectangle,
              other.rectangle,
              gap,
            ),
          )
        )
          continue;
        chosen.push({
          annotation: label.annotation,
          priority: label.priority,
          locked: label.locked,
          position: candidate.position,
          rectangle: candidate.rectangle,
          candidate: candidate.candidate,
        });
        if (search(index + 1)) return true;
        chosen.pop();
      }
      return false;
    };
    if (!search(0)) {
      const blocked = labels.flatMap((label) =>
        label.candidates
          .filter((c) => c.blocked)
          .map((c) => `${label.annotation}:${c.obstacle}@${c.frame}`),
      );
      fail(
        "mechanism-cue-layout-conflict",
        `No cue-wide placement for labels ${order.map((a) => a.annotation).join(", ")}; exclusions: ${blocked.join(", ") || "label-to-label"}`,
      );
    }
    return {
      cue: cue.id,
      ...timing,
      placements: chosen.sort((a, b) =>
        a.annotation < b.annotation ? -1 : a.annotation > b.annotation ? 1 : 0,
      ),
      checkedOutputFrames: timing.endFrameExclusive - timing.startFrame,
      projectedFrames,
      searchCandidates: visited,
      evidence:
        "conservative-cue-wide-envelope-and-geometric-contact-prepass" as const,
    };
  });
}
