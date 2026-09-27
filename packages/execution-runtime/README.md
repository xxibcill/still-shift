# Execution runtime

The v0.6 worker exports a resolved `PreviewScene` through the same WebGL renderer used by the lab. It evaluates fixed frame indices, streams frame bytes to FFmpeg, validates the MP4 with FFprobe and a full decode, then publishes the validated output bundle with rollback on handled failures. Cancellation waits for the encoder to exit before removing temporary files. Publication is not crash-atomic across multiple files. The caller supplies normalized source/depth image paths and a destination path to `exportScene` from `@still-shift/execution-runtime/export`.

The default transport is an in-memory PNG pipe. `raw_rgba` is the exact reference transport; `jpeg_pipe` is a faster 95%-quality evaluation option. None of the transports writes intermediate frame files. FFmpeg defaults to `libx264 veryfast crf18`, `yuv420p`, BT.709 metadata, and fast start. The optional `h264_videotoolbox` encoder is available on supported macOS hosts. The Playwright package, Chromium revision, and FFmpeg version are pinned in the root toolchain files.

Run `pnpm test:browser:export` to verify exact 150-frame output at 1080p, 90-frame transport and repeatability checks, the 2D fallback without a depth image, output validation, and cleanup. Each MP4 has a deterministic `.scene.json` manifest containing the resolved scene and source/depth checksums. The worker computes the scene and output SHA-256 checksums before publication and returns them with the manifest path and output size. It also reports frame-render/capture time, frame-upload time (including FFmpeg backpressure), encode-path wall time (render, upload, FFmpeg, and validation), validation wall time, FFmpeg processing CPU time (input decode, conversion, encode, and mux), CPU model and available logical cores, browser version, GPU renderer, FFmpeg version, peak parent RSS, and peak sampled RSS summed over the worker's process tree. Process-tree RSS includes Chromium and FFmpeg, is sampled every 500 ms, and is `null` when OS process accounting is unavailable; it is not a hardware memory peak or a sum of private memory.

This package owns shared local execution beneath the animation engine and CLI:

- `@still-shift/execution-runtime/export`: browser rendering, encoding, validation,
  and publication of the output bundle.
- `@still-shift/execution-runtime/locks`: artifact-directory locks with stale-owner
  recovery, and interrupted batch progress recovery.
- `@still-shift/execution-runtime/subprocess`: cancellable process execution that
  waits for the child to exit before settling.
- `@still-shift/execution-runtime/publication`: exclusive bundle publication with
  rollback limited to files owned by the current attempt.
- `@still-shift/execution-runtime/browser`: package-owned browser entry locations.

Lock recovery uses only the Python standard library and does not depend on the
depth worker's virtual environment. Embedding applications may pass
`pythonCommand` to `acquireArtifactLock`; `STILL_SHIFT_PYTHON` supplies the process
configuration, with `python3` as the default. Process identity checks require
`ps`; the recovery guard requires POSIX `fcntl` locks.

The export request accepts `runtime.projectRoot` for applications that supply a
Vite composition root. Repository use defaults to workspace discovery relative
to this package. Browser assets are resolved from this package's module location,
so callers do not depend on a `tools/` directory layout.

Run `pnpm check:boundaries` after changing package imports. Shared packages cannot
import application implementation files, the execution runtime cannot depend on
the animation engine, consumers must use its public entry points, and each
package must declare its source dependencies.

Publication uses exclusive filesystem links and rolls back the current attempt
when staging, publication, or cancellation fails. Passage exports include media,
the final report, and the completed job checkpoint in the same transaction; the
checkpoint is published last while the job lock remains held. On resume, prior
files are backed up beside their destinations and restored after failure. If
another writer creates a replacement, its file is preserved and any unrestored
backup remains beside the destination with its path reported to stderr or in the
rollback error. Assembly cleanup never deletes those backups.

This is a rollback transaction for a running process, not a filesystem-wide
atomic rename or a power-loss recovery protocol. Readers should use the completed
job checkpoint as the completion marker. Cancellation observed before the final
commit check restores the previous bundle; cancellation after that commit does
not undo a completed export. Cleanup failures after commit are reported without
turning a completed export into a failed one.
