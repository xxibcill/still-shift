# Third-party notices

Still Shift application code is licensed under GPL-3.0-only. The full license is
in `LICENSE`; corresponding source and build scripts are included in `source/`.
The owner selected this license and the separately installed soundtrack runtime
on 2026-10-09.

## Commerce catalog

The repository owner confirmed on 2026-10-09 that they created the included
commerce catalog. Its descriptive content is distributed under GPL-3.0-only
with Still Shift. Its external study links do not include the referenced
templates, footage, music or artwork. The ownership record is included at
`source/catalogs/ecommerce-motion/source/v1.0/SOURCE.md`.

## Included font

Noto Sans Thai is included under the SIL Open Font License 1.1. Its copyright,
license text and provenance are in `assets/ecommerce-motion/fonts/OFL.txt` and
`sources.json`. The font license is independent of the application license.

## Separately installed dependencies

JavaScript dependencies are declared in `package.json` and installed by the
package manager; they are not bundled into the application output. Preserve
their own licenses and notices when redistributing an installed dependency tree.
Chromium is installed separately by Playwright. FFmpeg, ffprobe, uv and Python
are external prerequisites.

The optional soundtrack installer uses the pinned, hash-checked requirements in
`scripts/soundtrack/requirements.txt`: DawDreamer 0.9.0, NumPy 2.3.3 and SciPy
1.16.2. DawDreamer is GPLv3 and has native component obligations; NumPy/SciPy have
BSD and bundled native-library notices. No audio backend wheels or binaries are
included here. Review the installed distributions' license files before
redistributing that runtime. The existing dependency audit is recorded in the
repository's `docs/composition-ce16-backend-proof.md`.

Depth model weights are not included. Their applicable licenses accompany their
separate model distributions.
