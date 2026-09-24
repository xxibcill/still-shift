# Lab

Run `pnpm lab` and open `http://127.0.0.1:4173/`. The lab reads
`benchmarks/corpus-manifest.json`. Select a corpus entry to verify its source checksum,
prepare depth with the v0.2 worker, and inspect its animated preview. **Build corpus
gallery** prepares all listed images and creates midpoint tiles; selecting a tile opens
the frame-by-frame preview. This operation may take time on the real model's first run.

While the real corpus is missing, prepare any local image with `pnpm depth:prepare`
and load the returned `source.png` and `depth.png` through **Load local pair**. Local
files stay in the browser. The lab shows both assets, the resolved scene, warnings,
and the parameters for the selected frame.

The lab is a local review tool, not a public file server. Its API binds to
`127.0.0.1` and serves only corpus entries and the assets it prepared in the current
session.
