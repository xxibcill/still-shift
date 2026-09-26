import type { PreparedScene } from "../../scene-contract/src/prepared.ts";
import { sha256Hex } from "./browser-checksum.ts";

export type LoadedFont = { family: string; weight: string };

export async function loadPreparedFonts(
  scene: Pick<PreparedScene, "fonts">,
  assetUrl: (id: string) => string,
): Promise<Map<string, LoadedFont>> {
  const entries = await Promise.all(
    (scene.fonts ?? []).map(async (font) => {
      const response = await fetch(assetUrl(font.id));
      if (!response.ok) throw new Error(`Font unavailable: ${font.id}`);
      const bytes = await response.arrayBuffer();
      const checksum = await sha256Hex(bytes);
      if (`sha256:${checksum}` !== font.sha256)
        throw new Error(`Font checksum differs: ${font.id}`);
      const family = `StillShift-${checksum}`;
      const face =
        [...document.fonts].find(
          (candidate) =>
            candidate.family === family && candidate.weight === font.weight,
        ) ?? new FontFace(family, bytes, { weight: font.weight });
      try {
        await face.load();
      } catch {
        throw new Error(`Cannot decode font: ${font.id}`);
      }
      document.fonts.add(face);
      return [font.id, { family, weight: font.weight }] as const;
    }),
  );
  return new Map(entries);
}
