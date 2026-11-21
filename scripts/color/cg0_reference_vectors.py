# ruff: noqa: E501 -- long strings are source citations and recorded notes.
"""CG0 reference vectors for the color grading engine (development only).

Writes tracked JSON vectors (and small generated .cube LUTs) under
benchmarks/fixtures/color/cg0/vectors/:

- transfer-functions.json: encode/decode samples for every display and camera
  transfer function the plan names, published anchor points, and the scene
  ramps the 10-bit/log fixtures are built from;
- primaries.json: RGB-to-XYZ matrices, conversions, luma coefficients and
  chromatic adaptation, checked against published matrices;
- input-transforms.json: camera log + gamut to ACES2065-1, end to end, from
  OpenColorIO built-in transforms, cross-checked against colour-science;
- cdl.json: ASC CDL v1.2 slope/offset/power/saturation cases;
- lut-interpolation.json and luts/*.cube: trilinear and tetrahedral cases on
  generated (license-free) LUTs.

The references are colour-science (formula implementations that cite each
vendor document) and OpenColorIO (an independent implementation, float32 CPU).
They are never runtime dependencies. Run with the pinned versions:

    pnpm color:cg0-vectors            # write
    pnpm color:cg0-vectors --check    # regenerate and compare byte for byte

Every vector names its source document and the tolerance it is good for. The
script fails if a published anchor or a published matrix disagrees with the
implementation beyond the anchor's stated precision, or if the two
implementations disagree beyond the stated cross-check tolerance.
"""

from __future__ import annotations

import json
import math
import platform
import subprocess
import sys
import tempfile
from pathlib import Path

import colour
import numpy as np
import PyOpenColorIO as ocio

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "benchmarks/fixtures/color/cg0/vectors"
GENERATOR = "scripts/color/cg0_reference_vectors.py"
PINNED = {"python": "3.12.11", "colour-science": "0.4.6", "opencolorio": "2.4.2"}

# float64 port tolerance: a port of the same closed-form equations.
FLOAT64 = {"absolute": 1e-12, "relative": 1e-12}
# OpenColorIO evaluates on the CPU in float32 (optimization off).
OCIO_RELATIVE = 2e-6
OCIO_ABSOLUTE = 2e-7
HALF_CODE_10BIT = 0.5 / 1023


def f(value) -> float:
    """Python float for JSON (shortest round-trip repr)."""
    out = float(value)
    if not math.isfinite(out):
        raise ValueError(f"non-finite reference value {value!r}")
    return 0.0 if out == 0 else out


def floats(values) -> list[float]:
    return [f(v) for v in np.asarray(values, dtype=np.float64).ravel()]


def matrix(m) -> list[list[float]]:
    return [floats(row) for row in np.asarray(m, dtype=np.float64)]


def header(kind: str, description: str) -> dict:
    return {
        "schema": "still-shift-color-reference-vectors-1",
        "kind": kind,
        "description": description,
        "generator": GENERATOR,
        "references": {
            "colour-science": colour.__version__,
            "opencolorio": ocio.__version__,
            "numpy": np.__version__,
            "python": platform.python_version(),
        },
        "license": "Generated numeric reference data; no third-party content. Same terms as the repository.",
    }


# numpy.where evaluates both branches of each piecewise curve; the unused
# branch may take a log of a non-positive value. Outputs are checked finite.
np.seterr(all="ignore")

CONFIG = ocio.Config.CreateRaw()


def ocio_apply(transform, rgb: np.ndarray) -> np.ndarray:
    processor = CONFIG.getProcessor(transform).getOptimizedCPUProcessor(ocio.OPTIMIZATION_NONE)
    rows = np.asarray(rgb, dtype=np.float64).reshape(-1, 3)
    return np.array([processor.applyRGB([float(c) for c in row]) for row in rows])


def ocio_gray(transform, values: np.ndarray) -> np.ndarray:
    rgb = np.repeat(np.asarray(values, dtype=np.float64)[:, None], 3, axis=1)
    return ocio_apply(transform, rgb)[:, 0]


def agreement(a: np.ndarray, b: np.ndarray) -> dict:
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    diff = np.abs(a - b)
    scale = np.maximum(np.abs(b), 1.0)
    return {
        "maxAbsolute": f(diff.max()),
        "maxRelativeToMax1": f((diff / scale).max()),
    }


def require(condition: bool, message: str):
    if not condition:
        raise SystemExit(f"reference check failed: {message}")


# --------------------------------------------------------------------------
# Transfer functions
# --------------------------------------------------------------------------

DISPLAY_RAMP = np.arange(128) / 127.0
PQ_RAMP = np.concatenate([[0.0], 10 ** (-3 + 7 * np.arange(127) / 126.0)])
SCENE_RAMP = np.concatenate([[0.0], 0.18 * 2 ** ((np.arange(1, 128) - 64) / 8.0)])
DECODE_CODES = np.arange(65) / 64.0

M = colour.models


def exp_linear(gamma: float, offset: float):
    t = ocio.ExponentWithLinearTransform()
    t.setGamma([gamma, gamma, gamma, 1.0])
    t.setOffset([offset, offset, offset, 0.0])
    return t


def builtin(name: str):
    return ocio.BuiltinTransform(name)


