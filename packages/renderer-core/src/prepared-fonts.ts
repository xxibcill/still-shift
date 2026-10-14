import {
  decodeRenderFont,
  mapRenderResources,
  prepareRenderResources,
  readRenderAssetBody,
} from "./managed-resources.ts";
import {
  createRenderCanvas,
  releaseRenderCanvas,
} from "./managed-memory-context.ts";
import type { PreparedScene } from "../../scene-contract/src/prepared.ts";
import { sha256Hex } from "./browser-checksum.ts";

export type LoadedFont = {
  family: string;
  weight: string;
  style?: string;
  bytes?: ArrayBuffer;
  metrics?: FontMetrics;
  identity?: FontIdentity;
  fontDiagnostics?: FontValidationDiagnostic[];
};
import { readFontMetrics, type FontMetrics } from "./font-metrics.ts";
import { resolvedTextStyle, styleFontKey } from "./typography-style.ts";
import type { TextStyle } from "../../scene-contract/src/typography.ts";
import {
  inspectFontText,
  readFontIdentity,
  type FontIdentity,
  type FontDeclaration,
  type FontValidationDiagnostic,
  type FontValidationOptions,
} from "./font-identity.ts";
import { collectFontTextRuns, type FontCopyScene } from "./font-copy.ts";
import { PassageError, passageDiagnostics } from "./passage-diagnostics.ts";

export async function loadPreparedFonts(
  scene: Pick<PreparedScene, "fonts"> &
    Partial<Pick<PreparedScene, "nodes">> &
    FontCopyScene & {
      typography?: "type-1" | undefined;
      textStyles?: Record<string, TextStyle> | undefined;
    },
  assetUrl: (id: string) => string,
  validation?: FontValidationOptions,
): Promise<Map<string, LoadedFont>> {
  const textRuns = validation
    ? (validation.textRuns ?? collectFontTextRuns(scene))
    : [];
  return prepareRenderResources(async () => {
    const entries = await mapRenderResources(
      scene.fonts ?? [],
      async (font) => {
        const response = await fetch(assetUrl(font.id));
        if (!response.ok) throw new Error(`Font unavailable: ${font.id}`);
        const bytes = await readRenderAssetBody(response);
        const checksum = await sha256Hex(bytes);
        if (`sha256:${checksum}` !== font.sha256)
          throw new Error(`Font checksum differs: ${font.id}`);
        const inspection = validation
          ? inspectPreparedFont(
              bytes,
              { ...font, path: `fonts.${scene.fonts?.indexOf(font)}` },
              textRuns.filter((run) => run.fontAsset === font.id),
              validation,
            )
          : undefined;
        const metrics = scene.typography ? readFontMetrics(bytes) : undefined;
        if (
          font.variable &&
          JSON.stringify(Object.entries(font.variable).sort()) !==
            JSON.stringify(Object.entries(metrics?.axes ?? {}).sort())
        )
          throw new Error(
            `font-axis-metadata: ${font.id} differs from pinned bytes`,
          );
        const family = `StillShift-${checksum}`;
        const existing = [...document.fonts].find(
          (candidate) =>
            candidate.family === family &&
            candidate.weight === font.weight &&
            candidate.style === (font.style ?? "normal"),
        );
        const initialize = async (face: FontFace) => {
          try {
            await face.load();
          } catch {
            throw new Error(`Cannot decode font: ${font.id}`);
          }
          document.fonts.add(face);
        };
        if (existing) await initialize(existing);
        else
          await decodeRenderFont(
            family,
            bytes,
            { weight: font.weight, style: font.style ?? "normal" },
            initialize,
          );
        return [
          font.id,
          {
            family,
            weight: font.weight,
            style: font.style ?? "normal",
            bytes,
            ...(metrics ? { metrics } : {}),
            ...(inspection ?? {}),
          },
        ] as const;
      },
    );
    const fonts: Map<string, LoadedFont> = new Map(entries);
    if (scene.typography) {
      for (const node of scene.nodes ?? []) {
        if (node.type !== "text") continue;
        for (const span of [undefined, ...(node.spans ?? [])]) {
          const style = resolvedTextStyle(
            node,
            scene.textStyles ?? {},
            span?.style,
          );
          await loadTextStyleFont(style, fonts);
        }
      }
    }
    return fonts;
  });
}

