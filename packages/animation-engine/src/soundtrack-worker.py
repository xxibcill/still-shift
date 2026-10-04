"""soundtrack-worker-1: one validated snapshot in, deterministic offline PCM out."""

import hashlib
import json
import platform
import resource
import subprocess
import sys
import time
from importlib.metadata import version
from pathlib import Path


class WorkerError(Exception):
    def __init__(self, code, message, **context):
        super().__init__(message)
        self.code, self.context = code, context


def checksum(path):
    with Path(path).open("rb") as source:
        return "sha256:" + hashlib.file_digest(source, "sha256").hexdigest()


def command(args):
    result = subprocess.run(args, capture_output=True)
    if result.returncode:
        raise WorkerError(
            "media-decode",
            "FFmpeg/probe failed; verify the source file",
            stderr=result.stderr.decode()[-2048:],
        )
    return result.stdout


def decode(asset, clip, np):
    metadata = json.loads(
        command(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=channels,duration",
                "-of",
                "json",
                asset["path"],
            ]
        )
    )
    streams = metadata.get("streams", [])
    if not streams or streams[0].get("channels") not in (1, 2):
        raise WorkerError(
            "source-channels",
            "Only mono/stereo audio is supported",
            asset=asset["id"],
            clip=clip["id"],
        )
    channels = streams[0]["channels"]
    channel_filter = "pan=stereo|c0=c0|c1=c0" if channels == 1 else "aformat=channel_layouts=stereo"
    data = command(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            asset["path"],
            "-map",
            "0:a:0",
            "-af",
            f"aresample=48000,{channel_filter},atrim=start_sample={clip['sourceStartSample']}:end_sample={clip['sourceEndSample']},asetpts=PTS-STARTPTS",
            "-ar",
            "48000",
            "-c:a",
            "pcm_f32le",
            "-f",
            "f32le",
            "pipe:1",
        ]
    )
    audio = np.frombuffer(data, dtype="<f4").reshape(-1, 2).T.copy()
    if (
        audio.shape[1] != clip["sourceEndSample"] - clip["sourceStartSample"]
        or not np.isfinite(audio).all()
    ):
        raise WorkerError(
            "source-range",
            "Source does not cover the end-exclusive trim; shorten the interval",
            asset=asset["id"],
            clip=clip["id"],
        )
    return audio


def clip_envelope(clip, np):
    length = clip["sourceEndSample"] - clip["sourceStartSample"]
    samples = np.arange(length, dtype=np.float64)
    envelope = np.ones(length)
    if clip["fadeInSamples"]:
        envelope *= np.minimum(1, samples / clip["fadeInSamples"])
    if clip["fadeOutSamples"]:
        envelope *= np.minimum(1, (length - samples) / clip["fadeOutSamples"])
    points = clip["automation"]["points"]
    if points:
        positions, values = [p["sample"] for p in points], [p["gain"] for p in points]
        if clip["automation"]["interpolation"] == "linear":
            envelope *= np.interp(samples, positions, values)
        else:
            envelope *= np.asarray(values)[
                np.clip(np.searchsorted(positions, samples, side="right") - 1, 0, len(points) - 1)
            ]
    return (envelope * 10 ** (clip["gainDb"] / 20)).astype(np.float32)


def duck_envelope(detector, settings, np):
    """Window peak detector, optional lookahead, sample-exact hold and linear ramps."""
    length, window = detector.shape[1], settings["windowSamples"]
    starts = np.arange(0, length, window)
    peaks = np.maximum.reduceat(np.max(np.abs(detector), axis=0), starts)
    active = np.repeat(peaks >= 10 ** (settings["thresholdDb"] / 20), window)[:length]
    ahead = settings["lookaheadSamples"]
    if ahead:
        active = np.concatenate((active[ahead:], np.zeros(min(ahead, length), dtype=bool)))[:length]
    last = np.maximum.accumulate(np.where(active, np.arange(length), -length - 1))
    active |= np.arange(length) - last <= settings["holdSamples"]
    edges = np.r_[0, np.flatnonzero(active[1:] != active[:-1]) + 1, length]
    target = 10 ** (settings["attenuationDb"] / 20)
    envelope, value = np.ones(length, dtype=np.float32), 1.0
    for begin, end in zip(edges[:-1], edges[1:], strict=True):
        goal = target if active[begin] else 1.0
        ramp = settings["attackSamples"] if goal < value else settings["releaseSamples"]
        if ramp == 0:
            envelope[begin:end], value = goal, goal
        else:
            delta = (1 - target) / ramp
            positions = np.arange(1, end - begin + 1)
            values = (
                np.maximum(goal, value - positions * delta)
                if goal < value
                else np.minimum(goal, value + positions * delta)
            )
            envelope[begin:end], value = values, float(values[-1])
    return envelope


