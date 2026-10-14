import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  compileBlenderEpisode,
  evaluateBlenderProductionQA,
  BlenderEpisodePlatesSchema,
  checkBlenderEpisodePlates,
  blenderEpisodePlateKey,
  readBlenderEpisodeAnchorFrames,
  type BlenderProductionIdentity,
} from "@still-shift/animation-engine";
import {
  blenderEpisodeSource,
  blenderEpisodePlan,
  blenderHash,
} from "../fixtures/blender-episode-support.ts";
import { productionFile } from "../../packages/animation-engine/src/mechanism/production-queue-files.ts";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";

async function nativeFixture(
  options: {
    callout?: boolean;
    shot?: {
      framing?: { orthoScale: number; shiftX?: number };
      shownParts?: string[];
      hiddenParts?: string[];
    };
    camera?: { orthoScale?: number; shiftX?: number };
    parts?: Array<{ name: string; visible: boolean }>;
  } = {},
) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "blender-plate-fixture-")),
  );
  await mkdir(join(root, "capture"));
  const plan = blenderEpisodePlan();
  plan.controlTracks["slider.travel"] = [
    { frame: 0, value: 0.34, interpolation: "hold" },
  ];
  plan.shots = [
    {
      id: "held",
      start: 0,
      endExclusive: 60,
      camera: "camera.main",
      hiddenParts: [],
    },
  ];
  Object.assign(plan.shots[0]!, options.shot);
  if (options.callout)
    Object.assign(plan, {
      callouts: [
        {
          id: "cup",
          text: "Cup",
          shot: "held",
          anchor: "anchor.cup",
          part: "cup",
          start: 0,
          endExclusive: 60,
          position: [0.3, 0.2],
          color: "#ffc14a",
          controlRanges: {},
        },
      ],
    });
  const compiled = compileBlenderEpisode(blenderEpisodeSource(), plan);
  const pin = async (path: string, content: string) => {
    const bytes = Buffer.from(content);
    await writeFile(join(root, path), bytes);
    return { path, bytes: bytes.length, sha256: blenderHash(bytes) };
  };
  const worker = await pin(
    "capture/frozen-worker.py",
    "synthetic byte fixture; no native execution",
  );
  const profile = {
    backend: "blender-native" as const,
    blenderExecutableSha256: blenderHash("fixture-executable"),
    blenderVersion: "Blender fixture\nbuild hash: fffff",
    workerSha256: worker.sha256,
    receiverProfileSha256: blenderHash("receiver"),
  };
  const identity: BlenderProductionIdentity = {
    codeSha256: blenderHash("fixture-code"),
    profileSha256: mechanismPackHash(profile),
    profile,
  };
  const job = {
    ...compiled.job,
    outputDirectory: root,
    frames: [compiled.job.frames[0]!],
  };
  const frozen = await pin("capture/frozen-job.json", JSON.stringify(job));
  const image = await pin(
    "capture/image.png",
    "synthetic byte fixture; not a rendered image",
  );
  const observation = await pin(
    "capture/observation.json",
    JSON.stringify({
      schemaVersion: "blender-native-observed-frame-1",
      outputFrame: 0,
      sourceFrame: 0,
      sourceAssetSha256: job.assetSha256,
      camera: {
        name: "camera.main",
        type: "ORTHO",
        orthoScale: 4,
        shiftX: 0.2,
        ...options.camera,
      },
      requestedControls: job.frames[0]!.controls,
      actualControls: job.frames[0]!.controls,
      anchors: options.callout
        ? {
            "anchor.cup": {
              kind: "object-origin",
              world: [0, 0, 0],
              pixel: [100, 200],
              depth: 5,
              inFrame: true,
            },
          }
        : {},
      parts: options.parts ?? [],
    }),
  );
  const receipt = await pin(
    "capture/capture.json",
    JSON.stringify({
      summary: {
        sourceAssetSha256: job.assetSha256,
        frameCount: 1,
        blenderRenders: 1,
      },
      backend: { version: "fixture", buildHash: "fffff" },
      width: 320,
      height: 568,
      fps: 30,
      assetBytesUnchanged: true,
      frozenJob: { ...frozen, path: "frozen-job.json" },
      frozenWorker: { ...worker, path: "frozen-worker.py" },
      frames: [
        {
          frame: 0,
          sourceFrame: 0,
          image: { ...image, path: "image.png" },
          observation: { ...observation, path: "observation.json" },
        },
      ],
    }),
  );
  const producer = await pin(
    "capture/producer.json",
    JSON.stringify({
      schemaVersion: "blender-native-producer-seal-1",
      profile,
      capture: receipt,
    }),
  );
  const key = blenderEpisodePlateKey(
    compiled.job,
    compiled.job.frames[0]!,
    identity.profileSha256,
  );
  const frames = Array.from({ length: 60 }, (_, frame) => ({
    frame,
    key,
    capture: receipt,
    producer,
    captureFrame: 0,
    image,
    observation,
  }));
  const sequence = await pin(
    "sequence.json",
    JSON.stringify({
      schemaVersion: "composition-sequence-1",
      frames: frames.map((f) => f.image.sha256),
    }),
  );
  const map = {
    schemaVersion: "blender-episode-plates-1",
    producerProfileSha256: identity.profileSha256,
    frameCount: 60,
    frames,
    sequence,
    freshNativeRenders: 1,
    reusedOutputFrames: 59,
    freshCaptures: [receipt],
    cacheRejections: [],
  };
  return { root, compiled, identity, map };
}
describe("native frame dependency closure", () => {
  it("retains authenticated same-state label projections under the caller allowance and rejects changed records", async () => {
    const f = await nativeFixture({
        callout: true,
        parts: [{ name: "cup", visible: true }],
      }),
      parent = new CompositionNodeMemory(),
      foreign = parent.reserve(1024),
      owner = new CompositionNodeMemory(parent),
      before = parent.availableBytes;
    try {
      const data = await readBlenderEpisodeAnchorFrames(
        f.compiled,
        f.map as unknown as Parameters<
          typeof readBlenderEpisodeAnchorFrames
        >[1],
        f.identity,
        f.root,
        owner,
      );
      expect(data.frames).toHaveLength(60);
      expect(data.frames[17]).toMatchObject({
        anchors: { "anchor.cup": { pixel: [100, 200] } },
        partVisibility: { cup: true },
      });
      expect(parent.availableBytes).toBeLessThan(before);
      data.release();
      expect(parent.availableBytes).toBe(before);
      await writeFile(join(f.root, "capture/observation.json"), "changed");
      await expect(
        readBlenderEpisodeAnchorFrames(
          f.compiled,
          f.map as unknown as Parameters<
            typeof readBlenderEpisodeAnchorFrames
          >[1],
          f.identity,
          f.root,
          owner,
        ),
      ).rejects.toBeDefined();
      expect(parent.availableBytes).toBe(before);
      expect(foreign.active).toBe(true);
    } finally {
      owner.dispose();
      parent.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it("authenticates requested projection and explicit cutaway states against retained observations", async () => {
    for (const fault of [
      "none",
      "scale",
      "hidden",
      "shown",
      "missing",
    ] as const) {
      const f = await nativeFixture({
          shot: {
            framing: { orthoScale: 4, shiftX: 0.2 },
            hiddenParts: ["cover"],
            shownParts: ["section"],
          },
          camera: { orthoScale: fault === "scale" ? 5 : 4.00000001 },
          parts:
            fault === "missing"
              ? []
              : [
                  { name: "cover", visible: fault === "hidden" },
                  { name: "section", visible: fault !== "shown" },
                ],
        }),
        parent = new CompositionNodeMemory(),
        foreign = parent.reserve(1024),
        owner = new CompositionNodeMemory(parent);
      try {
        const result = checkBlenderEpisodePlates(
          f.map,
          f.compiled,
          f.identity,
          f.root,
          owner,
        );
        if (fault === "none") await expect(result).resolves.toEqual(f.map);
        else
          await expect(result).rejects.toThrow(
            fault === "scale" ? /framing differs/ : /visibility differs/,
          );
      } finally {
        owner.dispose();
        await rm(f.root, { recursive: true, force: true });
        expect(foreign.active).toBe(true);
        expect(parent.statistics.current.metadata).toBe(1024);
        parent.dispose();
      }
    }
  });

  it("verifies every mapped state and actual submission receipt while preserving a foreign owner", async () => {
    const f = await nativeFixture(),
      parent = new CompositionNodeMemory(),
      foreign = parent.reserve(1024),
      owner = new CompositionNodeMemory(parent);
    try {
      expect(
        await checkBlenderEpisodePlates(
          f.map,
          f.compiled,
          f.identity,
          f.root,
          owner,
        ),
      ).toEqual(f.map);
    } finally {
      owner.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
    expect(foreign.active).toBe(true);
    expect(parent.statistics.current.metadata).toBe(1024);
    parent.dispose();
  });
  it("replays native QA failures, pins peak images and rejects changed facts while preserving a foreign owner", async () => {
    const f = await nativeFixture(),
      parent = new CompositionNodeMemory(),
      foreign = parent.reserve(1024),
      owner = new CompositionNodeMemory(parent);
    try {
      await mkdir(join(f.root, "qa"));
      await writeFile(join(f.root, "map.json"), JSON.stringify(f.map));
      const map = BlenderEpisodePlatesSchema.parse(f.map);
      const plan = {
        schemaVersion: "blender-production-qa-plan-1",
        measurements: [
          {
            kind: "actual-control",
            measurement: "travel",
            control: "slider.travel",
          },
          {
            kind: "part-origin-drift",
            measurement: "missing",
            part: "absent.mount",
            referenceFrame: 0,
          },
        ],
        programs: [
          {
            id: "fixture-event",
            interval: { start: 0, endExclusive: 60 },
            registrations: [
              {
                schemaVersion: "mechanism-semantic-registration-1",
                id: "observed-defects",
                description:
                  "Synthetic byte fixture; no rendered-image or mechanical approval",
                domain: "mechanical",
                method: "sampled-numeric-range",
                requireEveryOutputFrame: true,
                rules: [
                  {
                    measurement: "travel",
                    range: [0, 0],
                    unit: "control-value",
                    rig: "controls",
                    parts: ["slider"],
                    relationship: "seeded-wrong-hold",
                  },
                  {
                    measurement: "missing",
                    range: [0, 0],
                    unit: "native-unit",
                    rig: "controls",
                    parts: ["absent.mount"],
                    relationship: "seeded-missing-mount",
                  },
                ],
              },
            ],
          },
        ],
      };
      const input = {
        plan,
        planSha256: blenderHash(JSON.stringify(plan)),
        compiled: f.compiled,
        map,
        identity: f.identity,
        binding: {
          inputSha256: blenderHash("inputs"),
          outputSha256: blenderHash("output"),
          codeSha256: f.identity.codeSha256,
          profileSha256: f.identity.profileSha256,
        },
        outputRoot: f.root,
        directory: join(f.root, "qa"),
        plates: await productionFile(f.root, "map.json", owner),
        owner,
      };
      const qa = await evaluateBlenderProductionQA(input);
      expect(qa.facts.failures.mechanical).toBe(120);
      const groups = JSON.parse(
        await readFile(join(f.root, "qa/qa-warning-groups.json"), "utf8"),
      );
      expect(groups.groups).toHaveLength(2);
      expect(groups.groups[0].badFrames[0]).toEqual({
        path: map.frames[0]!.image.path,
        sha256: map.frames[0]!.image.sha256,
      });
      expect(
        groups.groups
          .map(
            (g: { maximumMeasuredChange: number }) => g.maximumMeasuredChange,
          )
          .sort(),
      ).toEqual([0.34, 1]);
      expect(
        (await evaluateBlenderProductionQA({ ...input, verify: true })).facts,
      ).toEqual(qa.facts);
      await writeFile(
        join(f.root, "qa/qa-facts.json"),
        JSON.stringify({ ...qa.facts, failures: { mechanical: 0 } }),
      );
      await expect(
        evaluateBlenderProductionQA({ ...input, verify: true }),
      ).rejects.toThrow(/current observation replay/);
    } finally {
      owner.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
    expect(foreign.active).toBe(true);
    expect(parent.statistics.current.metadata).toBe(1024);
    parent.dispose();
  });
  it("rejects an altered capture ordinal even after the repeated key was verified", async () => {
    const f = await nativeFixture(),
      owner = new CompositionNodeMemory();
    try {
      f.map.frames[1]!.captureFrame = 1;
      await expect(
        checkBlenderEpisodePlates(f.map, f.compiled, f.identity, f.root, owner),
      ).rejects.toThrow(/cached frame/);
    } finally {
      owner.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("rejects changed cached bytes and rekeyed producer identity", async () => {
    const f = await nativeFixture(),
      owner = new CompositionNodeMemory();
    try {
      const bytes = await readFile(join(f.root, f.map.frames[0]!.image.path));
      await writeFile(join(f.root, f.map.frames[0]!.image.path), "changed");
      await expect(
        checkBlenderEpisodePlates(f.map, f.compiled, f.identity, f.root, owner),
      ).rejects.toThrow(/retained pin/);
      await writeFile(join(f.root, f.map.frames[0]!.image.path), bytes);
      const changed = { ...f.identity, profileSha256: blenderHash("rekey") };
      f.map.producerProfileSha256 = changed.profileSha256;
      for (const frame of f.map.frames)
        frame.key = blenderEpisodePlateKey(
          f.compiled.job,
          f.compiled.job.frames[frame.frame]!,
          changed.profileSha256,
        );
      await expect(
        checkBlenderEpisodePlates(f.map, f.compiled, changed, f.root, owner),
      ).rejects.toThrow(/producer seal/);
    } finally {
      owner.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("rejects guessed submission counts and the wrong output frame order", async () => {
    const f = await nativeFixture(),
      owner = new CompositionNodeMemory();
    try {
      f.map.freshNativeRenders = 2;
      await expect(
        checkBlenderEpisodePlates(f.map, f.compiled, f.identity, f.root, owner),
      ).rejects.toThrow(/submission counters/);
      f.map.freshNativeRenders = 1;
      f.map.frames[1]!.frame = 2;
      await expect(
        checkBlenderEpisodePlates(f.map, f.compiled, f.identity, f.root, owner),
      ).rejects.toThrow(/current episode plan/);
    } finally {
      owner.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
  });
});
