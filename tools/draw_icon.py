"""Значок игры: текст CABAL и под ним PENETRATION.

Чёрное поле, буквы цвета цифр HUD. Круглая маска телефона не срезает строку.
Пишет public/icons/. Пересобрать: python tools/draw_icon.py
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

BLACK = (0, 0, 0, 255)
INK = (231, 220, 196, 255)

# Пять на семь. Точка пустая, решётка — буква.
GLYPH = {
    "A": [
        ".###.",
        "#...#",
        "#...#",
        "#####",
        "#...#",
        "#...#",
        "#...#",
    ],
    "B": [
        "####.",
        "#...#",
        "#...#",
        "####.",
        "#...#",
        "#...#",
        "####.",
    ],
    "C": [
        ".###.",
        "#...#",
        "#....",
        "#....",
        "#....",
        "#...#",
        ".###.",
    ],
    "E": [
        "#####",
        "#....",
        "#....",
        "####.",
        "#....",
        "#....",
        "#####",
    ],
    "I": [
        "#####",
        "..#..",
        "..#..",
        "..#..",
        "..#..",
        "..#..",
        "#####",
    ],
    "L": [
        "#....",
        "#....",
        "#....",
        "#....",
        "#....",
        "#....",
        "#####",
    ],
    "N": [
        "#...#",
        "##..#",
        "#.#.#",
        "#.#.#",
        "#..##",
        "#...#",
        "#...#",
    ],
    "O": [
        ".###.",
        "#...#",
        "#...#",
        "#...#",
        "#...#",
        "#...#",
        ".###.",
    ],
    "P": [
        "####.",
        "#...#",
        "#...#",
        "####.",
        "#....",
        "#....",
        "#....",
    ],
    "R": [
        "####.",
        "#...#",
        "#...#",
        "####.",
        "#.#..",
        "#..#.",
        "#...#",
    ],
    "T": [
        "#####",
        "..#..",
        "..#..",
        "..#..",
        "..#..",
        "..#..",
        "..#..",
    ],
}

Pixel = tuple[int, int, int, int]
Bitmap = list[list[bool]]


def scale_glyph(rows: list[str], factor: int) -> Bitmap:
    out: Bitmap = []
    for row in rows:
        for _ in range(factor):
            out.append([cell == "#" for cell in row for _ in range(factor)])
    return out


def line(text: str, factor: int, gap: int) -> Bitmap:
    glyphs = [scale_glyph(GLYPH[ch], factor) for ch in text]
    height = len(glyphs[0])
    width = sum(len(glyph[0]) for glyph in glyphs) + gap * (len(glyphs) - 1)
    rows = [[False for _ in range(width)] for _ in range(height)]
    x = 0
    for glyph in glyphs:
        for y, glyph_row in enumerate(glyph):
            for dx, on in enumerate(glyph_row):
                if on:
                    rows[y][x + dx] = True
        x += len(glyph[0]) + gap
    return rows


def center(rows: Bitmap, width: int) -> Bitmap:
    pad = width - len(rows[0])
    left = pad // 2
    right = pad - left
    return [[False] * left + row + [False] * right for row in rows]


def words() -> Bitmap:
    """CABAL крупнее: строка короче, и на значке она держит высоту."""
    title = line("CABAL", 2, 2)
    sub = line("PENETRATION", 1, 1)
    width = max(len(title[0]), len(sub[0]))
    gap = [[False for _ in range(width)] for _ in range(4)]
    return center(title, width) + gap + center(sub, width)


def max_scale(width: int, height: int, size: int) -> int:
    """Углы надписи внутри круга, которым телефон закрывает значок."""
    room = 0.8 * size / math.hypot(width, height)
    square = min(size / width, size / height)
    return int(min(room, square))


def paint(size: int, block: Bitmap, factor: int) -> list[list[Pixel]]:
    height = len(block)
    width = len(block[0])
    left = (size - width * factor) // 2
    top = (size - height * factor) // 2
    canvas = [[BLACK for _ in range(size)] for _ in range(size)]
    for y, row in enumerate(block):
        for x, on in enumerate(row):
            if not on:
                continue
            for oy in range(factor):
                py = top + y * factor + oy
                for ox in range(factor):
                    canvas[py][left + x * factor + ox] = INK
    return canvas


def icon(size: int, block: Bitmap) -> list[list[Pixel]]:
    factor = max_scale(len(block[0]), len(block), size)
    if factor < 1:
        raise ValueError(f"Надпись не входит в {size}px")
    return paint(size, block, factor)


def png_bytes(width: int, height: int, rows: list[bytes]) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + row for row in rows)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + chunk(
        b"IDAT", zlib.compress(raw, 9)
    ) + chunk(b"IEND", b"")


def write_png(path: Path, pixels: list[list[Pixel]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw_rows = [b"".join(bytes(px) for px in row) for row in pixels]
    path.write_bytes(png_bytes(len(pixels[0]), len(pixels), raw_rows))


def main() -> None:
    for rows in GLYPH.values():
        if len(rows) != 7 or any(len(row) != 5 for row in rows):
            raise SystemExit("Буква должна быть 5×7")

    root = Path(__file__).resolve().parents[1]
    folder = root / "public" / "icons"
    block = words()
    # Вкладка берёт тот же рисунок, что и значок 192: в 32px строка не читается.
    for name, size in (
        ("favicon.png", 192),
        ("apple-touch-icon.png", 180),
        ("icon-192.png", 192),
        ("icon-512.png", 512),
    ):
        write_png(folder / name, icon(size, block))
        print(f"{name} {size}x{size}")


if __name__ == "__main__":
    main()