def probe_paths(project, daw, np):
    measurements = []
    for track in project["tracks"]:
        if not track["processors"]:
            continue
        engine = daw.RenderEngine(48000, 512)
        impulse = np.zeros((2, 48000), np.float32)
        impulse[:, 1024] = 1
        source = engine.make_playback_processor("probe", impulse)
        graph, previous = [(source, [])], "probe"
        for index, effect in enumerate(track["processors"]):
            processor = engine.make_filter_processor(
                f"probe-{index}",
                "high" if effect["type"] == "highpass" else "low",
                effect["frequencyHz"],
                effect["q"],
            )
            graph.append((processor, [previous]))
            previous = processor.get_name()
        if not engine.load_graph(graph) or not engine.render(1):
            raise WorkerError("latency-probe", "Cannot calibrate DSP path", processor=track["id"])
        audio = engine.get_audio()[0]
        nonzero = np.flatnonzero(audio != 0)
        tail = np.flatnonzero(np.abs(audio) > 1e-10)
        delay = int(nonzero[0]) - 1024 if nonzero.size else -1
        if delay != 0:
            raise WorkerError(
                "unsupported-latency",
                "DSP onset is delayed; this backend does not support compensation",
                processor=track["id"],
                delaySamples=delay,
            )
        measurements.append(
            {
                "track": track["id"],
                "impulseSample": 1024,
                "onsetSample": int(nonzero[0]),
                "peakSample": int(np.argmax(np.abs(audio))),
                "lastAbove1eMinus10": int(tail[-1]) if tail.size else None,
                "compensationSamples": 0,
            }
        )
    return measurements


