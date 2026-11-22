"""Лист пехоты из кадров в public/assets/enemies/infantry.

Бег вправо: running/frame_000..003. Влево игру зеркалит код.
Стойка: shooting/frame_000. Выстрел: shooting/frame_002, вспышка у дула.
Труп: dead/frame_000. Лужа на лист не входит, её рисует игра.
Остальные кадры стрельбы на лист не входят: бой держит одну клетку наводки.

Общее окно 44×48. Ступня самого низкого кадра на нижней строке,
пустой край исходных 64×64 фигуру не уменьшает.
Труп шире этого окна: площадь пикселя усредняется в клетку
и низ тела садится на ту же строку.
Пишет public/assets/infantry.png, 308×48.
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

CELL_W = 44
CELL_H = 48
CROP_X = 12
CROP_Y = 6

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "assets" / "enemies" / "infantry"
OUT = ROOT / "public" / "assets" / "infantry.png"

FRAMES = (
    SRC / "running" / "frame_000.png",
    SRC / "running" / "frame_001.png",
    SRC / "running" / "frame_002.png",
    SRC / "running" / "frame_003.png",
    SRC / "shooting" / "frame_000.png",
    SRC / "shooting" / "frame_002.png",
    SRC / "dead" / "frame_000.png",
)

DEAD = FRAMES[-1]


def png_bytes(width: int, height: int, rows: list[bytes]) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + row for row in rows)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + chunk(
        b"IDAT", zlib.compress(raw, 9)
    ) + chunk(b"IEND", b"")


def read_png(path: Path) -> tuple[int, int, list[bytearray]]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"{path} is not a PNG")
    pos = 8
    width = height = 0
    idat = b""
    while pos < len(data):
        size = struct.unpack(">I", data[pos : pos + 4])[0]
        tag = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + size]
        pos += 12 + size
        if tag == b"IHDR":
            width, height, depth, color, _compression, _png_filter, interlace = struct.unpack(">IIBBBBB", chunk[:13])
            if (depth, color, interlace) != (8, 6, 0):
                raise SystemExit(f"{path.name}: need 8-bit RGBA, got depth {depth} color {color}")
        elif tag == b"IDAT":
            idat += chunk
        elif tag == b"IEND":
            break
    raw = zlib.decompress(idat)
    stride = width * 4
    rows: list[bytearray] = []
    index = 0
    prev = bytearray(stride)
    for _y in range(height):
        filt = raw[index]
        index += 1
        row = bytearray(raw[index : index + stride])
        index += stride
        if filt == 1:
            for x in range(stride):
                left = row[x - 4] if x >= 4 else 0
                row[x] = (row[x] + left) & 255
        elif filt == 2:
            for x in range(stride):
                row[x] = (row[x] + prev[x]) & 255
        elif filt == 3:
            for x in range(stride):
                left = row[x - 4] if x >= 4 else 0
                row[x] = (row[x] + ((left + prev[x]) // 2)) & 255
        elif filt == 4:
            for x in range(stride):
                a = row[x - 4] if x >= 4 else 0
                b = prev[x]
                c = prev[x - 4] if x >= 4 else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else b if pb <= pc else c
                row[x] = (row[x] + pr) & 255
        elif filt != 0:
            raise SystemExit(f"{path.name}: filter {filt}")
        prev = row
        rows.append(row)
    return width, height, rows


def opaque_box(rows: list[bytearray], width: int) -> tuple[int, int, int, int]:
    min_x, min_y, max_x, max_y = width, len(rows), 0, 0
    for y, row in enumerate(rows):
        for x in range(width):
            if row[x * 4 + 3] <= 16:
                continue
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
    return min_x, min_y, max_x, max_y


def crop(rows: list[bytearray]) -> list[bytes]:
    out: list[bytes] = []
    for y in range(CELL_H):
        src = rows[CROP_Y + y]
        start = CROP_X * 4
        out.append(bytes(src[start : start + CELL_W * 4]))
    return out


def fit_down(rows: list[bytearray], width: int) -> list[bytes]:
    """Тело шире клетки. Среднее по площади, низ на последней строке, по центру."""
    min_x, min_y, max_x, max_y = opaque_box(rows, width)
    src_w = max_x - min_x + 1
    src_h = max_y - min_y + 1
    scale = min(CELL_W / src_w, CELL_H / src_h)
    dst_w = max(1, min(CELL_W, round(src_w * scale)))
    dst_h = max(1, min(CELL_H, round(src_h * scale)))
    left = (CELL_W - dst_w) // 2
    top = CELL_H - dst_h
    cell = [bytearray(CELL_W * 4) for _ in range(CELL_H)]
    for dy in range(dst_h):
        y0 = min_y + dy * src_h / dst_h
        y1 = min_y + (dy + 1) * src_h / dst_h
        dest = cell[top + dy]
        for dx in range(dst_w):
            x0 = min_x + dx * src_w / dst_w
            x1 = min_x + (dx + 1) * src_w / dst_w
            sample = average(rows, width, x0, x1, y0, y1)
            if sample is None:
                continue
            j = (left + dx) * 4
            dest[j : j + 4] = sample
    return [bytes(row) for row in cell]


def average(
    rows: list[bytearray], width: int, x0: float, x1: float, y0: float, y1: float
) -> bytes | None:
    area = (x1 - x0) * (y1 - y0)
    if area <= 0:
        return None
    red = green = blue = covered = 0.0
    y_last = min(len(rows) - 1, math.ceil(y1) - 1)
    x_last = min(width - 1, math.ceil(x1) - 1)
    for sy in range(max(0, math.floor(y0)), y_last + 1):
        wy = min(sy + 1, y1) - max(sy, y0)
        if wy <= 0:
            continue
        row = rows[sy]
        for sx in range(max(0, math.floor(x0)), x_last + 1):
            wx = min(sx + 1, x1) - max(sx, x0)
            if wx <= 0:
                continue
            i = sx * 4
            alpha = row[i + 3] / 255
            if alpha <= 0:
                continue
            weight = wx * wy * alpha
            red += row[i] * weight
            green += row[i + 1] * weight
            blue += row[i + 2] * weight
            covered += wx * wy * alpha
    if covered <= 0 or covered / area * 255 < 16:
        return None
    return bytes(
        (
            round(red / covered),
            round(green / covered),
            round(blue / covered),
            round(covered / area * 255),
        )
    )


def main() -> None:
    cells: list[list[bytes]] = []
    for path in FRAMES:
        width, height, rows = read_png(path)
        box = opaque_box(rows, width)
        right = CROP_X + CELL_W - 1
        bottom = CROP_Y + CELL_H - 1
        if (width, height) != (64, 64):
            raise SystemExit(f"{path.name}: expected 64x64, got {width}x{height}")
        if path == DEAD:
            cells.append(fit_down(rows, width))
            continue
        if box[0] < CROP_X or box[1] < CROP_Y or box[2] > right or box[3] > bottom:
            raise SystemExit(f"{path.relative_to(SRC)} sticks out of the cell: {box}")
        cells.append(crop(rows))
    sheet = [b"".join(cell[y] for cell in cells) for y in range(CELL_H)]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(png_bytes(CELL_W * len(cells), CELL_H, sheet))
    print(f"{CELL_W * len(cells)}x{CELL_H}")


if __name__ == "__main__":
    main()
