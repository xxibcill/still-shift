# Motion Craft v014-g reference renders

These pinned MP4s make the MC3 historical comparison reproducible from a fresh checkout. `archived.mp4` is the 192-frame v014-g Unequal Margins prototype rendered on 2026-09-26. `later-buffer-press.mp4` is the distinct 442-key Buffer Press composition rendered on 2026-09-27; it is a comparison artifact, not the v014-g baseline.

| Artifact                 | SHA-256                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `archived.mp4`           | `59916b3457df4c92e0a188d0d591195fa05a4e477dfd00040b17f7e9a1ac862a` |
| `later-buffer-press.mp4` | `4962b6b3d70e16c9087182602adedb0f581de68f6255171ac89dcaec28e7bf7e` |

The paired `.result.json` and `.scene.json` files are copies of the original render sidecars with local absolute paths replaced by `/archive/still-shift/` paths. The scene payload, source and output checksums, frame counts, and MP4 bytes are unchanged. The browser executable path is also anonymized; it is historical metadata and is not used by the verifier. The v014-g source checksum is `ed3a58c0b805277de2e4e608ce5e4b6b09a9cfdbc41d30b714933c19a9b77b8f`; its art and fonts are recovered from Git commit `e3990bc855176984c38261a2c4c0f15c63217d24` and verified against the scene manifest.

Run the [historical verification](../../../docs/motion-craft-historical-verification.md) with these files. The checker pins the archived video and source identity before comparing frames.