# Each entry: id, name, kind, input description, ramp, encode/decode callables,
# source document, implementation, extra sample points, anchors, OCIO check.
TRANSFERS = [
    {
        "id": "srgb",
        "name": "sRGB",
        "kind": "display",
        "input": "display-linear relative luminance, 0-1",
        "ramp": DISPLAY_RAMP,
        "extra": [0.0031308, 0.0031309],
        "encode": M.eotf_inverse_sRGB,
        "decode": M.eotf_sRGB,
        "implementation": "colour.models.eotf_inverse_sRGB / eotf_sRGB",
        "source": "IEC 61966-2-1:1999, Multimedia systems and equipment - Colour measurement and management - Part 2-1: Default RGB colour space - sRGB (piecewise transfer, 2.4 exponent, 0.055 offset)",
        "anchors": [
            (
                0.0031308,
                0.04045,
                1e-5,
                "IEC 61966-2-1 linear segment breakpoint (0.0031308 -> 0.04045, published to 5 decimals)",
            ),
            (1.0, 1.0, 1e-12, "IEC 61966-2-1 reference white"),
        ],
        "ocio": (
            "ExponentWithLinearTransform gamma 2.4 offset 0.055 (decode)",
            exp_linear(2.4, 0.055),
            1.0,
        ),
    },
    {
        "id": "bt709",
        "name": "ITU-R BT.709 OETF",
        "kind": "display",
        "input": "scene-linear camera signal, 0-1",
        "ramp": DISPLAY_RAMP,
        "extra": [0.018, 0.0179999],
        "encode": M.oetf_BT709,
        "decode": M.oetf_inverse_BT709,
        "implementation": "colour.models.oetf_BT709 / oetf_inverse_BT709",
        "source": "Recommendation ITU-R BT.709-6 (06/2015), Part 1 item 1.2, opto-electronic transfer characteristic: V = 1.099 L^0.45 - 0.099 for L >= 0.018, V = 4.500 L below",
        "anchors": [
            (
                0.0179999,
                0.0809996,
                1e-6,
                "ITU-R BT.709-6 linear segment V = 4.500 L just below L = 0.018",
            ),
            (1.0, 1.0, 1e-12, "ITU-R BT.709-6: 1.099 - 0.099 = 1 at L = 1"),
        ],
        "ocio": (
            "ExponentWithLinearTransform gamma 1/0.45 offset 0.099 (decode)",
            exp_linear(1 / 0.45, 0.099),
            1.0,
        ),
        # OpenColorIO derives the linear segment from gamma and offset (a
        # C1-continuous "moncurve"); BT.709 publishes 4.5 and 0.018, which are
        # rounded, so the two differ slightly near the break.
        "ocioTolerance": 1e-4,
    },
    {
        "id": "bt1886",
        "name": "ITU-R BT.1886 EOTF (L_W = 1, L_B = 0)",
        "kind": "display",
        "input": "display-linear relative luminance, 0-1",
        "ramp": DISPLAY_RAMP,
        "extra": [],
        "encode": lambda x: M.eotf_inverse_BT1886(x, L_B=0, L_W=1),
        "decode": lambda v: M.eotf_BT1886(v, L_B=0, L_W=1),
        "implementation": "colour.models.eotf_inverse_BT1886 / eotf_BT1886 with L_B = 0, L_W = 1",
        "source": "Recommendation ITU-R BT.1886 (03/2011), Annex 1 reference EOTF L = a (max(V + b, 0))^2.4; with L_B = 0, L_W = 1 this is L = V^2.4",
        "anchors": [(0.5**2.4, 0.5, 1e-12, "ITU-R BT.1886 Annex 1 with L_B = 0: V = L^(1/2.4)")],
        "ocio": (
            "ExponentTransform 2.4 (decode)",
            ocio.ExponentTransform([2.4, 2.4, 2.4, 1.0]),
            1.0,
        ),
    },
    {
        "id": "pq",
        "name": "SMPTE ST 2084 (PQ) inverse EOTF",
        "kind": "display",
        "input": "absolute display luminance in cd/m2, 0-10000",
        "ramp": PQ_RAMP,
        "extra": [100.0, 203.0, 1000.0, 10000.0],
        "encode": M.eotf_inverse_ST2084,
        "decode": M.eotf_ST2084,
        "implementation": "colour.models.eotf_inverse_ST2084 / eotf_ST2084 (L_p = 10000)",
        "source": "SMPTE ST 2084:2014 and Recommendation ITU-R BT.2100-2 (07/2018), Table 4, PQ system reference EOTF (m1 = 2610/16384, m2 = 2523/4096 x 128, c1 = 3424/4096, c2 = 2413/4096 x 32, c3 = 2392/4096 x 32)",
        "anchors": [
            (10000.0, 1.0, 1e-12, "ITU-R BT.2100-2 Table 4: 10000 cd/m2 is signal 1"),
            (
                203.0,
                0.58,
                0.005,
                "Report ITU-R BT.2408: HDR reference white 203 cd/m2 at 58% PQ signal (published to 1%)",
            ),
        ],
        # OCIO's curve is in nits/100.
        "ocio": (
            "BuiltinTransform 'CURVE - ST-2084_to_LINEAR' (nits/100, scaled by 100)",
            builtin("CURVE - ST-2084_to_LINEAR"),
            100.0,
        ),
    },
    {
        "id": "hlg",
        "name": "ITU-R BT.2100 HLG OETF",
        "kind": "display",
        "input": "normalized scene-linear light E, 0-1",
        "ramp": DISPLAY_RAMP,
        "extra": [1 / 12],
        "encode": M.oetf_BT2100_HLG,
        "decode": M.oetf_inverse_BT2100_HLG,
        "implementation": "colour.models.oetf_BT2100_HLG / oetf_inverse_BT2100_HLG",
        "source": "Recommendation ITU-R BT.2100-2 (07/2018), Table 5, HLG reference OETF (a = 0.17883277, b = 1 - 4a, c = 0.5 - a ln(4a))",
        "anchors": [
            (1 / 12, 0.5, 1e-12, "ITU-R BT.2100-2 Table 5: E = 1/12 gives sqrt(3E) = 0.5"),
            (
                1.0,
                1.0,
                1e-7,
                "ITU-R BT.2100-2 Table 5: E = 1 gives 1 (constants published to 8 decimals)",
            ),
        ],
        "ocio": None,
        "ocioNote": "OpenColorIO's HLG built-ins are rescaled (18% grey at 0.42), not the bare BT.2100 OETF; anchors only.",
    },
    {
        "id": "acescct",
        "name": "ACEScct",
        "kind": "working-log",
        "input": "ACES AP1 scene-linear (0.18 = mid grey)",
        "ramp": SCENE_RAMP,
        "extra": [0.0078125, -0.01],
        "encode": M.log_encoding_ACEScct,
        "decode": M.log_decoding_ACEScct,
        "implementation": "colour.models.log_encoding_ACEScct / log_decoding_ACEScct",
        "source": "Academy of Motion Picture Arts and Sciences, S-2016-001, ACEScct - A Quasi-Logarithmic Encoding of ACES Data for use within Color Grading Systems (2016)",
        "anchors": [
            (
                0.0078125,
                0.155251141552511,
                1e-12,
                "S-2016-001: X_BRK = 0.0078125 maps to Y_BRK = 0.155251141552511",
            ),
            (
                0.18,
                (math.log2(0.18) + 9.72) / 17.52,
                1e-12,
                "S-2016-001: log segment (log2(lin) + 9.72) / 17.52 at 0.18",
            ),
        ],
        "ocio": (
            "BuiltinTransform 'CURVE - ACEScct-LOG_to_LINEAR'",
            builtin("CURVE - ACEScct-LOG_to_LINEAR"),
            1.0,
        ),
    },
    {
        "id": "arri-logc3",
        "name": "ARRI LogC3 (SUP 3.x, EI 800, linear scene exposure factor)",
        "kind": "camera-log",
        "input": "scene-linear reflectance (0.18 = mid grey)",
        "ramp": SCENE_RAMP,
        "extra": [0.010591, -0.01],
        "encode": lambda x: M.log_encoding_ARRILogC3(
            x, firmware="SUP 3.x", method="Linear Scene Exposure Factor", EI=800
        ),
        "decode": lambda v: M.log_decoding_ARRILogC3(
            v, firmware="SUP 3.x", method="Linear Scene Exposure Factor", EI=800
        ),
        "implementation": "colour.models.log_encoding_ARRILogC3(firmware='SUP 3.x', method='Linear Scene Exposure Factor', EI=800)",
        "source": "ARRI (2012), ALEXA Log C Curve - Usage in VFX, SUP 3.x, EI 800 (cut 0.010591, a 5.555556, b 0.052272, c 0.247190, d 0.385537, e 5.367655, f 0.092809)",
        "anchors": [
            (
                0.18,
                400 / 1023,
                HALF_CODE_10BIT,
                "ARRI ALEXA Log C: 18% grey at EI 800 is 10-bit code 400 (0.391)",
            )
        ],
        "ocio": None,
        "ocioNote": "Checked end to end in input-transforms.json (ARRI_ALEXA-LOGC-EI800-AWG_to_ACES2065-1).",
    },
    {
        "id": "arri-logc4",
        "name": "ARRI LogC4",
        "kind": "camera-log",
        "input": "scene-linear reflectance (0.18 = mid grey)",
        "ramp": SCENE_RAMP,
        "extra": [-0.018, -0.01],
        "encode": M.log_encoding_ARRILogC4,
        "decode": M.log_decoding_ARRILogC4,
        "implementation": "colour.models.log_encoding_ARRILogC4 / log_decoding_ARRILogC4",
        "source": "ARRI (2022), ARRI LogC4 Logarithmic Color Space Specification (a = (2^18 - 16) / 117.45, b = (1023 - 95) / 1023, c = 95 / 1023)",
        "anchors": [],
        "ocio": None,
        "ocioNote": "Checked end to end in input-transforms.json (ARRI_LOGC4_to_ACES2065-1).",
    },
    {
        "id": "sony-slog3",
        "name": "Sony S-Log3",
        "kind": "camera-log",
        "input": "scene-linear reflectance (0.18 = mid grey)",
        "ramp": SCENE_RAMP,
        "extra": [0.01125, -0.01],
        "encode": M.log_encoding_SLog3,
        "decode": M.log_decoding_SLog3,
        "implementation": "colour.models.log_encoding_SLog3 / log_decoding_SLog3 (10-bit normalised code value, reflection input)",
        "source": "Sony Corporation, Technical Summary for S-Gamut3.Cine/S-Log3 and S-Gamut3/S-Log3",
        "anchors": [
            (
                0.0,
                95 / 1023,
                HALF_CODE_10BIT,
                "Sony S-Log3 technical summary: 0% reflection is 10-bit code 95",
            ),
            (
                0.18,
                420 / 1023,
                HALF_CODE_10BIT,
                "Sony S-Log3 technical summary: 18% grey is 10-bit code 420",
            ),
            (
                0.9,
                598 / 1023,
                HALF_CODE_10BIT,
                "Sony S-Log3 technical summary: 90% white is 10-bit code 598",
            ),
        ],
        "ocio": None,
        "ocioNote": "Checked end to end in input-transforms.json (SONY_SLOG3-SGAMUT3_to_ACES2065-1).",
    },
    {
        "id": "panasonic-vlog",
        "name": "Panasonic V-Log",
        "kind": "camera-log",
        "input": "scene-linear reflectance (0.18 = mid grey)",
        "ramp": SCENE_RAMP,
        "extra": [0.01, -0.01],
        "encode": M.log_encoding_VLog,
        "decode": M.log_decoding_VLog,
        "implementation": "colour.models.log_encoding_VLog / log_decoding_VLog (10-bit normalised code value, reflection input)",
        "source": "Panasonic (2014), VARICAM V-Log/V-Gamut reference manual (cut1 0.01, b 0.00873, c 0.241514, d 0.598206)",
        "anchors": [
            (0.0, 128 / 1023, HALF_CODE_10BIT, "Panasonic V-Log: 0% reflection is 10-bit code 128"),
            (0.18, 433 / 1023, HALF_CODE_10BIT, "Panasonic V-Log: 18% grey is 10-bit code 433"),
            (0.9, 602 / 1023, HALF_CODE_10BIT, "Panasonic V-Log: 90% white is 10-bit code 602"),
        ],
        "ocio": None,
        "ocioNote": "Checked end to end in input-transforms.json (PANASONIC_VLOG-VGAMUT_to_ACES2065-1).",
    },
    {
        "id": "apple-log",
        "name": "Apple Log",
        "kind": "camera-log",
        "input": "scene-linear reflectance (0.18 = mid grey)",
        "ramp": SCENE_RAMP,
        "extra": [0.01, -0.01],
        "encode": M.log_encoding_AppleLogProfile,
        "decode": M.log_decoding_AppleLogProfile,
        "implementation": "colour.models.log_encoding_AppleLogProfile / log_decoding_AppleLogProfile",
        "source": "Apple Inc. (2023), Apple Log Profile White Paper (R0 = -0.05641088, Rt = 0.01, c = 47.28711236, beta = 0.00964052, gamma = 0.08550479, delta = 0.69336945)",
        "anchors": [],
        "ocio": (
            "BuiltinTransform 'CURVE - APPLE_LOG_to_LINEAR'",
            builtin("CURVE - APPLE_LOG_to_LINEAR"),
            1.0,
        ),
    },
    {
        "id": "canon-log2",
        "name": "Canon Log 2 (v1.2 equations)",
        "kind": "camera-log",
        "input": "scene-linear reflectance (0.18 = mid grey)",
        "ramp": SCENE_RAMP,
        "extra": [-0.01],
        "encode": lambda x: M.log_encoding_CanonLog2(x, method="v1.2"),
        "decode": lambda v: M.log_decoding_CanonLog2(v, method="v1.2"),
        "implementation": "colour.models.log_encoding_CanonLog2(method='v1.2') (10-bit normalised code value, reflection input)",
        "source": "Canon (2020), Canon Log Gamma Curves - Description of the Canon Log, Canon Log 2 and Canon Log 3 Gamma Curves (v1.2 equations)",
        "anchors": [],
        "ocio": (
            "BuiltinTransform 'CURVE - CANON_CLOG2_to_LINEAR'",
            builtin("CURVE - CANON_CLOG2_to_LINEAR"),
            1.0,
        ),
    },
    {
        "id": "canon-log3",
        "name": "Canon Log 3 (v1.2 equations)",
        "kind": "camera-log",
        "input": "scene-linear reflectance (0.18 = mid grey)",
        "ramp": SCENE_RAMP,
        "extra": [-0.01],
        "encode": lambda x: M.log_encoding_CanonLog3(x, method="v1.2"),
        "decode": lambda v: M.log_decoding_CanonLog3(v, method="v1.2"),
        "implementation": "colour.models.log_encoding_CanonLog3(method='v1.2') (10-bit normalised code value, reflection input)",
        "source": "Canon (2020), Canon Log Gamma Curves - Description of the Canon Log, Canon Log 2 and Canon Log 3 Gamma Curves (v1.2 equations)",
        "anchors": [],
        "ocio": (
            "BuiltinTransform 'CURVE - CANON_CLOG3_to_LINEAR'",
            builtin("CURVE - CANON_CLOG3_to_LINEAR"),
            1.0,
        ),
    },
    {
        "id": "red-log3g10",
        "name": "RED Log3G10 (v3, 0.01 offset)",
        "kind": "camera-log",
        "input": "scene-linear (0.18 = mid grey)",
        "ramp": SCENE_RAMP,
        "extra": [-0.01, -0.005],
        "encode": lambda x: M.log_encoding_Log3G10(x, method="v3"),
        "decode": lambda v: M.log_decoding_Log3G10(v, method="v3"),
        "implementation": "colour.models.log_encoding_Log3G10(method='v3')",
        "source": "RED Digital Cinema (2017), White Paper on REDWideGamutRGB and Log3G10 (a = 0.224282, b = 155.975327, c = 0.01, g = 15.1927)",
        "anchors": [(0.18, 1 / 3, 1e-6, "RED Log3G10 white paper: 18% grey maps to 1/3")],
        "ocio": None,
        "ocioNote": "Checked end to end in input-transforms.json (RED_LOG3G10-RWG_to_ACES2065-1).",
    },
    {
        "id": "bmd-film-gen5",
        "name": "Blackmagic Film Generation 5",
        "kind": "camera-log",
        "input": "scene-linear (0.18 = mid grey)",
        "ramp": SCENE_RAMP,
        "extra": [0.005, -0.01],
        "encode": M.oetf_BlackmagicFilmGeneration5,
        "decode": M.oetf_inverse_BlackmagicFilmGeneration5,
        "implementation": "colour.models.oetf_BlackmagicFilmGeneration5 / oetf_inverse_BlackmagicFilmGeneration5",
        "source": "Blackmagic Design (2021), Blackmagic Generation 5 Color Science technical reference (A, B, C, D, E, LIN_CUT 0.005)",
        "anchors": [],
        "ocio": None,
        "ocioNote": "No OpenColorIO built-in; single implementation, checked by round trip only.",
    },
    {
        "id": "dji-dlog",
        "name": "DJI D-Log",
        "kind": "camera-log",
        "input": "scene-linear (0.18 = mid grey)",
        "ramp": SCENE_RAMP,
        "extra": [0.0078, -0.01],
        "encode": M.log_encoding_DJIDLog,
        "decode": M.log_decoding_DJIDLog,
        "implementation": "colour.models.log_encoding_DJIDLog / log_decoding_DJIDLog",
        "source": "DJI (2017), White Paper on D-Log and D-Gamut of DJI Cinema Color System (D-Log, not D-Log M)",
        # The white paper publishes encode and decode separately with rounded
        # constants (3.89616 for 1/0.256663, 2.27752 for 0.584555/0.256663).
        "roundTripTolerance": 1e-6,
        "roundTripNote": "DJI publishes the encode and decode equations separately with independently rounded constants (decode 3.89616 and 2.27752 for 1/0.256663 and 0.584555/0.256663), so decode(encode(x)) is not exact. A port must reproduce each published equation, not invert one of them.",
        "anchors": [],
        "ocio": None,
        "ocioNote": "No OpenColorIO built-in; single implementation, checked by round trip only.",
    },
    {
        "id": "fujifilm-flog",
        "name": "FUJIFILM F-Log",
        "kind": "camera-log",
        "input": "scene-linear reflectance (0.18 = mid grey)",
        "ramp": SCENE_RAMP,
        "extra": [0.00089, -0.01],
        "encode": M.log_encoding_FLog,
        "decode": M.log_decoding_FLog,
        "implementation": "colour.models.log_encoding_FLog / log_decoding_FLog (10-bit normalised code value, reflection input)",
        "source": "FUJIFILM (2016), F-Log Data Sheet Ver.1.0",
        "anchors": [
            (
                0.0,
                95 / 1023,
                HALF_CODE_10BIT,
                "FUJIFILM F-Log data sheet: 0% reflection is 10-bit code 95",
            ),
            (
                0.18,
                470 / 1023,
                HALF_CODE_10BIT,
                "FUJIFILM F-Log data sheet: 18% grey is 10-bit code 470",
            ),
            (
                0.9,
                705 / 1023,
                HALF_CODE_10BIT,
                "FUJIFILM F-Log data sheet: 90% white is 10-bit code 705",
            ),
        ],
        "ocio": None,
        "ocioNote": "No OpenColorIO built-in; checked by published anchors and round trip.",
    },
    {
        "id": "fujifilm-flog2",
        "name": "FUJIFILM F-Log2",
        "kind": "camera-log",
        "input": "scene-linear reflectance (0.18 = mid grey)",
        "ramp": SCENE_RAMP,
        "extra": [0.000889, -0.01],
        "encode": M.log_encoding_FLog2,
        "decode": M.log_decoding_FLog2,
        "implementation": "colour.models.log_encoding_FLog2 / log_decoding_FLog2 (10-bit normalised code value, reflection input)",
        "source": "FUJIFILM (2022), F-Log2 Data Sheet Ver.1.0",
        "anchors": [],
        "ocio": None,
        "ocioNote": "No OpenColorIO built-in; single implementation, checked by round trip only.",
    },
    {
        "id": "nikon-nlog",
        "name": "Nikon N-Log",
        "kind": "camera-log",
        "input": "scene-linear reflectance (0.18 = mid grey)",
        "ramp": SCENE_RAMP,
        "extra": [0.328, -0.01],
        "encode": M.log_encoding_NLog,
        "decode": M.log_decoding_NLog,
        "implementation": "colour.models.log_encoding_NLog / log_decoding_NLog (10-bit normalised code value, reflection input)",
        "source": "Nikon (2018), N-Log Specification Document Version 1.0.0",
        "anchors": [],
        "ocio": None,
        "ocioNote": "No OpenColorIO built-in; single implementation, checked by round trip only.",
    },
]


