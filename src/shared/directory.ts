/**
 * The list of rooms a player sees before joining one: what players call the
 * lobby. (`lobby.ts` is older and narrower than its name: it is the roster of
 * one room.)
 *
 * Rooms that are open to anyone tell the directory how they stand; the
 * directory keeps one entry per room and hands the list to everyone looking at
 * it. Pure functions over plain data, so the same code is unit-tested directly
 * and run inside the directory's Durable Object.
 */
import { GAMES, isGameId, type GameId } from "./games";
import { gameOf, isValidRoomCode, normalizeNick, type LobbyState, type RoomConfig } from "./lobby";

/** Tunable values of the list. Loaded from `directory-config.json`. */
export interface DirectoryConfig {
  /** The most rooms the list shows. */
  maxListed: number;
  /** Hours an entry is kept without news from its room, in case the room's last word was lost. */
  staleHours: number;
}

/** A room as the list shows it. Nothing here is secret. */
export interface RoomListing {
  code: string;
  /** The game the room was made for. */
  game: GameId;
  /** The nickname of the host. */
  host: string;
  /** Players connected now. */
  players: number;
  /** The most players a game in the room can have. */
  maxPlayers: number;
  /** Whether a game is being played; someone who joins now watches until the next one. */
  playing: boolean;
}

/** What the directory stores for a room: its listing and when it last heard from it. */
export interface DirectoryEntry {
  listing: RoomListing;
  /** Milliseconds since the epoch. */
  updatedAt: number;
}

/** What a room tells the directory: how to list it, or `null` to take it off the list. */
export interface RoomReport {
  code: string;
  listing: RoomListing | null;
}

/**
 * How a room should be listed, or `null` when it should not be: it is reached
 * by its code alone, or nobody is connected. The host is the connected player
 * in the lowest slot, as in the room itself.
 */
export function listingOf(
  code: string,
  lobby: LobbyState,
  connectedSlots: ReadonlySet<number>,
  playing: boolean,
  config: RoomConfig,
): RoomListing | null {
  if (lobby.listed !== true) return null;
  const connected = lobby.players.filter((p) => connectedSlots.has(p.slot));
  if (connected.length === 0) return null;
  const host = connected.reduce((lowest, p) => (p.slot < lowest.slot ? p : lowest));
  const game = gameOf(lobby);
  return {
    code,
    game,
    host: host.nick,
    players: connected.length,
    maxPlayers: Math.min(config.maxPlayers, GAMES[game].maxPlayers),
    playing,
  };
}

/**
 * Checks a report, returning `null` for anything malformed. The directory
 * shows these values to everyone, so nothing is taken on trust: a room code
 * must be well-formed, the name is cleaned like any nickname, and the counts
 * must be whole numbers that make sense together.
 */
export function parseReport(raw: unknown, config: RoomConfig): RoomReport | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.code !== "string" || !isValidRoomCode(data.code, config)) return null;
  if (data.listing === null) return { code: data.code, listing: null };
  if (typeof data.listing !== "object" || data.listing === undefined) return null;
  const listing = data.listing as Record<string, unknown>;
  if (listing.code !== data.code) return null;
  if (!isGameId(listing.game)) return null;
  if (typeof listing.host !== "string") return null;
  const host = normalizeNick(listing.host, config);
  if (host === null) return null;
  const players = listing.players;
  const maxPlayers = listing.maxPlayers;
  if (typeof players !== "number" || !Number.isInteger(players)) return null;
  if (typeof maxPlayers !== "number" || !Number.isInteger(maxPlayers)) return null;
  if (maxPlayers < 1 || maxPlayers > config.maxPlayers || players < 1 || players > maxPlayers) return null;
  if (typeof listing.playing !== "boolean") return null;
  return {
    code: data.code,
    listing: { code: data.code, game: listing.game, host, players, maxPlayers, playing: listing.playing },
  };
}

/** Whether an entry last heard from at `updatedAt` is too old to show at `now`. */
export function isStale(updatedAt: number, now: number, config: DirectoryConfig): boolean {
  return now - updatedAt > config.staleHours * 3_600_000;
}

/**
 * The rooms to show, best to join first: rooms waiting for players before
 * rooms in a game, a room with a free place before a full one, then the
 * fullest (it starts soonest), then the one heard from most recently. Entries
 * too old to trust are left out, and the list is cut to the configured length.
 */
export function listRooms(entries: readonly DirectoryEntry[], now: number, config: DirectoryConfig): RoomListing[] {
  const rank = (listing: RoomListing): number => (listing.playing ? 2 : 0) + (listing.players >= listing.maxPlayers ? 1 : 0);
  return entries
    .filter((entry) => !isStale(entry.updatedAt, now, config))
    .sort(
      (a, b) =>
        rank(a.listing) - rank(b.listing) ||
        b.listing.players - a.listing.players ||
        b.updatedAt - a.updatedAt ||
        (a.listing.code < b.listing.code ? -1 : 1),
    )
    .slice(0, config.maxListed)
    .map((entry) => entry.listing);
}
