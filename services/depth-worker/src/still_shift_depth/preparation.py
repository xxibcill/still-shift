"""Normalize, estimate, validate, and cache reusable depth assets."""

from __future__ import annotations

import fcntl
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import resource
import tempfile
import time
import warnings
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError

from . import __version__
from .models import (
    DepthAnythingV2SmallAdapter,
    DepthEstimator,
    FakeDepthAdapter,
    ModelIdentity,
    choose_device,
    sha256_file,
)

PIPELINE_VERSION = f"depth-prep-{__version__}"
PREPROCESSING_VERSION = "image-normalize-0.2.0"
DEPTH_POSTPROCESSING_VERSION = "percentile-bilateral-0.2.0"
MAX_IMAGE_EDGE = 2048
MAX_IMAGE_PIXELS = 80_000_000
SUPPORTED_FORMATS = {"JPEG", "PNG", "WEBP"}


@dataclass(frozen=True)
class DepthParameters:
    lower_percentile: float = 2.0
    upper_percentile: float = 98.0
    bilateral_diameter: int = 5
    bilateral_sigma_color: float = 0.08
    bilateral_sigma_space: float = 3.0

    def __post_init__(self) -> None:
        if not (
            math.isfinite(self.lower_percentile)
            and math.isfinite(self.upper_percentile)
            and 0 <= self.lower_percentile < self.upper_percentile <= 100
        ):
            raise ValueError("Depth percentiles must satisfy 0 <= lower < upper <= 100")
        if self.bilateral_diameter <= 0 or self.bilateral_diameter % 2 == 0:
            raise ValueError("Bilateral filter diameter must be a positive odd integer")
        for name in ("bilateral_sigma_color", "bilateral_sigma_space"):
            value = getattr(self, name)
            if not math.isfinite(value) or value <= 0:
                raise ValueError(f"{name} must be a positive finite number")

    def as_dict(self) -> dict[str, float | int]:
        return {
            "lowerPercentile": self.lower_percentile,
            "upperPercentile": self.upper_percentile,
            "bilateralDiameter": self.bilateral_diameter,
            "bilateralSigmaColor": self.bilateral_sigma_color,
            "bilateralSigmaSpace": self.bilateral_sigma_space,
        }


DEFAULT_DEPTH_PARAMETERS = DepthParameters()


class PreparationError(Exception):
    """Stable machine-readable failure from the preparation pipeline."""

    def __init__(self, code: str, message: str, context: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.context = context or {}

    def as_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "context": self.context}


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _default_cache_dir() -> Path:
    configured = os.environ.get("STILL_SHIFT_CACHE_DIR")
    if configured:
        return Path(configured).expanduser() / "depth"
    return Path.home() / ".cache" / "still-shift" / "depth"


def _peak_cpu_memory_bytes() -> int | None:
    try:
        value = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    except (AttributeError, OSError, ValueError):
        return None
    return value if platform.system() == "Darwin" else value * 1024


def _hardware_description(device: str) -> str:
    description = platform.platform()
    if device == "cuda":
        try:
            import torch

            return f"{description}; {torch.cuda.get_device_name(0)}"
        except (ImportError, RuntimeError):
            pass
    if device == "mps":
        return f"{description}; Apple Metal Performance Shaders"
    processor = platform.processor()
    return f"{description}; {processor}" if processor else description


