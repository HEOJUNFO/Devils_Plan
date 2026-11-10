/**
 * Typing an answer in 네모 세기: what the keys a player presses do to the
 * number being typed. Kept apart from the screen so that it can be tested:
 * the screen only knows which keys came, and in which order.
 *
 * Keys are named as the browser names them (`KeyboardEvent.code`).
 */

/** What came of some keys. */
export interface Typed {
  /** The digits as they stand now. */
  typed: string;
  /** The answer as it stood when Enter was pressed, or `null` if it was not (or nothing was typed yet). */
  said: number | null;
}

/** The digit a key types, or `null` for any other key. */
function digitOf(code: string): string | null {
  return /^(?:Digit|Numpad)(\d)$/.exec(code)?.[1] ?? null;
}

/**
 * Applies `codes` to `typed`, in the order they were pressed. A slow frame
 * can hold several keys at once, and "1" then "0" must be ten, never one.
 *
 * A digit is added while there is room for it (`maxDigits`); a nought typed
 * first gives way to the digit after it. Backspace takes the last digit off.
 * Enter says the number as it stands, and whatever was pressed after it in
 * the same breath is left out: the answer has gone.
 */
export function typeAnswer(typed: string, codes: readonly string[], maxDigits: number): Typed {
  let now = typed;
  for (const code of codes) {
    const digit = digitOf(code);
    if (digit !== null) {
      if (now === "0") now = digit;
      else if (now.length < maxDigits) now += digit;
    } else if (code === "Backspace") {
      now = now.slice(0, -1);
    } else if ((code === "Enter" || code === "NumpadEnter") && now !== "") {
      return { typed: now, said: Number(now) };
    }
  }
  return { typed: now, said: null };
}

/**
 * The keys pressed after the one that buzzed, when a buzz and the start of
 * an answer come in the same frame: `null` when none of `codes` buzzes.
 */
export function afterBuzz(codes: readonly string[]): string[] | null {
  const at = codes.findIndex((code) => code === "Space" || code === "Enter" || code === "NumpadEnter");
  return at < 0 ? null : codes.slice(at + 1);
}
