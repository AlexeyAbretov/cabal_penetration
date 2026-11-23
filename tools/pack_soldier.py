"""Лист солдата из роликов public/assets/character.

Кадр листа 32×48. Ролик нарисован на холсте 48×48 и ниже прежней стойки.
Фигура увеличивается ближайшим пикселем. Прежняя стойка была 44 пикселя
от макушки до ступни. Берём 43: на 44 широкий шаг бега уже не входит
в 32 пикселя клетки и срезается. Это не двойной рост.

Шаг, бег, стойка и колено сажаются на одну землю ролика и на середину
холста, чтобы тело не прыгало между кадрами. Перекат сажает каждый кадр
своей нижней точкой и по центру клетки: в ролике тело гуляет по холсту.

Ряды веера и длинного кувырка пустые. Игра их не крутит.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

CELL_W = 32
CELL_H = 48
COLS = 8
ROWS = 8
SRC = 48
# Прежняя стойка была 44. На 44 бег шире клетки, поэтому стойка здесь 43.
STAND_INK = 43

# Файл, ряд листа, сколько кадров, сажать ли кадр отдельно.
CLIPS = (
    ("idle.gif", 0, 4, False),
    ("knee_idle.gif", 1, 4, False),
    ("walking.gif", 2, 8, False),
    ("running.gif", 3, 8, False),
    ("rolling.gif", 4, 6, True),
)


def load_frames(path: Path) -> list[Image.Image]:
    image = Image.open(path)
    frames: list[Image.Image] = []
    for index in range(image.n_frames):
        image.seek(index)
        frames.append(image.convert("RGBA"))
    return frames


def ink_height(frame: Image.Image) -> int:
    box = frame.getbbox()
    if box is None:
        raise SystemExit("пустой кадр")
    return box[3] - box[1]


def enlarge(frame: Image.Image, scale: float) -> Image.Image:
    if frame.size != (SRC, SRC):
        raise SystemExit(f"холст {frame.size}, нужен {SRC}×{SRC}")
    size = (round(SRC * scale), round(SRC * scale))
    return frame.resize(size, Image.Resampling.NEAREST)


def bottom_row(frame: Image.Image) -> int:
    box = frame.getbbox()
    if box is None:
        raise SystemExit("пустой кадр")
    return box[3] - 1


def window_x(frame: Image.Image, own: bool) -> int:
    if not own:
        return round(frame.width / 2 - CELL_W / 2)
    box = frame.getbbox()
    if box is None:
        raise SystemExit("пустой кадр")
    width = box[2] - box[0]
    if width >= CELL_W:
        return box[0] + (width - CELL_W) // 2
    return box[0] - (CELL_W - width) // 2


def place(frame: Image.Image, shift: int, x0: int) -> Image.Image:
    box = frame.getbbox()
    if box is None:
        raise SystemExit("пустой кадр")
    if box[1] + shift < 0:
        raise SystemExit("сдвиг срезает макушку")
    if box[3] - 1 + shift > CELL_H - 1:
        raise SystemExit("сдвиг срезает ступню")
    cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    cell.paste(frame, (-x0, shift), frame)
    return cell


def pack(root: Path) -> Image.Image:
    folder = root / "public" / "assets" / "character"
    idle = load_frames(folder / "idle.gif")
    scale = STAND_INK / ink_height(idle[0])
    print(f"масштаб {scale:.4f}, стойка {ink_height(idle[0])} -> {STAND_INK}")
    sheet = Image.new("RGBA", (CELL_W * COLS, CELL_H * ROWS), (0, 0, 0, 0))
    for name, row, count, own_ground in CLIPS:
        frames = [enlarge(frame, scale) for frame in load_frames(folder / name)]
        if len(frames) != count:
            raise SystemExit(f"{name}: кадров {len(frames)}, в листе {count}")
        bottoms = [bottom_row(frame) for frame in frames]
        shared = (CELL_H - 1) - max(bottoms)
        for index, frame in enumerate(frames):
            shift = (CELL_H - 1) - bottoms[index] if own_ground else shared
            x0 = window_x(frame, own_ground)
            cell = place(frame, shift, x0)
            box = cell.getbbox()
            print(f"  {name} {index}: {box}")
            sheet.paste(cell, (index * CELL_W, row * CELL_H), cell)
    return sheet


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    sheet = pack(root)
    out = root / "public" / "assets" / "soldier.png"
    sheet.save(out)
    print(f"{sheet.size[0]}x{sheet.size[1]} -> {out}")


if __name__ == "__main__":
    main()
