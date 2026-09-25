import { stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type GateEvidence = { label: string; target: string };

export const evaluationGuidePath = fileURLToPath(
  new URL("../../docs/v0.10-evaluation-release.md", import.meta.url),
);
export const parityGuidePath = fileURLToPath(
  new URL("../../docs/v0.7-preview-export-parity.md", import.meta.url),
);

export const resolveSuppliedEvidence = async (
  value: string | undefined,
): Promise<string | null> => {
  if (!value?.trim()) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).href;
    } catch {
      return null;
    }
  }
  const path = resolve(value);
  try {
    return (await stat(path)).isFile() ? path : null;
  } catch {
    return null;
  }
};

export const formatGateEvidence = (
  reportPath: string,
  references: readonly GateEvidence[],
): string => {
  if (references.length === 0)
    throw new Error("Every exit gate needs an evidence reference");
  return references
    .map(({ label, target }) => {
      const href = /^https?:\/\//i.test(target)
        ? new URL(target).href.replaceAll("|", "%7C").replaceAll(">", "%3E")
        : relative(dirname(reportPath), target)
            .split(sep)
            .map(encodeURIComponent)
            .join("/");
      return `[${label}](<${href}>)`;
    })
    .join(", ");
};