def transfer_functions() -> dict:
    out = header(
        "transfer-functions",
        "Encode (linear -> normalized full-range code value) and decode (code value -> linear) samples for display and camera transfer functions. "
        "'encode' is the 128-sample ramp the CG0 10-bit/log fixtures are built from (code values outside 0-1 are clamped only when a fixture quantizes them); "
        "'encodeExtra' holds segment breaks and negative inputs.",
    )
    out["tolerances"] = {
        "float64Port": {
            **FLOAT64,
            "use": "A float64 port of the same closed-form equations (CG1 color-science) must match every encode/decode sample within absolute 1e-12 or relative 1e-12.",
        },
        "anchors": "Each anchor states its own tolerance: the precision of the published value (half a 10-bit code value for published integer codes).",
        "ocioCrossCheck": {
            "relative": OCIO_RELATIVE,
            "absolute": OCIO_ABSOLUTE,
            "use": "Agreement between colour-science (float64) and OpenColorIO (float32 CPU, optimization off), relative to max(|value|, 1). Shows two independent implementations agree; not a port tolerance.",
        },
    }
    functions = []
    for t in TRANSFERS:
        ramp = np.asarray(t["ramp"], dtype=np.float64)
        extra = np.asarray(t["extra"], dtype=np.float64)
        decoded = np.asarray(t["decode"](DECODE_CODES), dtype=np.float64)
        # Round trip over the ramp (finite domain values only).
        back = np.asarray(t["decode"](t["encode"](ramp)), dtype=np.float64)
        round_trip = float(np.max(np.abs(back - ramp) / np.maximum(np.abs(ramp), 1.0)))
        require(
            round_trip < t.get("roundTripTolerance", 1e-10), f"{t['id']} round trip {round_trip}"
        )
        anchors = []
        for linear, code, tol, source in t["anchors"]:
            got = float(t["encode"](np.float64(linear)))
            require(
                abs(got - code) <= tol,
                f"{t['id']} anchor {linear} -> {got}, published {code} +- {tol}",
            )
            anchors.append(
                {
                    "linear": f(linear),
                    "code": f(code),
                    "tolerance": f(tol),
                    "implementation": f(got),
                    "source": source,
                }
            )
        entry = {
            "id": t["id"],
            "name": t["name"],
            "kind": t["kind"],
            "input": t["input"],
            "output": "normalized full-range code value (10-bit code / 1023 for camera curves)",
            "source": t["source"],
            "implementation": f"{t['implementation']} (colour-science {colour.__version__})",
            "anchors": anchors,
            "roundTripMaxRelativeError": f(round_trip),
            **({"roundTripNote": t["roundTripNote"]} if "roundTripNote" in t else {}),
            "encode": {
                "linear": floats(ramp),
                "code": floats(np.asarray(t["encode"](ramp), dtype=np.float64)),
            },
            "encodeExtra": {
                "linear": floats(extra),
                "code": floats(np.asarray(t["encode"](extra), dtype=np.float64)),
            },
            "decode": {"code": floats(DECODE_CODES), "linear": floats(decoded)},
        }
        if t["ocio"] is not None:
            label, transform, scale = t["ocio"]
            theirs = ocio_gray(transform, DECODE_CODES) * scale
            check = agreement(theirs, decoded)
            tolerance = t.get("ocioTolerance", OCIO_RELATIVE)
            require(
                check["maxRelativeToMax1"] <= tolerance,
                f"{t['id']} OCIO disagreement {check}",
            )
            entry["independentCheck"] = {
                "implementation": f"OpenColorIO {ocio.__version__} {label}, CPU float32, optimization off",
                "samples": "decode.code",
                "tolerance": f(tolerance),
                **check,
            }
            if "ocioTolerance" in t:
                entry["independentCheck"]["note"] = (
                    "OpenColorIO derives the linear segment from gamma and offset (C1-continuous moncurve); "
                    "the published BT.709 constants 4.5 and 0.018 are rounded, so the curves differ near the break."
                )
        else:
            entry["independentCheck"] = {"implementation": None, "note": t["ocioNote"]}
        functions.append(entry)
    out["functions"] = functions
    return out


