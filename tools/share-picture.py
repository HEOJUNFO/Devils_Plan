"""Draws the pictures a shared link and a search result show for the site.

  public/og-ko.png, public/og-en.png   1200 by 630: the card a messenger or a
                                       social site draws for a link (og:image)
  public/invite-<lang>-<game>.png      1200 by 630: the card for a link that
                                       invites someone to a room of one game
                                       (the page such a link goes through:
                                       `inviteFiles` in src/shared/site/pages.ts)
  public/icon-180.png                  the page's pixel mark as a file with an
                                       address, which a search result and a
                                       phone's home screen take it from
  public/icon-192.png, icon-512.png,   the same mark at the sizes the page's
  public/icon-maskable-512.png         manifest names for a home screen
                                       (`manifest` in src/shared/site/pages.ts)

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

# What a game is called in an address where its id is not its name (`slugOf` in src/shared/site/paths.ts): keep the two the same.
SLUGS = {"under-thirteen": "heavy-13"}

# On a card that invites to one game, under what the game is about: who it is for, and what to do.
INVITES = {
    "ko": lambda low, high: f"{low}~{high}명 · 링크를 열면 방으로 들어갑니다",
    "en": lambda low, high: f"{low}–{high} players · open the link to join the room",
}

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


def wrapped(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    """`text` broken between words into lines no wider than `width`."""
    lines, line = [], ""
    for word in text.split(" "):
        longer = f"{line} {word}" if line else word
        if line and draw.textlength(longer, font=font) > width:
            lines.append(line)
            line = word
        else:
            line = longer
    return [*lines, line]


def invite(lang: str, game: dict) -> Image.Image:
    """The card for a link that invites to a room of `game`: its name, what it is about, how many play."""
    picture = Image.new("RGB", (1200, 630), NIGHT)
    draw = ImageDraw.Draw(picture)
    draw.fontmode = "1"
    draw.rectangle([24, 24, 1175, 605], outline=LINE, width=6)
    mark(draw, 84, 84, 6)
    draw.text((180, 96), NAME, font=face(48), fill=BONE)
    address = face(24)
    draw.text((1116 - draw.textlength(ADDRESS, font=address), 114), ADDRESS, font=address, fill=TEAL)
    # the name as large as fits on one line
    title = game["title"][lang]
    size = next(size for size in (120, 96, 72) if draw.textlength(title, font=face(size)) <= 1032 or size == 72)
    draw.text((84, 216), title, font=face(size), fill=AMBER)
    y = 216 + size + 36
    for line in wrapped(draw, game["summary"][lang], face(36), 1032):
        draw.text((84, y), line, font=face(36), fill=BONE)
        y += 48
    draw.text((84, 528), INVITES[lang](game["minPlayers"], game["maxPlayers"]), font=face(36), fill=BONE_DIM)
    return picture


def icon(size: int = 180, unit: int = 10) -> Image.Image:
    """The pixel mark in the middle of a square of `size`, each of its 12 units `unit` wide."""
    picture = Image.new("RGB", (size, size), NIGHT)
    edge = (size - 12 * unit) // 2
    mark(ImageDraw.Draw(picture), edge, edge, unit)
    return picture


if __name__ == "__main__":
    public = ROOT / "public"
    for lang in HEADLINES:
        card(lang).save(public / f"og-{lang}.png", optimize=True)
        for game_id, game in GAMES.items():
            invite(lang, game).save(public / f"invite-{lang}-{SLUGS.get(game_id, game_id)}.png", optimize=True)
    icon().save(public / "icon-180.png", optimize=True)
    # what a phone's home screen shows (the manifest of src/shared/site/pages.ts). A phone cuts the last to its
    # own shape, a circle at the least, and keeps the middle four fifths: the mark is smaller there, corners inside.
    icon(192, 12).save(public / "icon-192.png", optimize=True)
    icon(512, 32).save(public / "icon-512.png", optimize=True)
    icon(512, 24).save(public / "icon-maskable-512.png", optimize=True)
    for made in sorted(public.glob("*.png")):
        print(f"{made.relative_to(ROOT)}: {made.stat().st_size} bytes")
