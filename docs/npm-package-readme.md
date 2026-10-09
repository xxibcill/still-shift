# Still Shift

Author, preview and render deterministic compositions from JSON or TypeScript.
Includes the `still-shift` command, motion authoring API, renderer and optional
soundtrack workflow. Licensed under GPL-3.0-only.

## Install

Use Node 22.23.1 or a newer Node 22 release. The verified production platform is
macOS on Apple Silicon. Other platforms have not completed release verification.

```sh
npm install still-shift
npx still-shift setup browser
```

Rendering also requires FFmpeg and ffprobe 8.0.1 on `PATH`. Browser installation
downloads the pinned Playwright Chromium separately. Installation does not run
setup scripts, download models or install a Python/audio runtime automatically.

```sh
npx still-shift --help
npx still-shift comp validate --input composition.json
npx still-shift comp preview --input composition.json
npx still-shift comp render --input composition.json --output clip.mp4 --backend webgl2
```

Keep project assets beside the project at its recorded relative paths. Rendering
requires a new output path; preserve the generated manifests alongside the video.

## TypeScript authoring

```ts
import { comp, solid } from "still-shift";

export default comp(
  {
    id: "hello",
    width: 320,
    height: 192,
    fps: 24,
    seconds: 2,
    background: "#fff4df",
  },
  (scene) => {
    scene.add(solid("card", { color: "#305c70", size: [100, 100] }));
  },
);
```

Save as `composition.ts` and use it with the same commands. `still-shift/motion`
also exports the authoring API; `still-shift/motion/node` contains Node asset
helpers. Existing `@still-shift/motion` imports are supported inside programs
loaded by the CLI. For direct imports in your application use the `still-shift`
package names. Additional ESM entry points are `still-shift/engine`,
`still-shift/renderer`, `still-shift/schema` and `still-shift/runtime`.
Type declarations are included. CommonJS `require()` is not a supported API.

## Optional soundtrack runtime

Install `uv` separately, then explicitly install the pinned audio runtime:

```sh
npx still-shift setup soundtrack
npx still-shift soundtrack --help
```

The default runtime is `~/.cache/still-shift/soundtrack`. To install elsewhere,
set `STILL_SHIFT_SOUNDTRACK_ENV`; use the printed `STILL_SHIFT_SOUNDTRACK_PYTHON`
path when rendering. An existing compatible runtime can be selected directly
with `STILL_SHIFT_SOUNDTRACK_PYTHON`.

DawDreamer, NumPy, SciPy and their native libraries are installed separately;
their binaries are not in this npm package. See `THIRD-PARTY-NOTICES.md`.
Depth preparation is also opt-in: `still-shift setup depth` uses `uv` and the
included Python lockfile. Depth models are obtained separately when requested.

## Source and verification

The complete application source and package build scripts are included under
`source/`. With the pinned toolchain, run `pnpm install --frozen-lockfile` then
`pnpm build:package` from that directory to rebuild the distribution.
Repository verification runs locally; GitHub Actions are prohibited.
See the repository's `docs/npm-release-plan.md` for the release procedure and
recorded validation limits.