# --------------------------------------------------------------------------
# Primaries, matrices and chromatic adaptation
# --------------------------------------------------------------------------

SPACES = [
    (
        "bt709",
        "ITU-R BT.709",
        "Recommendation ITU-R BT.709-6, Part 2 item 1.3-1.4 (primaries, D65)",
    ),
    ("srgb", "sRGB", "IEC 61966-2-1:1999 (BT.709 primaries, D65)"),
    ("bt2020", "ITU-R BT.2020", "Recommendation ITU-R BT.2020-2, Table 3 (primaries, D65)"),
    ("dci-p3", "DCI-P3", "SMPTE RP 431-2:2011 (P3 primaries, DCI white)"),
    ("p3-d65", "P3-D65", "SMPTE EG 432-1:2010 (P3 primaries, D65)"),
    ("display-p3", "Display P3", "Apple Display P3 (P3 primaries, D65; same matrix as P3-D65)"),
    (
        "aces-ap0",
        "ACES2065-1",
        "SMPTE ST 2065-1:2012 / Academy S-2014-004 (AP0 primaries, ACES white)",
    ),
    ("aces-ap1", "ACEScg", "Academy S-2014-004, ACEScg (AP1 primaries, ACES white)"),
    (
        "arri-awg3",
        "ARRI Wide Gamut 3",
        "ARRI (2012), ALEXA Log C Curve - Usage in VFX (ALEXA Wide Gamut)",
    ),
    (
        "arri-awg4",
        "ARRI Wide Gamut 4",
        "ARRI (2022), ARRI LogC4 Logarithmic Color Space Specification",
    ),
    (
        "sony-sgamut3",
        "S-Gamut3",
        "Sony, Technical Summary for S-Gamut3.Cine/S-Log3 and S-Gamut3/S-Log3",
    ),
    (
        "sony-sgamut3-cine",
        "S-Gamut3.Cine",
        "Sony, Technical Summary for S-Gamut3.Cine/S-Log3 and S-Gamut3/S-Log3",
    ),
    ("panasonic-vgamut", "V-Gamut", "Panasonic (2014), VARICAM V-Log/V-Gamut reference manual"),
    (
        "red-wide-gamut",
        "REDWideGamutRGB",
        "RED Digital Cinema (2017), White Paper on REDWideGamutRGB and Log3G10",
    ),
    ("canon-cinema-gamut", "Cinema Gamut", "Canon (2014), EOS C500 Cinema Gamut white paper"),
    (
        "bmd-wide-gamut",
        "Blackmagic Wide Gamut",
        "Blackmagic Design (2021), Blackmagic Generation 5 Color Science technical reference",
    ),
    (
        "dji-dgamut",
        "DJI D-Gamut",
        "DJI (2017), White Paper on D-Log and D-Gamut of DJI Cinema Color System",
    ),
    (
        "fujifilm-fgamut",
        "F-Gamut",
        "FUJIFILM (2016), F-Log Data Sheet Ver.1.0 (F-Gamut = BT.2020 primaries)",
    ),
    (
        "nikon-ngamut",
        "N-Gamut",
        "Nikon (2018), N-Log Specification Document 1.0.0 (N-Gamut = BT.2020 primaries)",
    ),
]

# Published matrices, compared to the matrix computed from published primaries
# at the precision they were published to.
PUBLISHED_NPM = {
    "bt709": (
        [[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]],
        0.5e-4 + 1e-5,
        "IEC 61966-2-1:1999, linear RGB to XYZ (published to 4 decimals)",
    ),
    "aces-ap0": (
        [
            [0.9525523959, 0.0, 0.0000936786],
            [0.3439664498, 0.7281660966, -0.0721325464],
            [0.0, 0.0, 1.0088251844],
        ],
        1e-9,
        "Academy S-2014-004 / SMPTE ST 2065-1: AP0 normalized primary matrix (published to 10 decimals)",
    ),
    "aces-ap1": (
        [
            [0.6624541811, 0.1340042065, 0.1561876870],
            [0.2722287168, 0.6740817658, 0.0536895174],
            [-0.0055746495, 0.0040607335, 1.0103391003],
        ],
        1e-9,
        "Academy S-2014-004: AP1 normalized primary matrix (published to 10 decimals)",
    ),
}

