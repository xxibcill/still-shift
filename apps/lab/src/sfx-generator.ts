import {
  PassageAudioAssetSchema,
  type PassageAudioAsset,
} from "../../../packages/scene-contract/src/passage-audio.ts";
import { SfxGenerationRequestSchema } from "../../../packages/scene-contract/src/sfx-generation.ts";

type RegisterSound = (asset: PassageAudioAsset) => Promise<string | undefined>;

export function createSfxGenerator(
  captureTarget: () => RegisterSound | undefined,
) {
  const element = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const input = (name: string) => element<HTMLInputElement>("sfx-" + name);
  const form = element<HTMLFormElement>("sfx-form");
  const generate = element<HTMLButtonElement>("sfx-generate");
  const register = element<HTMLButtonElement>("sfx-register");
  const refresh = element<HTMLButtonElement>("sfx-refresh");
  const fields = element<HTMLFieldSetElement>("sfx-fields");
  const notice = element("sfx-status");
  let configured = false,
    busy = false;
  let asset: PassageAudioAsset | undefined;

  function updateBusy(value: boolean) {
    busy = value;
    fields.disabled = value;
    register.disabled = value;
    refresh.disabled = value;
    generate.disabled = value || !configured;
    form.setAttribute("aria-busy", String(value));
  }

  async function configure() {
    refresh.disabled = true;
    generate.disabled = true;
    const status = element("sfx-config");
    try {
      const response = await fetch("/passage-api/sfx/config");
      if (!response.ok)
        throw new Error("Could not check the ElevenLabs connection.");
      configured = (await response.json()).configured === true;
      status.textContent = configured
        ? "ElevenLabs is configured. Describe a sound to generate a reusable asset."
        : "Set ELEVENLABS_API_KEY in the server environment, restart pnpm lab, then refresh the connection. Your key stays on the server.";
    } catch {
      configured = false;
      status.textContent =
        "Could not check ElevenLabs setup. Refresh the connection to try again.";
    } finally {
      updateBusy(busy);
    }
  }

  async function attach(target: RegisterSound | undefined) {
    if (!asset) return;
    const attached = target && (await target(asset));
    notice.textContent = attached
      ? `Registered ${attached}. Select it under Asset for new sound, then add a sound to this beat.`
      : "Sound saved. Use Add to current passage when a linked authoring passage is ready.";
  }

  form.onsubmit = (event) => {
    event.preventDefault();
    if (busy || !configured || !form.reportValidity()) return;
    const target = captureTarget();
    if (!target) {
      notice.textContent =
        "Load a linked authoring passage before generating a sound.";
      return;
    }
    const parsed = SfxGenerationRequestSchema.safeParse({
      provider: "elevenlabs",
      id: input("id").value,
      prompt: element<HTMLTextAreaElement>("sfx-prompt").value,
      durationSeconds: Number(input("duration").value),
      promptInfluence: Number(input("influence").value),
      loop: input("loop").checked,
    });
    if (!parsed.success) {
      notice.textContent = parsed.error.issues
        .map((issue) => issue.message)
        .join("; ");
      return;
    }
    updateBusy(true);
    const requestId = crypto.randomUUID();
    notice.textContent = "Generating sound… This can take up to two minutes.";
    void (async () => {
      try {
        const response = await fetch("/passage-api/sfx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...parsed.data, requestId }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.message ?? "Sound generation failed.");
        asset = PassageAudioAssetSchema.parse(result.asset);
        element("sfx-result").hidden = false;
        element<HTMLAudioElement>("sfx-preview").src =
          "/passage-api/asset?path=" + encodeURIComponent(asset.path);
        element("sfx-file").textContent = asset.path;
        await attach(target);
      } catch (error) {
        notice.textContent = `${error instanceof Error ? error.message : "Sound generation failed."} No automatic retry was made. Check assets/generated-sfx/${parsed.data.id}-${requestId} for this take before generating again.`;
      } finally {
        updateBusy(false);
      }
    })();
  };
  register.onclick = () => {
    if (busy) return;
    updateBusy(true);
    void attach(captureTarget())
      .catch(() => {
        notice.textContent =
          "Sound saved, but registration failed. See passage diagnostics and try adding it again.";
      })
      .finally(() => updateBusy(false));
  };
  refresh.onclick = () => {
    void configure();
  };
  void configure();
}
