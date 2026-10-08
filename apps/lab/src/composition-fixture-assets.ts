/// <reference types="vite/client" />

let owner: Promise<string> | undefined;

/** The preview websocket owns all registered native captures from this fixture page. */
export function retainFixtureOwner(): Promise<string> {
  if (owner) return owner;
  const hot = import.meta.hot;
  if (!hot)
    return Promise.reject(
      new Error("The fixture preview connection is unavailable"),
    );
  const request = crypto.randomUUID();
  owner = new Promise<string>((resolve, reject) => {
    const receive = (payload: {
      request: string;
      owner?: string;
      diagnostics: { message: string }[];
    }) => {
      if (payload.request !== request) return;
      clearTimeout(timeout);
      hot.off("composition-fixture:retained", receive);
      if (payload.owner) resolve(payload.owner);
      else
        reject(
          new Error(
            payload.diagnostics
              .map((diagnostic) => diagnostic.message)
              .join("\n"),
          ),
        );
    };
    const timeout = setTimeout(() => {
      hot.off("composition-fixture:retained", receive);
      reject(new Error("The fixture preview did not retain its capture owner"));
    }, 10000);
    hot.on("composition-fixture:retained", receive);
    hot.send("composition-fixture:retain", { request });
  }).catch((error) => {
    owner = undefined;
    throw error;
  });
  return owner;
}
