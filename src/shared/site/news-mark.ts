/**
 * Whether the page of what changed lately (`news-words.ts`) has lines a
 * player has not read: what puts a mark by the build's number in the lobby,
 * the link that leads to that page (`src/client/main.ts`).
 *
 * The game's script does not carry the page's lines, so it cannot count them.
 * The build does, and tells the script the mark of the newest (`__NEWS__`,
 * `vite.config.ts`). A browser keeps the mark of the page as its player last
 * went to read it, and one that differs is news.
 *
 * It follows the page and not the build: a build that changes nothing a
 * player would notice adds no line, and a mark by it would lead to a page
 * that reads as it did.
 */

/** Put in by the build: the mark of the news the build was made with. Not there in a test. */
declare const __NEWS__: string | undefined;

/** The mark of the news this code was built with, or `""` where the build did not say. */
export const NEWS_MARK: string = typeof __NEWS__ === "string" ? __NEWS__ : "";

/**
 * The mark of a page of news whose days are `days`, newest first: its newest
 * day and how many lines that day has. A line added under today, or a new
 * day, changes it; a day long past taken off the page does not.
 */
export function newsMark(days: readonly { date: string; lines: readonly unknown[] }[]): string {
  const newest = days[0];
  return newest === undefined ? "" : `${newest.date}#${newest.lines.length}`;
}

/**
 * Whether the news of mark `mark` is unread by a player whose browser keeps
 * `read` as the mark last read (`null`: none kept).
 *
 * A browser that keeps none is either someone new, to whom the whole site is
 * new and a mark would say nothing, or someone who played before the mark
 * was kept (`returning`), who has not read what came since. Where the build
 * gave no mark there is nothing to compare, and no mark is shown.
 */
export function unreadNews(mark: string, read: string | null, returning: boolean): boolean {
  if (mark === "") return false;
  return read === null ? returning : read !== mark;
}
