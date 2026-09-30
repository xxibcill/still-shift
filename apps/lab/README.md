# Lab

For an outcome-based tour, required inputs and export instructions, start with the
**[Still Shift user guide](../../docs/user-guide.md)**.

Run `pnpm lab`, then choose a screen:

| Screen                      | Local path                                 |
| --------------------------- | ------------------------------------------ |
| Image/depth preview         | `/`                                        |
| Cinematic variations        | `/illustrated.html?collection=cinematic`   |
| Story recipes               | `/illustrated.html?collection=story`       |
| Earlier illustrated studies | `/illustrated.html?collection=illustrated` |
| Passage editing             | `/passage.html`                            |
| Product treatments          | `/commerce.html`                           |
| Commerce components/effects | `/commerce-components.html`                |
| Shared reusable components  | `/reusable-components.html`                |

The base URL is `http://127.0.0.1:4173`. Commerce and component galleries export
MP4s directly; illustrated scenes and saved passage plans render through the CLI.

The Story recipes screen shows compiled carrier, action, response and current
activity under the frame scrubber. The line follows the preview frame, and the
strip updates when narration timing is applied. V2 scenes also show continuous
motion diagnostics with buttons that seek to the affected frames.

## Image and depth preview

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

## Commerce motion

Open /commerce.html for the imported 40-format/eight-recipe reference catalog.
H03, H01, H04 and A01 can render in landscape, portrait and square. Upload a product
image, supply copy and sources, update the preview, then export an MP4 or source ZIP.
The bundled samples are original fictional illustrations. Prepared cutouts are
required for H01/H04/A01; this workflow does not perform segmentation.

See the [Commerce guide](../../docs/ecommerce-motion-implementation.md) for inputs,
CLI reproduction, coverage and verification. Preview uses browser-local files;
export sends scene/dependency bytes to the local worker and clears temporary
files afterward. Run **pnpm commerce:prepare** to regenerate the technical fixtures.
