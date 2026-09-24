"""Integration checks for corpus depth review."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image


class ContactSheetTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(temporary_directory.cleanup)
        self.root = Path(temporary_directory.name)
        self.benchmarks = self.root / "benchmarks"
        corpus_dir = self.benchmarks / "corpus"
        corpus_dir.mkdir(parents=True)
        self.source = corpus_dir / "image.png"
        image = Image.new("RGB", (8, 8))
        for y in range(image.height):
            for x in range(image.width):
                image.putpixel((x, y), (x * 30, y * 30, 0))
        image.save(self.source)
        self.manifest = self.benchmarks / "corpus-manifest.json"
        self.output = self.root / "contact-sheet.png"

    def write_manifest(self, checksum: str | None = None) -> None:
        actual_checksum = hashlib.sha256(self.source.read_bytes()).hexdigest()
        self.manifest.write_text(
            json.dumps(
                {
                    "status": "frozen",
                    "entries": [
                        {
                            "id": "image",
                            "source": {
                                "path": "./corpus/image.png",
                                "sha256": checksum or f"sha256:{actual_checksum}",
                            },
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )

    def run_contact_sheet(self) -> dict:
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "still_shift_depth.cli",
                "contact-sheet",
                "--manifest",
                "benchmarks/corpus-manifest.json",
                "--workspace-root",
                str(self.root),
                "--output",
                str(self.output),
                "--adapter",
                "fake",
                "--cache-dir",
                str(self.root / "cache"),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        return json.loads(result.stdout)

    def test_source_path_is_relative_to_manifest_directory(self) -> None:
        self.write_manifest()

        summary = self.run_contact_sheet()

        self.assertEqual(summary["preparedCount"], 1)
        self.assertEqual(summary["failedCount"], 0)
        self.assertTrue(self.output.is_file())
        self.assertEqual(summary["items"][0]["status"], "prepared")

    def test_source_checksum_mismatch_is_reported_before_preparation(self) -> None:
        self.write_manifest(checksum=f"sha256:{'0' * 64}")

        summary = self.run_contact_sheet()

        self.assertEqual(summary["preparedCount"], 0)
        self.assertEqual(summary["failedCount"], 1)
        self.assertEqual(summary["items"][0]["error"]["code"], "SOURCE_CHECKSUM_MISMATCH")
        self.assertFalse((self.root / "cache").exists())


if __name__ == "__main__":
    unittest.main()
