/**
 * A game's rules as the page shows them before a game, on the sheet the bar's
 * button opens. Each game writes its own, in each language, in its `words.ts`.
 */
export interface RulesSheet {
  /** The line at the top: the game's name, and that these are its rules. */
  title: string;
  /** What follows, in order: a paragraph, or a list of points. */
  parts: readonly (string | readonly string[])[];
}

/**
 * A line of the rules a game's screen draws over itself during a game (H):
 * plain, the colour of a heading (the first line and the last), dimmer for
 * what is said aside, or marked out from the rest. The screen holds 16 lines
 * of 436 pixels.
 */
export interface HelpLine {
  text: string;
  tone?: "title" | "dim" | "mark";
}
