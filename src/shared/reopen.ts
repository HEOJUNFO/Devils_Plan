/**
 * A room opened again under the code it had. A link to a room is what a
 * group of friends keeps (pinned in a chat), and a room is gone once its
 * last player leaves: the link then led to "that room has closed". Now
 * whoever comes by it first can make the room again under the same code,
 * so the link they all have leads to it once more; they are its host, as
 * of any room they make.
 *
 * The room's server needs nothing for this: a code whose room is gone is
 * free to make a room under (`src/server/room.ts`, `handleJoin`). What is
 * here is what the page does when the making is refused.
 */

/**
 * What the page does next when a room it asked to make was refused:
 *
 * - `another-code`: make it under a fresh code. The code was picked at random
 *   and happened to be in use.
 * - `join`: go into the room that is there. The room was being opened again
 *   under its old code and someone else did so first: theirs is the room
 *   the link leads to now.
 * - `tell`: say that it was refused.
 */
export type AfterRefusal = "another-code" | "join" | "tell";

/**
 * What to do after a room asked for was refused for `reason`. `reopening`:
 * the room was being opened again under the code of a link. `attemptsLeft`:
 * how many more fresh codes may be tried.
 */
export function afterRefusedMake(reason: string, reopening: boolean, attemptsLeft: number): AfterRefusal {
  if (reason !== "code-taken") return "tell";
  if (reopening) return "join";
  return attemptsLeft > 0 ? "another-code" : "tell";
}
