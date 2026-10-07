"""Isolated CE16-A trial. Readable project JSON is the sole graph authority."""

import argparse
import hashlib
import json
import platform
import resource
import subprocess
import sys
import time
from importlib.metadata import version
from pathlib import Path

import dawdreamer as daw
import numpy as np
from scipy.io import wavfile

RATE = 48000
BLOCK = 512


def digest(path):
    with Path(path).open("rb") as source:
        return "sha256:" + hashlib.file_digest(source, "sha256").hexdigest()


def decode(clip):
    if digest(clip["path"]) != clip["sha256"]:
        raise ValueError("source-checksum: " + clip["id"])
    command = [
        "ffmpeg",
        "-v",
        "error",
        "-i",
        clip["path"],
        "-map",
        "0:a:0",
        "-af",
        f"aresample={RATE},atrim=start_sample={clip['sourceStartSample']}:"
        f"end_sample={clip['sourceEndSample']},asetpts=PTS-STARTPTS",
        "-ac",
        "2",
        "-ar",
        str(RATE),
        "-c:a",
        "pcm_f32le",
        "-f",
        "f32le",
        "pipe:1",
    ]
    result = subprocess.run(command, check=True, capture_output=True)
    data = np.frombuffer(result.stdout, dtype="<f4").reshape(-1, 2).T.copy()
    expected = clip["sourceEndSample"] - clip["sourceStartSample"]
    if data.shape != (2, expected):
        raise ValueError(
            f"source-range: {clip['id']} has {data.shape[1]} samples, needs {expected}"
        )
    return data


def envelope(clip, length):
    positions = np.arange(length, dtype=np.float64)
    gains = np.ones(length, dtype=np.float64)
    if clip["fadeInSamples"]:
        gains *= np.minimum(1, positions / clip["fadeInSamples"])
    if clip["fadeOutSamples"]:
        gains *= np.minimum(1, (length - positions) / clip["fadeOutSamples"])
    points = clip["automation"]
    if points:
        gains *= np.interp(positions, [p[0] for p in points], [p[1] for p in points])
    return (gains * 10 ** (clip["gainDb"] / 20)).astype(np.float32)


def filters(engine, name, source, graph):
    high = engine.make_filter_processor(name + "-highpass", "high", 100)
    low = engine.make_filter_processor(name + "-lowpass", "low", 5500)
    high.record = low.record = True
    graph.extend([(high, [source]), (low, [high.get_name()])])
    return low.get_name()


def latency_probe():
    engine = daw.RenderEngine(RATE, BLOCK)
    impulse = np.zeros((2, RATE), np.float32)
    impulse[:, 1024] = 1
    playback = engine.make_playback_processor("probe-source", impulse)
    graph = [(playback, [])]
    filters(engine, "probe", playback.get_name(), graph)
    if not engine.load_graph(graph) or not engine.render(1):
        raise RuntimeError("latency-probe-render")
    audio = engine.get_audio()
    nonzero = np.flatnonzero(np.abs(audio[0]) > 1e-10)
    latency = int(nonzero[0]) - 1024
    if latency != 0:
        raise ValueError(
            f"unsupported-latency: built-in chain onset is delayed by {latency} samples"
        )
    return {
        "inputImpulseSample": 1024,
        "firstOutputSample": int(nonzero[0]),
        "peakOutputSample": int(np.argmax(np.abs(audio[0]))),
        "lastOutputAbove1eMinus10": int(nonzero[-1]),
        "onsetLatencySamples": latency,
        "compensationSamples": 0,
        "tailPolicy": "Retain tails within the project; truncate at its declared end.",
        "externalPlugins": "Unsupported; no automatic compensation claimed.",
    }


