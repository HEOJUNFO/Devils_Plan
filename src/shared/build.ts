/**
 * Which build this code is from, and when a page is from an older one than
 * the server it talks to.
 *
 * A deploy ends every connection and tells nobody, and a page that was open
 * connects again by itself, to rooms run by code newer than its own. The room
 * and the list of rooms say which build they are (`ServerMessage`,
 * `DirectoryMessage`), and a page that hears another than its own loads
 * itself again when nothing would be lost by it (`src/client/main.ts`).
 */

/** Put in by the build: the commit it was made from (`vite.config.ts`). Not there in a test. */
declare const __BUILD__: string | undefined;

/** The build this code is from: the first letters of its commit, or `dev` while developing and in a test. */
export const BUILD: string = typeof __BUILD__ === "string" && __BUILD__ !== "" ? __BUILD__ : "dev";

/**
 * Whether a page of build `mine` should load itself again, having heard that
 * the server is of build `servers`.
 *
 * Not when the server says nothing of its build (one from before builds were
 * said). And not when the page was last loaded again from this very build
 * (`reloadedFrom`): loading again brought the same page, and doing it once
 * more would bring it again, without end.
 */
export function outOfDate(mine: string, servers: unknown, reloadedFrom: string | null): boolean {
  if (typeof servers !== "string" || servers === "") return false;
  return servers !== mine && reloadedFrom !== mine;
}
