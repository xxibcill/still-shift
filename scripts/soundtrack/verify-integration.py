"""Independently inspect retained CE16-B PCM, not encoded WAV hashes."""

import argparse
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
    evidence["ce16Integration"] = "implemented; command-only verification recorded"
    if "backendProofLimitations" not in evidence:
        evidence["backendProofLimitations"] = evidence.pop("limitations", [])
    evidence["integration"] = {
        "schemaVersion": "soundtrack-project-1",
        "workerProtocol": "soundtrack-worker-1",
        "dspVersion": "soundtrack-dsp-1",
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
    evidence["limitations"] = [
        (
            "Full pnpm check and frozen browser baselines not run: CE16 prohib"
            "its browser driving. Command/library/API verification is separate"
            " from those repository gates."
        ),
        (
            "No listening, audiovisual QA or visible GUI inspection performed. "
            "Earlier broad integration tier indirectly launched headless browsers; "
            "this policy breach is recorded and subsequent selection is audio-only."
        ),
        (
            "Local opt-in pinned Python runtime only; GPL/transitive distribut"
            "ion decision remains pending. No backend dependency binaries bund"
            "led."
        ),
        (
            "Only causal built-in high/low-pass DSP is accepted, with per-path"
            " onset probes. External plugins and nonzero latency compensation "
            "are unsupported."
        ),
        (
            "No drag handles or native browser DSP parity claimed; explicit nu"
            "meric/JSON edits share the same atomic API."
        ),
    ]
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
