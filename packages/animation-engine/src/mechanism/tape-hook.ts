import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  MechanismEpisodeSchema,
  MechanismSceneSchema,
  MechanismGeometrySchema,
  type MechanismEpisode,
  type MechanismShot,
  type MechanismLabel,
  type MechanismVector,
} from "@still-shift/scene-contract";
import {
  createTapeHookGeometry,
  TAPE_HOOK_RIVET_MESH_IDS,
  TAPE_HOOK_LIGHTING_PROFILE,
} from "./geometry.ts";
import {
  mechanismContentHash,
  mechanismHash,
  readMechanismEpisode,
  writeMechanismJson,
} from "./io.ts";
import { readFontIdentity } from "../../../renderer-core/src/font-identity.ts";

const yUp = (p: MechanismVector): MechanismVector => [p[0], p[2], -p[1]];
export function createTapeHookScene({
  hookThickness = 0.18,
  bladeLength = 10,
  bladeWidth = 2,
}: { hookThickness?: number; bladeLength?: number; bladeWidth?: number } = {}) {
  const geometry = MechanismGeometrySchema.parse(
    createTapeHookGeometry({ hookThickness, bladeLength, bladeWidth }),
  );
  const profile = TAPE_HOOK_LIGHTING_PROFILE;
  return MechanismSceneSchema.parse({
    schemaVersion: "mechanism-scene-1",
    id: "tape-hook-e01",
    geometrySha256: mechanismContentHash(geometry),
    coordinateSystem: "right-handed-y-up",
    units: { kind: "illustrative", scaleToMeters: 1 },
    seed: 42,
    geometry,
    parts: [
      { id: "model" },
      { id: "hook", parent: "model" },
      { id: "blade", parent: "model" },
      {
        id: "housing",
        parent: "model",
        transform: { position: [bladeLength + 0.5, 2.55, 0] },
      },
      { id: "board" },
      { id: "wall" },
      { id: "floor" },
      { id: "datum" },
      { id: "thickness", parent: "hook" },
      { id: "travel", parent: "model" },
    ],
    rigs: [
      {
        id: "slider",
        type: "tape-hook-slider",
        rootPart: "model",
        hookPart: "hook",
        bladePart: "blade",
        rivetMeshIds: [...TAPE_HOOK_RIVET_MESH_IDS],
        thickness: hookThickness,
      },
    ],
    anchors: [
      {
        id: "hook.innerFace",
        part: "hook",
        position: [0, 1.25, 0.92],
        role: "physical-inner-face",
      },
      {
        id: "hook.outerFace",
        part: "hook",
        position: [-hookThickness, 1.25, 0.92],
        role: "physical-outer-face",
      },
      {
        id: "hook.thickness",
        part: "hook",
        position: [-hookThickness / 2, 1.18, 1.2],
        role: "proof-target",
      },
      {
        id: "rivet.travel",
        part: "blade",
        position: [0.72, 2.24, 0.02],
        role: "proof-target",
      },
      {
        id: "hook.flange",
        part: "hook",
        position: [1.25, 2.16, 0.24],
        role: "proof-target",
      },
      {
        id: "contact.datum",
        part: "datum",
        position: [0, 2.24, 1.163],
        role: "proof-target",
      },
      {
        id: "hook.pullProof",
        part: "hook",
        position: [0.95, 2.12, 0.25],
        role: "proof-target",
      },
      {
        id: "hook.slideProof",
        part: "hook",
        position: [0.22, 2.12, 0.6],
        role: "proof-target",
      },
      {
        id: "hook.thicknessMarker",
        part: "thickness",
        position: [-hookThickness / 2, 1.18, 1.212],
        role: "proof-target",
      },
      {
        id: "rivet.travelMarker",
        part: "travel",
        position: [0.72 - hookThickness / 2, 2.234, 0.47],
        role: "proof-target",
      },
      {
        id: "housing.center",
        part: "housing",
        position: [0, 0, 0],
        role: "proof-target",
      },
    ],
    camera: {
      position: yUp([-4.6, -7.1, 6.4]),
      target: yUp([1.1, 0, 1.3]),
      fovDegrees: 35,
      near: 0.03,
      far: 100,
    },
    profile: {
      toneMapping: profile.toneMapping,
      exposure: profile.exposure,
      output: "srgb-rgba8-straight",
      background: profile.background,
      environment: profile.environment,
      environmentIntensity: profile.environmentIntensity,
      fog: { color: profile.background, near: 22, far: 65 },
    },
    lights: [
      {
        id: "key",
        type: "directional",
        position: [...profile.keyLight.position],
        target: [0, 0, 0],
        color: profile.keyLight.color,
        intensity: profile.keyLight.intensity,
        castShadow: true,
        shadowMapSize: profile.shadowMapSize,
        shadowBias: -0.0003,
        shadowNormalBias: 0.018,
        shadowRadius: 4,
      },
      {
        id: "fill",
        type: "directional",
        position: [...profile.fillLight.position],
        target: [0, 0, 0],
        color: profile.fillLight.color,
        intensity: profile.fillLight.intensity,
        castShadow: true,
        shadowMapSize: profile.shadowMapSize,
        shadowBias: -0.0003,
        shadowNormalBias: 0.018,
        shadowRadius: 5,
      },
    ],
  });
}
const ranges = [0, 78, 163, 247, 336, 418, 472, 526, 603, 696];
const purposes = [
  "recognize",
  "pull-contact",
  "push-contact",
  "thickness-proof",
  "travel-proof",
  "aligned-inner-face",
  "aligned-outer-face",
  "fixed-rivets-slot-slide",
  "return-context",
];
const cameraPositions: MechanismVector[] = [
  [-4.6, -7.1, 6.4],
  [-4.2, -6.8, 5.6],
  [2.2, -7.5, 5.5],
  [-2.3, -5.4, 3.5],
  [1.1, -3.8, 6.6],
  [0.4, -7.7, 3.5],
  [0.4, -7.7, 3.5],
  [1.3, -3.5, 7.3],
  [-4.2, -6.8, 5.6],
];
const cameraTargets: MechanismVector[] = [
  [1.1, 0, 1.3],
  [0.8, 0, 1.25],
  [0.72, 0, 1.3],
  [0.26, 0, 1.18],
  [0.8, 0, 2],
  [0.9, 0, 1.3],
  [0.9, 0, 1.3],
  [0.95, 0, 1.99],
  [0.8, 0, 1.45],
];
const fovs = [35, 36, 35, 35, 34, 34, 34, 35, 36];
const keys = (pairs: [number, number][]) =>
  pairs.map(([frame, value]) => ({
    frame,
    value,
    easing: "smoothstep" as const,
  }));
