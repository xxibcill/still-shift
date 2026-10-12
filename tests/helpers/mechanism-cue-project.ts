import type { MechanismNarratedCycle } from "@still-shift/scene-contract";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { narratedCycleFixture } from "./mechanism-narrated-cycle.ts";
import { mediaFloat32Wave } from "./composition-media-audio.ts";
import { mechanismHash } from "../../packages/animation-engine/src/mechanism/io.ts";
import {
  createMechanismFamilyAuthoring,
  saveMechanismFamilyAuthoring,
} from "../../packages/animation-engine/src/mechanism/family-authoring.ts";
import { saveMechanismCueAuthoring } from "../../packages/animation-engine/src/mechanism/cue-authoring.ts";
export async function createCueProjectFixture(
  directory: string,
  family: "tape-hook" | "cable-tie" | "clothespeg" = "tape-hook",
  output?: MechanismNarratedCycle["output"],
) {
  await mkdir(directory, { recursive: true });
  const { instance, document } = narratedCycleFixture(family, 96000),
    source = JSON.stringify(instance.scene, null, 2) + "\n";
  await writeFile(join(directory, "scene.json"), source);
  document.source.path = "scene.json";
  document.source.sha256 = mechanismHash(source);
  const font = resolve("assets/story-motion/fonts/plex-sans-semibold.ttf");
  document.font.path = font;
  document.font.sha256 = mechanismHash(await readFile(font));
  const recording = mediaFloat32Wave(
      96000,
      1,
      (sample) => 0.02 * Math.sin(sample * 0.023),
    ),
    tick = mediaFloat32Wave(
      2400,
      1,
      (sample) => 0.035 * Math.sin(sample * 0.3) * (1 - sample / 2400),
    );
  await writeFile(join(directory, "narration.wav"), recording.wav);
  await writeFile(join(directory, "tick.wav"), tick.wav);
  document.narration.path = "narration.wav";
  document.narration.sha256 = mechanismHash(recording.wav);
  document.output = output ?? { width: 240, height: 136, fps: 30 };
  if (output)
    for (const cue of document.cues)
      cue.annotations = cue.annotations.map((annotation) => ({
        ...annotation,
        position: [
          (annotation.position[0] * output.width) / 240,
          (annotation.position[1] * output.height) / 136,
        ] as [number, number],
      }));
  for (const cue of document.cues)
    for (const sound of cue.sounds) {
      sound.asset.path = "tick.wav";
      sound.asset.sha256 = mechanismHash(tick.wav);
    }
  const familyPath = join(directory, "family.json"),
    cuePath = join(directory, "cues.json");
  await saveMechanismFamilyAuthoring(
    createMechanismFamilyAuthoring(family, "demo").document,
    familyPath,
  );
  await saveMechanismCueAuthoring(instance, document, cuePath);
  return { familyPath, cuePath, instance, document };
}
