/**
 * Cleaning of text that one player types and others are shown: nicknames and
 * chat lines.
 */

/**
 * Characters that do not belong in a line shown to others: control
 * characters, and the marks that flip the direction of the text around them
 * (they can make a line read as something its writer did not write).
 */
const UNWANTED = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩﻿]/gu;

/**
 * One clean line: unwanted characters and runs of whitespace each become one
 * space, and the ends are trimmed. May be empty.
 */
export function cleanLine(raw: string): string {
  return raw.replace(UNWANTED, " ").replace(/\s+/gu, " ").trim();
}

/** `text` cut to at most `max` characters, counting a character as a reader does, not by code unit. */
export function cutTo(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join("").trim();
}
