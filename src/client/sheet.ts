/**
 * A game's rules in three lines, for someone who has a minute before the
 * game starts: enough to sit down to it, with the sheet under them for the
 * rest. Each is a sentence of the sheet said shorter, never a rule the sheet
 * does not have. Each is one line of the sheet (379 pixels beside the Korean
 * labels, 392 beside the English: about 30 Korean characters, 58 Latin ones);
 * a new one is measured on the sheet, in both languages.
 */
export interface RulesBrief {
  /** What a player is after. */
  goal: string;
  /** What a player does, on their turn or all at once. */
  play: string;
  /** When the game is over, and who then comes out ahead. */
  end: string;
}

/**
 * A game's rules as the page shows them before a game, on the sheet the bar's
 * button opens. Each game writes its own, in each language, in its `words.ts`.
 */
export interface RulesSheet {
  /** The line at the top: the game's name, and that these are its rules. */
  title: string;
  /** The rules in three lines, read before the rest. */
  brief: RulesBrief;
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
