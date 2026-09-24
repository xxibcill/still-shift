# Export worker

The v0.6 worker exports a resolved `PreviewScene` through the same WebGL renderer used by the lab. It evaluates fixed frame indices, streams frame bytes to FFmpeg, validates the MP4 with FFprobe and a full decode, then atomically publishes the output. A failed export leaves no final or temporary MP4. The caller supplies normalized source/depth image paths and a destination path to `exportScene` in `src/export-worker.ts`.

The default transport is an in-memory PNG pipe. `raw_rgba` is the exact reference transport; `jpeg_pipe` is a faster 95%-quality evaluation option. None of the transports writes intermediate frame files. FFmpeg defaults to `libx264 veryfast crf18`, `yuv420p`, BT.709 metadata, and fast start. The optional `h264_videotoolbox` encoder is available on supported macOS hosts. The Playwright package, Chromium revision, and FFmpeg version are pinned in the root toolchain files.

Run `pnpm test:browser:export` to verify exact 90-frame output, repeatability, the 2D fallback without a depth image, all three transports, output validation, and cleanup. The worker reports frame-render time, total encode-path wall time, output size, parent-process peak RSS, browser version, GPU renderer, and FFmpeg version. Browser and FFmpeg child memory are not included in the RSS field.
