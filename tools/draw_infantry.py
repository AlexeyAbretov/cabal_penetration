"""Лист пехоты из кадров в public/assets/enemies/infantry.

Бег вправо: running/frame_000..003. Влево игру зеркалит код.
Стойка: shooting/frame_000. Выстрел: shooting/frame_002, вспышка у дула.
Труп: dead/frame_000. Лужа на лист не входит, её рисует игра.

Новый солдат садится в клетку 32×30 ближайшим пикселем, без смешивания цветов.
Рост стойки как у прежнего солдата, около 30 пикселей.
Один масштаб на все кадры: труп остаётся ниже стойки.
Низ тела на нижней строке, фигура по центру.
Пишет public/assets/infantry.png, 224×30.

Прежний солдат лежит в public/assets/enemies/infantry2.
Его окно 44×48 садится в клетку 30×33 ближайшим пикселем, без смешивания цветов.
Пишет public/assets/infantry2.png, 210×33.
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

CELL_W = 32
CELL_H = 30

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "assets" / "enemies" / "infantry"
OUT = ROOT / "public" / "assets" / "infantry.png"
OLD_SRC = ROOT / "public" / "assets" / "enemies" / "infantry2"
OLD_OUT = ROOT / "public" / "assets" / "infantry2.png"
OLD_W = 30
OLD_H = 33
OLD_CROP_X = 12
OLD_CROP_Y = 6
OLD_CROP_W = 44
OLD_CROP_H = 48

FRAMES = (
    SRC / "running" / "frame_000.png",
    SRC / "running" / "frame_001.png",
    SRC / "running" / "frame_002.png",
    SRC / "running" / "frame_003.png",
    SRC / "shooting" / "frame_000.png",
    SRC / "shooting" / "frame_002.png",
    SRC / "dead" / "frame_000.png",
)


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


def place(rows: list[bytearray], width: int, scale: float) -> list[bytes]:
    """Фигура одним масштабом. Низ на последней строке, по центру клетки."""
    min_x, min_y, max_x, max_y = opaque_box(rows, width)
    src_w = max_x - min_x + 1
    src_h = max_y - min_y + 1
    dst_w = max(1, min(CELL_W, round(src_w * scale)))
    dst_h = max(1, min(CELL_H, round(src_h * scale)))
    left = (CELL_W - dst_w) // 2
    top = CELL_H - dst_h
    return nearest(rows, min_x, min_y, src_w, src_h, dst_w, dst_h, left, top, CELL_W, CELL_H)


def nearest(
    rows: list[bytearray],
    src_x: int,
    src_y: int,
    src_w: int,
    src_h: int,
    dst_w: int,
    dst_h: int,
    left: int,
    top: int,
    cell_w: int,
    cell_h: int,
) -> list[bytes]:
    """Один исходный пиксель на клетку приёмника. Цвета соседей не смешиваются."""
    cell = [bytearray(cell_w * 4) for _ in range(cell_h)]
    for dy in range(dst_h):
        sy = src_y + min(src_h - 1, int((dy + 0.5) * src_h / dst_h))
        src = rows[sy]
        dest = cell[top + dy]
        for dx in range(dst_w):
            sx = src_x + min(src_w - 1, int((dx + 0.5) * src_w / dst_w))
            i = sx * 4
            if src[i + 3] <= 16:
                continue
            j = (left + dx) * 4
            dest[j : j + 4] = src[i : i + 4]
    return [bytes(row) for row in cell]


def place_old(rows: list[bytearray], width: int, path: Path) -> list[bytes]:
    if path.name == "frame_000.png" and path.parent.name == "dead":
        min_x, min_y, max_x, max_y = opaque_box(rows, width)
        src_w = max_x - min_x + 1
        src_h = max_y - min_y + 1
        scale = min(OLD_W / src_w, OLD_H / src_h)
        dst_w = max(1, min(OLD_W, round(src_w * scale)))
        dst_h = max(1, min(OLD_H, round(src_h * scale)))
        left = (OLD_W - dst_w) // 2
        top = OLD_H - dst_h
        return nearest(rows, min_x, min_y, src_w, src_h, dst_w, dst_h, left, top, OLD_W, OLD_H)
    if (width, len(rows)) != (64, 64):
        raise SystemExit(f"{path.relative_to(OLD_SRC)}: expected 64x64, got {width}x{len(rows)}")
    return nearest(rows, OLD_CROP_X, OLD_CROP_Y, OLD_CROP_W, OLD_CROP_H, OLD_W, OLD_H, 0, 0, OLD_W, OLD_H)


def write_old() -> None:
    cells: list[list[bytes]] = []
    for path in FRAMES:
        old = OLD_SRC / path.relative_to(SRC)
        width, _height, rows = read_png(old)
        cells.append(place_old(rows, width, old))
    sheet = [b"".join(cell[y] for cell in cells) for y in range(OLD_H)]
    OLD_OUT.write_bytes(png_bytes(OLD_W * len(cells), OLD_H, sheet))
    print(f"{OLD_W * len(cells)}x{OLD_H}")


def main() -> None:
    loaded: list[tuple[Path, int, list[bytearray], tuple[int, int, int, int]]] = []
    widest = 1
    tallest = 1
    for path in FRAMES:
        width, _height, rows = read_png(path)
        box = opaque_box(rows, width)
        src_w = box[2] - box[0] + 1
        src_h = box[3] - box[1] + 1
        widest = max(widest, src_w)
        tallest = max(tallest, src_h)
        loaded.append((path, width, rows, box))
    scale = min(CELL_W / widest, CELL_H / tallest)
    cells = [place(rows, width, scale) for _path, width, rows, _box in loaded]
    sheet = [b"".join(cell[y] for cell in cells) for y in range(CELL_H)]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(png_bytes(CELL_W * len(cells), CELL_H, sheet))
    print(f"{CELL_W * len(cells)}x{CELL_H}")
    write_old()


if __name__ == "__main__":
    main()
