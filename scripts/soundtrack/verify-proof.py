"""Compare CE16-A decoded outputs and retain honest lifecycle evidence."""

import argparse
import json
import platform
import re
import subprocess
from pathlib import Path

import numpy as np
from scipy.io import wavfile


def compare(left, right):
    rate, original = wavfile.read(left)
    other_rate, other = wavfile.read(right)
    if rate != 48000 or other_rate != rate or original.shape != (2880000, 2):
        raise ValueError("Unexpected sample rate, channel count or full-length sample count")
    if original.shape != other.shape:
        raise ValueError("Outputs have different shapes")
    delta = original.astype(np.float64) - other.astype(np.float64)
    return {
        "sampleRate": rate,
        "channels": 2,
        "samplesPerChannel": original.shape[0],
        "maximumSampleError": float(np.max(np.abs(delta))),
        "differingSamples": int(np.count_nonzero(delta)),
        "exact": bool(np.array_equal(original, other)),
    }


def setup_measurement(path):
    text = path.read_text()
    wall = re.search(r"([\d.]+) real", text)
    peak = re.search(r"(\d+)\s+maximum resident set size", text)
    return {
        "wallSeconds": float(wall[1]) if wall else None,
        "peakResidentBytes": int(peak[1]) if peak else None,
        "log": str(path),
        "method": (
            "macOS /usr/bin/time -l; reused uv cache directory; install downloaded the three wheels"
        ),
    }