LUMA = [
    (
        "bt601",
        [0.299, 0.587, 0.114],
        "Recommendation ITU-R BT.601-7, item 2.5.1 (E'Y = 0.299 E'R + 0.587 E'G + 0.114 E'B)",
        None,
    ),
    ("bt709", [0.2126, 0.7152, 0.0722], "Recommendation ITU-R BT.709-6, Part 2 item 3.2", "bt709"),
    ("bt2020", [0.2627, 0.6780, 0.0593], "Recommendation ITU-R BT.2020-2, Table 4", "bt2020"),
]


def primaries() -> dict:
    out = header(
        "primaries",
        "RGB primaries and white points, normalized primary matrices (linear RGB -> CIE XYZ, Y of white = 1), luma coefficients, conversions and chromatic adaptation.",
    )
    out["tolerances"] = {
        "float64Port": {
            "absolute": 1e-12,
            "use": "A float64 port computing the normalized primary matrix from the listed primaries and white point (SMPTE RP 177-1993 method) must match within 1e-12.",
        },
        "published": "Each published matrix states the precision it was published to; computed matrices must agree within it.",
    }
    spaces = []
    computed = {}
    for sid, name, source in SPACES:
        cs = colour.RGB_COLOURSPACES[name]
        npm = colour.normalised_primary_matrix(cs.primaries, cs.whitepoint)
        computed[sid] = npm
        entry = {
            "id": sid,
            "colourName": name,
            "source": source,
            "primaries": {k: floats(v) for k, v in zip(["r", "g", "b"], cs.primaries)},
            "whitepoint": {"name": cs.whitepoint_name, "xy": floats(cs.whitepoint)},
            "rgbToXyz": matrix(npm),
            "xyzToRgb": matrix(np.linalg.inv(npm)),
            "method": f"colour.normalised_primary_matrix (SMPTE RP 177-1993), colour-science {colour.__version__}",
        }
        if sid in PUBLISHED_NPM:
            pub, tol, psource = PUBLISHED_NPM[sid]
            diff = float(np.max(np.abs(np.asarray(pub) - npm)))
            require(diff <= tol, f"{sid} NPM differs from published by {diff}")
            entry["published"] = {
                "rgbToXyz": matrix(pub),
                "tolerance": f(tol),
                "maxDifference": f(diff),
                "source": psource,
            }
        spaces.append(entry)
    out["spaces"] = spaces

    luma = []
    for lid, coeffs, source, space in LUMA:
        entry = {"id": lid, "coefficients": floats(coeffs), "source": source}
        if space:
            y = computed[space][1]
            diff = float(np.max(np.abs(y - np.asarray(coeffs))))
            require(diff <= 0.5e-4 + 1e-6, f"{lid} luma differs by {diff}")
            entry["fromPrimaries"] = floats(y)
            entry["maxDifference"] = f(diff)
        luma.append(entry)
    out["luma"] = luma

    conversions = []
    # BT.709 -> BT.2020 (same white, no adaptation), published in BT.2087.
    m709_2020 = np.linalg.inv(computed["bt2020"]) @ computed["bt709"]
    pub = [[0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0114], [0.0164, 0.0880, 0.8956]]
    diff = float(np.max(np.abs(m709_2020 - np.asarray(pub))))
    require(diff <= 0.5e-4 + 1e-5, f"709->2020 differs by {diff}")
    conversions.append(
        {
            "id": "bt709-to-bt2020",
            "matrix": matrix(m709_2020),
            "adaptation": None,
            "published": {
                "matrix": matrix(pub),
                "tolerance": f(0.5e-4 + 1e-5),
                "maxDifference": f(diff),
                "source": "Recommendation ITU-R BT.2087-0, equation 4 (published to 4 decimals)",
            },
        }
    )
    # AP0 <-> AP1 (same white).
    m = np.linalg.inv(computed["aces-ap1"]) @ computed["aces-ap0"]
    conversions.append(
        {
            "id": "aces-ap0-to-ap1",
            "matrix": matrix(m),
            "adaptation": None,
            "source": "Derived from Academy S-2014-004 AP0 and AP1 primaries (same ACES white)",
        }
    )
    # Bradford adaptation, checked against OpenColorIO utilities.
    cat = colour.adaptation.matrix_chromatic_adaptation_VonKries(
        colour.xy_to_XYZ(colour.RGB_COLOURSPACES["ACEScg"].whitepoint),
        colour.xy_to_XYZ(colour.RGB_COLOURSPACES["ITU-R BT.709"].whitepoint),
        transform="Bradford",
    )
    conversions.append(
        {
            "id": "bradford-aces-white-to-d65",
            "matrix": matrix(cat),
            "adaptation": "Bradford (von Kries)",
            "source": "Lam (1985) Bradford cone response, von Kries scaling; ACES white (x 0.32168, y 0.33767) to D65 (x 0.3127, y 0.3290)",
        }
    )
    for cid, src, builtin_name in [
        ("aces-ap1-to-bt709-bradford", "aces-ap1", "UTILITY - ACES-AP1_to_LINEAR-REC709_BFD"),
        ("aces-ap0-to-xyz-d65-bradford", "aces-ap0", "UTILITY - ACES-AP0_to_CIE-XYZ-D65_BFD"),
    ]:
        if cid.endswith("bt709-bradford"):
            m = np.linalg.inv(computed["bt709"]) @ cat @ computed[src]
        else:
            m = cat @ computed[src]
        theirs = ocio_apply(builtin(builtin_name), np.eye(3)).T
        check = agreement(theirs, m)
        require(check["maxAbsolute"] <= 1e-6, f"{cid} OCIO disagreement {check}")
        conversions.append(
            {
                "id": cid,
                "matrix": matrix(m),
                "adaptation": "Bradford (von Kries)",
                "source": "Derived from the primaries above with Bradford adaptation",
                "independentCheck": {
                    "implementation": f"OpenColorIO {ocio.__version__} BuiltinTransform '{builtin_name}', CPU float32",
                    **check,
                },
            }
        )
    out["conversions"] = conversions
    return out


# --------------------------------------------------------------------------
# Camera input transforms, end to end
# --------------------------------------------------------------------------

IDTS = [
    (
        "arri-logc3-awg3",
        "ARRI_ALEXA-LOGC-EI800-AWG_to_ACES2065-1",
        "arri-logc3",
        "ARRI Wide Gamut 3",
    ),
    ("arri-logc4-awg4", "ARRI_LOGC4_to_ACES2065-1", "arri-logc4", "ARRI Wide Gamut 4"),
    ("sony-slog3-sgamut3", "SONY_SLOG3-SGAMUT3_to_ACES2065-1", "sony-slog3", "S-Gamut3"),
    (
        "sony-slog3-sgamut3-cine",
        "SONY_SLOG3-SGAMUT3.CINE_to_ACES2065-1",
        "sony-slog3",
        "S-Gamut3.Cine",
    ),
    ("panasonic-vlog-vgamut", "PANASONIC_VLOG-VGAMUT_to_ACES2065-1", "panasonic-vlog", "V-Gamut"),
    ("red-log3g10-rwg", "RED_LOG3G10-RWG_to_ACES2065-1", "red-log3g10", "REDWideGamutRGB"),
    ("canon-log2-cinema-gamut", "CANON_CLOG2-CGAMUT_to_ACES2065-1", "canon-log2", "Cinema Gamut"),
    ("canon-log3-cinema-gamut", "CANON_CLOG3-CGAMUT_to_ACES2065-1", "canon-log3", "Cinema Gamut"),
    ("apple-log-bt2020", "APPLE_LOG_to_ACES2065-1", "apple-log", "ITU-R BT.2020"),
]

IDT_SAMPLES = np.array(
    [
        [0.1, 0.1, 0.1],
        [0.3, 0.3, 0.3],
        [0.4, 0.4, 0.4],
        [0.5, 0.5, 0.5],
        [0.6, 0.6, 0.6],
        [0.4, 0.3, 0.2],
        [0.2, 0.35, 0.5],
        [0.55, 0.4, 0.45],
        [0.3, 0.5, 0.3],
        [0.7, 0.6, 0.35],
    ]
)


