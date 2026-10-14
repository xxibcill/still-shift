import {
  CompositionSchema,
  type CompositionLayer,
  type Composition,
} from "@still-shift/scene-contract";
import {
  parseBlenderEpisodePlan,
  parseBlenderEpisodeSource,
  blenderEpisodeFrameCount,
  type BlenderEpisodePlan,
} from "./blender-episode-contract.ts";
import { parseBlenderCaptureJob } from "./blender-capture-contract.ts";
import { mechanismPackHash, freezeMechanismPack } from "./pack-support.ts";
import { mechanismCueCaptionLayout } from "./cue-caption.ts";
import {
  composeBlenderCallouts,
  type BlenderAnchorFrames,
} from "./blender-episode-annotations.ts";

type CompositionSequenceAsset = Extract<
  Composition["assets"][number],
  { type: "sequence" }
>;
type Track = BlenderEpisodePlan["sourceFrameTrack"];
export function sampleBlenderEpisodeTrack(keys: Track, frame: number): number {
  const start = keys.findLast((k) => k.frame <= frame)!;
  const end = keys.find((k) => k.frame > frame);
  if (!end || start.interpolation === "hold") return start.value;
  const t = (frame - start.frame) / (end.frame - start.frame);
  const u = start.interpolation === "smoothstep" ? t * t * (3 - 2 * t) : t;
  return start.value + (end.value - start.value) * u;
}
/** Pure absolute-time sampling; native cameras and controllers remain in the saved asset. */
export function compileBlenderEpisode(
  sourceInput: unknown,
  planInput: unknown,
) {
  const source = parseBlenderEpisodeSource(sourceInput),
    plan = parseBlenderEpisodePlan(planInput);
  const declared = Object.keys(source.controller?.properties ?? {});
  const supplied = Object.keys(plan.controlTracks);
  if (
    declared.length !== supplied.length ||
    declared.some((k) => !Object.hasOwn(plan.controlTracks, k))
  )
    throw Error(
      "Every native source control requires exactly one absolute track",
    );
  const frameCount = blenderEpisodeFrameCount(
    plan.narration.sampleCount,
    plan.fps,
  );
  const projectedWork =
    frameCount * (512 + declared.reduce((n, k) => n + k.length * 2 + 128, 0)) +
    plan.shots.reduce(
      (bytes, shot) =>
        bytes +
        (shot.endExclusive - shot.start) *
          (shot.camera.length * 2 +
            128 +
            [
              ...shot.hiddenParts,
              ...shot.shownParts,
              ...Object.keys(shot.highlights),
            ].reduce((n, name) => n + name.length * 2 + 16, 0)),
      0,
    ) +
    plan.callouts.reduce(
      (n, c) => n + (c.endExclusive - c.start) * (c.anchor.length * 2 + 256),
      0,
    );
  if (projectedWork > 16 * 1024 * 1024)
    throw Error(
      "Native episode expanded-track budget exceeded before sampling",
    );
  const frames = Array.from({ length: frameCount }, (_, frame) => {
    const shot = plan.shots.find(
      (s) => frame >= s.start && frame < s.endExclusive,
    )!;
    return {
      sourceFrame: sampleBlenderEpisodeTrack(plan.sourceFrameTrack, frame),
      camera: shot.camera,
      ...(shot.framing ? { framing: shot.framing } : {}),
      controls: Object.fromEntries(
        declared.map((k) => [
          k,
          sampleBlenderEpisodeTrack(plan.controlTracks[k]!, frame),
        ]),
      ),
      hiddenParts: shot.hiddenParts,
      shownParts: shot.shownParts,
      highlights: shot.highlights,
      anchors: [
        ...new Set(
          plan.callouts
            .filter((c) => frame >= c.start && frame < c.endExclusive)
            .map((c) => c.anchor),
        ),
      ].sort(),
    };
  });
  for (const callout of plan.callouts)
    for (let frame = callout.start; frame < callout.endExclusive; frame++)
      for (const [key, range] of Object.entries(callout.controlRanges)) {
        const value = frames[frame]!.controls[key];
        if (value === undefined || value < range.min || value > range.max)
          throw Error(
            `Native callout ${callout.id} is outside its declared control state at frame ${frame}`,
          );
      }
  const job = parseBlenderCaptureJob({
    schemaVersion: "blender-native-capture-job-1",
    id: plan.id,
    assetPath: source.asset.path,
    assetSha256: source.asset.sha256,
    collection: source.collection,
    camera: plan.shots[0]!.camera,
    requireEmbeddedResources: true,
    outputDirectory: "unbound-native-output",
    width: plan.width,
    height: plan.height,
    fps: plan.fps,
    samples: plan.samples,
    ...(source.controller ? { controller: source.controller } : {}),
    frames,
  });
  return freezeMechanismPack({
    source,
    plan,
    job,
    frameCount,
    speechSourceSha256: mechanismPackHash({
      schemaVersion: "blender-episode-speech-source-1",
      locale: plan.locale,
      fps: plan.fps,
      audioSha256: plan.narration.sha256,
      sourceSamples: plan.narration.sampleCount,
      cues: plan.speech,
    }),
  });
}
export function composeBlenderEpisode(
  compiled: ReturnType<typeof compileBlenderEpisode>,
  sequence: CompositionSequenceAsset,
  anchorFrames?: BlenderAnchorFrames,
) {
  const { plan, frameCount, speechSourceSha256 } = compiled;
  if (
    sequence.frameCount !== frameCount ||
    sequence.width !== plan.width ||
    sequence.height !== plan.height ||
    sequence.frameRate.numerator !== plan.fps ||
    sequence.frameRate.denominator !== 1
  )
    throw Error(
      "Native plate sequence must match the whole episode clock and dimensions",
    );
  const layout = mechanismCueCaptionLayout(plan.width, plan.height);
  const layers: CompositionLayer[] = composeBlenderCallouts(
    compiled,
    anchorFrames,
  );
  for (const cue of plan.speech) {
    const start = blenderEpisodeFrameCount(cue.startSample, plan.fps),
      end = blenderEpisodeFrameCount(cue.endSampleExclusive, plan.fps),
      layer = "speech-" + cue.id;
    const speechCue = {
      id: "caption-" + cue.id,
      cueId: cue.id,
      purpose: "Display authored speech",
      layer,
      text: cue.text,
      start,
      end,
      sourceSha256: speechSourceSha256,
      audioLayer: "narration",
      audioSha256: plan.narration.sha256,
      locale: plan.locale,
    };
    layers.push({
      id: layer,
      type: "text",
      text: cue.text,
      textRole: "body",
      fontAsset: "episode-font",
      fontSize: layout.fontSize,
      color: "#ffffff",
      align: "center",
      anchor: "top",
      size: layout.textSize,
      textBox: {
        locale: plan.locale,
        maxLines: layout.maxLines,
        lineHeight: layout.lineHeight,
      },
      inPoint: start,
      outPoint: end,
      transform: { anchor: [0, 0], position: layout.textPosition },
      metadata: {
        speechCue,
        sourceSamples: [cue.startSample, cue.endSampleExclusive],
      },
    });
    layers.push({
      id: "panel-" + cue.id,
      type: "shape",
      inPoint: start,
      outPoint: end,
      transform: { position: layout.panelPosition },
      contents: [
        { id: "panel", type: "rect", size: layout.panelSize, roundness: 4 },
        { id: "fill", type: "fill", color: "#101820eb" },
      ],
    });
  }
  layers.push({
    id: "narration",
    type: "audio",
    role: "narration",
    asset: plan.narration.id,
    sourceStartSample: 0,
    sourceEndSample: plan.narration.sampleCount,
    inPoint: 0,
    outPoint: frameCount,
  });
  layers.push({
    id: "native-plates",
    type: "sequence",
    asset: sequence.id,
    size: [plan.width, plan.height],
    fit: "stretch",
    frameBlending: "hold",
    sourceInFrame: 0,
    sourceOutFrame: frameCount,
    inPoint: 0,
    outPoint: frameCount,
    transform: { anchor: [0, 0], position: [0, 0] },
  });
  return CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: plan.id,
    width: plan.width,
    height: plan.height,
    fps: plan.fps,
    frameCount,
    background: plan.background,
    assets: [
      sequence,
      { id: "episode-font", type: "font", ...plan.font },
      plan.narration,
    ],
    layers,
  });
}
