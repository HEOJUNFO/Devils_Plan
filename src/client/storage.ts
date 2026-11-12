/**
 * Where this page keeps what it remembers in the browser: the player's token
 * and nickname, the choices last made, the language.
 *
 * `?profile=<name>` gives a tab its own set, so several tabs of one browser
 * can act as several players.
 */
// The build reads the games' words as well, to write the pages a search engine reads (`vite.config.ts`): no address there.
const profile = typeof location === "undefined" ? "" : (new URLSearchParams(location.search).get("profile") ?? "");

/** The key `name` is kept under; the project's name leads it (CLAUDE.md, Project Rules). */
export function storageKey(name: string): string {
  return `brain-survival.${name}${profile ? `.${profile}` : ""}`;
}