def input_transforms() -> dict:
    out = header(
        "input-transforms",
        "Camera log code values (normalized full range) in the camera gamut -> ACES2065-1 linear, end to end. Reference: OpenColorIO built-in transforms. "
        "The colour-science reconstruction (decode, then linear RGB conversion with the named adaptation) is recorded for agreement.",
    )
    out["tolerances"] = {
        "reference": {
            "relative": 2e-5,
            "use": "OpenColorIO evaluates in float32; a float64 port should match within 2e-5 relative to max(|value|, 1).",
        },
    }
    by_id = {t["id"]: t for t in TRANSFERS}
    items = []
    for iid, name, curve, gamut in IDTS:
        theirs = ocio_apply(builtin(name), IDT_SAMPLES)
        linear = np.asarray(by_id[curve]["decode"](IDT_SAMPLES), dtype=np.float64)
        best = None
        for cat in [None, "Bradford", "CAT02"]:
            mine = colour.RGB_to_RGB(
                linear,
                colour.RGB_COLOURSPACES[gamut],
                colour.RGB_COLOURSPACES["ACES2065-1"],
                chromatic_adaptation_transform=cat,
            )
            check = agreement(theirs, mine)
            if best is None or check["maxRelativeToMax1"] < best[1]["maxRelativeToMax1"]:
                best = (cat, check)
        cat, check = best
        require(check["maxRelativeToMax1"] <= 2e-5, f"{iid} OCIO vs colour {check}")
        items.append(
            {
                "id": iid,
                "curve": curve,
                "gamut": gamut,
                "reference": f"OpenColorIO {ocio.__version__} BuiltinTransform '{name}', CPU float32, optimization off",
                "input": matrix(IDT_SAMPLES),
                "aces2065": matrix(theirs),
                "colourAgreement": {
                    "adaptation": cat,
                    "method": "decode (transfer-functions.json) then colour.RGB_to_RGB to ACES2065-1",
                    **check,
                },
            }
        )
    out["transforms"] = items
    return out


# --------------------------------------------------------------------------
# ASC CDL
# --------------------------------------------------------------------------

REC709_LUMA = np.array([0.2126, 0.7152, 0.0722])
CDL_CASES = [
    ("identity", [1, 1, 1], [0, 0, 0], [1, 1, 1], 1.0),
    ("slope-warm", [1.2, 1.0, 0.85], [0, 0, 0], [1, 1, 1], 1.0),
    ("offset-lift", [1, 1, 1], [0.05, 0.03, -0.02], [1, 1, 1], 1.0),
    ("power-contrast", [1, 1, 1], [0, 0, 0], [1.4, 1.2, 0.8], 1.0),
    ("saturation-up", [1, 1, 1], [0, 0, 0], [1, 1, 1], 1.5),
    ("saturation-zero", [1, 1, 1], [0, 0, 0], [1, 1, 1], 0.0),
    ("combined", [1.1, 0.95, 1.05], [-0.02, 0.01, 0.03], [0.9, 1.1, 1.25], 0.8),
    ("clip-push", [2.0, 1.5, 0.5], [0.1, -0.2, 0.0], [1.0, 2.0, 0.5], 1.2),
]
CDL_INPUTS = np.array(
    [
        [0, 0, 0],
        [1, 1, 1],
        [0.18, 0.18, 0.18],
        [0.5, 0.25, 0.75],
        [0.9, 0.1, 0.4],
        [0.05, 0.6, 0.95],
        [-0.1, 0.5, 1.2],
        [1.5, 0.8, -0.05],
    ],
    dtype=np.float64,
)


def asc_cdl(rgb, slope, offset, power, sat):
    """ASC CDL v1.2: out = clamp(in * slope + offset)^power, then saturation with Rec.709 luma, then clamp."""
    v = np.clip(rgb * np.asarray(slope) + np.asarray(offset), 0.0, 1.0) ** np.asarray(power)
    luma = v @ REC709_LUMA
    v = luma[:, None] + sat * (v - luma[:, None])
    return np.clip(v, 0.0, 1.0)


def cdl() -> dict:
    out = header(
        "cdl",
        "ASC CDL slope, offset, power and saturation. 'asc' is the v1.2 clamping form; 'noClamp' is OpenColorIO's CDL_NO_CLAMP style (unclamped; power is not applied to negative values).",
    )
    out["source"] = (
        "American Society of Cinematographers, ASC Color Decision List (ASC CDL) Transfer Functions and Interchange Syntax, ASC-CDL_Release1.2 (2009): SOP then saturation with Rec.709 luma weights"
    )
    out["tolerances"] = {
        "float64Port": {
            "absolute": 1e-12,
            "use": "A float64 port of the v1.2 equations must match 'asc' within 1e-12.",
        },
        "ocio": {
            "absolute": 2e-6,
            "use": "OpenColorIO (float32) agreement with the float64 'asc' values.",
        },
    }
    out["inputs"] = matrix(CDL_INPUTS)
    cases = []
    for cid, slope, offset, power, sat in CDL_CASES:
        ours = asc_cdl(CDL_INPUTS, slope, offset, power, sat)
        results = {}
        for style, enum in [("asc", ocio.CDL_ASC), ("noClamp", ocio.CDL_NO_CLAMP)]:
            t = ocio.CDLTransform()
            t.setSlope([float(x) for x in slope])
            t.setOffset([float(x) for x in offset])
            t.setPower([float(x) for x in power])
            t.setSat(float(sat))
            t.setStyle(enum)
            results[style] = ocio_apply(t, CDL_INPUTS)
        check = agreement(results["asc"], ours)
        require(check["maxAbsolute"] <= 2e-6, f"CDL {cid} OCIO disagreement {check}")
        cases.append(
            {
                "id": cid,
                "slope": floats(slope),
                "offset": floats(offset),
                "power": floats(power),
                "saturation": f(sat),
                "asc": matrix(ours),
                "noClamp": matrix(results["noClamp"]),
                "independentCheck": {
                    "implementation": f"OpenColorIO {ocio.__version__} CDLTransform CDL_ASC, CPU float32",
                    **check,
                },
            }
        )
    out["cases"] = cases
    return out


# --------------------------------------------------------------------------
# LUT interpolation
# --------------------------------------------------------------------------


