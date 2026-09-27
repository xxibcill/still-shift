"""Generate the deterministic painted layers for the vertical camera fixture."""

from pathlib import Path

from PIL import Image, ImageDraw

SIZE = (2880, 1620)
ROOT = Path(__file__).parent


def paint_background() -> None:
    image = Image.new("RGB", SIZE)
    pixels = image.load()
    for y in range(SIZE[1]):
        blend = y / SIZE[1]
        color = (
            round(91 + 123 * blend),
            round(150 + 67 * blend),
            round(184 + 18 * blend),
        )
        for x in range(SIZE[0]):
            pixels[x, y] = color
    draw = ImageDraw.Draw(image)
    draw.ellipse((2070, 135, 2260, 325), fill=(251, 229, 175))
    draw.polygon(
        [
            (0, 1110),
            (340, 800),
            (780, 1080),
            (1190, 660),
            (1660, 1030),
            (2030, 760),
            (2530, 1100),
            (2880, 820),
            (2880, 1620),
            (0, 1620),
        ],
        fill=(131, 169, 164),
    )
    draw.polygon(
        [
            (0, 1290),
            (510, 1030),
            (890, 1240),
            (1430, 900),
            (1880, 1180),
            (2390, 960),
            (2880, 1210),
            (2880, 1620),
            (0, 1620),
        ],
        fill=(111, 151, 144),
    )
    image.save(ROOT / "vista-far.png", optimize=True)


def paint_terrain() -> None:
    image = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.polygon(
        [
            (0, 1110),
            (380, 1030),
            (810, 1080),
            (1130, 940),
            (1440, 1000),
            (1830, 880),
            (2250, 1050),
            (2880, 980),
            (2880, 1620),
            (0, 1620),
        ],
        fill=(94, 130, 113, 255),
    )
    draw.polygon(
        [
            (0, 1350),
            (450, 1190),
            (830, 1270),
            (1380, 1080),
            (1930, 1250),
            (2480, 1100),
            (2880, 1270),
            (2880, 1620),
            (0, 1620),
        ],
        fill=(74, 111, 96, 255),
    )
    draw.polygon(
        [(1310, 990), (1362, 920), (1490, 920), (1540, 990)],
        fill=(71, 86, 82, 255),
    )
    draw.rectangle((1342, 990, 1510, 1095), fill=(230, 217, 181, 255))
    draw.rectangle((1400, 1020, 1450, 1095), fill=(65, 100, 108, 255))
    draw.rectangle((1470, 1015, 1490, 1045), fill=(65, 100, 108, 255))
    for x, y, radius in [
        (1100, 1020, 28),
        (1170, 990, 33),
        (1600, 970, 29),
        (1700, 950, 38),
        (1810, 980, 26),
    ]:
        draw.rectangle((x - 7, y, x + 7, y + 110), fill=(59, 86, 75, 255))
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(53, 101, 83, 255))
    image.save(ROOT / "vista-terrain.png", optimize=True)


def paint_ridge() -> None:
    image = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.polygon(
        [
            (0, 1450),
            (340, 1330),
            (700, 1390),
            (1080, 1290),
            (1390, 1430),
            (1730, 1270),
            (2140, 1390),
            (2510, 1260),
            (2880, 1350),
            (2880, 1620),
            (0, 1620),
        ],
        fill=(47, 76, 67, 255),
    )
    for x, y in [(180, 1420), (480, 1370), (910, 1375), (2080, 1360), (2490, 1325), (2740, 1370)]:
        draw.polygon([(x - 28, y), (x, y - 115), (x + 28, y)], fill=(39, 67, 58, 255))
    image.save(ROOT / "vista-ridge.png", optimize=True)


paint_background()
paint_terrain()
paint_ridge()
