# Courtyard — original cinematic scene kit

Generated with Codex's built-in image generation on 2026-09-25. Four outputs are retained unchanged: the original master, a continuous clean background, an RGBA subject/contact-shadow layer, and an RGBA foreground doorframe layer. All are 1672×941.

[Exact executed prompts](./prompts.md) and [provenance, hashes, and measurement notes](./provenance.json) accompany the art. The three derivatives used this original master as their edit target. No selected episode image or retired corpus image was used.

The compositor uses registered source rectangles for the subject and foreground, avoiding unused transparent canvas and faint stray alpha outside those regions. It preserves the original PNG bytes. The complete RGB background covers every output frame; its actual alpha is checked in the browser before rendering.

The delivery composition maps 1672 source pixels to 2080 scene pixels, then crops a 1920×1080 view. That is approximately 1.244× enlargement, not native 1080p source detail. Final linework and edges were visually inspected. The primary and alternate scene reuse the same three layers with different subject positions, plane depths, and camera direction.

The generation window includes coding between generation stages. Active asset-preparation labor and provider billing were not separately available, so the metadata does not claim a production cost or an isolated preparation-time measurement.
