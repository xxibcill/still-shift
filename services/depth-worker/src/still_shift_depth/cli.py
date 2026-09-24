"""Command-line entry points for v0.2 depth preparation."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import __version__
from .contact_sheet import build_contact_sheet
from .preparation import (
    DEFAULT_DEPTH_PARAMETERS,
    DepthParameters,
    DepthPreparationService,
    PreparationError,
    create_adapter,
    default_cache_directory,
    normalize_source_only,
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
    parser.add_argument(
        "--lower-percentile", type=float, default=DEFAULT_DEPTH_PARAMETERS.lower_percentile
    )
    parser.add_argument(
        "--upper-percentile", type=float, default=DEFAULT_DEPTH_PARAMETERS.upper_percentile
    )
    parser.add_argument(
        "--bilateral-diameter", type=int, default=DEFAULT_DEPTH_PARAMETERS.bilateral_diameter
    )
    parser.add_argument(
        "--bilateral-sigma-color",
        type=float,
        default=DEFAULT_DEPTH_PARAMETERS.bilateral_sigma_color,
    )
    parser.add_argument(
        "--bilateral-sigma-space",
        type=float,
        default=DEFAULT_DEPTH_PARAMETERS.bilateral_sigma_space,
    )


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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="still-shift-depth")
    parser.add_argument("--version", action="version", version=f"still-shift-depth {__version__}")
    commands = parser.add_subparsers(dest="command", required=True)

    prepare_parser = commands.add_parser(
        "prepare", help="Normalize one image and prepare reusable depth assets."
    )
    prepare_parser.add_argument("--input", type=Path, required=True)
    _add_preparation_options(prepare_parser)

    normalize_parser = commands.add_parser(
        "normalize", help="Normalize one image without running depth inference."
    )
    normalize_parser.add_argument("--input", type=Path, required=True)
    normalize_parser.add_argument("--cache-dir", type=Path, default=default_cache_directory())

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
        elif arguments.command == "normalize":
            result = normalize_source_only(arguments.input, arguments.cache_dir)
        else:
            result = build_contact_sheet(
                arguments.manifest,
                arguments.workspace_root,
                arguments.output,
                _service(arguments),
            )
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
