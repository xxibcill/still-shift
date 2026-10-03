import { fileURLToPath } from "node:url";
import { searchForWorkspaceRoot } from "vite";

export type BrowserRuntimeOptions = {
  /** Vite composition root; workspace discovery is the default for repository use. */
  projectRoot?: string;
};

export const defaultBrowserProjectRoot = searchForWorkspaceRoot(
  fileURLToPath(new URL("../", import.meta.url)),
);

/** Serve package-owned browser assets without assuming an application directory layout. */
export function runtimeBrowserUrl(
  baseUrl: string,
  page: "export" | "passage-text" | "composition-compile",
): string {
  const filename = page === "export" ? "index.html" : `${page}.html`;
  const path = fileURLToPath(new URL(`../${filename}`, import.meta.url));
  return new URL(`/@fs/${path}`, baseUrl).href;
}
