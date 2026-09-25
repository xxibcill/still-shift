"""Create original, text-free Layered Chronicle-style motion test fixtures.

These abstract drawings are local engineering fixtures. They are not episode
artwork, historical reconstructions, or source evidence.
"""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw


HERE = Path(__file__).resolve().parent
WIDTH, HEIGHT, SCALE = 1920, 1080, 2
BONE = "#E8DFC9"
INK = "#211F1B"
GREEN = "#59664D"
OCHRE = "#B47A2A"
RED = "#8B3F36"
PALE = "#F0E9D8"
LIGHT_GREEN = "#AEBBA0"
LIGHT_OCHRE = "#D3B77D"


def n(value: float) -> int:
    return round(value * SCALE)


def rect(box: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    return tuple(n(value) for value in box)


def points(values: list[tuple[float, float]]) -> list[tuple[int, int]]:
    return [(n(x), n(y)) for x, y in values]


def make_canvas(seed: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    canvas = Image.new("RGB", (n(WIDTH), n(HEIGHT)), BONE)
    draw = ImageDraw.Draw(canvas)
    rng = random.Random(seed)
    # Sparse, quiet print grain. It cannot be mistaken for writing.
    for _ in range(5500):
        x = rng.randrange(n(WIDTH))
        y = rng.randrange(n(HEIGHT))
        color = "#E1D7C1" if rng.random() < 0.55 else "#F0E8D6"
        radius = 1 if rng.random() < 0.85 else 2
        draw.ellipse((x, y, x + radius, y + radius), fill=color)
    return canvas, draw


def stroke(draw: ImageDraw.ImageDraw, vertices: list[tuple[float, float]],
           color: str = INK, width: float = 5) -> None:
    draw.line(points(vertices), fill=color, width=n(width), joint="curve")


def polygon(draw: ImageDraw.ImageDraw, vertices: list[tuple[float, float]],
            fill: str, outline: str | None = INK, width: float = 5) -> None:
    draw.polygon(points(vertices), fill=fill)
    if outline:
        stroke(draw, vertices + [vertices[0]], outline, width)


def halftone_ellipse(draw: ImageDraw.ImageDraw,
                     area: tuple[float, float, float, float],
                     step: int = 14) -> None:
    left, top, right, bottom = area
    midx = (left + right) / 2
    midy = (top + bottom) / 2
    rx = (right - left) / 2
    ry = (bottom - top) / 2
    for y in range(int(top), int(bottom), step):
        for x in range(int(left), int(right), step):
            if ((x - midx) / rx) ** 2 + ((y - midy) / ry) ** 2 <= 0.92:
                draw.ellipse(rect((x, y, x + 2.5, y + 2.5)), fill="#817967")


def figure(draw: ImageDraw.ImageDraw, x: float, ground: float,
           size: float, garment: str, facing: int = 1) -> None:
    """A generic anonymous graphic silhouette without historical details."""
    def p(dx: float, dy: float) -> tuple[float, float]:
        return x + facing * dx * size, ground + dy * size

    stroke(draw, [p(-17, -65), p(-20, -4), p(-44, 0)], width=7 * size)
    stroke(draw, [p(20, -65), p(17, -4), p(43, 0)], width=7 * size)
    polygon(draw, [p(-34, -160), p(28, -161), p(43, -62), p(-47, -62)], garment,
            width=4 * size)
    stroke(draw, [p(-31, -147), p(-69, -104), p(-48, -83)], width=8 * size)
    stroke(draw, [p(27, -145), p(57, -114), p(53, -91)], width=8 * size)
    draw.ellipse(rect((x - 21 * size, ground - 215 * size,
                       x + 21 * size, ground - 166 * size)), fill=PALE,
                 outline=INK, width=n(5 * size))
    # One edge plane keeps the face readable without suggesting an identity.
    stroke(draw, [p(4, -187), p(19, -183)], width=3 * size)


def tableau() -> Image.Image:
    canvas, draw = make_canvas(11)
    # Three broad depth bands with a generous calm sky.
    polygon(draw, [(0, 555), (255, 520), (430, 540), (675, 495), (920, 527),
                   (1170, 487), (1440, 525), (1670, 496), (1920, 530),
                   (1920, 735), (0, 735)], LIGHT_GREEN, None)
    polygon(draw, [(0, 661), (265, 630), (460, 650), (720, 608), (960, 632),
                   (1230, 602), (1500, 625), (1710, 594), (1920, 635),
                   (1920, 885), (0, 885)], "#8F9F83", None)
    polygon(draw, [(0, 830), (240, 781), (565, 837), (840, 785), (1130, 824),
                   (1415, 780), (1700, 839), (1920, 802), (1920, 1080),
                   (0, 1080)], GREEN, None)
    # A broad flat path creates an editable central stage; no building or dated object.
    polygon(draw, [(525, 1080), (820, 817), (863, 667), (1050, 665),
                   (1110, 824), (1470, 1080)], LIGHT_OCHRE, None)
    stroke(draw, [(525, 1080), (820, 817), (863, 667)], "#746C58", 4)
    stroke(draw, [(1050, 665), (1110, 824), (1470, 1080)], "#746C58", 4)
    # Distant landscape marks remain subordinate to the human silhouettes.
    for x, y, radius in [(310, 603, 37), (348, 591, 28), (1550, 575, 32),
                         (1593, 593, 25), (1700, 570, 37)]:
        draw.ellipse(rect((x - radius, y - radius, x + radius, y + radius)),
                     fill=GREEN)
    figure(draw, 855, 762, 0.94, GREEN, 1)
    figure(draw, 1080, 770, 0.84, OCHRE, -1)
    # A few deliberate foreground hatch marks, not moving particles.
    for x, y in [(235, 874), (320, 915), (390, 858), (1530, 906),
                 (1630, 863), (1720, 931)]:
        stroke(draw, [(x - 14, y + 19), (x, y - 12), (x + 9, y + 16)], INK, 3)
    halftone_ellipse(draw, (166, 833, 456, 1005), 16)
    return canvas


def panel(draw: ImageDraw.ImageDraw, box: tuple[float, float, float, float]) -> None:
    draw.rounded_rectangle(rect(box), radius=n(20), fill=PALE, outline=INK,
                           width=n(6))


def token(draw: ImageDraw.ImageDraw, x: float, y: float, radius: float,
          color: str) -> None:
    draw.ellipse(rect((x - radius, y - radius, x + radius, y + radius)),
                 fill=color, outline=INK, width=n(5))


def system_frame() -> Image.Image:
    canvas, draw = make_canvas(23)
    boxes = [(130, 180, 590, 900), (730, 180, 1190, 900),
             (1330, 180, 1790, 900)]
    for box in boxes:
        panel(draw, box)
    # Left: a compact starting arrangement.
    draw.rounded_rectangle(rect((230, 580, 490, 660)), radius=n(16),
                           fill=GREEN, outline=INK, width=n(5))
    for x in (295, 360, 425):
        token(draw, x, 476, 28, OCHRE)
        stroke(draw, [(x, 505), (x, 580)], GREEN, 8)
    polygon(draw, [(265, 700), (455, 700), (425, 755), (295, 755)],
            LIGHT_OCHRE, width=4)
    # Middle: a route with two separated options.
    stroke(draw, [(790, 525), (900, 525), (965, 465), (1115, 465)], GREEN, 24)
    stroke(draw, [(900, 525), (965, 655), (1115, 655)], OCHRE, 24)
    token(draw, 790, 525, 37, GREEN)
    token(draw, 1115, 465, 39, GREEN)
    token(draw, 1115, 655, 39, OCHRE)
    # Third panel settles into a quiet, explicitly abstract endpoint grouping.
    stroke(draw, [(1395, 370), (1530, 370), (1620, 465)], GREEN, 18)
    stroke(draw, [(1395, 720), (1530, 720), (1620, 620)], OCHRE, 18)
    token(draw, 1395, 370, 29, GREEN)
    token(draw, 1395, 720, 29, OCHRE)
    draw.rounded_rectangle(rect((1560, 440, 1710, 645)), radius=n(16),
                           fill=LIGHT_GREEN, outline=INK, width=n(5))
    token(draw, 1635, 542, 42, LIGHT_OCHRE)
    # Repeated bottom bands make the three ordered states easy to reveal by panel.
    for left, _, right, bottom in boxes:
        draw.rectangle(rect((left + 4, bottom - 68, right - 4, bottom - 4)),
                       fill=LIGHT_GREEN)
        stroke(draw, [(left + 18, bottom - 69), (right - 18, bottom - 69)],
               INK, 3)
    return canvas


def comparison_half(draw: ImageDraw.ImageDraw, left: float,
                    ochre_width: float) -> None:
    panel(draw, (left, 160, left + 760, 930))
    # Both halves have the exact same geometry and anonymous figure.
    draw.ellipse(rect((left + 310, 300, left + 450, 440)),
                 fill=LIGHT_GREEN, outline=INK, width=n(5))
    token(draw, left + 380, 370, 37, GREEN)
    figure(draw, left + 380, 717, 0.74, GREEN, 1)
    draw.rounded_rectangle(rect((left + 135, 754, left + 625, 807)),
                           radius=n(10), fill=PALE, outline=INK, width=n(4))
    draw.rounded_rectangle(rect((left + 138, 757, left + 138 + ochre_width, 804)),
                           radius=n(7), fill=OCHRE)
    stroke(draw, [(left + 80, 842), (left + 680, 842)], GREEN, 5)
    for x in (left + 105, left + 660):
        stroke(draw, [(x, 832), (x, 854)], INK, 4)


def comparison() -> Image.Image:
    canvas, draw = make_canvas(37)
    comparison_half(draw, 120, 360)
    comparison_half(draw, 1040, 190)
    stroke(draw, [(960, 158), (960, 934)], INK, 5)
    return canvas


def main() -> None:
    for name, make in (
        ("tableau-hold.png", tableau),
        ("system-panel-reveal.png", system_frame),
        ("split-comparison.png", comparison),
    ):
        image = make().resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
        image.save(HERE / name, optimize=True)
        print(f"{name}: {image.width}x{image.height}")


if __name__ == "__main__":
    main()
