"""soundtrack-worker-1: one validated snapshot in, deterministic offline PCM out."""

import hashlib
import json
import math
import os
import platform
import resource
import struct
import subprocess
import sys
import tempfile
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
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


def decode_command(asset, channels, start, end):
    """Resample the whole stream, then trim, so any span yields identical samples."""
    channel_filter = "pan=stereo|c0=c0|c1=c0" if channels == 1 else "aformat=channel_layouts=stereo"
    return [
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


def decoded_blocks(asset, channels, first, last, np, block_frames=1 << 16):
    """Yield (source position, frames x 2 block) for one decode of [first, last).

    The block buffer is reused, so callers copy what they keep. A source that ends
    early yields fewer samples; a decoder failure raises after the stream ends.
    """
    block = np.empty((block_frames, 2), "<f4")
    view, position = memoryview(block).cast("B"), first
    # stderr goes to a file so a noisy decoder can never block on a full pipe.
    with tempfile.TemporaryFile() as errors:
        process = subprocess.Popen(
            decode_command(asset, channels, first, last), stdout=subprocess.PIPE, stderr=errors
        )
        try:
            with process.stdout:
                while True:
                    filled = 0
                    while filled < len(view):
                        read = process.stdout.readinto(view[filled:])
                        if not read:
                            break
                        filled += read
                    frames = filled // 8
                    if frames:
                        yield position, block[:frames]
                    position += frames
                    if filled < len(view):
                        break
            if process.wait():
                errors.seek(0)
                raise WorkerError(
                    "media-decode",
                    "FFmpeg/probe failed; verify the source file",
                    stderr=errors.read().decode(errors="replace")[-2048:],
                    asset=asset["id"],
                )
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()


def stream_spans(asset, channels, spans, np):
    """Decode the union of spans in one pass, keeping only the spans' samples.

    The pass trims the resampled stream to the covering interval, so each returned
    span equals a decode of that span alone, while memory holds only the spans.
    A span the source does not fully cover comes back short; callers report it.
    """
    first, last = min(s for s, _ in spans), max(e for _, e in spans)
    outputs = [np.empty((2, end - start), np.float32) for start, end in spans]
    position = first
    for position, block in decoded_blocks(asset, channels, first, last, np):
        for output, (start, end) in zip(outputs, spans, strict=True):
            low, high = max(start, position), min(end, position + len(block))
            if low < high:
                output[:, low - start : high - start] = block[low - position : high - position].T
        position += len(block)
    return [
        output[:, : max(0, min(end, position) - start)]
        for output, (start, end) in zip(outputs, spans, strict=True)
    ]


def clip_stream(clip, asset, channels, np):
    """Yield (clip-relative offset, 2 x frames block) straight from the decoder.

    Equals a whole-clip decode block by block, without holding the clip in memory.
    """
    start, end = clip["sourceStartSample"], clip["sourceEndSample"]
    decoded = 0
    for position, block in decoded_blocks(asset, channels, start, end, np):
        chunk = np.ascontiguousarray(block.T)
        if not np.isfinite(chunk).all():
            break
        yield position - start, chunk
        decoded = position - start + chunk.shape[1]
    if decoded != end - start:
        raise source_range(clip)


def source_range(clip):
    return WorkerError(
        "source-range",
        "Source does not cover the end-exclusive trim; shorten the interval",
        asset=clip["asset"],
        clip=clip["id"],
    )


def span_frames(clip):
    return clip["sourceEndSample"] - clip["sourceStartSample"]


def decode_jobs(clips, budget_frames):
    """Group clips into (asset, clip indices) decode jobs, ordered by first clip.

    This is the plan of a lazy authored-order pass: when a clip is first needed, its
    asset's next clips join one streamed pass while their samples fit in
    budget_frames beside samples already decoded for later clips; a clip that fits
    nowhere decodes alone. The plan depends only on the project, never on timing.
    """
    remaining = {}
    for index, clip in enumerate(clips):
        remaining.setdefault(clip["asset"], []).append(index)
    jobs, planned, streamed, retained = [], set(), set(), 0
    for index, clip in enumerate(clips):
        key = clip["asset"]
        if index not in planned:
            batch, frames = [], 0
            for later in remaining[key]:
                length = span_frames(clips[later])
                if retained + frames + length > budget_frames:
                    break
                batch.append(later)
                frames += length
            if len(batch) > 1:
                retained += frames
                streamed.update(batch)
            else:
                batch = [index]
            jobs.append((key, batch))
            planned.update(batch)
        remaining[key].pop(0)
        if index in streamed:
            retained -= span_frames(clip)
    return jobs


def clip_sources(clips, assets, budget_frames, np, workers=None):
    """Yield (clip, audio) in authored order while decoding ahead in parallel.

    decode_jobs fixes which samples each FFmpeg pass produces, so results equal a
    per-clip decode sample for sample regardless of scheduling. Jobs run on a thread
    pool, holding at most budget_frames of decoded samples ahead of the mix (always
    at least the job the mix needs next). A clip longer than budget_frames is not
    held at all: audio is then an iterator of (offset, block) straight from FFmpeg.
    Clips are consumed in authored order, so floating-point accumulation is
    unchanged, and a failure surfaces at the first affected clip in authored order.
    """
    workers = workers or min(8, os.cpu_count() or 1)
    jobs, first_use = decode_jobs(clips, budget_frames), {}
    for clip in clips:
        first_use.setdefault(clip["asset"], clip)

    def run(key, batch, probe):
        # Streaming fills preallocated arrays, avoiding a second in-flight copy.
        spans = [(clips[i]["sourceStartSample"], clips[i]["sourceEndSample"]) for i in batch]
        return stream_spans(assets[key], probe.result(), spans, np)

    pool = ThreadPoolExecutor(workers)
    try:
        # Probes are queued first, so a job never waits on a probe behind it.
        probes = {
            key: pool.submit(probe_channels, assets[key], clip) for key, clip in first_use.items()
        }
        pending, ready, submitted, held = deque(), {}, 0, 0
        for index, clip in enumerate(clips):
            while submitted < len(jobs):
                key, batch = jobs[submitted]
                frames = sum(span_frames(clips[i]) for i in batch)
                if frames > budget_frames:
                    # Decoded by the mix itself, block by block.
                    pending.append((batch, None))
                    submitted += 1
                    continue
                if pending and held + frames > budget_frames:
                    break
                pending.append((batch, pool.submit(run, key, batch, probes[key])))
                submitted, held = submitted + 1, held + frames
            while index not in ready:
                batch, future = pending.popleft()
                if future is None:
                    ready[batch[0]] = None
                else:
                    ready.update(zip(batch, future.result(), strict=True))
            audio = ready.pop(index)
            if audio is None:
                yield (
                    clip,
                    clip_stream(clip, assets[clip["asset"]], probes[clip["asset"]].result(), np),
                )
                continue
            held -= span_frames(clip)
            if audio.shape[1] != span_frames(clip) or not np.isfinite(audio).all():
                raise source_range(clip)
            yield clip, audio
    finally:
        pool.shutdown(cancel_futures=True)


def verify_checksums(assets, message, workers=None):
    """Hash every asset concurrently; report the first mismatch in authored order."""
    with ThreadPoolExecutor(workers or min(8, os.cpu_count() or 1)) as pool:
        sums = list(pool.map(checksum, [asset["path"] for asset in assets]))
    for asset, digest in zip(assets, sums, strict=True):
        if digest != asset["sha256"]:
            raise WorkerError("source-checksum", message, asset=asset["id"])


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


def clip_envelope(clip, np, begin=0, end=None):
    """Clip gain, fade and automation gains for clip-relative samples [begin, end)."""
    length = clip["sourceEndSample"] - clip["sourceStartSample"]
    samples = np.arange(begin, length if end is None else end, dtype=np.float64)
    envelope = np.ones(samples.size)
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


CHUNK = 1 << 18


def duck_envelope(detector, settings, np):
    """Window peak detector, optional lookahead, sample-exact hold and linear ramps.

    Activity is kept as sample intervals rather than per-sample index arrays, and
    ramps are evaluated in chunks, so memory stays near the float32 envelope. Each
    sample gets the same float64 expression as a whole-array evaluation.
    """
    length, window = detector.shape[1], settings["windowSamples"]
    span = window * max(1, CHUNK // window)
    peaks = np.concatenate(
        [
            np.maximum.reduceat(
                np.max(np.abs(detector[:, at : at + span]), axis=0),
                np.arange(0, min(span, length - at), window),
            )
            for at in range(0, length, span)
        ]
    )
    loud = peaks >= 10 ** (settings["thresholdDb"] / 20)
    changes = np.flatnonzero(np.diff(np.r_[False, loud, False].astype(np.int8)))
    ahead, hold, intervals = settings["lookaheadSamples"], settings["holdSamples"], []
    for first, last in zip(changes[::2], changes[1::2], strict=True):
        begin = max(0, int(first) * window - ahead)
        end = min(int(last) * window, length) - ahead
        if end <= begin:
            continue
        end = min(length, end + hold)
        if intervals and begin <= intervals[-1][1]:
            intervals[-1][1] = max(intervals[-1][1], end)
        else:
            intervals.append([begin, end])
    edges, cursor = [], 0
    for begin, end in intervals:
        if begin > cursor:
            edges.append((cursor, begin, False))
        edges.append((begin, end, True))
        cursor = end
    if cursor < length:
        edges.append((cursor, length, False))
    target = 10 ** (settings["attenuationDb"] / 20)
    envelope, value = np.ones(length, dtype=np.float32), 1.0
    for begin, end, active in edges:
        goal = target if active else 1.0
        ramp = settings["attackSamples"] if goal < value else settings["releaseSamples"]
        if ramp == 0:
            envelope[begin:end], value = goal, goal
            continue
        delta, start = (1 - target) / ramp, value
        for at in range(begin, end, CHUNK):
            stop = min(end, at + CHUNK)
            positions = np.arange(at - begin + 1, stop - begin + 1)
            values = (
                np.maximum(goal, start - positions * delta)
                if goal < start
                else np.minimum(goal, start + positions * delta)
            )
            envelope[at:stop], value = values, float(values[-1])
    return envelope


def juce_equal(a, b, np):
    """JUCE 8 approximatelyEqual for float, as AudioBuffer gain shortcuts use it."""
    a, b = np.float32(a), np.float32(b)
    limit = max(np.finfo(np.float32).tiny, np.finfo(np.float32).eps * max(abs(a), abs(b)))
    return abs(a - b) <= limit


def fused_add(acc, source, gain, np):
    """acc += source * gain with one rounding, as JUCE's FMA addWithMultiply does.

    The float64 product of two float32 values is exact; TwoSum recovers the float64
    sum's rounding error, which decides the one case where rounding the float64 sum
    to float32 differs from rounding the exact sum: a sum on a float32 midpoint.
    """
    gain = np.float64(gain)
    for at in range(0, acc.shape[1], CHUNK):
        a = acc[:, at : at + CHUNK].astype(np.float64)
        product = source[:, at : at + CHUNK].astype(np.float64) * gain
        total = a + product
        partial = total - a
        error = (a - (total - partial)) + (product - partial)
        rounded = total.astype(np.float32)
        wide = rounded.astype(np.float64)
        other = np.nextafter(rounded, np.where(total > wide, np.inf, -np.inf).astype(np.float32))
        other_wide = other.astype(np.float64)
        tie = (
            (total != wide) & (np.abs(total - wide) * 2 == np.abs(other_wide - wide)) & (error != 0)
        )
        if tie.any():
            upward = np.maximum(wide, other_wide) == other_wide
            choose_other = np.where(error > 0, upward, ~upward)
            rounded = np.where(tie & choose_other, other, rounded)
        acc[:, at : at + CHUNK] = rounded


def sum_input(acc, source, gain, np):
    """One AddProcessor input, as DawDreamer 0.9.0 sums it with JUCE AudioBuffer.

    The first input takes applyGain in place; later inputs use addFrom. Both skip a
    gain approximately equal to 1 and treat one approximately 0 as silence.
    Returns the accumulator, which may be the (consumed) source itself.
    """
    gain = np.float32(gain)
    if acc is None:
        if not source.flags.writeable:
            # A read-only (memory-mapped) input becomes an owned accumulator.
            source = np.array(source)
        if juce_equal(gain, 0, np):
            source[:] = 0
        elif not juce_equal(gain, 1, np):
            source *= gain
        return source
    if juce_equal(gain, 0, np):
        return acc
    if juce_equal(gain, 1, np):
        acc += source
    else:
        fused_add(acc, source, gain, np)
    return acc


def write_wav(path, audio, begin, end, np):
    """Stream a Float32 WAV byte-identical to scipy.io.wavfile.write(audio[..., begin:end].T).

    Returns the headroom/waveform report computed from the same samples, chunk by
    chunk; peaks use the same hop, so they equal a whole-array reduction.
    """
    channels = 1 if audio.ndim == 1 else audio.shape[0]
    frames = end - begin
    nbytes = frames * channels * 4
    fmt = struct.pack("<HHIIHH", 3, channels, 48000, 48000 * 4 * channels, channels * 4, 32)
    fmt += b"\x00\x00"
    header = b"WAVE" + b"fmt " + struct.pack("<I", len(fmt)) + fmt
    header += b"fact" + struct.pack("<II", 4, frames) + b"data" + struct.pack("<I", nbytes)
    if len(header) + 4 + nbytes > 0xFFFFFFFF:
        raise WorkerError("output-invalid", "Output exceeds the 4 GB RIFF limit")
    hop = max(1, int(np.ceil(frames / 1200)))
    step = hop * max(1, CHUNK // hop)
    peaks, peak, overs = [], 0.0, 0
    with open(path, "wb") as target:
        target.write(b"RIFF" + struct.pack("<I", len(header) + nbytes) + header)
        for at in range(begin, end, step):
            block = audio[..., at : min(end, at + step)]
            if not np.isfinite(block).all():
                return None
            target.write(np.ascontiguousarray(block.T, dtype="<f4").tobytes())
            mono = np.abs(block) if block.ndim == 1 else np.max(np.abs(block), axis=0)
            peaks += np.maximum.reduceat(mono, np.arange(0, mono.size, hop)).tolist()
            peak = max(peak, float(mono.max()))
            overs += int(np.count_nonzero(mono > 1))
    return peaks, peak, overs


def shape_clip_into(target, detector, clip, audio, np, offset=0):
    """Add clip samples [offset, offset + len) into its track (or the pre-pan detector).

    Clip gain, fades, automation and pan are elementwise, so chunks give the same
    samples as whole-clip arrays without full-length float64 envelopes.
    """
    start, length = clip["startSample"] + offset, audio.shape[1]
    gains = pan_gains(clip.get("pan", 0), np)
    for at in range(0, length, CHUNK):
        stop = min(length, at + CHUNK)
        envelope = clip_envelope(clip, np, offset + at, offset + stop)
        shaped = audio[:, at:stop] * envelope[None, :]
        if detector is not None:
            detector[:, start + at : start + stop] += shaped
        if target is not None:
            if gains is not None:
                shaped = shaped * gains
            target[:, start + at : start + stop] += shaped


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


DECODE_BUDGET_FRAMES = 8_000_000


def decode_budget():
    """Frames of decoded clips held ahead of the mix.

    STILL_SHIFT_SOUNDTRACK_DECODE_FRAMES may only lower the default, so tests can
    exercise batching limits and direct streaming on short projects without ever
    exceeding the memory estimate.
    """
    value = os.environ.get("STILL_SHIFT_SOUNDTRACK_DECODE_FRAMES")
    if value is None:
        return DECODE_BUDGET_FRAMES
    if not value.isdigit() or not 1 <= int(value) <= DECODE_BUDGET_FRAMES:
        raise WorkerError(
            "decode-budget",
            f"STILL_SHIFT_SOUNDTRACK_DECODE_FRAMES must be 1–{DECODE_BUDGET_FRAMES}",
        )
    return int(value)


def working_bytes(project):
    """Peak memory estimate; mirrors soundtrackWorkingBytes in the scene contract.

    Units are project-length stereo float32 buffers: the routing depth (accumulators
    alive along one bus path) plus 1 for the track being mixed, or 3 while
    DawDreamer filters one track before any accumulator exists; 0.5 more for a
    ducking envelope. Fixed: 200 MB for the interpreter and chunk temporaries and
    128 MB for decoded clips (the 64 MB decode budget plus the clip being mixed).
    """
    outputs = {bus["id"]: bus["output"] for bus in project["buses"]}
    routing_depth = 1
    for bus in outputs:
        nodes, at = 1, bus
        # A cycle is reported as routing-cycle when the graph is resolved.
        while at != "master" and nodes <= len(outputs) + 1:
            at, nodes = outputs.get(at, "master"), nodes + 1
        routing_depth = max(routing_depth, nodes)
    filtered = any(track["processors"] for track in project["tracks"])
    # Half-buffer units keep the estimate in integers.
    halves = (1 if project.get("ducking") else 0) + max(6 if filtered else 0, 2 * routing_depth + 2)
    return project["durationSamples"] * 4 * halves + 328_000_000


def render(request):
    import dawdreamer as daw
    import numpy as np

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
        or working_bytes(project) > 1500000000
    ):
        raise WorkerError(
            "resource-budget", "Worker project exceeds its buffer budget; shorten or split it"
        )
    latency = probe_paths(project, daw, np)
    started = time.perf_counter()
    project, output = request["project"], Path(request["output"])
    length = project["durationSamples"]
    assets = {a["id"]: a for a in project["assets"]}
    verify_checksums(
        list(assets.values()), "Asset bytes changed; restore the source or author a new identity"
    )
    output.mkdir(exist_ok=False)
    begin, end = request["range"]["start"], request["range"]["end"]
    tracks = {t["id"]: t for t in project["tracks"]}
    # Outputs are reported in graph resolution order; a cycle never resolves.
    order, resolved = list(tracks), set(tracks)
    pending = list(project["buses"]) + [project["master"]]
    while pending:
        progressed = False
        for bus in pending[:]:
            upstream = [n for n in project["tracks"] + project["buses"] if n["output"] == bus["id"]]
            if all(n["id"] in resolved for n in upstream):
                order.append(bus["id"])
                resolved.add(bus["id"])
                pending.remove(bus)
                progressed = True
        if not progressed:
            raise WorkerError("routing-cycle", "Graph cannot be resolved")
    ducking = project.get("ducking")
    # Decoded clip samples held ahead of the mix: 64 MB, whatever the project
    # length. A longer clip streams from FFmpeg straight into its track.
    budget = decode_budget()

    def clips_on(track_id):
        return [clip for clip in project["clips"] if clip["track"] == track_id]

    def upstream_of(node_id):
        return [n for n in project["tracks"] + project["buses"] if n["output"] == node_id]

    # Tracks are mixed in exactly this order: the ducking detector, filtered tracks
    # (rendered before any routing accumulator exists), then the remaining tracks
    # in depth-first routing order. One decode plan covers the whole sequence, so
    # passes and lookahead span track boundaries.
    sequence = [ducking["sourceTrack"]] if ducking else []
    sequence += [t["id"] for t in project["tracks"] if t["processors"]]

    def walk(node_id):
        for source in upstream_of(node_id):
            if source["id"] not in tracks:
                walk(source["id"])
            elif not source["processors"]:
                sequence.append(source["id"])

    walk("master")
    sources = clip_sources(
        [clip for track_id in sequence for clip in clips_on(track_id)], assets, budget, np
    )

    def mix_clips(track_id, panned):
        """Sum a track's clips in authored order; panned=False gives the detector sum.

        A function scope releases each decoded clip as soon as it has been added.
        """
        audio = np.zeros((2, length), np.float32)
        target, detector = (audio, None) if panned else (None, audio)
        for expected in clips_on(track_id):
            clip, decoded = next(sources)
            assert clip is expected, "decode sequence follows the render order"
            if isinstance(decoded, np.ndarray):
                shape_clip_into(target, detector, clip, decoded, np)
            else:
                for offset, block in decoded:
                    shape_clip_into(target, detector, clip, block, np, offset)
        return audio

    # Pre-fader, pre-pan sidechain: the detector hears clip gain, fades and
    # automation, but not pan, track gain, mute/solo or DSP.
    duck = duck_envelope(mix_clips(ducking["sourceTrack"], False), ducking, np) if ducking else None
    solo = any(t["solo"] and not t["mute"] for t in project["tracks"])
    # DawDreamer truncates seconds * sample rate; round upward at this boundary.
    seconds = math.nextafter(length / 48000, math.inf)

    def track_output(track):
        """The track's processed stem: clips, gain/mute/solo, ducking, then filters."""
        audio = mix_clips(track["id"], True)
        audio *= (
            0 if track["mute"] or (solo and not track["solo"]) else 10 ** (track["gainDb"] / 20)
        )
        if duck is not None and track["id"] in ducking["targetTracks"]:
            audio *= duck[None, :]
        if not track["processors"]:
            # A playback processor copies its data unchanged.
            return audio
        # Only filter chains need DawDreamer; each track renders alone, and the
        # playback processor copies the data, so the array can be released first.
        engine = daw.RenderEngine(48000, 512)
        graph = [(engine.make_playback_processor("track-" + track["id"], audio), [])]
        del audio
        previous = graph[0][0].get_name()
        for index, effect in enumerate(track["processors"]):
            processor = engine.make_filter_processor(
                f"dsp-{track['id']}-{index}",
                "high" if effect["type"] == "highpass" else "low",
                effect["frequencyHz"],
                effect["q"],
            )
            graph.append((processor, [previous]))
            previous = processor.get_name()
        graph[-1][0].record = True
        if not engine.load_graph(graph) or not engine.render(seconds):
            raise WorkerError("graph-render", "DawDreamer failed to render", processor=track["id"])
        processed = engine.get_audio(previous)
        del graph, engine
        return processed

    reports = {}

    def publish(name, audio):
        if audio.shape != (2, length):
            raise WorkerError(
                "output-invalid", "Rendered PCM is not finite or aligned", processor=name
            )
        if name != "master" and not request["stems"]:
            return
        filename = "mix.wav" if name == "master" else name + ".wav"
        report = write_wav(output / filename, audio, begin, end, np)
        if report is None:
            raise WorkerError(
                "output-invalid", "Rendered PCM is not finite or aligned", processor=name
            )
        peaks, peak, overs = report
        reports[name] = {
            "file": filename,
            "sha256": checksum(output / filename),
            "samplesPerChannel": end - begin,
            "peaks": peaks,
            # Float WAV keeps overs; integer delivery formats clip them.
            "peakDbfs": 20 * math.log10(peak) if peak > 0 else None,
            "samplesAboveFullScale": overs,
        }

    def node_output(node, spilled):
        """A bus or master: its inputs summed in graph order, depth first.

        Only the accumulators on the current routing path are alive, so memory
        follows bus depth rather than the number of tracks and buses.
        """
        upstream = [n for n in project["tracks"] + project["buses"] if n["output"] == node["id"]]
        if not upstream:
            # An input-less bus plays silence.
            acc = np.zeros((2, length), np.float32)
        else:
            acc, gain = None, 10 ** (node["gainDb"] / 20)
            for source in upstream:
                if source["id"] in spilled:
                    audio = np.memmap(spilled[source["id"]], np.float32, "r", shape=(2, length))
                elif source["id"] in tracks:
                    audio = track_output(source)
                else:
                    audio = node_output(source, spilled)
                publish(source["id"], audio)
                acc = sum_input(acc, audio, gain, np)
                del audio
        return acc

    # Filtered tracks render first, while no routing accumulator is alive, and wait
    # on disk: their mapped pages are clean and reclaimable rather than resident
    # working memory. The bytes are unchanged.
    with tempfile.TemporaryDirectory(dir=output.parent, prefix="filtered-") as directory:
        spilled = {}
        for index, track in enumerate(project["tracks"]):
            if track["processors"]:
                processed = track_output(track)
                if processed.shape != (2, length):
                    raise WorkerError(
                        "output-invalid",
                        "Rendered PCM is not finite or aligned",
                        processor=track["id"],
                    )
                spilled[track["id"]] = Path(directory) / f"{index}.f32"
                processed.tofile(spilled[track["id"]])
                del processed
        master = node_output(project["master"], spilled)
        publish("master", master)
        del master
    # Every clip has been mixed; release the decode pool.
    sources.close()
    files = {name: reports[name] for name in order if name in reports}
    if duck is not None:
        write_wav(output / "duck-envelope.wav", duck, begin, end, np)
    verify_checksums(
        list(assets.values()), "Asset changed during render; retry with stable sources"
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
