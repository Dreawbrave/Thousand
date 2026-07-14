from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def split_sheet(source: Path, output: Path, names: list[str], columns: int = 4) -> None:
    sheet = Image.open(source).convert("RGBA")
    rows = (len(names) + columns - 1) // columns
    cell_width = sheet.width // columns
    cell_height = sheet.height // rows
    output.mkdir(parents=True, exist_ok=True)

    for index, name in enumerate(names):
        column = index % columns
        row = index // columns
        cell = sheet.crop(
            (
                column * cell_width,
                row * cell_height,
                (column + 1) * cell_width,
                (row + 1) * cell_height,
            )
        )
        alpha = cell.getchannel("A")
        bounds = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
        if bounds is None:
            raise ValueError(f"Sticker cell {name!r} is empty")
        sticker = cell.crop(bounds)
        sticker.thumbnail((448, 448), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        position = ((512 - sticker.width) // 2, (512 - sticker.height) // 2)
        canvas.alpha_composite(sticker, position)
        canvas.save(output / f"{name}.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Split a transparent sticker sheet into square PNG assets")
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("names", nargs="+")
    parser.add_argument("--columns", type=int, default=4)
    args = parser.parse_args()
    split_sheet(args.source, args.output, args.names, args.columns)


if __name__ == "__main__":
    main()