def render(request):
    import dawdreamer as daw
    import numpy as np
    from scipy.io import wavfile

    if platform.python_version() != "3.12.11" or any(
        version(name) != pin
        for name, pin in {"dawdreamer": "0.9.0", "numpy": "2.3.3", "scipy": "1.16.2"}.items()
    ):
        raise WorkerError(
            "runtime-version", "Use the hash-pinned soundtrack runtime; run soundtrack setup"
        )
    if request.get("protocol") != "soundtrack-worker-1":
        raise WorkerError("protocol", "Unsupported worker protocol")
    project = request["project"]
    nodes = (
        len(project["tracks"])
        + len(project["buses"])
        + 1
        + sum(len(t["processors"]) for t in project["tracks"])
    )
    length = project["durationSamples"]
    if (
        not isinstance(length, int)
        or length < 1
        or length > 28800000
        or nodes > 89
        or length * 8 * (nodes * 4 + 8) > 1500000000
    ):
        raise WorkerError(
            "resource-budget", "Worker project exceeds its buffer budget; shorten or split it"
        )
    latency = probe_paths(project, daw, np)
    started = time.perf_counter()
    project, output = request["project"], Path(request["output"])
    length = project["durationSamples"]
    assets = {a["id"]: a for a in project["assets"]}
    for asset in assets.values():
        if checksum(asset["path"]) != asset["sha256"]:
            raise WorkerError(
                "source-checksum",
                "Asset bytes changed; restore the source or author a new identity",
                asset=asset["id"],
            )
    output.mkdir(exist_ok=False)
    buffers = {t["id"]: np.zeros((2, length), np.float32) for t in project["tracks"]}
    detector = np.zeros((2, length), np.float32) if project.get("ducking") else None
    for clip in project["clips"]:
        audio = decode(assets[clip["asset"]], clip, np)
        start, end = clip["startSample"], clip["startSample"] + audio.shape[1]
        if detector is not None and clip["track"] == project["ducking"]["sourceTrack"]:
            detector[:, start:end] += audio
        buffers[clip["track"]][:, start:end] += audio * clip_envelope(clip, np)[None, :]
    duck = duck_envelope(detector, project["ducking"], np) if detector is not None else None
    engine, graph, outputs = daw.RenderEngine(48000, 512), [], {}
    solo = any(t["solo"] and not t["mute"] for t in project["tracks"])
    for track in project["tracks"]:
        audio = buffers[track["id"]]
        audio *= (
            0 if track["mute"] or (solo and not track["solo"]) else 10 ** (track["gainDb"] / 20)
        )
        if duck is not None and track["id"] in project["ducking"]["targetTracks"]:
            audio *= duck[None, :]
        processor = engine.make_playback_processor("track-" + track["id"], audio)
        processor.record = True
        graph.append((processor, []))
        previous = processor.get_name()
        for index, effect in enumerate(track["processors"]):
            processor = engine.make_filter_processor(
                f"dsp-{track['id']}-{index}",
                "high" if effect["type"] == "highpass" else "low",
                effect["frequencyHz"],
                effect["q"],
            )
            processor.record = True
            graph.append((processor, [previous]))
            previous = processor.get_name()
        outputs[track["id"]] = previous
    pending = list(project["buses"]) + [project["master"]]
    while pending:
        progressed = False
        for bus in pending[:]:
            upstream = [n for n in project["tracks"] + project["buses"] if n["output"] == bus["id"]]
            if not all(n["id"] in outputs for n in upstream):
                continue
            if upstream:
                processor = engine.make_add_processor(
                    "bus-" + bus["id"], [10 ** (bus["gainDb"] / 20)] * len(upstream)
                )
            else:
                processor = engine.make_playback_processor(
                    "bus-" + bus["id"], np.zeros((2, length), np.float32)
                )
            processor.record = True
            graph.append((processor, [outputs[n["id"]] for n in upstream]))
            outputs[bus["id"]] = processor.get_name()
            pending.remove(bus)
            progressed = True
        if not progressed:
            raise WorkerError("routing-cycle", "Graph cannot be resolved")
    if not engine.load_graph(graph) or not engine.render(length / 48000):
        raise WorkerError("graph-render", "DawDreamer failed to render")
    begin, end = request["range"]["start"], request["range"]["end"]
    files = {}
    selected = outputs if request["stems"] else {"master": outputs["master"]}
    for name, node in selected.items():
        audio = engine.get_audio(node)
        if audio.shape != (2, length) or not np.isfinite(audio).all():
            raise WorkerError(
                "output-invalid", "Rendered PCM is not finite or aligned", processor=name
            )
        filename = "mix.wav" if name == "master" else name + ".wav"
        wavfile.write(output / filename, 48000, audio[:, begin:end].T)
        # A compact waveform view is derived from the same processed PCM.
        hop = max(1, int(np.ceil((end - begin) / 1200)))
        mono = np.max(np.abs(audio[:, begin:end]), axis=0)
        peaks = np.maximum.reduceat(mono, np.arange(0, mono.size, hop)).tolist()
        files[name] = {
            "file": filename,
            "sha256": checksum(output / filename),
            "samplesPerChannel": end - begin,
            "peaks": peaks,
        }
    if duck is not None:
        wavfile.write(output / "duck-envelope.wav", 48000, duck[begin:end])
    for asset in assets.values():
        if checksum(asset["path"]) != asset["sha256"]:
            raise WorkerError(
                "source-checksum",
                "Asset changed during render; retry with stable sources",
                asset=asset["id"],
            )
    return {
        "protocol": "soundtrack-worker-1",
        "ok": True,
        "revision": project["revision"],
        "sampleRate": 48000,
        "channels": 2,
        "blockSize": 512,
        "range": request["range"],
        "files": files,
        "stemTap": "post clip gain/fades/automation, ducking and track DSP; pre bus/master gain",
        "normalization": "none",
        "latencySamples": 0,
        "latencyProbes": latency,
        "tailPolicy": project["tailPolicy"],
        "dspVersion": "soundtrack-dsp-1",
        "ducking": project.get("ducking"),
        "wallSeconds": time.perf_counter() - started,
        "peakResidentBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "runtime": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "packages": {name: version(name) for name in ["dawdreamer", "numpy", "scipy"]},
        },
    }


if __name__ == "__main__":
    try:
        request_path = Path(sys.argv[1])
        if request_path.stat().st_size > 8000000:
            raise WorkerError("request-size", "Worker request exceeds 8 MB")
        print(json.dumps(render(json.loads(request_path.read_text())), allow_nan=False))
    except Exception as error:
        print(
            json.dumps(
                {
                    "protocol": "soundtrack-worker-1",
                    "ok": False,
                    "error": {
                        "code": getattr(error, "code", "worker-failed"),
                        "message": str(error),
                        "context": getattr(error, "context", {}),
                    },
                }
            )
        )
        print(str(error), file=sys.stderr)
        sys.exit(1)