def lut_function(rgb: np.ndarray) -> np.ndarray:
    """A smooth, non-separable test transform with outputs in [0, 1] on [0, 1]^3."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return np.stack(
        [
            0.85 * r**1.3 + 0.15 * g * b,
            0.75 * g + 0.2 * r * r + 0.05 * b,
            0.65 * np.sqrt(b) + 0.35 * r * g,
        ],
        axis=-1,
    )


LUT3D = [
    ("cube-2", 2, 0.0, 1.0),
    ("cube-5", 5, 0.0, 1.0),
    ("cube-17", 17, 0.0, 1.0),
    ("cube-5-domain", 5, -0.25, 1.25),
]


def cube_text(title: str, size: int, lo: float, hi: float) -> tuple[str, np.ndarray]:
    axis = lo + (hi - lo) * np.arange(size) / (size - 1)
    # .cube order: red varies fastest, then green, then blue.
    b, g, r = np.meshgrid(axis, axis, axis, indexing="ij")
    grid = np.stack([r, g, b], axis=-1).reshape(-1, 3)
    table = lut_function(np.clip(grid, 0.0, None))
    lines = [
        f'TITLE "{title}"',
        "# Generated by scripts/color/cg0_reference_vectors.py; license-free test data.",
        f"LUT_3D_SIZE {size}",
    ]
    if lo != 0.0 or hi != 1.0:
        lines += [
            f"DOMAIN_MIN {lo:.10f} {lo:.10f} {lo:.10f}",
            f"DOMAIN_MAX {hi:.10f} {hi:.10f} {hi:.10f}",
        ]
    lines += [f"{v[0]:.10f} {v[1]:.10f} {v[2]:.10f}" for v in table]
    # Values as written (parsed back), so references use the file's numbers.
    parsed = np.array(
        [[float(x) for x in line.split()] for line in lines if line[0].isdigit() or line[0] == "-"]
    )
    return "\n".join(lines) + "\n", parsed


def lut1d_text(size: int) -> tuple[str, np.ndarray]:
    x = np.arange(size) / (size - 1)
    table = np.stack([x ** (1 / 2.2), x**0.8, 1 - (1 - x) ** 1.5], axis=-1)
    lines = [
        'TITLE "cg0 1D"',
        "# Generated by scripts/color/cg0_reference_vectors.py; license-free test data.",
        f"LUT_1D_SIZE {size}",
    ]
    lines += [f"{v[0]:.10f} {v[1]:.10f} {v[2]:.10f}" for v in table]
    parsed = np.array([[float(x) for x in line.split()] for line in lines[3:]])
    return "\n".join(lines) + "\n", parsed


def lut_samples(size: int, lo: float, hi: float) -> tuple[np.ndarray, list[str]]:
    rng = np.random.default_rng(20261120)
    span = hi - lo
    axis = lo + span * np.arange(size) / (size - 1)
    nodes = np.array(
        [[axis[0], axis[-1], axis[size // 2]], [axis[-1], axis[0], axis[0]], [axis[size // 2]] * 3]
    )
    centres = lo + span * (
        np.array([[0.5, 0.5, 0.5], [1.5, 0.5, 2.5], [0.5, 2.5, 1.5]]) % (size - 1) + 0.0
    ) / (size - 1)
    random = lo + span * rng.random((48, 3))
    faces = np.array(
        [
            [lo, 0.3 * span + lo, 0.7 * span + lo],
            [hi, 0.2 * span + lo, 0.9 * span + lo],
            [0.5 * span + lo, hi, lo],
        ]
    )
    outside = np.array([[lo - 0.2, 0.5, 0.5], [0.5, hi + 0.3, 0.5], [hi + 0.1, lo - 0.1, hi + 0.2]])
    samples = np.concatenate([nodes, centres, random, faces, outside])
    kinds = (
        ["node"] * len(nodes)
        + ["cell-centre"] * len(centres)
        + ["random"] * len(random)
        + ["face"] * len(faces)
        + ["outside-domain"] * len(outside)
    )
    return samples, kinds


def lut_interpolation(write_dir: Path) -> tuple[dict, dict[str, str]]:
    out = header(
        "lut-interpolation",
        "Trilinear and tetrahedral interpolation of generated .cube LUTs (luts/*.cube, license-free). Samples include grid nodes, cell centres, seeded random points, domain faces and out-of-domain points (clamped to the domain).",
    )
    out["tolerances"] = {
        "reference": {
            "absolute": 2e-6,
            "use": "OpenColorIO (float32) is the reference for in-domain and out-of-domain samples; a float64 port should match within 2e-6.",
        },
        "nodes": {
            "absolute": 1e-10,
            "use": "At grid nodes both interpolations return the table entry (as written to 10 decimals).",
        },
    }
    files: dict[str, str] = {}
    luts = []
    for lid, size, lo, hi in LUT3D:
        text, table = cube_text(f"cg0 {lid}", size, lo, hi)
        files[f"luts/{lid}.cube"] = text
        path = write_dir / f"{lid}.cube"
        path.write_text(text)
        samples, kinds = lut_samples(size, lo, hi)
        entry = {
            "id": lid,
            "file": f"luts/{lid}.cube",
            "size": size,
            "domain": [f(lo), f(hi)],
            "samples": matrix(samples),
            "kinds": kinds,
        }
        clamped = np.clip(samples, lo, hi)
        cl = colour.LUT3D(
            table=table.reshape(size, size, size, 3).transpose(2, 1, 0, 3),
            size=size,
            domain=np.array([[lo] * 3, [hi] * 3]),
        )
        for key, interp, ref in [
            (
                "tetrahedral",
                ocio.INTERP_TETRAHEDRAL,
                colour.algebra.table_interpolation_tetrahedral,
            ),
            ("trilinear", ocio.INTERP_LINEAR, colour.algebra.table_interpolation_trilinear),
        ]:
            t = ocio.FileTransform(src=str(path), interpolation=interp)
            theirs = ocio_apply(t, samples)
            mine = cl.apply(clamped, interpolator=ref)
            check = agreement(theirs, mine)
            require(check["maxAbsolute"] <= 2e-6, f"{lid} {key} OCIO vs colour {check}")
            node = np.array([k == "node" for k in kinds])
            node_err = float(
                np.max(np.abs(theirs[node] - lut_function(np.clip(samples[node], 0, None))))
            )
            require(node_err <= 1e-6, f"{lid} {key} node error {node_err}")
            entry[key] = matrix(theirs)
            entry[f"{key}Check"] = {
                "implementation": f"colour-science {colour.__version__} {ref.__name__} on the clamped samples",
                **check,
            }
        luts.append(entry)
    # 1D LUT.
    size = 64
    text, table = lut1d_text(size)
    files["luts/curve-1d-64.cube"] = text
    path = write_dir / "curve-1d-64.cube"
    path.write_text(text)
    samples = np.array(
        [
            [0, 0, 0],
            [1, 1, 1],
            [0.5, 0.25, 0.75],
            [1 / 63, 2 / 63, 62 / 63],
            [0.123, 0.456, 0.789],
            [-0.1, 1.2, 0.5],
        ]
    )
    theirs = ocio_apply(
        ocio.FileTransform(src=str(path), interpolation=ocio.INTERP_LINEAR), samples
    )
    x = np.arange(size) / (size - 1)
    mine = np.stack(
        [np.interp(np.clip(samples[:, c], 0, 1), x, table[:, c]) for c in range(3)], axis=-1
    )
    check = agreement(theirs, mine)
    require(check["maxAbsolute"] <= 2e-6, f"1D OCIO vs numpy {check}")
    luts.append(
        {
            "id": "curve-1d-64",
            "file": "luts/curve-1d-64.cube",
            "size": size,
            "domain": [0.0, 1.0],
            "samples": matrix(samples),
            "linear": matrix(theirs),
            "linearCheck": {
                "implementation": "numpy.interp per channel on the clamped samples",
                **check,
            },
        }
    )
    # CG5: a Resolve-style .cube with a 1D shaper (LUT_1D_SIZE, input range
    # 0-4, a log-like curve into 0-1) followed by a 3D LUT on 0-1.
    shaper_size, cube_size = 32, 9
    xs = 4.0 * np.arange(shaper_size) / (shaper_size - 1)
    shaper = np.log2(1 + xs) / np.log2(5)
    axis = np.arange(cube_size) / (cube_size - 1)
    b, g, r = np.meshgrid(axis, axis, axis, indexing="ij")
    grid = np.stack([r, g, b], axis=-1).reshape(-1, 3)
    table = lut_function(grid)
    # No TITLE: OpenColorIO's Resolve .cube reader does not accept it.
    lines = [
        "# Generated by scripts/color/cg0_reference_vectors.py; license-free test data.",
        f"LUT_1D_SIZE {shaper_size}",
        f"LUT_3D_SIZE {cube_size}",
        "LUT_1D_INPUT_RANGE 0.0000000000 4.0000000000",
        "LUT_3D_INPUT_RANGE 0.0000000000 1.0000000000",
    ]
    lines += [f"{v:.10f} {v:.10f} {v:.10f}" for v in shaper]
    lines += [f"{v[0]:.10f} {v[1]:.10f} {v[2]:.10f}" for v in table]
    text = "\n".join(lines) + "\n"
    files["luts/cube-9-shaper.cube"] = text
    path = write_dir / "cube-9-shaper.cube"
    path.write_text(text)
    rng = np.random.default_rng(20261121)
    samples = np.concatenate(
        [
            np.array([[0, 0, 0], [4, 4, 4], [1, 2, 3], [0.5, 0.25, 3.5], [-0.5, 5, 2]]),
            4 * rng.random((40, 3)),
        ]
    )
    entry = {
        "id": "cube-9-shaper",
        "file": "luts/cube-9-shaper.cube",
        "size": cube_size,
        "domain": [0.0, 1.0],
        "shaper": {"size": shaper_size, "domain": [0.0, 4.0]},
        "samples": matrix(samples),
    }
    for key, interp in [
        ("tetrahedral", ocio.INTERP_TETRAHEDRAL),
        ("trilinear", ocio.INTERP_LINEAR),
    ]:
        theirs = ocio_apply(ocio.FileTransform(src=str(path), interpolation=interp), samples)
        # Independent check: shaper by numpy.interp, then colour-science's 3D sampler.
        shaped = np.stack(
            [np.interp(np.clip(samples[:, c], 0, 4), xs, shaper) for c in range(3)], axis=-1
        )
        cl = colour.LUT3D(
            table=table.reshape(cube_size, cube_size, cube_size, 3).transpose(2, 1, 0, 3),
            size=cube_size,
        )
        ref = (
            colour.algebra.table_interpolation_tetrahedral
            if key == "tetrahedral"
            else colour.algebra.table_interpolation_trilinear
        )
        mine = cl.apply(np.clip(shaped, 0, 1), interpolator=ref)
        check = agreement(theirs, mine)
        require(check["maxAbsolute"] <= 2e-6, f"shaper {key} OCIO vs colour {check}")
        entry[key] = matrix(theirs)
        entry[f"{key}Check"] = {
            "implementation": "numpy.interp shaper then colour-science 3D interpolation",
            **check,
        }
    luts.append(entry)
    out["luts"] = luts
    out["note"] = (
        "The 3D LUT function is 0.85 r^1.3 + 0.15 g b, 0.75 g + 0.2 r^2 + 0.05 b, 0.65 sqrt(b) + 0.35 r g (negative inputs clamped to 0 when tabulated)."
    )
    return out, files


# --------------------------------------------------------------------------
# Correlated colour temperature (added for CG2 white balance)
# --------------------------------------------------------------------------

CCT_SAMPLES = [
    1667.0,
    2000.0,
    2222.0,
    2500.0,
    3200.0,
    4000.0,
    4500.0,
    5000.0,
    5600.0,
    6500.0,
    7500.0,
    10000.0,
    15000.0,
    25000.0,
]
WB_SAMPLES = [2000.0, 3200.0, 5000.0, 6500.0, 9000.0]


def temperature() -> dict:
    out = header(
        "temperature",
        "Planckian locus chromaticity by correlated colour temperature (Kang et al. 2002 cubic approximation), and Bradford adaptation matrices in linear BT.709 RGB from each sample's locus white to D65 (BT.709's white, the target white of grade.white-balance).",
    )
    out["source"] = (
        "Kang, B., Moon, O., Hong, C., Lee, H., Cho, B., Kim, Y. (2002), Design of Advanced Color Temperature Control System for HDTV Applications, Journal of the Korean Physical Society 41(6), 865-871"
    )
    out["tolerances"] = {
        "float64Port": {
            "absolute": 1e-12,
            "use": "A float64 port of the Kang 2002 polynomials and of the Bradford adaptation must match within 1e-12.",
        }
    }
    xy = colour.temperature.CCT_to_xy_Kang2002(np.array(CCT_SAMPLES))
    out["locus"] = {"cct": floats(CCT_SAMPLES), "xy": matrix(xy)}
    npm = colour.normalised_primary_matrix(
        colour.RGB_COLOURSPACES["ITU-R BT.709"].primaries,
        colour.RGB_COLOURSPACES["ITU-R BT.709"].whitepoint,
    )
    reference = colour.xy_to_XYZ(colour.RGB_COLOURSPACES["ITU-R BT.709"].whitepoint)
    adaptation = []
    for t in WB_SAMPLES:
        source = colour.xy_to_XYZ(colour.temperature.CCT_to_xy_Kang2002(t))
        cat = colour.adaptation.matrix_chromatic_adaptation_VonKries(
            source, reference, transform="Bradford"
        )
        adaptation.append({"cct": f(t), "linearBt709": matrix(np.linalg.inv(npm) @ cat @ npm)})
    out["bradfordToD65"] = adaptation
    return out


# --------------------------------------------------------------------------
# Monotone curve splines (added for CG4 curves)
# --------------------------------------------------------------------------

SPLINE_CASES = [
    ("identity", [[0, 0], [1, 1]], False),
    ("s-curve", [[0, 0], [0.25, 0.18], [0.5, 0.5], [0.75, 0.84], [1, 1]], False),
    ("lift-and-crush", [[0, 0.08], [0.2, 0.15], [0.8, 0.92], [1, 0.97]], False),
    ("non-monotone", [[0, 0.2], [0.3, 0.9], [0.5, 0.4], [0.7, 0.4], [1, 0.8]], False),
    ("flat-segment", [[0, 0], [0.4, 0.5], [0.6, 0.5], [1, 1]], False),
    (
        "sixteen-points",
        [[i / 15, (i / 15) ** 0.6 if i % 3 else (i / 15) ** 0.9] for i in range(16)],
        False,
    ),
    ("tight-controls", [[0, 0], [0.5, 0.2], [0.500001, 0.8], [1, 1]], False),
    ("hue-flat", [[0, 0.5], [1, 0.5]], True),
    ("hue-bump", [[0, 0.5], [0.1, 0.7], [0.25, 0.5], [1, 0.5]], True),
    ("hue-wrap-bump", [[0, 0.65], [0.08, 0.6], [0.5, 0.5], [0.92, 0.6], [1, 0.65]], True),
]


def periodic_points(points):
    """Points over one period (x = 1 dropped: it equals x = 0), then extended
    two points to each side, as the renderer's periodic curves do."""
    inner = [p for p in points if p[0] < 1]
    head = [[p[0] + 1, p[1]] for p in inner[:2]]
    tail = [[p[0] - 1, p[1]] for p in inner[-2:]]
    return tail + inner + head


