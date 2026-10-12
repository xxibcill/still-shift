import { resolveCueSurfaceMarking } from "./cue-surface-markings.ts";
import { compileCueWorldText } from "./cue-world-annotations.ts";
import { compileCueAnnotation } from "./cue-annotations.ts";
import { planMechanismCueLayout } from "./cue-layout.ts";
import {
  MechanismNarratedCycleSchema,
  validateComposition,
  CompositionPcmClock,
  type MechanismNarratedCycle,
  type MechanismRigControlsV2,
  type Composition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import { compileMechanismPackTimeline } from "./pack-timeline.ts";
import { MechanismPackInvariantError } from "./pack-invariant.ts";
import {
  freezeMechanismPack,
  mechanismPackHash,
  type MechanismPackInstanceSource,
} from "./pack-support.ts";

const outputFrame = (sample: number, fps: number) =>
  Number((BigInt(sample) * BigInt(fps) + 47999n) / 48000n);
const trackId = (kind: string, cue: string, member = "") =>
  `${kind}-${mechanismPackHash([cue, member]).slice(7, 39)}`;
type Cue = MechanismNarratedCycle["cues"][number];
type Reference = { cue: string; edge: "start" | "end"; offsetSamples: number };
/** Compile all tracks from the same supplied PCM cue map. No asset I/O or paid generation. */
export function compileMechanismNarratedCycle(
  instance: MechanismPackInstanceSource,
  input: unknown,
) {
  const fail = (
    code: string,
    message: string,
    path: (string | number)[],
    frame?: number,
  ): never => {
    throw new MechanismPackInvariantError(message, {
      code,
      path,
      pack: instance.pack,
      ...(frame === undefined ? {} : { frame }),
    });
  };
  const parsed = MechanismNarratedCycleSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    fail(
      "mechanism-cue-contract",
      issue.message,
      issue.path.map((value) =>
        typeof value === "number" ? value : String(value),
      ),
    );
  }
  const document = parsed.data!;
  const { width, height, fps } = document.output;
  const frameCount = outputFrame(document.narration.sampleCount, fps);
  if (frameCount > 108000)
    fail(
      "mechanism-cue-recording",
      "Recording exceeds the mechanism output frame limit",
      ["narration", "sampleCount"],
    );
  const surfaceCameraBound = Math.max(
    0,
    ...document.cues.flatMap((cue) =>
      cue.camera
        ? [Math.hypot(...cue.camera.position), Math.hypot(...cue.camera.target)]
        : [],
    ),
  );
  const cues = new Map<string, Cue>();
  const resolvedWorld = new Map<
    NonNullable<Cue["worldAnnotations"]>[number],
    {
      annotation: Extract<
        NonNullable<Cue["worldAnnotations"]>[number],
        { kind: "world-text" }
      >;
      surface?: ReturnType<typeof resolveCueSurfaceMarking>["surface"];
    }
  >();
  const segmenter = new Intl.Segmenter(document.locale, {
    granularity: "grapheme",
  });
  const frames = document.cues.map((cue, index) => {
    const path = ["cues", index];
    if (cues.has(cue.id))
      fail("mechanism-cue-id", "Cue IDs must be unique", [...path, "id"]);
    cues.set(cue.id, cue);
    if (
      cue.startSample >= cue.endSampleExclusive ||
      cue.endSampleExclusive > document.narration.sampleCount
    )
      fail(
        "mechanism-cue-recording",
        "Cue must be a nonempty interval inside the supplied recording",
        path,
      );
    if (
      (index === 0 && cue.startSample !== 0) ||
      (index > 0 &&
        cue.startSample < document.cues[index - 1]!.endSampleExclusive)
    )
      fail(
        "mechanism-cue-order",
        "Cues begin at sample zero and do not overlap",
        [...path, "startSample"],
      );
    const start = outputFrame(cue.startSample, fps),
      end = outputFrame(cue.endSampleExclusive, fps);
    const nextSample =
      document.cues[index + 1]?.startSample ?? document.narration.sampleCount;
    if (
      nextSample <= cue.startSample ||
      cue.minimumActionSamples > nextSample - cue.startSample ||
      outputFrame(nextSample, fps) <= start ||
      cue.minimumActionSamples * fps >
        (outputFrame(nextSample, fps) - start) * 48000
    )
      fail(
        "mechanism-cue-action",
        "Semantic action does not fit its supplied shot interval",
        [...path, "minimumActionSamples"],
        start,
      );
    const reading = (text: string, textPath: (string | number)[]) => {
      const count = [...segmenter.segment(text)].length;
      const requiredSamples = Math.ceil(
        (count * 48000) / document.maxGraphemesPerSecond,
      );
      if (
        requiredSamples > cue.endSampleExclusive - cue.startSample ||
        end <= start ||
        count / document.maxGraphemesPerSecond > (end - start) / fps
      )
        fail(
          "mechanism-cue-reading",
          "Supplied cue has insufficient visible reading time",
          textPath,
          start,
        );
    };
    reading(cue.text, [...path, "text"]);
    const annotationIds = new Set<string>();
    for (const [annotationIndex, annotation] of cue.annotations.entries()) {
      if (annotationIds.has(annotation.id))
        fail("mechanism-cue-id", "Annotation IDs must be unique within a cue", [
          ...path,
          "annotations",
          annotationIndex,
          "id",
        ]);
      annotationIds.add(annotation.id);
      if (
        !instance.scene.anchors.some(
          (anchor) => anchor.id === annotation.anchor,
        )
      )
        fail("mechanism-cue-anchor", "Unknown annotation anchor", [
          ...path,
          "annotations",
          annotationIndex,
          "anchor",
        ]);
      if (annotation.style?.kind === "bracket") {
        const secondary = annotation.style.toAnchor;
        if (!instance.scene.anchors.some((anchor) => anchor.id === secondary))
          fail("mechanism-cue-anchor", "Unknown secondary bracket anchor", [
            ...path,
            "annotations",
            annotationIndex,
            "style",
            "toAnchor",
          ]);
      }
      if (annotation.style?.kind === "highlight") {
        const [w, h] = annotation.style.sizePixels;
        if (w >= width || h >= height)
          fail(
            "mechanism-cue-layout",
            "Highlight must fit the owning viewport",
            [...path, "annotations", annotationIndex, "style", "sizePixels"],
          );
        if (
          annotation.visibility?.policy === "offscreen-indicator" &&
          annotation.visibility.insetPixels < Math.max(w, h) / 2 + 1
        )
          fail(
            "mechanism-cue-layout",
            "Offscreen highlight inset must enclose its outline",
            [
              ...path,
              "annotations",
              annotationIndex,
              "visibility",
              "insetPixels",
            ],
          );
      }
      if (annotation.position[0] >= width || annotation.position[1] >= height)
        fail(
          "mechanism-cue-layout",
          "Annotation start must fit the output viewport",
          [...path, "annotations", annotationIndex, "position"],
        );
      reading(annotation.text, [
        ...path,
        "annotations",
        annotationIndex,
        "text",
      ]);
    }
    for (const [annotationIndex, annotation] of (
      cue.worldAnnotations ?? []
    ).entries()) {
      const annotationPath = [...path, "worldAnnotations", annotationIndex];
      if (annotationIds.has(annotation.id))
        fail("mechanism-cue-id", "Annotation IDs must be unique within a cue", [
          ...annotationPath,
          "id",
        ]);
      annotationIds.add(annotation.id);
      if (annotation.kind === "surface-marking")
        resolvedWorld.set(
          annotation,
          resolveCueSurfaceMarking(
            instance.scene,
            annotation,
            (message, field) =>
              fail("mechanism-cue-surface", message, [
                ...annotationPath,
                field,
              ]),
            surfaceCameraBound,
          ),
        );
      else {
        if (!instance.scene.parts.some((part) => part.id === annotation.part))
          fail("mechanism-cue-part", "Unknown world annotation part", [
            ...annotationPath,
            "part",
          ]);
        resolvedWorld.set(annotation, { annotation });
      }
      reading(annotation.text, [...annotationPath, "text"]);
    }
    return {
      cue: cue.id,
      startFrame: start,
      endFrameExclusive: end,
      shotEndFrameExclusive: outputFrame(nextSample, fps),
      startSample: cue.startSample,
      endSampleExclusive: cue.endSampleExclusive,
      onsetDelaySamples:
        new CompositionPcmClock().place(start, fps).sample - cue.startSample,
    };
  });
  const resolve = (reference: Reference, path: (string | number)[]) => {
    const cue = cues.get(reference.cue);
    if (!cue)
      return fail("mechanism-cue-reference", "Unknown motion cue", [
        ...path,
        "cue",
      ]);
    const sample =
      (reference.edge === "start" ? cue.startSample : cue.endSampleExclusive) +
      reference.offsetSamples;
    if (
      !Number.isSafeInteger(sample) ||
      sample < 0 ||
      sample > document.narration.sampleCount
    )
      fail(
        "mechanism-cue-recording",
        "Motion reference lies outside the supplied recording",
        path,
      );
    return outputFrame(sample, fps);
  };
  const controls: Record<string, unknown> = {};
  for (const [index, entry] of document.controls.entries()) {
    const path = ["controls", index];
    if (Object.hasOwn(controls, entry.rig))
      fail("mechanism-cue-writer", "Each rig has one authored writer", [
        ...path,
        "rig",
      ]);
    const scalar = (
      writer: {
        value?: number | undefined;
        keys?: { at: Reference; value: number; easing: string }[] | undefined;
      },
      keyPath: (string | number)[],
    ) => ({
      ...(writer.value === undefined ? {} : { value: writer.value }),
      ...(writer.keys
        ? {
            keys: writer.keys.map((key, i) => ({
              frame: resolve(key.at, [...keyPath, "keys", i, "at"]),
              value: key.value,
              easing: key.easing,
            })),
          }
        : {}),
    });
    const control = entry.control;
    controls[entry.rig] =
      control.type === "slider" || control.type === "hinge"
        ? { type: control.type, ...scalar(control, [...path, "control"]) }
        : control.type === "ratchet"
          ? {
              type: "ratchet",
              position: scalar(control.position, [
                ...path,
                "control",
                "position",
              ]),
              latchKeys: control.latchKeys.map((key, i) => ({
                frame: resolve(key.at, [
                  ...path,
                  "control",
                  "latchKeys",
                  i,
                  "at",
                ]),
                state: key.state,
              })),
            }
          : {
              type: "spring-return",
              states: control.states.map((state, i) => {
                const { at, ...rest } = state;
                return {
                  ...rest,
                  frame: resolve(at, [...path, "control", "states", i, "at"]),
                };
              }),
            };
  }
  const timeline = compileMechanismPackTimeline(instance, {
    schemaVersion: "mechanism-pack-timeline-1",
    frameCount,
    initialState: document.initialState,
    states: document.states,
    transitions: document.transitions,
    rigControls: controls,
    events: document.cues.map((cue, i) => ({
      id: cue.id,
      frame: frames[i]!.startFrame,
      kind: cue.kind,
      state: cue.state,
    })),
  });
  const sourceId = document.source.id,
    fontId = document.font.id;
  if (document.source.textureFont && document.source.textureFont !== fontId)
    fail(
      "mechanism-cue-font",
      "Texture artwork must use this document's pinned font",
      ["source", "textureFont"],
    );
  const needsTextureFont = instance.scene.geometry.materials.some(
    (material) => material.texture?.kind === "tape-graduations",
  );
  const sourceAsset = {
    ...document.source,
    ...(needsTextureFont ? { textureFont: fontId } : {}),
  };
  const assets: Composition["assets"] = [
    sourceAsset,
    document.font,
    document.narration,
  ];
  if (new Set(assets.map((asset) => asset.id)).size !== assets.length)
    fail(
      "mechanism-cue-asset",
      "Source, font and narration IDs must be distinct",
      ["source", "id"],
    );
  const layers: CompositionLayer[] = [];
  const cameraKeys: NonNullable<
    Extract<CompositionLayer, { type: "native3d" }>["cameraKeys"]
  > = [];
  let camera = instance.scene.camera;
  const controller = "mechanism-cycle-world";
  const fontSize = Math.max(8, Math.min(width / 24, height / 13));
  const textLayer = (
    id: string,
    text: string,
    start: number,
    end: number,
    position: [number, number],
    size: [number, number],
  ): CompositionLayer => ({
    id,
    type: "text",
    text,
    fontAsset: fontId,
    style: fontId,
    fontSize,
    color: "#ffffff",
    align: "center",
    anchor: "top",
    inPoint: start,
    outPoint: end,
    transform: { anchor: [0, 0], position },
    size,
    textBox: { locale: document.locale, maxLines: 3, lineHeight: 1.2 },
  });
  const panel = (
    id: string,
    position: [number, number],
    size: [number, number],
    start: number,
    end: number,
  ): CompositionLayer => ({
    id,
    type: "shape",
    inPoint: start,
    outPoint: end,
    transform: { position },
    contents: [
      { id: "panel", type: "rect", size, roundness: 4 },
      { id: "fill", type: "fill", color: "#101820eb" },
    ],
  });
  for (const [index, cue] of document.cues.entries()) {
    const timing = frames[index]!;
    if (
      cue.editing === "hold" &&
      cue.camera &&
      mechanismPackHash(cue.camera) !== mechanismPackHash(camera)
    )
      fail(
        "mechanism-cue-camera",
        "A held camera cannot change pose; declare a cut or transition",
        ["cues", index, "editing"],
        timing.startFrame,
      );
    if (
      cue.camera &&
      (cue.camera.near !== instance.scene.camera.near ||
        cue.camera.far !== instance.scene.camera.far)
    )
      fail(
        "mechanism-cue-camera",
        "Cue camera tracks retain the scene near/far planes",
        ["cues", index, "camera"],
        timing.startFrame,
      );
    camera = cue.camera ?? camera;
    cameraKeys.push({
      frame: timing.startFrame,
      position: camera.position,
      target: camera.target,
      fovDegrees: camera.fovDegrees,
      easing:
        document.cues[index + 1]?.editing === "transition"
          ? "smoothstep"
          : "hold",
    });
    layers.push({
      ...textLayer(
        trackId("caption", cue.id),
        cue.text,
        timing.startFrame,
        timing.endFrameExclusive,
        [width * 0.08, height * 0.8],
        [width * 0.84, height * 0.18],
      ),
      metadata: {
        cue: cue.id,
        track: "caption",
        sourceSamples: [cue.startSample, cue.endSampleExclusive],
      },
    });
    layers.push({
      ...panel(
        trackId("caption-panel", cue.id),
        [width * 0.5, height * 0.89],
        [width * 0.9, height * 0.2],
        timing.startFrame,
        timing.endFrameExclusive,
      ),
      metadata: { cue: cue.id, track: "caption-panel" },
    });
    for (const annotation of cue.annotations)
      layers.push(
        ...compileCueAnnotation(annotation, {
          controller,
          cue: cue.id,
          startFrame: timing.startFrame,
          endFrameExclusive: timing.endFrameExclusive,
          sourceSamples: [cue.startSample, cue.endSampleExclusive],
          width,
          height,
          font: fontId,
          fontSize,
          locale: document.locale,
          ids: {
            label: trackId("annotation", cue.id, annotation.id),
            backing: trackId("annotation-panel", cue.id, annotation.id),
            leader: trackId("leader", cue.id, annotation.id),
            highlight: trackId("annotation-highlight", cue.id, annotation.id),
            visibility: trackId("annotation-visibility", cue.id, annotation.id),
          },
        }),
      );
    for (const annotation of cue.worldAnnotations ?? []) {
      const resolved = resolvedWorld.get(annotation)!;
      const layer = compileCueWorldText(resolved.annotation, {
        controller,
        cue: cue.id,
        id: trackId("world-annotation", cue.id, annotation.id),
        startFrame: timing.startFrame,
        endFrameExclusive: timing.endFrameExclusive,
        sourceSamples: [cue.startSample, cue.endSampleExclusive],
        font: fontId,
        locale: document.locale,
      });
      if (resolved.surface)
        layer.metadata = { ...layer.metadata, surface: resolved.surface };
      layers.push(layer);
    }
    const soundIds = new Set<string>();
    for (const [soundIndex, sound] of cue.sounds.entries()) {
      const path = ["cues", index, "sounds", soundIndex];
      if (soundIds.has(sound.id))
        fail("mechanism-cue-id", "Sound IDs must be unique within a cue", [
          ...path,
          "id",
        ]);
      soundIds.add(sound.id);
      const end = sound.sourceEndSample ?? sound.asset.sampleCount;
      const count = end - sound.sourceStartSample;
      const startSample = new CompositionPcmClock().place(
        timing.startFrame,
        fps,
      ).sample;
      if (
        count <= 0 ||
        end > sound.asset.sampleCount ||
        startSample + count > document.narration.sampleCount
      )
        fail(
          "mechanism-cue-sound",
          "Sound trim and scheduled tail must fit their source and the supplied recording",
          path,
          timing.startFrame,
        );
      const existing = assets.find((asset) => asset.id === sound.asset.id);
      if (
        existing &&
        mechanismPackHash(existing) !== mechanismPackHash(sound.asset)
      )
        fail(
          "mechanism-cue-asset",
          "An asset ID cannot identify conflicting source metadata",
          [...path, "asset"],
        );
      if (!existing) assets.push(sound.asset);
      layers.push({
        id: trackId("sound", cue.id, sound.id),
        type: "audio",
        role: "sfx",
        asset: sound.asset.id,
        inPoint: timing.startFrame,
        outPoint: outputFrame(startSample + count, fps),
        startFrame: timing.startFrame,
        sourceStartSample: sound.sourceStartSample,
        sourceEndSample: end,
        gainDb: sound.gainDb,
        metadata: {
          cue: cue.id,
          authoredStartSample: cue.startSample,
          scheduledStartSample: startSample,
        },
      });
    }
  }
  layers.push({
    id: "mechanism-cycle-narration",
    type: "audio",
    role: "narration",
    asset: document.narration.id,
    inPoint: 0,
    outPoint: frameCount,
    sourceStartSample: 0,
    sourceEndSample: document.narration.sampleCount,
  });
  layers.push({
    id: controller,
    type: "native3d",
    asset: sourceId,
    sourceStartFrame: 0,
    sourceFps: fps,
    inPoint: 0,
    outPoint: frameCount,
    rigControls: timeline.timeline.rigControls as MechanismRigControlsV2,
    cameraKeys,
  });
  const labelLayout = planMechanismCueLayout(
    instance,
    document,
    frames,
    timeline.timeline.rigControls as MechanismRigControlsV2,
    cameraKeys,
  );
  for (const [cueIndex, cue] of document.cues.entries())
    for (const annotation of cue.annotations) {
      const placed = labelLayout[cueIndex]!.placements.find(
        (p) => p.annotation === annotation.id,
      )!;
      const delta: [number, number] = [
        placed.position[0] - annotation.position[0],
        placed.position[1] - annotation.position[1],
      ];
      for (const kind of [
        "annotation",
        "annotation-panel",
        "leader",
      ] as const) {
        const layer = layers.find(
          (layer) => layer.id === trackId(kind, cue.id, annotation.id),
        )!;
        if (
          layer.transform?.position &&
          Array.isArray(layer.transform.position)
        )
          layer.transform.position = [
            layer.transform.position[0]! + delta[0],
            layer.transform.position[1]! + delta[1],
          ];
        if (
          kind === "leader" &&
          layer.type === "shape" &&
          layer.native3D?.role === "screen-anchor" &&
          (layer.native3D.target.kind === "path-endpoint" ||
            layer.native3D.target.kind === "path-arrow")
        ) {
          const content = layer.contents.find(
            (content) => content.type === "path",
          );
          if (content?.type === "path" && "vertices" in content.path)
            content.path.vertices[0] = [
              placed.position[0] + width * 0.16,
              placed.position[1] + fontSize * 1.3,
            ];
        }
      }
    }
  const validation = validateComposition({
    schemaVersion: "composition-1",
    id: document.id,
    ...document.output,
    frameCount,
    background: instance.scene.profile.background,
    assets,
    layers,
    textStyles: {
      [fontId]: {
        fontAsset: fontId,
      },
    },
    markers: document.cues.map((cue, i) => ({
      id: cue.id,
      frame: frames[i]!.startFrame,
      label: cue.kind,
    })),
  });
  if (!validation.ok) {
    const issue = validation.diagnostics[0]!;
    return fail(
      "mechanism-cue-composition",
      `${issue.code}: ${issue.message}`,
      ["composition", issue.path],
    );
  }
  return freezeMechanismPack({
    version: "compiled-mechanism-narrated-cycle-1" as const,
    revision: document.revision,
    sourceDocumentSha256: mechanismPackHash(document),
    timeline,
    composition: validation.composition!,
    cueMap: frames,
    labelLayout,
    recording: {
      sourceSamples: document.narration.sampleCount,
      sourceSha256: document.narration.sha256,
      fps,
      frameCount,
      renderBoundarySamples: new CompositionPcmClock().place(frameCount, fps)
        .sample,
      samplePolicy: "unchanged-source-clock" as const,
    },
    timingPolicy: "first-output-frame-at-or-after-cue" as const,
  });
}
