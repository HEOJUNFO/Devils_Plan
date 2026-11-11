"""Makes the small file of the pixel font that a first visit waits for.

The whole font (assets/fonts/Galmuri11.woff2, about 500 KB) has 21,000
glyphs: every Hangul syllable there is, Chinese characters and kana. A page
that waits for all of it shows no word for seconds on a phone. This writes
assets/fonts/Galmuri11-common.woff2 with the letters nearly every line is
written with:

  - every character in the page's own sources (src/, index.html), so no
    sentence of the game itself ever needs the whole font
  - the 2,350 Hangul syllables of KS X 1001, which is what Korean is
    ordinarily written with, and the single consonants and vowels people
    type in chat
  - Latin letters, digits, and the signs and shapes of ordinary typing

A line with a letter this file lacks (a rare syllable in a nickname, a
Chinese character) is drawn with the whole font, which the page fetches only
then (src/client/style.css).

Run it again when a sentence gains a character the file does not have yet;
it says so when that is the case:

    python3 tools/subset-font.py          # writes the file
    python3 tools/subset-font.py --check  # only says whether it is up to date

Needs fontTools and brotli (pip install fonttools brotli). The font is under
the SIL Open Font License 1.1 (assets/fonts/Galmuri11-LICENSE.txt), which
allows a cut-down copy; its copyright and licence names are kept in the file.
"""
import pathlib
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
WHOLE = ROOT / "assets/fonts/Galmuri11.woff2"
COMMON = ROOT / "assets/fonts/Galmuri11-common.woff2"

# Where the page's own sentences are.
SOURCES = [ROOT / "index.html", *sorted((ROOT / "src").rglob("*.ts")), *sorted((ROOT / "src").rglob("*.json")), *sorted((ROOT / "src").rglob("*.css"))]

# Ordinary typing, as ranges of code points (both ends included).
RANGES = [
    (0x0020, 0x007E),  # Latin letters, digits, signs
    (0x00A0, 0x00FF),  # Latin-1: accented letters, × ÷ ± · °
    (0x2010, 0x2027),  # dashes, quotes, bullets, the ellipsis
    (0x2030, 0x203E),  # per mille, primes, the reference mark
    (0x20A9, 0x20A9),  # the won sign
    (0x20AC, 0x20AC),  # the euro sign
    (0x2190, 0x2199),  # arrows
    (0x2260, 0x2265),  # not equal, at most, at least
    (0x25A0, 0x25FF),  # squares, circles, triangles
    (0x2605, 0x2606),  # stars
    (0x2660, 0x266F),  # suits of cards, notes
    (0x2713, 0x2717),  # ticks and crosses
    (0x3000, 0x3015),  # the wide space and East Asian brackets and stops
    (0x3131, 0x318E),  # single Hangul consonants and vowels
    (0xFF01, 0xFF5E),  # wide forms of the Latin signs
    (0xFFE6, 0xFFE6),  # the wide won sign
]


def ks_x_1001() -> set[int]:
    """The 2,350 Hangul syllables of KS X 1001: rows 0xB0 to 0xC8 of EUC-KR."""
    found = set()
    for lead in range(0xB0, 0xC9):
        for trail in range(0xA1, 0xFF):
            found.add(ord(bytes([lead, trail]).decode("euc_kr")))
    return found


def wanted() -> set[int]:
    """Every code point the small file is to have, whether the font has it or not."""
    points = ks_x_1001()
    for first, last in RANGES:
        points.update(range(first, last + 1))
    for source in SOURCES:
        points.update(ord(char) for char in source.read_text(encoding="utf-8") if ord(char) >= 0x20)
    return points


def main() -> int:
    whole = TTFont(WHOLE)
    has = set(whole.getBestCmap())
    points = wanted() & has
    if "--check" in sys.argv:
        there = set(TTFont(COMMON).getBestCmap()) if COMMON.exists() else set()
        missing = sorted(points - there)
        if missing:
            print(f"{COMMON.name} lacks {len(missing)} characters the sources or the lists ask for: {''.join(chr(point) for point in missing[:40])}")
            print("run: python3 tools/subset-font.py")
            return 1
        print(f"{COMMON.name} is up to date: {len(there)} characters")
        return 0

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    # the copyright and the licence stay in the file
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    font = subset.load_font(str(WHOLE), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=sorted(points))
    subsetter.subset(font)
    subset.save_font(font, str(COMMON), options)
    kept = len(TTFont(COMMON).getBestCmap())
    print(f"{COMMON.name}: {kept} characters of the font's {len(has)}, {COMMON.stat().st_size:,} bytes (the whole font: {WHOLE.stat().st_size:,})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
