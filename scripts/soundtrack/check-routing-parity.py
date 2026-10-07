"""Check the worker's NumPy routing sums against DawDreamer's AddProcessor.

The worker reproduces DawDreamer 0.9.0 / JUCE AudioBuffer summation exactly:
applyGain on the first input, then fused addWithMultiply (one rounding), gains
within an ulp of 1 treated as unity, and subnormals preserved. This compares
bytes on random, subnormal and constructed float32-midpoint inputs (normal and
subnormal).
Usage: python check-routing-parity.py <soundtrack-worker.py>
"""

import importlib.util
import json
import math
import sys

import dawdreamer as daw
import numpy as np

spec = importlib.util.spec_from_file_location("worker", sys.argv[1])
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def via_dawdreamer(inputs, gains, length):
    engine, graph = daw.RenderEngine(48000, 512), []
    for index, audio in enumerate(inputs):
        graph.append((engine.make_playback_processor(f"input-{index}", audio), []))
    summed = engine.make_add_processor("sum", list(gains))
    summed.record = True
    graph.append((summed, [f"input-{index}" for index in range(len(inputs))]))
    assert engine.load_graph(graph) and engine.render(math.nextafter(length / 48000, math.inf))
    return engine.get_audio("sum")


def via_worker(inputs, gains):
    acc = None
    for audio, gain in zip(inputs, gains, strict=True):
        acc = worker.sum_input(acc, audio.copy(), gain, np)
    return acc


one = np.float32(1)
gains = [1.0, 0.5, 10 ** (-12 / 20), 10 ** (6 / 20), 1e-6, 3.98, 1 - 2**-20]
gains += [float(np.nextafter(one, 2)), float(np.nextafter(one, 0)), 1.0000002]
rng = np.random.default_rng(20261005)
cases, mismatches = [], 0
for trial in range(60):
    length = int(rng.integers(1, 6000)) if trial % 3 else int(rng.choice([512, 513, 4097]))
    inputs = []
    for _ in range(int(rng.integers(1, 5))):
        scale = rng.choice([1, 1e-3, 1e-38, 1e-42])
        audio = (rng.standard_normal((2, length)) * scale).astype(np.float32)
        audio[:, rng.random(length) < 0.1] = 0.0
        audio[:, rng.random(length) < 0.1] = -0.0
        inputs.append(audio)
    cases.append((inputs, [float(rng.choice(gains)) for _ in inputs], length))
# acc + x * g lands just below a float32 midpoint: float64 rounding puts it on the
# midpoint, where a naive float32 rounding ties the wrong way.
length = 2048
acc = np.full((2, length), np.float32(1 + 2**-23), np.float32)
acc[1] = -acc[1]
source = np.full((2, length), np.float32(2**-24 * (1 + 2**-20)), np.float32)
source[1] = -source[1]
cases.append(([acc, source], [1.0, float(np.float32(1 - 2**-20))], length))
# The same double-rounding trap among float32 subnormals, which keep fewer bits:
# (2**23 - 1) * 2**-149 + 3937 * 2**-149 * 8727391 * 2**-36 is 2**-185 below the
# midpoint under 2**-126. 8727391 * 2**-36 is an in-range gain (about -58 dB).
acc = np.full((2, length), np.float32((2**23 - 1) * 2.0**-149), np.float32)
source = np.full((2, length), np.float32(3937 * 2.0**-149), np.float32)
acc[1], source[1] = -acc[1], -source[1]
cases.append(([acc, source], [1.0, float(np.float32(8727391 * 2.0**-36))], length))
for inputs, case_gains, case_length in cases:
    want = via_dawdreamer(inputs, case_gains, case_length)
    got = via_worker(inputs, case_gains)
    mismatches += want.tobytes() != got.tobytes()
print(json.dumps({"cases": len(cases), "mismatches": int(mismatches)}))
sys.exit(1 if mismatches else 0)
