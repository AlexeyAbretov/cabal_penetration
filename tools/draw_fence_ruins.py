"""Кучи на ширине секции. Кадр тот же, что у целого листа: низ кучи на подошве кладки.

Две раскладки на вид, чтобы соседние секции не повторяли один штамп.
Контур и краски сняты с листов в public/assets/fence.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "assets" / "fence"

OUT = (26, 20, 14, 255)

SAND_L = (228, 198, 124, 255)
SAND = (198, 162, 78, 255)
SAND_M = (141, 106, 50, 255)
SAND_D = (106, 76, 34, 255)

STONE = (111, 101, 86, 255)
STONE_L = (168, 152, 128, 255)
STONE_D = (42, 36, 28, 255)
RUST_S = (180, 104, 60, 255)
RUST_SD = (122, 64, 36, 255)
RUST_SL = (212, 140, 90, 255)

BRICK = (180, 104, 60, 255)
BRICK_D = (122, 64, 36, 255)
BRICK_L = (212, 140, 90, 255)
MORTAR = (220, 207, 180, 255)

IRON = (90, 58, 30, 255)
IRON_M = (106, 76, 34, 255)
IRON_L = (141, 106, 50, 255)
IRON_H = (198, 162, 78, 255)
RIVET = (110, 108, 102, 255)


def hash2(x: int, y: int) -> int:
    n = (x * 374761393 + y * 668265263) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return (n ^ (n >> 16)) & 0xFFFFFFFF


def blank(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def put(im: Image.Image, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    if 0 <= x < im.width and 0 <= y < im.height:
        im.putpixel((x, y), color)


def outline(im: Image.Image) -> None:
    src = im.copy()
    pix = src.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            if pix[x, y][3] == 0:
                continue
            edge = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if nx < 0 or ny < 0 or nx >= w or ny >= h or pix[nx, ny][3] == 0:
                    edge = True
                    break
            if edge:
                im.putpixel((x, y), OUT)


def sand_heap(im: Image.Image, cx: int, base: int, rx: int, ry: int, x0: int, x1: int) -> None:
    """Широкая куча. Верх светлый, низ в тени, между кучами остаётся просвет."""
    cy = base - ry
    for y in range(base - ry * 2, base + 1):
        for x in range(cx - rx, cx + rx + 1):
            if x < x0 or x > x1 or y > base:
                continue
            nx = (x - cx) / rx
            ny = (y - cy) / ry
            if nx * nx + ny * ny > 1:
                continue
            n = hash2(x, y)
            if ny < -0.25:
                color = SAND_L if n % 3 else SAND
            elif ny < 0.25:
                color = SAND if n % 4 else SAND_M
            else:
                color = SAND_M if n % 2 else SAND_D
            put(im, x, y, color)


def rock(
    im: Image.Image,
    cx: int,
    base: int,
    rx: int,
    ry: int,
    kind: str,
    lift: int = 0,
    x0: int = 0,
    x1: int = 10_000,
) -> None:
    if kind == "rust":
        body, lite, dark = RUST_S, RUST_SL, RUST_SD
    else:
        body, lite, dark = STONE, STONE_L, STONE_D
    cy = base - ry - lift
    for y in range(cy - ry - 1, base + 1):
        for x in range(cx - rx - 1, cx + rx + 2):
            if x < x0 or x > x1 or y > base:
                continue
            nx = (x - cx) / rx
            ny = (y - cy) / ry
            if nx * nx + ny * ny > 1:
                continue
            n = hash2(x, y)
            if nx < -0.05 and ny < -0.05:
                color = lite if n % 3 else body
            elif ny > 0.35 or nx > 0.45:
                color = dark if n % 2 else body
            else:
                color = body if n % 6 else lite
            put(im, x, y, color)


def stone_pile(im: Image.Image, left: int, x0: int, x1: int, rust_first: bool) -> None:
    """Три камня в куче: два на земле, один сверху. left — левый край кучи."""
    a, b = ("rust", "grey") if rust_first else ("grey", "rust")
    rock(im, left + 4, 37, 5, 4, a, x0=x0, x1=x1)
    rock(im, left + 11, 37, 4, 3, b, x0=x0, x1=x1)
    rock(im, left + 7, 37, 3, 3, "grey", lift=5, x0=x0, x1=x1)


def brick(im: Image.Image, x: int, y: int, w: int, h: int, chip: int = 0) -> None:
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            if chip and xx >= x + w - chip and yy <= y + chip - 1:
                continue
            if yy == y:
                color = MORTAR
            elif yy == y + h - 1:
                color = BRICK_D
            elif xx <= x + 1:
                color = BRICK_L
            elif h >= 4 and yy == y + h // 2:
                color = MORTAR if hash2(xx, yy) % 2 == 0 else BRICK
            else:
                color = BRICK if hash2(xx, yy) % 4 else BRICK_D
            put(im, xx, yy, color)


def plate(im: Image.Image, x0: int, x1: int, base: int, thick: int, bend: int = 0, bend_at: int | None = None) -> None:
    for x in range(x0, x1 + 1):
        lift = 0
        if bend and bend_at is not None and x >= bend_at:
            lift = round(bend * (x - bend_at) / max(1, x1 - bend_at))
        jag = 1 if hash2(x, 9) % 4 == 0 else 0
        for t in range(thick + jag):
            y = base - lift - t
            n = hash2(x, t)
            if t >= thick + jag - 1:
                color = IRON_H if n % 2 == 0 else IRON_L
            elif t == 0:
                color = IRON
            else:
                color = IRON if n % 3 else IRON_M
            put(im, x, y, color)


def rivets(im: Image.Image) -> None:
    pix = im.load()
    w, h = im.size
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if pix[x, y] == OUT or pix[x, y][3] == 0:
                continue
            if pix[x, y] not in (IRON, IRON_M, IRON_L):
                continue
            if hash2(x, y) % 17 != 0:
                continue
            if pix[x - 1, y][3] == 0 or pix[x + 1, y][3] == 0:
                continue
            if pix[x, y - 1][3] == 0 or pix[x, y + 1][3] == 0:
                continue
            im.putpixel((x, y), RIVET)


def sandbag(variant: int) -> Image.Image:
    im = blank(96, 32)
    # Кладка x 24..71, подошва y 26. Три кучи с просветом, края на ширине мешков.
    if variant == 0:
        heaps = [(31, 7, 4), (48, 7, 5), (64, 7, 4)]
    else:
        heaps = [(30, 6, 5), (46, 8, 4), (64, 7, 5)]
    for cx, rx, ry in heaps:
        sand_heap(im, cx, 26, rx, ry, 24, 71)
    outline(im)
    return im


def stone(variant: int) -> Image.Image:
    im = blank(96, 48)
    # Кладка x 22..74, подошва y 37. Три кучи на ширине стены.
    if variant == 0:
        piles = [22, 40, 58]
        rust_first = False
    else:
        piles = [22, 39, 57]
        rust_first = True
    for left in piles:
        stone_pile(im, left, 22, 74, rust_first)
        rust_first = not rust_first
    rock(im, 71, 37, 4, 3, "grey", x0=22, x1=74)
    outline(im)
    return im


def short(variant: int) -> Image.Image:
    im = blank(96, 32)
    # Кладка x 20..76, подошва y 25. y — верх кирпича.
    if variant == 0:
        chunks = [
            (20, 22, 9, 4, 0),
            (30, 23, 6, 3, 2),
            (36, 18, 7, 4, 0),
            (37, 22, 10, 4, 0),
            (48, 20, 4, 6, 1),
            (53, 22, 8, 4, 0),
            (62, 19, 6, 3, 2),
            (61, 22, 8, 4, 0),
            (70, 21, 7, 5, 0),
        ]
    else:
        chunks = [
            (20, 21, 6, 5, 0),
            (27, 22, 8, 4, 2),
            (36, 23, 7, 3, 0),
            (43, 18, 8, 4, 0),
            (44, 22, 9, 4, 0),
            (54, 21, 5, 5, 1),
            (60, 23, 7, 3, 0),
            (67, 19, 5, 3, 0),
            (68, 22, 9, 4, 2),
        ]
    for x, y, w, h, chip in chunks:
        brick(im, x, y, w, h, chip)
    outline(im)
    return im


def rust(variant: int) -> Image.Image:
    im = blank(96, 48)
    # Кладка x 14..81, подошва y 44. Короткие обломки с просветом, не вторая стенка.
    if variant == 0:
        plates = [
            (14, 26, 5, 5, 21),
            (30, 40, 4, 0, None),
            (44, 58, 5, 6, 50),
            (62, 70, 4, 0, None),
            (73, 81, 5, 4, 76),
        ]
    else:
        plates = [
            (14, 22, 4, 0, None),
            (26, 40, 5, 6, 33),
            (44, 52, 4, 0, None),
            (56, 70, 5, 5, 63),
            (74, 81, 4, 0, None),
        ]
    for x0, x1, thick, bend, bend_at in plates:
        plate(im, x0, x1, 44, thick, bend, bend_at)
    outline(im)
    rivets(im)
    return im


def save_all() -> None:
    writers = {
        "sandbag": sandbag,
        "stone": stone,
        "short": short,
        "rust": rust,
    }
    for name, writer in writers.items():
        folder = ROOT / name
        folder.mkdir(parents=True, exist_ok=True)
        for variant in (0, 1):
            path = folder / f"ruin_{variant:03d}.png"
            writer(variant).save(path)
            print(path)


if __name__ == "__main__":
    save_all()