export function createTapeHookShots(): MechanismShot[] {
  const motion = [
    keys([
      [0, 1],
      [9, 1],
      [21.6, 0],
      [33, 0],
      [43.8, 1],
      [49.5, 1],
      [60.9, 0],
    ]),
    keys([
      [78, 1],
      [109.5, 1],
      [138, 0],
    ]),
    keys([
      [163, 0],
      [195, 0],
      [228, 1],
    ]),
    keys([[247, 0]]),
    keys([
      [336, 0],
      [340.5, 0],
      [361.5, 1],
      [382.5, 1],
      [402, 0],
    ]),
    keys([[418, 0]]),
    keys([[472, 1]]),
    keys([
      [526, 0],
      [534, 0],
      [550.5, 1],
      [564, 1],
      [582.6, 0],
    ]),
    keys([[603, 0]]),
  ];
  const roles = [
    null,
    "PULL",
    "PUSH",
    "THICKNESS",
    "TRAVEL",
    "INSIDE",
    "OUTSIDE",
    "SLIDES",
    null,
  ] as const;
  const anchors = [
    null,
    "hook.pullProof",
    "hook.innerFace",
    "hook.thicknessMarker",
    "rivet.travelMarker",
    "contact.datum",
    "contact.datum",
    "hook.slideProof",
    null,
  ];
  const proofTargets = [
    null,
    "hook.innerFace",
    "hook.outerFace",
    "hook.thickness",
    "rivet.travel",
    "hook.innerFace",
    "hook.outerFace",
    "hook.flange",
    null,
  ];
  const positions: [number, number][] = [
    [0, 0],
    [740, 470],
    [220, 430],
    [640, 830],
    [670, 690],
    [640, 740],
    [140, 740],
    [660, 690],
    [0, 0],
  ];
  return purposes.map((purpose, index) => {
    const start = ranges[index]!,
      end = ranges[index + 1]!,
      labelStart = start + 10;
    const labels: MechanismLabel[] = roles[index]
      ? [
          {
            id: `label-${roles[index]!.toLowerCase()}`,
            role: roles[index]!,
            text: roles[index]!,
            anchor: anchors[index]!,
            proofTarget: proofTargets[index]!,
            position: positions[index]!,
            readingInterval: {
              startFrame: labelStart,
              endFrameExclusive: end - 3,
            },
            fontSize: 48,
            visibilityPolicy: "hide-occluded",
            ...([3, 4, 7].includes(index)
              ? { qualification: "Illustrative enlarged view" }
              : {}),
          },
        ]
      : [];
    const camera = {
      position: yUp(cameraPositions[index]!),
      target: yUp(cameraTargets[index]!),
      up: [0, 1, 0] as MechanismVector,
      fovDegrees: fovs[index]!,
      near: 0.03,
      far: 100,
    };
    const cameraEnd =
      index === 8
        ? yUp([-15, -10, 18])
        : yUp([
            cameraPositions[index]![0] +
              ([0, 1, 3, 7].includes(index) ? 0.25 : 0),
            cameraPositions[index]![1],
            cameraPositions[index]![2],
          ]);
    return {
      id: `V8-${String(index + 1).padStart(2, "0")}`,
      purpose,
      startFrame: start,
      endFrameExclusive: end,
      camera,
      cameraKeys: [
        {
          frame: start,
          position: camera.position,
          target: camera.target,
          easing: index === 8 ? "smoothstep" : "linear",
        },
        {
          frame: end - 1,
          position: cameraEnd,
          target: index === 8 ? yUp([4.6, 0, 1.45]) : camera.target,
          easing: "hold",
        },
      ],
      controls: {
        slider: {
          travelKeys: motion[index]!,
          contactMode: [1, 5, 8].includes(index)
            ? "pull"
            : [2, 6].includes(index)
              ? "push"
              : "free",
        },
      },
      hiddenParts: [
        ...([5, 6].includes(index) ? [] : ["datum"]),
        ...(index === 3 ? [] : ["thickness"]),
        ...(index === 4 ? [] : ["travel"]),
        ...([1, 5, 8].includes(index) ? [] : ["board"]),
        ...([2, 6].includes(index) ? [] : ["wall"]),
      ],
      labels,
    };
  });
}
/** Copy only explicitly supplied local assets; no episode-owned browser or renderer is carried. */
export async function createTapeHookProject(options: {
  outputDirectory: string;
  fontPath: string;
  fontLicensePath?: string;
  audioPath?: string;
  captionsPath?: string;
}) {
  const directory = resolve(options.outputDirectory);
  await mkdir(directory, { recursive: false });
  try {
    await mkdir(join(directory, "assets"));
    const scene = createTapeHookScene();
    await writeMechanismJson(join(directory, "scene.json"), scene);
    const fontBytes = await readFile(options.fontPath),
      identity = readFontIdentity(
        fontBytes.buffer.slice(
          fontBytes.byteOffset,
          fontBytes.byteOffset + fontBytes.byteLength,
        ),
      );
    const fontName = basename(options.fontPath);
    await copyFile(options.fontPath, join(directory, "assets", fontName));
    const dependencies: MechanismEpisode["dependencies"] = [
      {
        id: "scene",
        type: "scene" as const,
        path: "scene.json",
        sha256: mechanismHash(await readFile(join(directory, "scene.json"))),
      },
      {
        id: "plex",
        type: "font" as const,
        path: `assets/${fontName}`,
        sha256: mechanismHash(fontBytes),
        weight: "600",
        family: identity.family,
        subfamily: identity.subfamily,
        postscriptName: identity.postscriptName,
        style: identity.style,
        profile: "strict" as const,
      },
    ];
    if (options.fontLicensePath) {
      const name = basename(options.fontLicensePath),
        licensePath = `assets/${name}`;
      const bytes = await readFile(options.fontLicensePath);
      await copyFile(options.fontLicensePath, join(directory, licensePath));
      dependencies.push({
        id: "font-license",
        type: "license",
        path: licensePath,
        sha256: mechanismHash(bytes),
      });
      const font = dependencies.find((dependency) => dependency.id === "plex")!;
      font.license = licensePath;
    }
    if (options.audioPath) {
      const name = basename(options.audioPath);
      await copyFile(options.audioPath, join(directory, "assets", name));
      dependencies.push({
        id: "narration",
        type: "audio",
        path: `assets/${name}`,
        sha256: mechanismHash(await readFile(options.audioPath)),
      });
    }
    let captions: {
      id: string;
      text: string;
      startFrame: number;
      endFrameExclusive: number;
    }[] = [];
    if (options.captionsPath) {
      const name = basename(options.captionsPath),
        bytes = await readFile(options.captionsPath);
      await copyFile(options.captionsPath, join(directory, "assets", name));
      dependencies.push({
        id: "captions",
        type: "captions",
        path: `assets/${name}`,
        sha256: mechanismHash(bytes),
      });
      const value = JSON.parse(bytes.toString("utf8")) as {
        id: number;
        text: string;
        startFrame: number;
        endFrame: number;
      }[];
      captions = value.map((item) => ({
        id: `caption-${item.id}`,
        text: item.text,
        startFrame: item.startFrame,
        endFrameExclusive: item.endFrame,
      }));
    }
    const shots = createTapeHookShots();
    const episode = MechanismEpisodeSchema.parse({
      schemaVersion: "mechanism-episode-1",
      id: "e01-tape-hook",
      revision: 0,
      scene: "scene",
      font: "plex",
      ...(options.audioPath ? { audio: "narration" } : {}),
      output: { width: 1080, height: 1920, fps: 30, frameCount: 696 },
      dependencies,
      shots,
      captions,
      events: shots.map((shot) => ({
        id: `${shot.id}.start`,
        frame: shot.startFrame,
        shot: shot.id,
        rig: "slider",
        purpose: shot.purpose,
      })),
    });
    const path = join(directory, "episode.json");
    await writeMechanismJson(path, episode);
    const loaded = await readMechanismEpisode(path);
    return {
      schemaVersion: "mechanism-project-created-1" as const,
      path,
      projectHash: loaded.projectHash,
      revision: episode.revision,
      geometrySha256: scene.geometrySha256,
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
