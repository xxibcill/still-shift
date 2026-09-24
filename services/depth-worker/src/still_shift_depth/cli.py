"""Command-line entry points for v0.2 depth preparation."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from . import __version__
from .preparation import (
    DepthParameters,
    DepthPreparationService,
    PreparationError,
    create_adapter,
    default_cache_directory,
)


def _add_preparation_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--adapter",
        choices=("depth-anything-v2-small", "fake"),
        default="depth-anything-v2-small",
        help="Depth estimator; fake is deterministic and intended for pipeline fixtures.",
    )
    parser.add_argument("--device", choices=("auto", "cpu", "cuda", "mps"), default="auto")
    parser.add_argument("--cache-dir", type=Path, default=default_cache_directory())
    parser.add_argument("--lower-percentile", type=float, default=2.0)
    parser.add_argument("--upper-percentile", type=float, default=98.0)
    parser.add_argument("--bilateral-diameter", type=int, default=5)
    parser.add_argument("--bilateral-sigma-color", type=float, default=0.08)
    parser.add_argument("--bilateral-sigma-space", type=float, default=3.0)


def _service(arguments: argparse.Namespace) -> DepthPreparationService:
    return DepthPreparationService(
        adapter=create_adapter(arguments.adapter),
        cache_dir=arguments.cache_dir,
        device=arguments.device,
        parameters=DepthParameters(
            lower_percentile=arguments.lower_percentile,
            upper_percentile=arguments.upper_percentile,
            bilateral_diameter=arguments.bilateral_diameter,
            bilateral_sigma_color=arguments.bilateral_sigma_color,
            bilateral_sigma_space=arguments.bilateral_sigma_space,
        ),
    )


def _write_atomic(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def _fit(image: Image.Image, width: int, height: int) -> Image.Image:
    preview = image.convert("RGB")
    preview.thumbnail((width, height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (width, height), "#20242b")
    canvas.paste(preview, ((width - preview.width) // 2, (height - preview.height) // 2))
    return canvas


def _make_contact_sheet(items: list[dict[str, Any]], corpus_status: str) -> Image.Image:
    columns = 3
    card_width, card_height = 480, 270
    margin, title_height = 18, 44
    row_count = max(1, (len(items) + columns - 1) // columns)
    sheet = Image.new(
        "RGB",
        (columns * card_width + 2 * margin, row_count * card_height + 2 * margin + title_height),
        "#111318",
    )
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text(
        (margin, margin),
        f"Still Shift v0.2 depth review: {len(items)} images; corpus {corpus_status}",
        fill="#f3f4f6",
        font=font,
    )
    if not items:
        draw.rounded_rectangle(
            (margin, margin + title_height, sheet.width - margin, sheet.height - margin),
            radius=10,
            fill="#20242b",
            outline="#414957",
        )
        draw.multiline_text(
            (margin + 24, margin + title_height + 28),
            "No corpus images are listed yet.\n"
            "Add and freeze the real explainer corpus, then rerun depth:contact-sheet.",
            fill="#f3f4f6",
            font=font,
            spacing=10,
        )
        return sheet

    for index, item in enumerate(items):
        column, row = index % columns, index // columns
        x = margin + column * card_width
        y = margin + title_height + row * card_height
        draw.rounded_rectangle(
            (x, y, x + card_width - 10, y + card_height - 10),
            radius=8,
            fill="#20242b",
            outline="#414957",
        )
        label = f"{item['id']} - {item['status']}"
        draw.text((x + 12, y + 10), label, fill="#f3f4f6", font=font)
        preview_y, preview_h = y + 34, 190
        preview_w = (card_width - 34) // 2
        if item.get("sourcePreview"):
            try:
                with Image.open(item["sourcePreview"]) as source:
                    sheet.paste(_fit(source, preview_w, preview_h), (x + 12, preview_y))
            except OSError:
                draw.text(
                    (x + 20, preview_y + 16),
                    "source preview unavailable",
                    fill="#ffb4a9",
                    font=font,
                )
        if item.get("depthPreview"):
            try:
                with Image.open(item["depthPreview"]) as depth:
                    sheet.paste(
                        _fit(depth.convert("RGB"), preview_w, preview_h),
                        (x + 22 + preview_w, preview_y),
                    )
            except OSError:
                draw.text(
                    (x + 32 + preview_w, preview_y + 16),
                    "depth preview unavailable",
                    fill="#ffb4a9",
                    font=font,
                )
        if item.get("error"):
            draw.multiline_text(
                (x + 12, preview_y + 10),
                f"{item['error']['code']}\n{item['error']['message'][:100]}",
                fill="#ffb4a9",
                font=font,
                spacing=4,
            )
        draw.text((x + 12, y + 232), "source", fill="#c8ccd4", font=font)
        draw.text((x + 22 + preview_w, y + 232), "depth", fill="#c8ccd4", font=font)
    return sheet


def _contact_sheet(arguments: argparse.Namespace) -> dict[str, Any]:
    workspace_root = arguments.workspace_root.expanduser().resolve()
    manifest_path = arguments.manifest.expanduser()
    if not manifest_path.is_absolute():
        manifest_path = workspace_root / manifest_path
    manifest_path = manifest_path.resolve()
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as cause:
        raise PreparationError(
            "CORPUS_MANIFEST_INVALID",
            "Unable to read the corpus manifest as JSON.",
            {"manifestPath": str(manifest_path), "reason": str(cause)},
        ) from cause
    if not isinstance(manifest, dict):
        raise PreparationError(
            "CORPUS_MANIFEST_INVALID",
            "Corpus manifest root must be an object.",
        )
    entries = manifest.get("entries")
    if not isinstance(entries, list):
        raise PreparationError(
            "CORPUS_MANIFEST_INVALID", "Corpus manifest entries must be an array."
        )

    service = _service(arguments)
    items: list[dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            items.append(
                {
                    "id": "unknown",
                    "status": "failed",
                    "error": {
                        "code": "CORPUS_ENTRY_INVALID",
                        "message": "Corpus entry must be an object.",
                    },
                }
            )
            continue
        item: dict[str, Any] = {"id": str(entry.get("id", "unknown")), "status": "failed"}
        source_record = entry.get("source", {})
        source_relative = source_record.get("path") if isinstance(source_record, dict) else None
        if not isinstance(source_relative, str) or not source_relative.strip():
            item["error"] = {"code": "CORPUS_ENTRY_INVALID", "message": "Source path is missing."}
            items.append(item)
            continue

        source_path = Path(source_relative).expanduser()
        if not source_path.is_absolute():
            source_path = manifest_path.parent / source_path
        try:
            prepared = service.prepare(source_path)
            item["status"] = "prepared"
            item["sourcePreview"] = prepared["assets"]["normalizedSource"]
            item["depthPreview"] = prepared["assets"]["previewDepth"]
            item["cacheStatus"] = prepared["cacheStatus"]
            item["metrics"] = prepared["metrics"]
            item["checksums"] = prepared["checksums"]
            item["manifestPath"] = prepared["manifestPath"]
        except PreparationError as error:
            item["sourcePreview"] = str(source_path)
            item["error"] = error.as_dict()
        except Exception as error:
            item["sourcePreview"] = str(source_path)
            item["error"] = {
                "code": "PREPARATION_FAILED",
                "message": f"Unexpected depth preparation failure: {error}",
            }
        items.append(item)

    output_path = arguments.output.expanduser()
    sheet = _make_contact_sheet(items, str(manifest.get("status", "unknown")))
    import io

    image_buffer = io.BytesIO()
    sheet.save(image_buffer, format="PNG", optimize=False, compress_level=9)
    summary = {
        "status": (
            "pending_corpus"
            if not items
            else "generated"
            if manifest.get("status") == "frozen"
            else "generated_corpus_incomplete"
        ),
        "preparationVersion": "0.2",
        "corpusId": manifest.get("corpusId"),
        "corpusStatus": manifest.get("status", "unknown"),
        "imageCount": len(items),
        "preparedCount": sum(item["status"] == "prepared" for item in items),
        "failedCount": sum(item["status"] == "failed" for item in items),
        "contactSheetPath": str(output_path),
        "items": items,
    }
    _write_atomic(output_path, image_buffer.getvalue())
    summary_path = output_path.with_suffix(".json")
    _write_atomic(summary_path, json.dumps(summary, indent=2, ensure_ascii=False).encode() + b"\n")
    summary["summaryPath"] = str(summary_path)
    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="still-shift-depth")
    parser.add_argument("--version", action="version", version=f"still-shift-depth {__version__}")
    commands = parser.add_subparsers(dest="command", required=True)

    prepare_parser = commands.add_parser(
        "prepare", help="Normalize one image and prepare reusable depth assets."
    )
    prepare_parser.add_argument("--input", type=Path, required=True)
    _add_preparation_options(prepare_parser)

    contact_parser = commands.add_parser(
        "contact-sheet",
        help="Prepare each corpus entry and write a source/depth review sheet plus metrics JSON.",
    )
    contact_parser.add_argument(
        "--manifest", type=Path, default=Path("benchmarks/corpus-manifest.json")
    )
    contact_parser.add_argument("--workspace-root", type=Path, default=Path.cwd())
    contact_parser.add_argument(
        "--output", type=Path, default=Path("benchmarks/gallery/depth-contact-sheet.png")
    )
    _add_preparation_options(contact_parser)
    return parser


def main() -> int:
    arguments = build_parser().parse_args()
    try:
        if arguments.command == "prepare":
            result = _service(arguments).prepare(arguments.input)
        else:
            result = _contact_sheet(arguments)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except PreparationError as error:
        print(json.dumps({"status": "failed", "error": error.as_dict()}, ensure_ascii=False))
        return 2
    except ValueError as error:
        failure = PreparationError("CONFIGURATION_INVALID", str(error))
        print(json.dumps({"status": "failed", "error": failure.as_dict()}, ensure_ascii=False))
        return 2
    except Exception as error:
        failure = PreparationError(
            "PREPARATION_FAILED",
            "Unexpected depth preparation failure.",
            {"reason": str(error)},
        )
        print(json.dumps({"status": "failed", "error": failure.as_dict()}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