def _normalize_image(source_path: Path) -> tuple[Image.Image, dict[str, Any], list[str]]:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(source_path) as opened:
                image_format = opened.format
                original_width, original_height = opened.size
                if image_format not in SUPPORTED_FORMATS:
                    raise PreparationError(
                        "INPUT_FORMAT_UNSUPPORTED",
                        "Input must be a JPEG, PNG, or WebP image.",
                        {"format": image_format or "unknown"},
                    )
                if original_width <= 0 or original_height <= 0:
                    raise PreparationError(
                        "INPUT_DIMENSIONS_INVALID", "Input image dimensions are invalid."
                    )
                if original_width * original_height > MAX_IMAGE_PIXELS:
                    raise PreparationError(
                        "INPUT_DIMENSIONS_INVALID",
                        f"Input exceeds the {MAX_IMAGE_PIXELS:,}-pixel safety limit.",
                        {"width": original_width, "height": original_height},
                    )
                opened.load()
                orientation = opened.getexif().get(274, 1)
                oriented = ImageOps.exif_transpose(opened)
                oriented_size = oriented.size
                image = oriented.copy()
                icc_profile = opened.info.get("icc_profile")
    except PreparationError:
        raise
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as cause:
        raise PreparationError(
            "INPUT_DECODE_FAILED", "Input image could not be decoded safely."
        ) from cause
    except OSError as cause:
        raise PreparationError("INPUT_UNREADABLE", "Input image could not be read.") from cause

    warnings_list: list[str] = []
    alpha: Image.Image | None = None
    if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        alpha = rgba.getchannel("A")
        image = rgba.convert("RGB")
    elif image.mode == "CMYK":
        image = image.copy()
    else:
        image = image.convert("RGB")

    if icc_profile:
        try:
            source_profile = ImageCms.ImageCmsProfile(bytes(icc_profile))
            srgb_profile = ImageCms.createProfile("sRGB")
            image = ImageCms.profileToProfile(
                image,
                source_profile,
                srgb_profile,
                outputMode="RGB",
                renderingIntent=ImageCms.Intent.PERCEPTUAL,
            )
        except (ImageCms.PyCMSError, OSError, TypeError, ValueError):
            warnings_list.append("INVALID_ICC_PROFILE_TREATED_AS_SRGB")

    if alpha is not None:
        background = Image.new("RGB", image.size, (255, 255, 255))
        background.paste(image, mask=alpha)
        image = background

    image = image.convert("RGB")
    image.thumbnail(
        (MAX_IMAGE_EDGE, MAX_IMAGE_EDGE),
        resample=Image.Resampling.LANCZOS,
        reducing_gap=3.0,
    )
    image = Image.frombytes("RGB", image.size, image.tobytes())
    dimensions = {
        "input": {"width": original_width, "height": original_height, "format": image_format},
        "orientation": int(orientation),
        "oriented": {"width": oriented_size[0], "height": oriented_size[1]},
        "normalized": {"width": image.width, "height": image.height},
    }
    return image, dimensions, warnings_list


def _normalized_source_hash(image: Image.Image) -> str:
    pixels = np.asarray(image, dtype=np.uint8)
    digest = hashlib.sha256()
    digest.update(PREPROCESSING_VERSION.encode("ascii"))
    digest.update(image.width.to_bytes(4, "little"))
    digest.update(image.height.to_bytes(4, "little"))
    digest.update(pixels.tobytes(order="C"))
    return digest.hexdigest()


def _cache_key(
    source_hash: str,
    identity: ModelIdentity,
    parameters: DepthParameters,
    device: str,
    runtime: dict[str, str],
) -> tuple[str, dict[str, Any]]:
    identity_payload = {
        "sourceHash": source_hash,
        "preprocessingVersion": PREPROCESSING_VERSION,
        "pipelineVersion": PIPELINE_VERSION,
        "model": {
            "adapter": identity.adapter,
            "id": identity.model_id,
            "revision": identity.revision,
            "weightsSha256": identity.weights_sha256,
            "license": identity.license,
        },
        "parameters": parameters.as_dict(),
        "device": device,
        "runtime": runtime,
    }
    return _sha256_bytes(_canonical_json(identity_payload)), identity_payload


def _validate_depth(depth: np.ndarray, width: int, height: int) -> np.ndarray:
    depth = np.asarray(depth, dtype=np.float32)
    if depth.ndim != 2 or depth.shape != (height, width):
        raise PreparationError(
            "DEPTH_OUTPUT_INVALID",
            "Depth adapter returned dimensions that do not match the normalized source.",
            {"expectedWidth": width, "expectedHeight": height, "shape": list(depth.shape)},
        )
    if not np.isfinite(depth).all():
        raise PreparationError(
            "DEPTH_OUTPUT_INVALID", "Depth output contains NaN or infinite values."
        )
    if depth.size == 0 or float(np.max(np.abs(depth))) > 1_000_000:
        raise PreparationError(
            "DEPTH_OUTPUT_INVALID", "Depth output contains values outside the supported range."
        )
    return np.ascontiguousarray(depth, dtype="<f4")


