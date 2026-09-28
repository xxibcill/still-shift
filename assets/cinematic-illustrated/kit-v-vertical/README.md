# Vertical Rising Vista test kit

Three 2880×1620 layers provide a deterministic, high-resolution acceptance fixture for the cinematic vertical reframe. The scene is authored in the existing 1920×1080 coordinate space and rendered to 1080×1920 through `format: "vertical"`.

Run `python3 assets/cinematic-illustrated/kit-v-vertical/generate.py` to regenerate the PNG layers. If the images change, update their SHA-256 values in [`ci-vertical-rising-vista.json`](../../../benchmarks/fixtures/cinematic-illustrated/vertical/ci-vertical-rising-vista.json).

This geometric art is a motion and coverage test fixture, not a production scene.
