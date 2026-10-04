"""Independently inspect retained CE16-B PCM, not encoded WAV hashes."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
from scipy.io import wavfile


def comparison(a, b):
    assert a.shape == b.shape
    return {
        "maxSampleError": float(np.max(np.abs(a - b))),
        "differingSamples": int(np.count_nonzero(a != b)),
        "samplesPerChannel": a.shape[0],
        "channels": a.shape[1],
    }


def verify(base):
    reports = {
        name: json.loads((base / name / "render.json").read_text())
        for name in ["initial", "reloaded", "edited", "relocated"]
    }
    current_source_hashes = {}
    for run in reports:
        project_path = base / run / "project.json"
        saved_project = json.loads(project_path.read_text())
        current_source_hashes[run] = {}
        resolved_assets = {
            asset["id"]: asset for asset in reports[run]["identityInputs"]["project"]["assets"]
        }
        for asset in saved_project["assets"]:
            resolved_asset = resolved_assets[asset["id"]]
            assert resolved_asset["sha256"] == asset["sha256"]
            path = Path(resolved_asset["path"])
            assert path.is_absolute(), "Manifest must record resolved source paths"
            digest = hashlib.sha256()
            with path.open("rb") as source_file:
                while chunk := source_file.read(1024 * 1024):
                    digest.update(chunk)
            actual = "sha256:" + digest.hexdigest()
            assert actual == asset["sha256"], (
                f"Current source checksum differs: {run}/{asset['id']}"
            )
            current_source_hashes[run][asset["id"]] = actual
    names = ["narration", "bgm", "sfx-pouch", "sfx-roots", "music-bus", "sfx-bus", "master"]
    audio = {}
    for run, report in reports.items():
        audio[run] = {}
        for name in names:
            rate, data = wavfile.read(base / run / "audio" / report["files"][name]["file"])
            assert rate == 48000 and data.shape == (2880000, 2) and np.isfinite(data).all()
            audio[run][name] = data
    reload = {name: comparison(audio["initial"][name], audio["reloaded"][name]) for name in names}
    assert all(c["differingSamples"] == 0 for c in reload.values())
    edited = {name: comparison(audio["initial"][name], audio["edited"][name]) for name in names}
    for name in ["narration", "bgm", "sfx-roots", "music-bus"]:
        assert edited[name]["differingSamples"] == 0
    for name in ["sfx-pouch", "sfx-bus", "master"]:
        assert edited[name]["differingSamples"] > 0
    relocated = {
        name: comparison(audio["edited"][name], audio["relocated"][name]) for name in names
    }
    assert all(c["differingSamples"] == 0 for c in relocated.values())
    project = json.loads((base / "initial/project.json").read_text())
    narration = next(a for a in project["assets"] if a["id"] == "narration-source")
    raw = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            narration["path"],
            "-af",
            "aresample=48000,atrim=end_sample=2880000",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-c:a",
            "pcm_f32le",
            "-f",
            "f32le",
            "pipe:1",
        ],
        capture_output=True,
        check=True,
    )
    source = np.frombuffer(raw.stdout, dtype="<f4").reshape(-1, 2)
    voice = comparison(source, audio["initial"]["narration"])
    assert voice["differingSamples"] == 0
    reconstruction = comparison(
        audio["initial"]["narration"] + audio["initial"]["music-bus"] + audio["initial"]["sfx-bus"],
        audio["initial"]["master"],
    )
    assert reconstruction["differingSamples"] == 0
    evidence_path = Path("docs/composition-ce16-verification-results.json")
    evidence = json.loads(evidence_path.read_text())
    evidence["milestone"] = "CE16"
    evidence["ce16Integration"] = "implemented; command/audio verification recorded"
    if "backendProofLimitations" not in evidence:
        evidence["backendProofLimitations"] = evidence.pop("limitations", [])
    evidence["integration"] = {
        "schemaVersion": "soundtrack-project-1",
        "workerProtocol": "soundtrack-worker-1",
        "dspVersion": "soundtrack-dsp-2",
        "results": str(base),
        "commands": json.loads((base / "commands.json").read_text()),
        "runs": {
            name: {
                key: value
                for key, value in report.items()
                if key not in ["files", "identityInputs"]
            }
            for name, report in reports.items()
        },
        "currentSourceHashes": current_source_hashes,
        "outputSizesBytes": {
            run: {
                name: (base / run / "audio" / reports[run]["files"][name]["file"]).stat().st_size
                for name in names
            }
            for run in reports
        },
        "reloadPCM": reload,
        "editedPCM": edited,
        "relocatedPCM": relocated,
        "narrationPCM": voice,
        "reconstructionPCM": reconstruction,
        "waveformPlaylistEvaluation": {
            "engine": "13.6.0 MIT",
            "core": "12.6.1 MIT",
            "browser": "16.0.0 MIT, React/Tone peers",
            "components": "@dawcore/components 0.0.37 MIT, Lit/native audio peers",
            "decision": (
                "Vanilla TypeScript view; shared project is sole authority. Engine"
                " collision rules and snapshot history differ from allowed overlap"
                "s and persisted project history. No additional npm audio librarie"
                "s installed."
            ),
        },
        "preview": (
            "Hash-checked rendered full mix; API response bytes exact. Range r"
            "endering evaluates complete DSP/ducking schedule before cropping."
        ),
        "measurementMethod": (
            "CLI monotonic wall time includes preflight, calibration and worker. "
            "Worker wallSeconds starts after calibration. RUSAGE_SELF peak includes "
            "worker/calibration but excludes FFmpeg children; no speed advantage claimed."
        ),
    }
    limitations = [
        "No listening or human audiovisual QA performed; automated technical checks are separate.",
        (
            "Earlier unapproved indirect headless-browser use remains recorded. "
            "The owner later authorized automated browser verification "
            "for the completion pass only."
        ),
        (
            "Local opt-in pinned Python runtime only; GPL/transitive distribution "
            "decision remains pending. No backend dependency binaries bundled."
        ),
        (
            "Only causal built-in high/low-pass DSP is accepted, with per-path "
            "onset probes. External plugins and nonzero latency compensation are unsupported."
        ),
        (
            "No drag handles or native browser DSP path adopted; explicit "
            "numeric/JSON edits share the same atomic API and preview uses rendered audio."
        ),
    ]
    verification = evidence.get("verification", {})
    if verification.get("fullRepository", {}).get("exitCode") != 0:
        limitations.insert(
            0,
            "Full repository gate is not confirmed passed. "
            "This verifier checks only the audio lifecycle.",
        )
    evidence["limitations"] = limitations
    evidence_path.write_text(json.dumps(evidence, indent=2) + "\n")
    print(
        json.dumps(
            {
                "ok": True,
                "reloadExact": True,
                "unaffectedStemsExact": True,
                "relocationExact": True,
                "narrationExact": True,
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", type=Path, required=True)
    verify(parser.parse_args().results)