def _make_preview(
    depth: np.ndarray,
    parameters: DepthParameters,
) -> tuple[np.ndarray, dict[str, float]]:
    lower = float(np.percentile(depth, parameters.lower_percentile))
    upper = float(np.percentile(depth, parameters.upper_percentile))
    spread = upper - lower
    if not np.isfinite(spread) or spread <= 1e-6:
        raise PreparationError(
            "DEPTH_RANGE_INVALID", "Depth output has no usable percentile range."
        )

    normalized = np.clip((depth - lower) / spread, 0.0, 1.0).astype(np.float32)
    if not np.isfinite(normalized).all():
        raise PreparationError(
            "DEPTH_OUTPUT_INVALID", "Normalized depth contains NaN or infinite values."
        )
    cv2.setNumThreads(1)
    smoothed = cv2.bilateralFilter(
        normalized,
        d=parameters.bilateral_diameter,
        sigmaColor=parameters.bilateral_sigma_color,
        sigmaSpace=parameters.bilateral_sigma_space,
    )
    preview = np.rint(np.clip(smoothed, 0.0, 1.0) * 255.0).astype(np.uint8)
    return preview, {"lower": lower, "upper": upper}


def _read_valid_cache(
    entry_dir: Path,
    cache_key: str,
    cache_identity: dict[str, Any],
    normalized_source_hash: str,
) -> dict[str, Any] | None:
    manifest_path = entry_dir / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if (
            manifest.get("cacheKey") != cache_key
            or manifest.get("cacheIdentity") != cache_identity
            or manifest.get("sourceHash") != f"sha256:{normalized_source_hash}"
            or manifest.get("preparationVersion") != "0.2"
        ):
            return None
        expected_assets = {
            "normalizedSource": "source.png",
            "rawDepth": "depth.raw.f32",
            "previewDepth": "depth.png",
        }
        if manifest.get("assets") != expected_assets or set(manifest.get("checksums", {})) != set(
            expected_assets
        ):
            return None
        for artifact_name, expected_hash in manifest["checksums"].items():
            artifact_path = entry_dir / manifest["assets"][artifact_name]
            if not artifact_path.is_file() or sha256_file(artifact_path) != expected_hash:
                return None

        width = int(manifest["dimensions"]["normalized"]["width"])
        height = int(manifest["dimensions"]["normalized"]["height"])
        raw_path = entry_dir / manifest["assets"]["rawDepth"]
        raw_values = np.fromfile(raw_path, dtype="<f4")
        if (
            raw_values.size != width * height
            or not np.isfinite(raw_values).all()
            or float(np.max(np.abs(raw_values))) > 1_000_000
        ):
            return None
        with Image.open(entry_dir / manifest["assets"]["previewDepth"]) as preview:
            if preview.mode != "L" or preview.size != (width, height):
                return None
        with Image.open(entry_dir / manifest["assets"]["normalizedSource"]) as source:
            if source.mode != "RGB" or source.size != (width, height):
                return None
            if _normalized_source_hash(source) != normalized_source_hash:
                return None
        return manifest
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None


@contextmanager
def _cache_lock(lock_path: Path) -> Iterator[None]:
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