def verify(root):
    comparisons = {"reloaded": {}, "edited": {}}
    names = ["narration", "bgm", "sfx-pouch", "sfx-roots", "music-bus", "sfx-bus", "mix"]
    for stage in comparisons:
        for name in names:
            result = compare(root / "initial" / (name + ".wav"), root / stage / (name + ".wav"))
            should_match = stage == "reloaded" or name in [
                "narration",
                "bgm",
                "sfx-roots",
                "music-bus",
            ]
            if result["exact"] != should_match:
                raise ValueError("Unexpected changed/unchanged output: " + stage + "/" + name)
            comparisons[stage][name] = result
    runs = {
        stage: json.loads((root / stage / "result.json").read_text())
        for stage in ["initial", "reloaded", "edited"]
    }
    for run in runs.values():
        if not run["narrationDecodedExact"] or run["reconstructionMaxSampleError"] != 0:
            raise ValueError("Narration or bus reconstruction differs")
        if run["latency"]["onsetLatencySamples"] != 0:
            raise ValueError("Uncompensated latency")
        if run["sourceHashes"] != runs["initial"]["sourceHashes"]:
            raise ValueError("Source hashes changed")
    negative = json.loads((root / "rejected-checksum.stdout.json").read_text())
    if negative.get("ok") is not False or negative.get("error") != "source-checksum: narration":
        raise ValueError("Checksum rejection evidence missing")
    evidence = {
        "date": "2026-10-04",
        "milestone": "CE16-A",
        "technicalLifecycle": "passed",
        "ce16Integration": "not started",
        "branch": "codex/composition-ce16",
        "base": "dee9e7b4c35256e298d8168b635aacd934a4a4ae",
        "worktree": str(Path.cwd()),
        "sampleRate": 48000,
        "channels": 2,
        "durationSeconds": 60,
        "samplesPerChannel": 2880000,
        "blockSize": 512,
        "runs": runs,
        "checksumRejection": {"expectedExitCode": 1, "actualExitCode": 1, "stdout": negative},
        "projectSnapshots": {stage: str(root / stage / "project.json") for stage in runs},
        "decodedComparisons": comparisons,
        "setup": {
            stage: setup_measurement(root / (stage + ".stderr.log"))
            for stage in ["setup-venv", "setup-install"]
        },
        "dependencies": json.loads((root / "dependencies.json").read_text()),
        "toolchain": {
            "ffmpeg": subprocess.check_output(["ffmpeg", "-version"], text=True).splitlines()[0],
            "ffprobe": subprocess.check_output(["ffprobe", "-version"], text=True).splitlines()[0],
            "uv": subprocess.check_output(["uv", "--version"], text=True).strip(),
            "python": platform.python_version(),
        },
        "sourceConversion": (
            "Decode with FFmpeg aresample=48000, then end-exclusive "
            "sample trim. Stereo inputs retained; no time stretching"
            ". Only SFX are resampled from 96 kHz."
        ),
        "cueEdit": {"id": "sfx-pouch", "moveSamples": 4800, "gainChangeDb": -3},
        "commandSurface": {
            "setup": (
                "UV_CACHE_DIR=/private/tmp/still-shift-ce16-uv-cache uv "
                "venv --python 3.12.11 benchmarks/results/composition-ce"
                "16/runtime && uv pip sync --python benchmarks/results/c"
                "omposition-ce16/runtime/bin/python --require-hashes scr"
                "ipts/soundtrack/requirements.txt"
            ),
            "initial": (
                "benchmarks/results/composition-ce16/runtime/bin/python "
                "scripts/soundtrack/proof-worker.py --project benchmarks"
                "/fixtures/composition/ce16/backend-proof.json --output-"
                "dir benchmarks/results/composition-ce16/initial"
            ),
            "reload": (
                "benchmarks/results/composition-ce16/runtime/bin/python "
                "scripts/soundtrack/proof-worker.py --project benchmarks"
                "/fixtures/composition/ce16/backend-proof.json --output-"
                "dir benchmarks/results/composition-ce16/reloaded"
            ),
            "edit": (
                "benchmarks/results/composition-ce16/runtime/bin/python "
                "scripts/soundtrack/proof-worker.py --project benchmarks"
                "/fixtures/composition/ce16/backend-proof.edited.json --"
                "output-dir benchmarks/results/composition-ce16/edited"
            ),
            "verify": "pnpm soundtrack:proof --verify-only",
        },
        "licensing": {
            "dawdreamer": "GPLv3, installed 0.9.0 wheel LICENSE retained locally.",
            "upstreamNativeComponents": [
                "JUCE",
                "nanobind",
                "libsamplerate",
                "Rubber Band",
                "Steinberg VST2/3",
                "FAUST",
            ],
            "upstreamSource": "https://github.com/DBraun/DawDreamer/blob/main/README.md#license",
            "packaging": (
                "Trial runtime is local and isolated; no dependency bina"
                "ry distributed or production backend adopted. GPL and n"
                "ative/transitive obligations require a documented packa"
                "ging decision before distribution. Subprocess use is no"
                "t a licensing exemption."
            ),
        },
        "limitations": [
            "Readable ce16-backend-proof-1 is a prototype format, not soundtrack-project-1.",
            (
                "Full worker protocol, shared edits, ducking, timeline a"
                "nd passage integration are not implemented."
            ),
            (
                "Fixture uses existing local episode source paths; porta"
                "ble project relocation remains CE16-B work."
            ),
            (
                "Per-process peak resident memory excludes separate FFmp"
                "eg child processes; /usr/bin/time -l records are retain"
                "ed for measured runs."
            ),
            (
                "Initial install used a cold download cache without peak"
                "-memory profiling; measured fresh hash-locked setup dow"
                "nloaded all three wheels again."
            ),
            "No speed comparison or advantage is claimed.",
        ],
        "computerUse": "none",
        "listening": "not performed",
        "audiovisualQA": "not performed",
    }
    previous_path = Path("docs/composition-ce16-verification-results.json")
    previous = json.loads(previous_path.read_text()) if previous_path.exists() else {}
    if "integration" in previous:
        evidence["milestone"] = previous["milestone"]
        evidence["ce16Integration"] = previous["ce16Integration"]
        evidence["backendProofLimitations"] = evidence.pop("limitations")
        for key in ["integration", "verification", "limitations"]:
            if key in previous:
                evidence[key] = previous[key]
    Path("docs/composition-ce16-verification-results.json").write_text(
        json.dumps(evidence, indent=2) + "\n"
    )
    print(
        json.dumps(
            {
                "ok": True,
                "fullLengthOutputsPerRun": len(names),
                "reloadExact": True,
                "unaffectedStemsExact": True,
                "narrationDecodedExact": True,
                "evidence": "docs/composition-ce16-verification-results.json",
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", type=Path, required=True)
    args = parser.parse_args()
    verify(args.results)
