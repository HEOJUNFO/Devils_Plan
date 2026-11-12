/**
 * Putting a room back on the screen when its page is loaded again.
 *
 * A page that is loaded again in a room has to open a new connection and ask
 * to come back in before the room tells it anything: far from the server that
 * is more than a second (1.3 to 1.6 s on the deployed address from Korea,
 * 2026-11-12, of which opening the connection is 1.0 to 1.25), and it used to
 * be a second of the lobby, as if the room had been left. So a page
 * that is put away keeps what its room last sent it, and the page that takes
 * its place shows that at once, marked as on its way back, until the room
 * answers and says how things stand now.
 *
 * What is kept is what the room sent this player and nothing more: its own
 * messages, as text. Pure functions over plain values: the page reads and
 * writes its store and does what {@link keptRoom} says.
 */
import { isGameId } from "./games";
import { parseServerMessage, type ServerMessage } from "./protocol";

/** The room's word on who is in it, as it was sent. */
export type LobbyMessage = Extract<ServerMessage, { type: "lobby" }>;
/** The room's word on its game, as it was sent to this player. */
export type GameMessage = Extract<ServerMessage, { type: "game" }>;

/** What a page shows of its room when it is loaded again. */
export interface KeptRoom {
  /** The waiting room as it stood. */
  lobby: LobbyMessage;
  /** The game that was on the screen, its results included; `null` when the waiting room was. */
  game: GameMessage | null;
  /** When that was last known to be so, in ms since the epoch. */
  at: number;
}

/**
 * What a page puts away of the room `code`: the room's last word on the
 * waiting room and, when a game was on the screen, on the game, both as they
 * were sent, and when (`at`, in ms since the epoch) they were last known to
 * be so.
 */
export function keepRoom(code: string, lobby: string, game: string | null, at: number): string {
  return JSON.stringify({ code, at, lobby, game });
}

/**
 * What to show of the room `code` from what was put away, or `null` to show
 * nothing of it: nothing was kept, it was kept of another room, it is not
 * what this page would have kept (an older page's, or not ours at all), or it
 * is older than `maxAgeSeconds` at `now`. A room gives up the place of a
 * player who has been away that long, so by then it is not this player's room
 * to be shown.
 *
 * A game this page has not heard of is left out and the waiting room shown.
 */
export function keptRoom(stored: string | null, code: string, now: number, maxAgeSeconds: number): KeptRoom | null {
  if (stored === null) return null;
  let kept: unknown;
  try {
    kept = JSON.parse(stored);
  } catch {
    return null;
  }
  if (typeof kept !== "object" || kept === null) return null;
  const { code: of, at, lobby: lobbyText, game: gameText } = kept as Record<string, unknown>;
  if (of !== code || typeof at !== "number" || !Number.isFinite(at)) return null;
  // a time ahead of now is a clock that was moved: how old it is cannot be told
  if (at > now || now - at > maxAgeSeconds * 1000) return null;

  const lobby = parseServerMessage(lobbyText);
  if (lobby === null || lobby.type !== "lobby" || lobby.room !== code) return null;
  if (!Number.isInteger(lobby.you) || !Array.isArray(lobby.players) || !isGameId(lobby.game)) return null;

  const game = gameText === null ? null : parseServerMessage(gameText);
  const shown =
    game !== null &&
    game.type === "game" &&
    game.room === code &&
    isGameId(game.game) &&
    typeof game.startedAt === "number" &&
    typeof game.view === "object" &&
    game.view !== null
      ? game
      : null;
  return { lobby, game: shown, at };
}