class DepthPreparationService:
    """Prepare image and depth assets with content-addressed, validated caching."""

    def __init__(
        self,
        adapter: DepthEstimator | None = None,
        cache_dir: Path | str | None = None,
        device: str = "auto",
        parameters: DepthParameters | None = None,
    ) -> None:
        self.adapter = adapter or DepthAnythingV2SmallAdapter()
        self.cache_dir = Path(cache_dir).expanduser() if cache_dir else _default_cache_dir()
        self.requested_device = device
        self.parameters = parameters or DEFAULT_DEPTH_PARAMETERS

    def prepare(self, source_path: Path | str) -> dict[str, Any]:
        started = time.perf_counter()
        source_path = Path(source_path).expanduser()
        if not source_path.is_file():
            raise PreparationError(
                "INPUT_UNREADABLE",
                "Input image path does not identify a readable file.",
                {"inputPath": str(source_path)},
            )

        image, dimensions, normalization_warnings = _normalize_image(source_path)
        source_hash = _normalized_source_hash(image)
        runtime = {
            "numpy": importlib.metadata.version("numpy"),
            "opencv": cv2.__version__,
            "pillow": importlib.metadata.version("pillow"),
            "platform": platform.platform(),
        }
        if self.adapter.identity.adapter == "fake":
            selected_device = "cpu"
            runtime["adapter"] = __version__
        else:
            try:
                selected_device = choose_device(self.requested_device)
            except (ImportError, RuntimeError) as cause:
                raise PreparationError(
                    "DEPTH_INFERENCE_FAILED",
                    "Unable to initialize the requested inference device.",
                    {"requestedDevice": self.requested_device, "reason": str(cause)},
                ) from cause
            runtime["torch"] = importlib.metadata.version("torch")
            runtime["transformers"] = importlib.metadata.version("transformers")

        cache_key, key_payload = _cache_key(
            source_hash,
            self.adapter.identity,
            self.parameters,
            selected_device,
            runtime,
        )
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
        except OSError as cause:
            raise PreparationError(
                "OUTPUT_WRITE_FAILED",
                "Unable to create the depth cache directory.",
                {"cacheDirectory": str(self.cache_dir), "reason": str(cause)},
            ) from cause
        entry_dir = self.cache_dir / cache_key
        lock_path = self.cache_dir / f".{cache_key}.lock"
        with _cache_lock(lock_path):
            cached_manifest = _read_valid_cache(
                entry_dir,
                cache_key,
                key_payload,
                source_hash,
            )
            if cached_manifest is not None:
                return self._result(
                    entry_dir,
                    cached_manifest,
                    cache_status="hit",
                    request_ms=(time.perf_counter() - started) * 1000.0,
                    cache_invalidated=False,
                    request_dimensions=dimensions,
                    request_warnings=normalization_warnings,
                )

            cache_invalidated = entry_dir.exists()
            if cache_invalidated:
                import shutil

                shutil.rmtree(entry_dir, ignore_errors=True)

            inference_started = time.perf_counter()
            try:
                raw_depth, selected_device, peak_gpu_memory_bytes = self.adapter.estimate(
                    image,
                    self.requested_device,
                )
            except PreparationError:
                raise
            except Exception as cause:
                raise PreparationError(
                    "DEPTH_INFERENCE_FAILED",
                    "Depth inference failed.",
                    {"adapter": self.adapter.identity.adapter, "reason": str(cause)},
                ) from cause
            inference_ms = (time.perf_counter() - inference_started) * 1000.0
            depth = _validate_depth(raw_depth, image.width, image.height)

            postprocess_started = time.perf_counter()
            try:
                preview_depth, percentiles = _make_preview(depth, self.parameters)
            except PreparationError:
                raise
            except Exception as cause:
                raise PreparationError(
                    "DEPTH_POSTPROCESS_FAILED",
                    "Depth normalization or smoothing failed.",
                    {"reason": str(cause)},
                ) from cause
            postprocess_ms = (time.perf_counter() - postprocess_started) * 1000.0
            cpu_memory_bytes = _peak_cpu_memory_bytes()

            temporary_dir: Path | None = None
            try:
                temporary_dir = Path(tempfile.mkdtemp(prefix=f".{cache_key}.", dir=self.cache_dir))
                source_asset = "source.png"
                raw_asset = "depth.raw.f32"
                preview_asset = "depth.png"
                normalized_source_path = temporary_dir / source_asset
                image.save(normalized_source_path, format="PNG", optimize=False, compress_level=9)
                raw_path = temporary_dir / raw_asset
                depth.tofile(raw_path)
                Image.fromarray(preview_depth, mode="L").save(
                    temporary_dir / preview_asset,
                    format="PNG",
                    optimize=False,
                    compress_level=9,
                )

                checksums = {
                    "normalizedSource": sha256_file(normalized_source_path),
                    "rawDepth": sha256_file(raw_path),
                    "previewDepth": sha256_file(temporary_dir / preview_asset),
                }
                manifest = {
                    "preparationVersion": "0.2",
                    "pipelineVersion": PIPELINE_VERSION,
                    "preprocessingVersion": PREPROCESSING_VERSION,
                    "postProcessingVersion": DEPTH_POSTPROCESSING_VERSION,
                    "sourceHash": f"sha256:{source_hash}",
                    "cacheKey": cache_key,
                    "cacheIdentity": key_payload,
                    "dimensions": dimensions,
                    "model": {
                        "adapter": self.adapter.identity.adapter,
                        "id": self.adapter.identity.model_id,
                        "revision": self.adapter.identity.revision,
                        "weightsChecksum": f"sha256:{self.adapter.identity.weights_sha256}",
                        "license": self.adapter.identity.license,
                    },
                    "runtime": runtime,
                    "parameters": {
                        **self.parameters.as_dict(),
                        "device": selected_device,
                        "rawDepthDType": "float32-little-endian",
                        "normalization": "percentile-linear-near-is-high",
                        "smoothing": "opencv-bilateral-filter",
                    },
                    "depthNormalization": {
                        "lowerPercentile": self.parameters.lower_percentile,
                        "upperPercentile": self.parameters.upper_percentile,
                        "lowerValue": percentiles["lower"],
                        "upperValue": percentiles["upper"],
                        "previewRange": [0, 255],
                    },
                    "assets": {
                        "normalizedSource": source_asset,
                        "rawDepth": raw_asset,
                        "previewDepth": preview_asset,
                    },
                    "checksums": checksums,
                    "normalizationWarnings": normalization_warnings,
                    "metrics": {
                        "inferenceMs": inference_ms,
                        "postProcessMs": postprocess_ms,
                        "totalPreparationMs": (time.perf_counter() - started) * 1000.0,
                        "cacheStatus": "miss",
                        "peakCpuMemoryBytes": cpu_memory_bytes,
                        "peakGpuMemoryBytes": peak_gpu_memory_bytes,
                        "selectedDevice": selected_device,
                        "hardwareDescription": _hardware_description(selected_device),
                    },
                }
                manifest_path = temporary_dir / "manifest.json"
                with manifest_path.open("wb") as manifest_file:
                    manifest_file.write(_canonical_json(manifest) + b"\n")
                    manifest_file.flush()
                    os.fsync(manifest_file.fileno())
                os.replace(temporary_dir, entry_dir)
                temporary_dir = None
            except OSError as cause:
                raise PreparationError(
                    "OUTPUT_WRITE_FAILED",
                    "Unable to publish validated depth cache assets.",
                    {"cacheDirectory": str(entry_dir), "reason": str(cause)},
                ) from cause
            finally:
                if temporary_dir is not None:
                    import shutil

                    shutil.rmtree(temporary_dir, ignore_errors=True)

        return self._result(
            entry_dir,
            manifest,
            cache_status="miss",
            request_ms=(time.perf_counter() - started) * 1000.0,
            cache_invalidated=cache_invalidated,
            request_dimensions=dimensions,
            request_warnings=normalization_warnings,
        )

    @staticmethod
    def _result(
        entry_dir: Path,
        manifest: dict[str, Any],
        cache_status: str,
        request_ms: float,
        cache_invalidated: bool,
        request_dimensions: dict[str, Any],
        request_warnings: list[str],
    ) -> dict[str, Any]:
        return {
            "status": "prepared",
            "preparationVersion": manifest["preparationVersion"],
            "cacheKey": manifest["cacheKey"],
            "cacheStatus": cache_status,
            "cacheInvalidated": cache_invalidated,
            "cacheDirectory": str(entry_dir),
            "manifestPath": str(entry_dir / "manifest.json"),
            "assets": {
                name: str(entry_dir / relative_path)
                for name, relative_path in manifest["assets"].items()
            },
            "model": manifest["model"],
            "dimensions": request_dimensions,
            "checksums": manifest["checksums"],
            "metrics": {
                **manifest["metrics"],
                "cacheStatus": cache_status,
                "requestMs": request_ms,
            },
            "normalizationWarnings": request_warnings,
        }


def create_adapter(name: str) -> DepthEstimator:
    if name == "fake":
        return FakeDepthAdapter()
    if name == "depth-anything-v2-small":
        return DepthAnythingV2SmallAdapter()
    raise ValueError(f"Unknown depth adapter: {name}")


def default_cache_directory() -> Path:
    return _default_cache_dir()
