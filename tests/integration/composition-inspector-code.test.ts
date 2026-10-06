import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { comp, solid } from "@still-shift/motion";
import { CompositionDocument } from "../../apps/lab/src/composition-document.ts";
import {
  compositionTracks,
  editedKeysCode,
  editTemporalHandle,
} from "../../apps/lab/src/composition-keys.ts";
import { loadProgram } from "../../tools/still-shift-cli/src/composition/program.ts";
it("copied edited keys execute in a real builder timeline and emit the accepted native curve", async () => {
  const source = comp({ width: 64, height: 64, fps: 24, frames: 24 }, (c) => {
    const layer = c.add(
      solid("box", { size: [8, 8], color: "#ffffff" }).at(0, 0),
    );
    c.timeline(
      layer.property("transform.position").keys([
        { frame: 0, value: [0, 0] },
        { frame: 23, value: [30, 40] },
      ]),
    );
  });
  const history = new CompositionDocument(source),
    track = compositionTracks(history.document)[0]!;
  history.commit(
    history.propose("Handle", (d) =>
      editTemporalHandle(d, track, 0, "out", 0.6, [2, 3]),
    )!,
  );
  const edited = compositionTracks(history.document)[0]!,
    code = editedKeysCode(edited),
    root = await mkdtemp(join(tmpdir(), "composition-copied-code-"));
  try {
    const input = join(root, "copied.ts");
    await writeFile(
      input,
      `import {comp,solid} from '@still-shift/motion'; export default comp({width:64,height:64,fps:24,frames:24},c=>{const layer=c.add(solid('box',{size:[8,8],color:'#ffffff'}).at(0,0));\n${code}\n});`,
    );
    const loaded = await loadProgram(input);
    expect(loaded.composition.layers[0]!.transform!.position).toEqual(
      edited.raw,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
