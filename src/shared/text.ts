/**
 * Cleaning of text that one player types and others are shown: nicknames and
 * chat lines. And, at the end, the laying of a line's parts in rows.
 *
 * The characters dealt with here are ones that cannot be seen, so none of
 * them is written in this file: each is named by its number.
 */

/** The characters from `from` to `to`, as they go inside a regular expression's character class. */
function span(from: number, to: number = from): string {
  return from === to ? String.fromCodePoint(from) : `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`;
}

/**
 * Characters that do not belong in a line shown to others: control
 * characters, the marks that set or flip the direction of the text around
 * them (they can make a line read as something its writer did not write), and
 * characters that take up room and show nothing (fillers, blanks, soft
 * hyphens), which would otherwise pass for a name.
 */
const UNWANTED = new RegExp(
  `[${[
    span(0x0000, 0x001f), // controls
    span(0x007f, 0x009f), // delete and more controls
    span(0x00ad), // soft hyphen
    span(0x061c), // Arabic letter mark
    span(0x115f, 0x1160), // Hangul fillers
    span(0x180e), // Mongolian vowel separator
    span(0x200b), // zero width space
    span(0x200e, 0x200f), // left-to-right and right-to-left marks
    span(0x202a, 0x202e), // direction embeddings and overrides
    span(0x2060, 0x2064), // word joiner and invisible operators
    span(0x2066, 0x2069), // direction isolates
    span(0x2800), // blank Braille pattern
    span(0x3164), // Hangul filler
    span(0xfeff), // byte order mark
    span(0xffa0), // halfwidth Hangul filler
    span(0xfff9, 0xfffb), // interlinear annotation marks
  ].join("")}]`,
  "gu",
);

/**
 * Characters kept because they join or style their neighbours (the joiners
 * inside an emoji, the selectors after one), but which show nothing alone.
 */
const SHOWS_NOTHING_ALONE = new RegExp(`[\\s${span(0x200c, 0x200d)}${span(0xfe00, 0xfe0f)}]`, "gu");

/**
 * One clean line: unwanted characters and runs of whitespace each become one
 * space, and the ends are trimmed. Empty when nothing in it would show.
 */
export function cleanLine(raw: string): string {
  const line = raw.replace(UNWANTED, " ").replace(/\s+/gu, " ").trim();
  return line.replace(SHOWS_NOTHING_ALONE, "") === "" ? "" : line;
}

/** `text` cut to at most `max` characters, counting a character as a reader does, not by code unit. */
export function cutTo(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join("").trim();
}

/**
 * `parts` laid out in rows no wider than `max`, the parts of a row joined by
 * `joint`: a part goes on the row in hand while the row still fits, and
 * starts the next row when it would not. A row is broken nowhere else, so a
 * part wider than `max` has a row of its own, whole; what is done with such a
 * row is the caller's to say. `width` says how wide a piece of text is: the
 * screen that draws the rows knows, and this does not.
 */
export function rowsOf(parts: readonly string[], joint: string, max: number, width: (text: string) => number): string[] {
  const rows: string[] = [];
  for (const part of parts) {
    const last = rows.length - 1;
    const longer = last < 0 ? part : `${rows[last]}${joint}${part}`;
    if (last >= 0 && width(longer) <= max) rows[last] = longer;
    else rows.push(part);
  }
  return rows;
}
