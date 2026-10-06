/// <reference types="vite/client" />
import type { ProgramSnapshot } from "../../../tools/still-shift-cli/src/composition/preview.ts";
export type OwnedProgramSnapshot = ProgramSnapshot & { lease: string };

export async function retainProgramSnapshot(
  program: ProgramSnapshot,
): Promise<OwnedProgramSnapshot> {
  const hot = import.meta.hot;
  if (!hot) throw new Error("The program preview connection is unavailable");
  const request = crypto.randomUUID();
  const lease = await new Promise<string>((resolve, reject) => {
    const receive = (payload: {
      request: string;
      lease?: string;
      diagnostics: { code: string; path?: string; message: string }[];
    }) => {
      if (payload.request !== request) return;
      clearTimeout(timeout);
      hot.off("composition-program:retained", receive);
      if (payload.lease) resolve(payload.lease);
      else
        reject(
          new Error(
            payload.diagnostics
              .map((d) => `${d.code} ${d.path ?? "document"}: ${d.message}`)
              .join("\n"),
          ),
        );
    };
    const timeout = setTimeout(() => {
      hot.off("composition-program:retained", receive);
      reject(
        new Error("The program preview did not retain its asset revision"),
      );
    }, 10000);
    hot.on("composition-program:retained", receive);
    hot.send("composition-program:retain", {
      request,
      revision: program.revision,
    });
  });
  return {
    ...program,
    lease,
    assets: Object.fromEntries(
      Object.entries(program.assets).map(([id, path]) => [
        id,
        `${path}&lease=${encodeURIComponent(lease)}`,
      ]),
    ),
  };
}
export function releaseProgramSnapshot(
  program: (ProgramSnapshot & { lease?: string }) | undefined,
) {
  if (program?.lease)
    import.meta.hot?.send("composition-program:release", {
      lease: program.lease,
    });
}
