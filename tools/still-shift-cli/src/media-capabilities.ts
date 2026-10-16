import { OVERLAP_RECOVERY_LIMITS } from "./overlay-overlap-policy.ts";
import { CompositionNative3DAssetVersionsSchema } from "@still-shift/scene-contract";
import { COMPOSITION_OUTPUT_FORMATS } from "@still-shift/execution-runtime/export";
import { RIGID_GLTF_LIMITS } from "../../../packages/animation-engine/src/mechanism/gltf-document.ts";
import { MECHANISM_PRODUCTION_QUEUE_LIMITS } from "../../../packages/animation-engine/src/mechanism/production-queue-contract.ts";

/** These routes share discovery and documentation; protocol1 fields keep their original scope. */
export function inspectMediaCapabilities() {
  return {
    schemaVersion: "still-shift-media-capabilities-1" as const,
    imports: {
      rigidGltf: {
        entryPoint: "Node API: importRigidGltf / decodeRigidGltfFile",
        containers: ["gltf", "glb"],
        limits: RIGID_GLTF_LIMITS,
        coordinates: "right-handed-y-up-meters",
        subset:
          "static-triangle-rigid-hierarchy-opaque-core-metallic-roughness-uv0",
        excluded: [
          "animation",
          "skin",
          "morph",
          "sparse-accessors",
          "required-extensions",
          "remote-resource-fetch",
        ],
        result:
          "rigid-gltf-asset-1 intermediate asset, not a native composition source",
        nativeHandoff:
          "prepareRigidGltfPbr, authored mechanism-scene-3, separately verified hashed RGBA resources",
        cliImport: false,
      },
    },
    routes: [
      {
        id: "composition-native",
        command: "comp preview / comp render",
        sources: [
          ...CompositionNative3DAssetVersionsSchema.shape.format.options,
        ],
        backend: "webgl2",
        preview:
          "prepared native composition with verified source/resources; browser hardware appearance is separately assessed",
        export: "authenticated original output-frame observations",
        workers: [1],
        formats: [...COMPOSITION_OUTPUT_FORMATS],
        defaultFormat: "legacy-mp4",
        source3Resources:
          "verified binary RGBA handoff required for preview and export",
      },
      {
        id: "episode-legacy",
        command: "episode preview / episode render",
        sources: ["mechanism-episode-1"],
        routes: ["bridge", "native3d"],
        nativeSources: ["mechanism-scene-1", "solid-scene-1"],
        preview: "one requested frame",
        export: "whole episode with final-file checking",
        formats: ["legacy-mp4"],
        workers: [1],
      },
      {
        id: "cue-native-plates",
        command: "episode compile / prepare / render / check --authoring cue",
        sources: ["mechanism-narrated-cycle-1"],
        nativeSources: ["mechanism-scene-2"],
        backend: "webgl2",
        captureFormat: "png16",
        exportFormats: ["legacy-mp4"],
        workers: [1],
        cache:
          "native-picture binding and original observations; overlay-only revisions reuse verified plates",
      },
    ],
    recovery: {
      entryPoint: "episode patch --recovery overlap",
      limits: OVERLAP_RECOVERY_LIMITS,
      route: "bridge",
      measurements:
        "current measured target/qualification glyphs and source-bound sidecars",
      preservation:
        "current clean plates, sidecars, dependencies and neighbor findings",
      status:
        "scoped recovery; whole final check and remaining findings reported separately",
    },
    outputConstraints: {
      dimensions: { minimum: 16, maximum: 8192 },
      profiledTransports: ["png_pipe", "raw_rgba"],
      nativeWorkers: [1],
      ordinaryCompositionWorkers: [1, 2, 3, 4],
      precision:
        "higher-bit-depth encoding converts RGBA8 capture; it does not establish higher-precision source capture",
    },
    batch: {
      image: {
        command: "batch",
        input: "JSONL image requests",
        concurrency: [1, 2],
        scope: "image animation requests; not an episode composition queue",
      },
      mechanism: {
        command: "production queue / run",
        items: MECHANISM_PRODUCTION_QUEUE_LIMITS.items,
        workers: 1,
        scope:
          "serial pinned family/cue projects with durable attempts and exact-CAS revisions",
      },
    },
    qualification:
      "Implemented route and parser limits. Source admission, software export evidence, hardware appearance, supported packs and whole pilot review are separate requirements.",
  };
}

