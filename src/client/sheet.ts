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