def render(project_path, output):
    started = time.perf_counter()
    project = json.loads(project_path.read_text())
    if project["schemaVersion"] != "ce16-backend-proof-1" or project["sampleRate"] != RATE:
        raise ValueError("proof-version")
    length = project["durationSamples"]
    if length != 2880000:
        raise ValueError("proof-duration")
    output.mkdir(parents=True, exist_ok=False)
    (output / "project.json").write_bytes(project_path.read_bytes())
    engine = daw.RenderEngine(RATE, BLOCK)
    graph, outputs, sources, placement = [], {}, {}, []
    for clip in project["clips"]:
        source = decode(clip)
        sources[clip["id"]] = clip["sha256"]
        processed = source * envelope(clip, source.shape[1])[None, :]
        buffer = np.zeros((2, length), np.float32)
        start, end = clip["startSample"], clip["startSample"] + processed.shape[1]
        if start < 0 or end > length:
            raise ValueError("placement-range: " + clip["id"])
        buffer[:, start:end] = processed
        playback = engine.make_playback_processor(clip["id"], buffer)
        playback.record = True
        graph.append((playback, []))
        result = playback.get_name()
        if clip["dsp"] == "highpass-lowpass":
            result = filters(engine, clip["id"], result, graph)
        elif clip["dsp"] != "none":
            raise ValueError("unsupported-dsp")
        outputs[clip["id"]] = result
        placement.append({"id": clip["id"], "startSample": start, "endSampleExclusive": end})
    music = engine.make_add_processor("music-bus", [1])
    effects = engine.make_add_processor("sfx-bus", [1, 1])
    master = engine.make_add_processor("master", [1, 1, 1])
    for processor in [music, effects, master]:
        processor.record = True
    graph.extend(
        [
            (music, [outputs["bgm"]]),
            (effects, [outputs["sfx-pouch"], outputs["sfx-roots"]]),
            (master, [outputs["narration"], "music-bus", "sfx-bus"]),
        ]
    )
    if not engine.load_graph(graph) or not engine.render(length / RATE):
        raise RuntimeError("graph-render-failed")
    files = {}
    for name, processor in {
        **outputs,
        "music-bus": "music-bus",
        "sfx-bus": "sfx-bus",
        "mix": "master",
    }.items():
        audio = engine.get_audio(processor)
        if audio.shape != (2, length) or not np.isfinite(audio).all():
            raise ValueError("invalid-output: " + name)
        wavfile.write(output / (name + ".wav"), RATE, audio.T)
        files[name] = {
            "samplesPerChannel": length,
            "channels": 2,
            "bytes": (output / (name + ".wav")).stat().st_size,
        }
    narration = next(c for c in project["clips"] if c["id"] == "narration")
    raw_narration = decode(narration)
    narration_audio = engine.get_audio(outputs["narration"])
    reference = np.zeros((2, length), np.float32)
    reference[:, narration["startSample"] : narration["startSample"] + raw_narration.shape[1]] = (
        raw_narration
    )
    if not np.array_equal(reference, narration_audio):
        raise ValueError("narration-changed")
    sum_stems = engine.get_audio(outputs["narration"]) + engine.get_audio("music-bus")
    sum_stems += engine.get_audio("sfx-bus")
    delta = sum_stems - engine.get_audio("master")
    report = {
        "ok": True,
        "project": str(project_path),
        "projectSha256": digest(project_path),
        "sampleRate": RATE,
        "blockSize": BLOCK,
        "durationSamples": length,
        "sourceHashes": sources,
        "placement": placement,
        "files": files,
        "stemTap": (
            "Post clip gain/envelopes and per-track filters, pre bus/master; buses also exported."
        ),
        "masterProcessing": "Unity summation; no normalization, limiter or master DSP.",
        "narrationDecodedExact": True,
        "reconstructionMaxSampleError": float(np.max(np.abs(delta))),
        "latency": latency_probe(),
        "wallSeconds": time.perf_counter() - started,
        "peakResidentBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "host": {
            "system": platform.system(),
            "release": platform.release(),
            "architecture": platform.machine(),
            "python": platform.python_version(),
        },
        "packages": {name: version(name) for name in ["dawdreamer", "numpy", "scipy"]},
    }
    (output / "result.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(render(args.project, args.output_dir)))
    except Exception as error:
        print(json.dumps({"ok": False, "stage": "ce16-a-render", "error": str(error)}))
        print(str(error), file=sys.stderr)
        sys.exit(1)
