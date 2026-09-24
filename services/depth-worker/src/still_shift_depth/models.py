"""Depth estimator adapters used by the preparation pipeline."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np
from PIL import Image

MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"
MODEL_REVISION = "5426e4f0f36572d16453bbda7a8389317b1bef99"
MODEL_WEIGHT_SHA256 = "3152477ce0d8c6978d76b995120de97cb5b928701fd0f817769f59e249a16b70"
MODEL_LICENSE = "Apache-2.0"
MODEL_CARD_URL = f"https://huggingface.co/{MODEL_ID}/tree/{MODEL_REVISION}"


@dataclass(frozen=True)
class ModelIdentity:
    adapter: str
    model_id: str
    revision: str
    weights_sha256: str
    license: str


class DepthEstimator(Protocol):
    @property
    def identity(self) -> ModelIdentity: ...

    def estimate(self, image: Image.Image, device: str) -> tuple[np.ndarray, str, int | None]: ...


class FakeDepthAdapter:
    """Deterministic image-derived depth for fixtures and pipeline development."""

    _identity = ModelIdentity(
        adapter="fake",
        model_id="still-shift/fake-depth-v0.2",
        revision="1",
        weights_sha256=f"{hashlib.sha256(b'still-shift-fake-depth-v0.2').hexdigest()}",
        license="internal-test-fixture",
    )

    @property
    def identity(self) -> ModelIdentity:
        return self._identity

    def estimate(self, image: Image.Image, device: str) -> tuple[np.ndarray, str, int | None]:
        pixels = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
        height, width = pixels.shape[:2]
        horizontal = np.linspace(0.0, 1.0, width, dtype=np.float32)[None, :]
        luminance = pixels[..., 0] * 0.2126 + pixels[..., 1] * 0.7152 + pixels[..., 2] * 0.0722
        vertical = np.linspace(0.0, 1.0, height, dtype=np.float32)[:, None]
        depth = (
            np.broadcast_to(horizontal, (height, width)) * 0.4
            + np.broadcast_to(vertical, (height, width)) * 0.4
            + luminance * 0.2
        )
        return np.ascontiguousarray(depth, dtype="<f4"), "cpu", None


def choose_device(requested: str) -> str:
    import torch

    if requested == "auto":
        if torch.cuda.is_available():
            return "cuda"
        if torch.backends.mps.is_available():
            return "mps"
        return "cpu"
    if requested == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is unavailable")
    if requested == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("MPS was requested but is unavailable")
    if requested not in {"cpu", "cuda", "mps"}:
        raise RuntimeError(f"Unsupported inference device: {requested}")
    return requested


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class DepthAnythingV2SmallAdapter:
    """Pinned Hugging Face Transformers adapter for the Small checkpoint."""

    def __init__(self) -> None:
        self._identity = ModelIdentity(
            adapter="depth-anything-v2-small",
            model_id=MODEL_ID,
            revision=MODEL_REVISION,
            weights_sha256=MODEL_WEIGHT_SHA256,
            license=MODEL_LICENSE,
        )
        self._torch = None
        self._processor = None
        self._model = None
        self._loaded_device: str | None = None

    @property
    def identity(self) -> ModelIdentity:
        return self._identity

    def _load(self, device: str) -> None:
        if self._model is not None:
            if device != self._loaded_device:
                raise RuntimeError("A loaded model adapter cannot switch devices")
            return

        import torch
        from huggingface_hub import snapshot_download
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation

        snapshot_path = Path(
            snapshot_download(
                repo_id=MODEL_ID,
                revision=MODEL_REVISION,
                allow_patterns=[
                    "README.md",
                    "config.json",
                    "model.safetensors",
                    "preprocessor_config.json",
                ],
            )
        )
        weights_path = snapshot_path / "model.safetensors"
        if not weights_path.is_file() or sha256_file(weights_path) != MODEL_WEIGHT_SHA256:
            raise RuntimeError("Pinned model weights failed the SHA-256 checksum check")

        processor = AutoImageProcessor.from_pretrained(snapshot_path, local_files_only=True)
        model = AutoModelForDepthEstimation.from_pretrained(
            snapshot_path,
            local_files_only=True,
            use_safetensors=True,
        )
        model.to(device)
        model.eval()

        self._torch = torch
        self._processor = processor
        self._model = model
        self._loaded_device = device

    def estimate(self, image: Image.Image, device: str) -> tuple[np.ndarray, str, int | None]:
        selected_device = choose_device(device)
        self._load(selected_device)
        assert self._torch is not None
        assert self._processor is not None
        assert self._model is not None

        torch = self._torch
        inputs = self._processor(images=image, return_tensors="pt").to(selected_device)
        if selected_device == "cuda":
            torch.cuda.reset_peak_memory_stats(selected_device)
        prior_deterministic = torch.are_deterministic_algorithms_enabled()
        if hasattr(torch.backends, "cudnn"):
            prior_cudnn_deterministic = torch.backends.cudnn.deterministic
            prior_cudnn_benchmark = torch.backends.cudnn.benchmark
        else:
            prior_cudnn_deterministic = None
            prior_cudnn_benchmark = None
        try:
            torch.use_deterministic_algorithms(True)
            if hasattr(torch.backends, "cudnn"):
                torch.backends.cudnn.deterministic = True
                torch.backends.cudnn.benchmark = False
            with torch.inference_mode():
                outputs = self._model(**inputs)
                height, width = image.height, image.width
                postprocessed = self._processor.post_process_depth_estimation(
                    outputs,
                    target_sizes=[(height, width)],
                )
                predicted_depth = postprocessed[0]["predicted_depth"]
                if predicted_depth.ndim == 3 and predicted_depth.shape[0] == 1:
                    predicted_depth = predicted_depth[0]
                depth = predicted_depth.detach().float().cpu().numpy()
        finally:
            torch.use_deterministic_algorithms(prior_deterministic)
            if hasattr(torch.backends, "cudnn"):
                torch.backends.cudnn.deterministic = prior_cudnn_deterministic
                torch.backends.cudnn.benchmark = prior_cudnn_benchmark

        peak_gpu_memory_bytes: int | None = None
        if selected_device == "cuda":
            peak_gpu_memory_bytes = int(torch.cuda.max_memory_allocated(selected_device))
        return np.ascontiguousarray(depth, dtype="<f4"), selected_device, peak_gpu_memory_bytes
