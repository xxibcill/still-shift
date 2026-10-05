"""soundtrack-worker-1: one validated snapshot in, deterministic offline PCM out."""

import hashlib
import json
import math
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


def probe_channels(asset, clip):
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
    return streams[0]["channels"]


def decode_span(asset, channels, start, end, np):
    """Resample the whole stream, then trim, so any span yields identical samples."""
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
            f"aresample=48000,{channel_filter},atrim=start_sample={start}:end_sample={end},asetpts=PTS-STARTPTS",
            "-ar",
            "48000",
            "-c:a",
            "pcm_f32le",
            "-f",
            "f32le",
            "pipe:1",
        ]
    )
    return np.frombuffer(data, dtype="<f4").reshape(-1, 2).T


def clip_sources(clips, assets, budget_frames, np):
    """Yield (clip, audio) in authored order, decoding each reused asset once.

    A reused asset's covering span is decoded once and sliced per clip while the
    cached spans fit in budget_frames; otherwise each clip decodes its own span.
    Slices equal per-clip decodes sample for sample, and authored order keeps
    floating-point mix accumulation unchanged.
    """
    uses, spans = {}, {}
    for clip in clips:
        key, span = clip["asset"], (clip["sourceStartSample"], clip["sourceEndSample"])
        uses[key] = uses.get(key, 0) + 1
        previous = spans.get(key, span)
        spans[key] = (min(previous[0], span[0]), max(previous[1], span[1]))
    channels, cache, cached_frames = {}, {}, 0
    for clip in clips:
        key, asset = clip["asset"], assets[clip["asset"]]
        if key not in channels:
            channels[key] = probe_channels(asset, clip)
        first, last = spans[key]
        if key not in cache and uses[key] > 1 and cached_frames + last - first <= budget_frames:
            cache[key] = (first, decode_span(asset, channels[key], first, last, np))
            cached_frames += last - first
        start, end = clip["sourceStartSample"], clip["sourceEndSample"]
        if key in cache:
            offset, span_audio = cache[key]
            audio = span_audio[:, start - offset : end - offset]
        else:
            audio = decode_span(asset, channels[key], start, end, np)
        if audio.shape[1] != end - start or not np.isfinite(audio).all():
            raise WorkerError(
                "source-range",
                "Source does not cover the end-exclusive trim; shorten the interval",
                asset=asset["id"],
                clip=clip["id"],
            )
        uses[key] -= 1
        if not uses[key] and key in cache:
            cached_frames -= last - first
            del cache[key]
        yield clip, audio


def fade_shape(ramp, curve, np):
    """Map a linear 0..1 fade ramp to its gain.

    Absent and "linear" return the ramp itself, so linear fades stay bit-identical.
    "equal-power" is sin(ramp * pi/2): -3 dB at the midpoint. Where the ramp is 1 the
    gain is pinned to exactly 1, so samples outside the fade never depend on the
    platform's sine rounding.
    """
    if curve != "equal-power":
        return ramp
    return np.where(ramp >= 1, 1.0, np.sin(ramp * (math.pi / 2)))


def clip_envelope(clip, np):
    length = clip["sourceEndSample"] - clip["sourceStartSample"]
    samples = np.arange(length, dtype=np.float64)
    envelope = np.ones(length)
    if clip["fadeInSamples"]:
        ramp = np.minimum(1, samples / clip["fadeInSamples"])
        envelope *= fade_shape(ramp, clip.get("fadeInCurve"), np)
    if clip["fadeOutSamples"]:
        ramp = np.minimum(1, (length - samples) / clip["fadeOutSamples"])
        envelope *= fade_shape(ramp, clip.get("fadeOutCurve"), np)
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


def pan_gains(pan, np):
    """Constant-power sine/cosine law, normalized so centre is unity on both channels.

    Returns None at centre so unpanned clips skip the multiply and stay bit-identical.
    Hard pan is +3 dB on its side and exact silence on the other.
    """
    if not pan:
        return None
    angle = (pan + 1) * math.pi / 4
    left = 0.0 if pan == 1 else math.sqrt(2) * math.cos(angle)
    right = 0.0 if pan == -1 else math.sqrt(2) * math.sin(angle)
    return np.array([[left], [right]], dtype=np.float32)


def duck_envelope(detector, settings, np):
    """Window peak detector, optional lookahead, sample-exact hold and linear ramps."""
    length, window = detector.shape[1], settings["windowSamples"]
    starts = np.arange(0, length, window)
    peaks = np.maximum.reduceat(np.max(np.abs(detector), axis=0), starts)
    active = np.repeat(peaks >= 10 ** (settings["thresholdDb"] / 20), window)[:length]
    ahead = settings["lookaheadSamples"]
    if ahead:
        active = np.concatenate((active[ahead:], np.zeros(min(ahead, length), dtype=bool)))[:length]
    last = np.maximum.accumulate(np.where(active, np.arange(length), -1))
    active |= (last >= 0) & (np.arange(length) - last <= settings["holdSamples"])
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
    for clip, audio in clip_sources(project["clips"], assets, length, np):
        start, end = clip["startSample"], clip["startSample"] + audio.shape[1]
        shaped = audio * clip_envelope(clip, np)[None, :]
        # Pre-fader, pre-pan sidechain: the detector hears clip gain, fades and
        # automation, but not pan, track gain, mute/solo or DSP.
        if detector is not None and clip["track"] == project["ducking"]["sourceTrack"]:
            detector[:, start:end] += shaped
        gains = pan_gains(clip.get("pan", 0), np)
        if gains is not None:
            shaped = shaped * gains
        buffers[clip["track"]][:, start:end] += shaped
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
    # DawDreamer truncates seconds * sample rate; round upward at this boundary.
    seconds = math.nextafter(length / 48000, math.inf)
    if not engine.load_graph(graph) or not engine.render(seconds):
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
        # A compact waveform view and headroom report use the same written PCM.
        hop = max(1, int(np.ceil((end - begin) / 1200)))
        mono = np.max(np.abs(audio[:, begin:end]), axis=0)
        peaks = np.maximum.reduceat(mono, np.arange(0, mono.size, hop)).tolist()
        peak = float(mono.max())
        files[name] = {
            "file": filename,
            "sha256": checksum(output / filename),
            "samplesPerChannel": end - begin,
            "peaks": peaks,
            # Float WAV keeps overs; integer delivery formats clip them.
            "peakDbfs": 20 * math.log10(peak) if peak > 0 else None,
            "samplesAboveFullScale": int(np.count_nonzero(mono > 1)),
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
        "stemTap": (
            "post clip gain/fades/automation/pan, ducking and track DSP; pre bus/master gain"
        ),
        "normalization": "none",
        "latencySamples": 0,
        "latencyProbes": latency,
        "tailPolicy": project["tailPolicy"],
        "dspVersion": "soundtrack-dsp-5",
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