export function mediaCapabilityRows() {
  const caps = inspectMediaCapabilities();
  return [
    {
      kind: "overlap-recovery",
      entryPoint: caps.recovery.entryPoint,
      route: caps.recovery.route,
      ...caps.recovery.limits,
    },
    {
      kind: "import-capability",
      import: "rigid-gltf",
      containers: caps.imports.rigidGltf.containers.join(" "),
      entryPoint: caps.imports.rigidGltf.entryPoint,
      cliImport: false,
      sourceBytes: caps.imports.rigidGltf.limits.sourceBytes,
      subset: caps.imports.rigidGltf.subset,
    },
    ...caps.routes.map((route) => ({
      kind: "render-capability",
      route: route.id,
      entryPoint: route.command,
      sources: route.sources.join(" "),
      workers: route.workers.join(" "),
      formats: ("formats" in route ? route.formats : route.exportFormats).join(
        " ",
      ),
    })),
    {
      kind: "batch-capability",
      route: "image",
      entryPoint: caps.batch.image.command,
      concurrency: caps.batch.image.concurrency.join(" "),
      scope: caps.batch.image.scope,
    },
    {
      kind: "batch-capability",
      route: "mechanism",
      entryPoint: caps.batch.mechanism.command,
      items: caps.batch.mechanism.items,
      workers: caps.batch.mechanism.workers,
      scope: caps.batch.mechanism.scope,
    },
  ];
}

export function mediaCapabilityMarkdown() {
  const caps = inspectMediaCapabilities();
  const routes = caps.routes
    .map(
      (r) =>
        `| ${r.id} | ${r.command} | ${r.sources.join(", ")} | ${r.workers.join(", ")} | ${("formats" in r ? r.formats : r.exportFormats).join(", ")} |`,
    )
    .join("\n");
  return `\n## Import, batch and rendering routes\n\nGenerated from the same scoped data exposed by episode and production discovery. Legacy episode protocol1 version fields retain their original meaning.

Automatic bridge overlap recovery uses \`episode patch --recovery overlap\` with current \`--input\`, \`--prepared-dir\`, \`--final-output\`, fresh \`--output-dir\` and \`--cache-dir\`. Its bounds are${caps.recovery.limits.targets} target,${caps.recovery.limits.candidates} candidates,${caps.recovery.limits.patches} patch and${caps.recovery.limits.renders} export. It requires current measured target/qualification glyphs, retains the bad check and exact-CAS request, reuses every current clean plate and rechecks the final file. Unsupported/multiple targets or exhausted candidates leave source unchanged. Other final findings remain visible.\n\n| Route | Entry point | Source | Workers | Export formats |\n| --- | --- | --- | --- | --- |\n${routes}\n\nRigid glTF/GLB import uses the Node API, without a glTF import CLI. The static triangle, rigid hierarchy, opaque core metallic/roughness and UV0 subset produces an intermediate asset. Native preview/export requires an authored mechanism-scene-3 plus separately verified hashed RGBA resources prepared through prepareRigidGltfPbr. Animation, skin, morph, sparse accessors, required extensions and remote resource fetching are excluded. Source bytes are capped at ${caps.imports.rigidGltf.limits.sourceBytes}; dependencies at ${caps.imports.rigidGltf.limits.dependencyBytes}; image bytes at ${caps.imports.rigidGltf.limits.imageBytes}; texture pixels at ${caps.imports.rigidGltf.limits.texturePixels}. The complete report contains all import limits.\n\nImage batch consumes JSONL image requests with concurrency1–2. It is not an episode composition queue. Production consumes at most ${caps.batch.mechanism.items} pinned family/cue projects with one serial worker and retained attempts.\n\nOmitting the composition format retains legacy MP4 output. Profiled output dimensions are16–8192, with format-specific even-dimension requirements and lossless PNG/raw RGBA transport. Ordinary compositions accept1–4 workers; authenticated native observation delivery requires1. Higher-bit-depth profiles convert RGBA8 capture and do not establish higher-precision source capture.\n\nNative composition preview/export shares prepared source/resource admission. Hardware preview appearance needs its own evidence. Episode preview returns one requested frame; episode export checks the whole final file. Cue capture stores png16 native plates, then exports MP4 overlays under the original picture/observation binding. Supported packs and whole pilot review remain separate.\n`;
}