def spline() -> dict:
    import scipy
    from scipy.interpolate import PchipInterpolator

    out = header(
        "spline",
        "Monotone piecewise cubic Hermite interpolation (PCHIP) of curve control points, as scipy.interpolate.PchipInterpolator evaluates it: interior derivatives by the weighted harmonic mean (zero at local extrema), end derivatives by the three-point formula limited to keep shape. Periodic (hue) curves drop the x = 1 point and extend the points by two on each side before interpolating.",
    )
    out["references"]["scipy"] = scipy.__version__
    out["source"] = (
        "Fritsch, F. N. and Carlson, R. E. (1980), Monotone Piecewise Cubic Interpolation, SIAM J. Numer. Anal. 17(2); Fritsch and Butland (1984) weighted harmonic mean derivatives, as implemented by scipy.interpolate.PchipInterpolator"
    )
    out["tolerances"] = {
        "float64Port": {
            "absolute": 1e-12,
            "use": "A float64 port of the same PCHIP derivatives and Hermite evaluation must match every sample within 1e-12.",
        }
    }
    xs = np.arange(257) / 256.0
    cases = []
    for cid, points, periodic in SPLINE_CASES:
        knots = periodic_points(points) if periodic else points
        k = np.array(knots, dtype=np.float64)
        interp = PchipInterpolator(k[:, 0], k[:, 1])
        samples = np.unique(
            np.concatenate([xs, np.array([p[0] for p in points], dtype=np.float64)])
        )
        if periodic:
            samples = samples[samples < 1]
        cases.append(
            {
                "id": cid,
                "periodic": periodic,
                "points": matrix(points),
                "x": floats(samples),
                "y": floats(interp(samples)),
            }
        )
    out["cases"] = cases
    return out


# --------------------------------------------------------------------------


def dump(value) -> str:
    """JSON as the repository's Prettier writes it (format:check covers benchmarks/)."""
    text = json.dumps(value, indent=2, ensure_ascii=False) + "\n"
    prettier = ROOT / "node_modules/.bin/prettier"
    return subprocess.run(
        [str(prettier), "--stdin-filepath", "vectors.json"],
        input=text,
        capture_output=True,
        text=True,
        check=True,
        cwd=ROOT,
    ).stdout


def build() -> dict[str, str]:
    for key, want in PINNED.items():
        have = {
            "python": platform.python_version(),
            "colour-science": colour.__version__,
            "opencolorio": ocio.__version__,
        }[key]
        require(have == want, f"{key} {have} is not the pinned {want}")
    files: dict[str, str] = {}
    with tempfile.TemporaryDirectory() as tmp:
        lut, lut_files = lut_interpolation(Path(tmp))
    files.update(lut_files)
    files["transfer-functions.json"] = dump(transfer_functions())
    files["primaries.json"] = dump(primaries())
    files["input-transforms.json"] = dump(input_transforms())
    files["cdl.json"] = dump(cdl())
    files["lut-interpolation.json"] = dump(lut)
    files["temperature.json"] = dump(temperature())
    files["spline.json"] = dump(spline())
    return files


def main() -> int:
    check = "--check" in sys.argv[1:]
    files = build()
    if check:
        bad = []
        for rel, text in files.items():
            path = OUT / rel
            if not path.exists() or path.read_text() != text:
                bad.append(rel)
        tracked = {str(p.relative_to(OUT)) for p in OUT.rglob("*") if p.is_file()}
        extra = sorted(tracked - set(files))
        if bad or extra:
            print(
                f"CG0 reference vectors differ: {bad}; untracked by generator: {extra}",
                file=sys.stderr,
            )
            return 1
        print(f"CG0 reference vectors identical ({len(files)} files)")
        return 0
    for rel, text in files.items():
        path = OUT / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    print(f"Wrote {len(files)} files to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
