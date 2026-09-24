"""Behavioral checks for reusable depth preparation."""

from __future__ import annotations

import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

import numpy as np
from PIL import Image
from still_shift_depth import preparation
from still_shift_depth.models import FakeDepthAdapter


class InvalidDepthAdapter(FakeDepthAdapter):
    def __init__(self, depth: np.ndarray) -> None:
        self.depth = depth

    def estimate(self, image: Image.Image, device: str) -> tuple[np.ndarray, str, None]:
        return self.depth, "cpu", None


class DepthPreparationTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(temporary_directory.cleanup)
        self.root = Path(temporary_directory.name)

    def service(
        self, adapter: FakeDepthAdapter | None = None
    ) -> preparation.DepthPreparationService:
        return preparation.DepthPreparationService(
            adapter=adapter or FakeDepthAdapter(), cache_dir=self.root / "cache"
        )

    def save_image(self, image: Image.Image, name: str, **options: object) -> Path:
        path = self.root / name
        image.save(path, **options)
        return path

    def test_exif_orientation_rotates_pixels_and_dimensions(self) -> None:
        image = Image.new("RGB", (2, 3))
        colors = [
            [(255, 0, 0), (0, 255, 0)],
            [(0, 0, 255), (255, 255, 0)],
            [(255, 0, 255), (0, 255, 255)],
        ]
        for y, row in enumerate(colors):
            for x, color in enumerate(row):
                image.putpixel((x, y), color)
        exif = Image.Exif()
        exif[274] = 6
        source = self.save_image(image, "rotated.png", exif=exif)

        result = self.service().prepare(source)

        self.assertEqual(result["dimensions"]["orientation"], 6)
        self.assertEqual(result["dimensions"]["normalized"], {"width": 3, "height": 2})
        with Image.open(result["assets"]["normalizedSource"]) as normalized:
            self.assertEqual(normalized.getpixel((0, 0)), (255, 0, 255))
            self.assertEqual(normalized.getpixel((2, 1)), (0, 255, 0))
            self.assertNotIn("exif", normalized.info)

    def test_alpha_grayscale_and_extreme_aspect_ratios(self) -> None:
        cases = [
            (Image.new("RGBA", (4, 3), (10, 20, 30, 0)), "alpha.png", (4, 3)),
            (Image.new("L", (4, 3), 120), "gray.png", (4, 3)),
            (Image.new("RGB", (4096, 32), "red"), "wide.png", (2048, 16)),
            (Image.new("RGB", (32, 4096), "blue"), "tall.png", (16, 2048)),
        ]
        for image, name, expected_size in cases:
            with self.subTest(name=name):
                result = self.service().prepare(self.save_image(image, name))
                with Image.open(result["assets"]["normalizedSource"]) as normalized:
                    self.assertEqual(normalized.mode, "RGB")
                    self.assertEqual(normalized.size, expected_size)
                    if name == "alpha.png":
                        self.assertEqual(normalized.getpixel((0, 0)), (255, 255, 255))

    def test_supported_formats_become_normalized_png(self) -> None:
        image = Image.new("RGB", (8, 6), (30, 70, 110))
        for name, expected_format in (
            ("input.jpg", "JPEG"),
            ("input.png", "PNG"),
            ("input.webp", "WEBP"),
        ):
            with self.subTest(name=name):
                result = self.service().prepare(self.save_image(image, name))
                self.assertEqual(result["dimensions"]["input"]["format"], expected_format)
                with Image.open(result["assets"]["normalizedSource"]) as normalized:
                    self.assertEqual(normalized.format, "PNG")
                    self.assertEqual(normalized.mode, "RGB")

    def test_cache_reuses_valid_assets_and_rebuilds_corruption(self) -> None:
        source = self.save_image(Image.new("RGB", (12, 9), "green"), "source.png")
        service = self.service()

        first = service.prepare(source)
        second = service.prepare(source)
        self.assertEqual(first["cacheStatus"], "miss")
        self.assertEqual(second["cacheStatus"], "hit")
        self.assertEqual(first["cacheKey"], second["cacheKey"])

        Path(first["assets"]["previewDepth"]).write_bytes(b"corrupt image")
        rebuilt = service.prepare(source)
        self.assertEqual(rebuilt["cacheStatus"], "miss")
        self.assertTrue(rebuilt["cacheInvalidated"])
        self.assertEqual(rebuilt["checksums"], first["checksums"])

    def test_preprocessing_and_model_revision_change_cache_key(self) -> None:
        source = self.save_image(Image.new("RGB", (12, 9), "green"), "source.png")
        baseline = self.service().prepare(source)

        with patch.object(preparation, "PREPROCESSING_VERSION", "image-normalize-next"):
            changed_preprocessing = self.service().prepare(source)

        adapter = FakeDepthAdapter()
        adapter._identity = replace(adapter.identity, revision="next")
        changed_model = self.service(adapter).prepare(source)

        self.assertEqual(changed_preprocessing["cacheStatus"], "miss")
        self.assertEqual(changed_model["cacheStatus"], "miss")
        cache_keys = {
            baseline["cacheKey"],
            changed_preprocessing["cacheKey"],
            changed_model["cacheKey"],
        }
        self.assertEqual(len(cache_keys), 3)

    def test_bad_inputs_have_stable_failure_codes(self) -> None:
        invalid_bytes = self.root / "corrupt.png"
        invalid_bytes.write_bytes(b"not an image")
        unsupported = self.save_image(Image.new("RGB", (4, 3)), "input.bmp")
        cases = [
            (self.root / "missing.png", "INPUT_UNREADABLE"),
            (invalid_bytes, "INPUT_DECODE_FAILED"),
            (unsupported, "INPUT_FORMAT_UNSUPPORTED"),
        ]
        for source, code in cases:
            with self.subTest(code=code):
                with self.assertRaises(preparation.PreparationError) as raised:
                    self.service().prepare(source)
                self.assertEqual(raised.exception.as_dict()["code"], code)

    def test_invalid_depth_never_enters_cache(self) -> None:
        source = self.save_image(Image.new("RGB", (4, 3)), "source.png")
        cases = [
            (np.zeros((2, 4), dtype=np.float32), "DEPTH_OUTPUT_INVALID"),
            (np.full((3, 4), np.nan, dtype=np.float32), "DEPTH_OUTPUT_INVALID"),
            (np.full((3, 4), 2_000_000, dtype=np.float32), "DEPTH_OUTPUT_INVALID"),
            (np.zeros((3, 4), dtype=np.float32), "DEPTH_RANGE_INVALID"),
        ]
        for depth, code in cases:
            with self.subTest(code=code):
                with self.assertRaises(preparation.PreparationError) as raised:
                    self.service(InvalidDepthAdapter(depth)).prepare(source)
                self.assertEqual(raised.exception.code, code)
                self.assertEqual(list((self.root / "cache").glob("*/manifest.json")), [])


if __name__ == "__main__":
    unittest.main()
