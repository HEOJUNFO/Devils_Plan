/**
 * Where this page keeps what it remembers in the browser: the player's token
 * and nickname, the choices last made, the language.
 *
 * `?profile=<name>` gives a tab its own set, so several tabs of one browser
 * can act as several players.
 */
const profile = new URLSearchParams(location.search).get("profile") ?? "";

/** The key `name` is kept under; the Worker's name leads it (CLAUDE.md, Project Rules). */
export function storageKey(name: string): string {
  return `game-plan.${name}${profile ? `.${profile}` : ""}`;
}