export async function loadTextStyleFont(
  style: TextStyle,
  fonts: Map<string, LoadedFont>,
) {
  const key = styleFontKey(style);
  if (fonts.has(key)) return;
  const source = fonts.get(style.fontAsset ?? "");
  if (!source?.bytes || !source.metrics)
    throw new Error(`missing-layout-font: ${style.fontAsset}`);
  for (const [tag, value] of Object.entries(style.axes ?? {})) {
    const range = source.metrics.axes[tag];
    if (!range || value < range.min || value > range.max)
      throw new Error(`font-axis-range: ${tag}=${value}`);
  }
  const features = { ...style.features };
  if (style.figures) {
    const spacing =
      typeof style.figures === "string" ? style.figures : style.figures.spacing;
    features[spacing === "tabular" ? "tnum" : "pnum"] = 1;
    if (typeof style.figures === "object" && style.figures.style)
      features[style.figures.style === "lining" ? "lnum" : "onum"] = 1;
  }
  if (style.case === "small-caps") features.smcp = 1;
  for (const [tag, value] of Object.entries(features))
    if (value && !source.metrics.features.includes(tag) && tag !== "tnum")
      throw new Error(`unsupported-font-feature: ${tag} on ${style.fontAsset}`);
  const featureSettings =
    Object.entries(features)
      .sort()
      .map(([tag, value]) => `"${tag}" ${value}`)
      .join(", ") || "normal";
  const variationSettings =
    Object.entries(style.axes ?? {})
      .sort()
      .map(([tag, value]) => `"${tag}" ${value}`)
      .join(", ") || "normal";
  const digest = await sha256Hex(new TextEncoder().encode(key).buffer);
  const family = `${source.family}-${digest.slice(0, 16)}`;
  await prepareRenderResources(async () => {
    await decodeRenderFont(
      family,
      source.bytes!,
      {
        weight: source.weight,
        style: source.style ?? "normal",
        featureSettings,
        variationSettings,
      } as FontFaceDescriptors & { variationSettings: string },
      async (face) => {
        if (
          (featureSettings !== "normal" && face.featureSettings === "normal") ||
          (variationSettings !== "normal" &&
            !(face as FontFace & { variationSettings?: string })
              .variationSettings)
        )
          throw new Error("unsupported-typography: font descriptors");
        await face.load();
        document.fonts.add(face);
        if (features.tnum) {
          const probeCanvas = createRenderCanvas();
          try {
            const probe = probeCanvas.getContext("2d")!;
            probe.font = `${source.weight} 100px "${family}"`;
            const widths = Array.from(
              "0123456789",
              (digit) => probe.measureText(digit).width,
            );
            if (Math.max(...widths) - Math.min(...widths) > 0.01)
              throw new Error(
                `unsupported-font-feature: tabular figures on ${style.fontAsset}`,
              );
          } finally {
            releaseRenderCanvas(probeCanvas);
          }
        }
      },
    );
  });
  fonts.set(key, { ...source, family });
}

function inspectPreparedFont(
  bytes: ArrayBuffer,
  declaration: FontDeclaration,
  runs: Parameters<typeof inspectFontText>[2],
  validation: FontValidationOptions,
): { identity?: FontIdentity; fontDiagnostics: FontValidationDiagnostic[] } {
  let identity: FontIdentity | undefined;
  let fontDiagnostics: FontValidationDiagnostic[];
  try {
    identity = readFontIdentity(bytes);
    fontDiagnostics = inspectFontText(identity, declaration, runs, validation);
  } catch (error) {
    fontDiagnostics = passageDiagnostics(error).map((diagnostic) => ({
      ...diagnostic,
      severity: validation.profile === "strict" ? "error" : "warning",
      path: declaration.path ?? declaration.id,
      fontId: declaration.id,
      fontSha256: declaration.sha256,
    }));
  }
  validation.onDiagnostics?.(fontDiagnostics);
  if (validation.profile === "strict" && fontDiagnostics.length)
    throw new PassageError(fontDiagnostics);
  return { ...(identity ? { identity } : {}), fontDiagnostics };
}
