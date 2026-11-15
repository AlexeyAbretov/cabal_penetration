"""Свой лист солдата, пиксель в пиксель. Не копия кадров TAD и Rare.

Стойка — спина в поле. Шаг и бег доворачивают ноги вправо вдоль дорожки.
Влево игру зеркалит код. Колено, перекат и вспышка — тот же человек, чтобы
пустые клетки листа не гасили позу.

Палитра:
  контур   #1a140e
  шлем     #c6b24a  свет #e4d078  тень #7a6828
  кожа     #d09870
  форма    #3a4a28  свет #7a8a52  тень #243018
  ранец    #2a341c
  ботинок  #6a4030  подошва #3e2418
  дерево   #8a5c32
  ствол    #5c5a56  блик #c8c4b4
  вспышка  #fff6d0
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

W = 32
H = 48
COLS = 8
ROWS = 8

OUT = (26, 20, 14, 255)
HELMET = (198, 178, 74, 255)
HELMET_HI = (228, 208, 120, 255)
HELMET_SH = (122, 104, 40, 255)
SKIN = (208, 152, 112, 255)
FAT = (58, 74, 40, 255)
FAT_HI = (122, 138, 82, 255)
FAT_SH = (36, 48, 24, 255)
PACK = (42, 52, 28, 255)
BOOT = (106, 64, 48, 255)
BOOT_SH = (62, 36, 24, 255)
WOOD = (138, 92, 50, 255)
GUN = (92, 90, 86, 255)
GUN_HI = (200, 196, 180, 255)
FLASH = (255, 246, 208, 255)
FLASH_HOT = (255, 254, 244, 255)
CLEAR = (0, 0, 0, 0)

PAL = {
    "h": HELMET_HI,
    "H": HELMET,
    "s": HELMET_SH,
    "n": SKIN,
    "F": FAT,
    "f": FAT_HI,
    "d": FAT_SH,
    "p": PACK,
    "b": BOOT,
    "B": BOOT_SH,
}

# Затылок, без лица. 11 строк.
HELMET_ART = [
    "hhhhhhhh",
    "hhHHHHHHHHh",
    "hHHHHHHHHHHh",
    "hHHHHHHHHHHHs",
    "hHHHHHHHHHHHs",
    "hHHHHHHHHHHHs",
    "hHHHHHHHHHHs",
    "hhsssssssshh",
    "ssssssssss",
    "ssssssss",
    "nnnn",
]

# Спина и ранец по центру. 13 строк. Низ — пояс, к нему крепятся ноги.
TORSO_ART = [
    "dddddddddddddd",
    "dFFFFFFFFFFFFd",
    "dFFFppppppFFFd",
    "dFFFppppppFFFd",
    "dFFFppppppFFFd",
    "dFFFppppppFFFd",
    "dFFFFFFFFFFFFd",
    "dFFFFFffFFFFFd",
    "dFFFFFffFFFFFd",
    "dddddddddddddd",
    "FFFFFFFFFFFF",
    "FFFFFffFFFFF",
    "dddddddddd",
]

HIP_Y = 32
ANKLE_Y = 43
CX = 16


def blank() -> list[list[tuple[int, int, int, int]]]:
    return [[CLEAR for _ in range(W)] for _ in range(H)]


def put(frame: list, x: float, y: float, color: tuple[int, int, int, int]) -> None:
    ix, iy = int(round(x)), int(round(y))
    if 0 <= ix < W and 0 <= iy < H and color[3]:
        frame[iy][ix] = color


def stamp(frame: list, lines: list[str], top: int, dx: int = 0) -> None:
    for row, line in enumerate(lines):
        y = top + row
        if not 0 <= y < H:
            continue
        pad = W - len(line)
        left = pad // 2 + dx
        for col, ch in enumerate(line):
            color = PAL.get(ch)
            if color:
                put(frame, left + col, y, color)


def limb(frame: list, a: tuple[float, float], b: tuple[float, float], width: float, color: tuple[int, int, int, int]) -> None:
    ax, ay = a
    bx, by = b
    steps = int(max(abs(bx - ax), abs(by - ay), 1) * 2)
    radius = width / 2
    limit = radius * radius + 0.2
    reach = int(radius) + 1
    for i in range(steps + 1):
        t = i / steps
        x = ax + (bx - ax) * t
        y = ay + (by - ay) * t
        for oy in range(-reach, reach + 1):
            for ox in range(-reach, reach + 1):
                if ox * ox + oy * oy <= limit:
                    put(frame, x + ox, y + oy, color)


def boot(frame: list, ankle: tuple[float, float], lift: float) -> None:
    x, y = ankle
    toe = 3
    heel = -2
    top = int(round(y))
    sole = top + 3
    toe_lift = -1 if lift > 2 else 0
    for yy in range(top, sole + 1):
        if yy < 0 or yy >= H:
            continue
        t = (yy - top) / 3
        x0 = int(round(x + heel))
        x1 = int(round(x + toe + toe_lift * (1 - t)))
        color = BOOT_SH if yy == sole else BOOT
        for xx in range(min(x0, x1), max(x0, x1) + 1):
            put(frame, xx, yy, color)
        if yy == top:
            put(frame, x0, yy, BOOT_SH)


def leg(
    frame: list,
    hip: tuple[float, float],
    foot_x: float,
    lift: float,
    color: tuple[int, int, int, int],
    shade: tuple[int, int, int, int],
) -> None:
    ankle = (foot_x, ANKLE_Y - lift)
    hx, hy = hip
    ax, ay = ankle
    bend = 2.2 + lift * 0.35
    knee = ((hx + ax) / 2 + (1.4 if ax >= hx else -0.4), (hy + ay) / 2 - bend)
    limb(frame, hip, knee, 4.2, color)
    limb(frame, knee, ankle, 3.2, shade)
    boot(frame, ankle, lift)


def gait(i: int, stride: float, lift_h: float) -> tuple[float, float, float, float, int]:
    """Ближняя нога и дальняя. Плюс по x — вправо, в сторону хода."""
    angle = i / 8 * math.tau
    near_x = math.cos(angle) * stride
    near_lift = max(0.0, -math.sin(angle)) * lift_h
    far_angle = angle + math.pi
    far_x = math.cos(far_angle) * stride
    far_lift = max(0.0, -math.sin(far_angle)) * lift_h
    bob = 1 if max(near_lift, far_lift) > lift_h * 0.55 else 0
    return near_x, near_lift, far_x, far_lift, bob


def shade_near_side(frame: list) -> None:
    """Правый бок шлема и куртки: разворот вправо, лица по-прежнему нет."""
    for y in range(H):
        xs = [x for x in range(W) if frame[y][x] in (HELMET, HELMET_HI, FAT, FAT_HI)]
        if not xs:
            continue
        edge = max(xs)
        for x in range(edge - 1, edge + 1):
            if frame[y][x] in (HELMET, HELMET_HI):
                frame[y][x] = HELMET_SH
            elif frame[y][x] in (FAT, FAT_HI):
                frame[y][x] = FAT_SH


def rifle(frame: list, sx: int, sy: int, dx: int, dy: int) -> tuple[int, int]:
    for oy in range(5):
        for ox in range(-1, 2):
            put(frame, sx + ox, sy + oy, WOOD if oy else WOOD)
    put(frame, sx, sy, GUN_HI)
    steps = max(abs(dx), abs(dy), 1)
    tip = (sx, sy)
    for i in range(steps + 1):
        t = i / steps
        x = sx + 1 + dx * t
        y = sy - 1 + dy * t
        put(frame, x, y, GUN_HI if i > steps - 2 else GUN)
        put(frame, x + 1, y, GUN)
        tip = (int(round(x)), int(round(y)))
    return tip


def flash(frame: list, tip: tuple[int, int], big: bool) -> None:
    x, y = tip
    radius = 2 if big else 1
    for oy in range(-radius, radius + 1):
        for ox in range(-radius, radius + 1):
            if ox * ox + oy * oy <= radius * radius + (1 if big else 0):
                put(frame, x + ox - 1, y + oy, FLASH_HOT if ox * ox + oy * oy <= 1 else FLASH)


def outline(frame: list) -> list:
    out = [row[:] for row in frame]
    for y in range(H):
        for x in range(W):
            if frame[y][x][3]:
                continue
            if any(
                0 <= y + oy < H and 0 <= x + ox < W and frame[y + oy][x + ox][3]
                for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            ):
                out[y][x] = OUT
    return out


def plant(frame: list, bottom: int = 46) -> list:
    ys = [y for y in range(H) for x in range(W) if frame[y][x][3]]
    if not ys:
        return frame
    shift = bottom - max(ys)
    moved = blank()
    for y in range(H):
        ny = y + shift
        if 0 <= ny < H:
            moved[ny] = frame[y][:]
    return moved


def upper(frame: list, bob: int, dx: int) -> None:
    top = HIP_Y - (len(HELMET_ART) + len(TORSO_ART)) - bob
    stamp(frame, HELMET_ART, top, dx)
    stamp(frame, TORSO_ART, top + len(HELMET_ART), dx)


def soldier(kind: str, i: int) -> list:
    frame = blank()
    turned = kind in ("walk", "run")
    if kind == "stand":
        bob = (0, 1, 1, 0)[i % 4]
        upper(frame, bob, 0)
        leg(frame, (CX - 4, HIP_Y - bob), CX - 4, 0, FAT, FAT_SH)
        leg(frame, (CX + 4, HIP_Y - bob), CX + 4, 0, FAT, FAT_SH)
        # Тело поверх бёдер, иначе пояс рвётся.
        upper(frame, bob, 0)
        rifle(frame, CX + 8, HIP_Y - len(TORSO_ART) + 2 - bob, 1, -15)
    elif turned:
        stride, lift_h = (8.0, 6.5) if kind == "run" else (5.5, 4.2)
        near_x, near_lift, far_x, far_lift, bob = gait(i, stride, lift_h)
        if kind == "run":
            bob += 1 if bob else 0
        hip = HIP_Y - bob
        leg(frame, (CX - 1, hip), CX + far_x, far_lift, FAT_SH, FAT_SH)
        leg(frame, (CX + 1, hip), CX + near_x, near_lift, FAT_HI, FAT)
        upper(frame, bob, 1 if kind == "run" else 0)
        shade_near_side(frame)
        rifle(
            frame,
            CX + 8,
            hip - len(TORSO_ART) + 3,
            8 if kind == "run" else 5,
            -10 if kind == "run" else -13,
        )
    elif kind == "kneel":
        kneel(frame, (0, 1, 1, 0)[i % 4])
    else:
        raise ValueError(kind)
    return outline(plant(frame))


def kneel(frame: list, bob: int) -> None:
    """Шлем ниже стойки. Левое колено на земле, правый ботинок рядом."""
    top = 16 - bob
    kneel_legs(frame, top)
    stamp(frame, HELMET_ART, top)
    stamp(frame, TORSO_ART, top + len(HELMET_ART))
    rifle(frame, CX + 8, top + len(HELMET_ART) + 2, 1, -14)


def kneel_legs(frame: list, top: int) -> None:
    limb(frame, (CX - 1, top + 22), (CX - 7, ANKLE_Y), 4.0, FAT)
    limb(frame, (CX + 2, top + 22), (CX + 6, ANKLE_Y), 3.2, FAT_SH)
    boot(frame, (CX - 7, ANKLE_Y), 0)
    boot(frame, (CX + 6, ANKLE_Y), 0)


def shade_shoulder(frame: list, side: int) -> None:
    """Кромка куртки в сторону ствола. Шлем не трогает: затылок остаётся на месте."""
    if side == 0:
        return
    for y in range(H):
        xs = [x for x in range(W) if frame[y][x] in (FAT, FAT_HI)]
        if len(xs) < 4:
            continue
        edge = max(xs) if side > 0 else min(xs)
        cols = (edge - 1, edge) if side > 0 else (edge, edge + 1)
        for x in cols:
            if frame[y][x] in (FAT, FAT_HI):
                frame[y][x] = FAT_SH


# Колонки веера: влево/прямо/вправо низко, затем то же выше. Ноги те же, двигаются плечо и ствол.
AIM = (
    (-1, -10, -4),
    (0, 1, -8),
    (1, 8, -4),
    (-1, -8, -13),
    (0, 0, -16),
    (1, 6, -13),
)


def aim_pose(kneeling: bool, side: int, dx: int, dy: int) -> list:
    frame = blank()
    if kneeling:
        top = 16
        kneel_legs(frame, top)
        stamp(frame, HELMET_ART, top)
        stamp(frame, TORSO_ART, top + len(HELMET_ART), side)
        sy = top + len(HELMET_ART) + 2
    else:
        leg(frame, (CX - 4, HIP_Y), CX - 4, 0, FAT, FAT_SH)
        leg(frame, (CX + 4, HIP_Y), CX + 4, 0, FAT, FAT_SH)
        top = HIP_Y - (len(HELMET_ART) + len(TORSO_ART))
        stamp(frame, HELMET_ART, top)
        stamp(frame, TORSO_ART, top + len(HELMET_ART), side)
        sy = HIP_Y - len(TORSO_ART) + 2
    shade_shoulder(frame, side)
    tip = rifle(frame, CX + side * 6 + 2, sy, dx, dy)
    flash(frame, tip, big=True)
    return outline(plant(frame))


def roll(i: int, n: int) -> list:
    frame = blank()
    angle = -i / n * math.tau
    cx, cy = 16.0, 34.0
    for y in range(H):
        for x in range(W):
            nx = (x - cx) / 8.5
            ny = (y - cy) / 5.2
            if nx * nx + ny * ny <= 1:
                frame[y][x] = FAT_SH if nx > 0.35 else FAT
    hx = cx + math.cos(angle) * 6.5
    hy = cy + math.sin(angle) * 3.6
    for y in range(H):
        for x in range(W):
            if (x - hx) ** 2 + (y - hy) ** 2 <= 11:
                frame[y][x] = HELMET_HI if y < hy - 1 else HELMET
    bx = cx - math.cos(angle) * 7
    by = cy - math.sin(angle) * 3.6
    boot(frame, (bx, by), lift=3)
    put(frame, cx + 2, cy, GUN)
    put(frame, cx + 3, cy, GUN_HI)
    return outline(plant(frame))


def compose() -> list:
    sheet = [[CLEAR for _ in range(W * COLS)] for _ in range(H * ROWS)]

    def blit(frame: list, col: int, row: int) -> None:
        ox, oy = col * W, row * H
        for y in range(H):
            sheet[oy + y][ox : ox + W] = frame[y]

    for i in range(4):
        blit(soldier("stand", i), i, 0)
        blit(soldier("kneel", i), i, 1)
        blit(roll(i, 4), i, 4)
    for i, (side, dx, dy) in enumerate(AIM):
        blit(aim_pose(False, side, dx, dy), i, 6)
        blit(aim_pose(True, side, dx, dy), i, 7)
    for i in range(8):
        blit(soldier("walk", i), i, 2)
        blit(soldier("run", i), i, 3)
        blit(roll(i, 8), i, 5)
    return sheet


def png_bytes(width: int, height: int, rows: list[bytes]) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + row for row in rows)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + chunk(
        b"IDAT", zlib.compress(raw, 9)
    ) + chunk(b"IEND", b"")


def to_rows(pixels: list[list[tuple[int, int, int, int]]]) -> list[bytes]:
    return [b"".join(bytes(px) for px in row) for row in pixels]


def write_png(path: Path, pixels: list[list[tuple[int, int, int, int]]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png_bytes(len(pixels[0]), len(pixels), to_rows(pixels)))


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    write_png(root / "public" / "assets" / "soldier.png", compose())
    print(f"{W * COLS}x{H * ROWS}")


if __name__ == "__main__":
    main()
