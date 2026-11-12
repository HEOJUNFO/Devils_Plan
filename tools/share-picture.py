"""Draws the pictures a shared link and a search result show for the site.

  public/og-ko.png, public/og-en.png   1200 by 630: the card a messenger or a
                                       social site draws for a link (og:image)
  public/icon-180.png                  the page's pixel mark as a file with an
                                       address, which a search result and a
                                       phone's home screen take it from

They are in public/ and not in assets/ because a link to them is written into
every page's head (src/shared/site/pages.ts) and has to stay the same from
build to build: what is in assets/ gets a new name whenever it changes.

The card names the games, from src/shared/games.json, in the game's own font
and colours. Its headline is the heading of the page about the games
(`home.heading` in src/shared/site/words.ts): keep the two the same. Run it
again when a game is added or renamed:

    python3 tools/share-picture.py

Needs Pillow and fontTools (pip install pillow fonttools brotli).
"""
import io
import json
import pathlib

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
GAMES = json.loads((ROOT / "src/shared/games.json").read_text(encoding="utf-8"))
ADDRESS = "play.brain-survival.workers.dev"
NAME = "brain-survival"

# The game's colours (src/client/style.css).
NIGHT, BAR, LINE = "#0d1020", "#0b0d19", "#2c3044"
BONE, BONE_DIM, AMBER, TEAL = "#efe6cc", "#a8a08a", "#ffb43c", "#3fd0b6"

# The headline in each language, on two lines: `home.heading` of src/shared/site/words.ts.
HEADLINES = {
    "ko": lambda games: ["친구와 실시간으로 하는", f"온라인 두뇌 게임 {games}종"],
    "en": lambda games: [f"{games} online brain games", "to play live with friends"],
}


def font_file() -> io.BytesIO:
    """The pixel font as Pillow reads it: the same outlines, out of their web wrapping."""
    font = TTFont(ROOT / "assets/fonts/Galmuri11.woff2")
    font.flavor = None
    plain = io.BytesIO()
    font.save(plain)
    return plain


PLAIN = font_file()


def face(size: int) -> ImageFont.FreeTypeFont:
    """The pixel font at `size`, a multiple of 12, the grid it is drawn on."""
    PLAIN.seek(0)
    return ImageFont.truetype(io.BytesIO(PLAIN.read()), size)


def mark(draw: ImageDraw.ImageDraw, x: int, y: int, unit: int) -> None:
    """The page's pixel mark, 12 units wide: a square, a hole in it, a dot in the hole."""
    draw.rectangle([x, y, x + 12 * unit - 1, y + 12 * unit - 1], fill=AMBER)
    draw.rectangle([x + 2 * unit, y + 2 * unit, x + 10 * unit - 1, y + 10 * unit - 1], fill=NIGHT)
    draw.rectangle([x + 5 * unit, y + 5 * unit, x + 7 * unit - 1, y + 7 * unit - 1], fill=AMBER)


def lines_of(draw: ImageDraw.ImageDraw, names: list[str], font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    """The games' names with a dot between, broken into lines no wider than `width`."""
    lines, line = [], ""
    for name in names:
        longer = f"{line} · {name}" if line else name
        if line and draw.textlength(longer, font=font) > width:
            lines.append(line)
            line = name
        else:
            line = longer
    return [*lines, line]


def card(lang: str) -> Image.Image:
    picture = Image.new("RGB", (1200, 630), NIGHT)
    draw = ImageDraw.Draw(picture)
    draw.fontmode = "1"  # whole pixels, as the game draws its letters
    draw.rectangle([24, 24, 1175, 605], outline=LINE, width=6)
    mark(draw, 84, 84, 6)
    draw.text((180, 96), NAME, font=face(48), fill=BONE)
    y = 216
    for line in HEADLINES[lang](len(GAMES)):
        draw.text((84, y), line, font=face(72), fill=AMBER)
        y += 96
    names = [game["title"][lang] for game in GAMES.values()]
    y = 444
    for line in lines_of(draw, names, face(36), 1032):
        draw.text((84, y), line, font=face(36), fill=BONE_DIM)
        y += 48
    address = face(24)
    # beside the name, where the games' names never reach however many lines they take
    draw.text((1116 - draw.textlength(ADDRESS, font=address), 114), ADDRESS, font=address, fill=TEAL)
    return picture


def icon() -> Image.Image:
    picture = Image.new("RGB", (180, 180), NIGHT)
    mark(ImageDraw.Draw(picture), 30, 30, 10)
    return picture


if __name__ == "__main__":
    public = ROOT / "public"
    for lang in HEADLINES:
        card(lang).save(public / f"og-{lang}.png", optimize=True)
    icon().save(public / "icon-180.png", optimize=True)
    for made in sorted(public.glob("*.png")):
        print(f"{made.relative_to(ROOT)}: {made.stat().st_size} bytes")
