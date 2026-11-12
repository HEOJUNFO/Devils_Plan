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
import type { FeedbackConfig } from "./feedback";
import { GAME_IDS, isGameId, type GameId } from "./games";
import {
  capacityOf,
  gameOf,
  hostOf,
  isValidRoomCode,
  normalizeNick,
  type LobbyState,
  type MessageLimit,
  type RoomConfig,
} from "./lobby";

/** Tunable values of the list. Loaded from `directory-config.json`. */
export interface DirectoryConfig {
  /** The most rooms the list shows at once: of every game, or of the one game a viewer picked. */
  maxListed: number;
  /** The most rooms the directory keeps; past this the one heard from longest ago is dropped. */
  maxStored: number;
  /** Hours an entry is kept without news from its room, in case the room's last word was lost. */
  staleHours: number;
  /**
   * How often one viewer may ask for the rooms of another game. Far above
   * what a page sends by itself (one for each game picked); the limit is for
   * a page that is not ours.
   */
  showLimit: MessageLimit;
  /** A word about the game, sent through the directory: how long, and how many (`feedback.ts`). */
  feedback: FeedbackConfig;
  /**
   * How many rooms one network address may make: each entry so many within
   * its window, and all of them hold at once (a few in a minute, and a good
   * many more in an hour). Making a room is the dearest thing a stranger can
   * ask of the game, and a script that makes them without end would use up
   * what the whole game has for a day. An address is not a person (a
   * household, a school, a phone network), so each is set well above what
   * people behind one address do; the smoke check makes nine in a run.
   */
  makeLimits: readonly MessageLimit[];
}

/** How many rooms of each game there are to join. A game with none is left out. */
export type RoomCounts = Partial<Record<GameId, number>>;

/** A room as the list shows it. Nothing here is secret. */
export interface RoomListing {
  code: string;
  /** The game the room was made for. */
  game: GameId;
  /** The nickname of the host. */
  host: string;
  /** Players connected now. */
  players: number;
  /** How many players the room holds: no more than a game of its game takes. */
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
 * by its code alone, or nobody is connected. The host is the room's own:
 * of the players connected, the one who came in first.
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
  const host = hostOf(lobby, connectedSlots);
  if (host === undefined) return null;
  const game = gameOf(lobby);
  return {
    code,
    game,
    host: host.nick,
    players: connected.length,
    maxPlayers: capacityOf(game, config),
    playing,
  };
}

/**
 * Checks a report, returning `null` for anything malformed. The directory
 * shows these values to everyone, so nothing is taken on trust: a room code
 * must be well-formed, the name is cleaned like any nickname, and the counts
 * must be whole numbers that make sense together and with the room's game.
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
  if (maxPlayers < 1 || maxPlayers > capacityOf(listing.game, config) || players < 1 || players > maxPlayers) return null;
  if (typeof listing.playing !== "boolean") return null;
  return {
    code: data.code,
    listing: { code: data.code, game: listing.game, host, players, maxPlayers, playing: listing.playing },
  };
}

/**
 * Whether one more room may be made at `now` from an address that made rooms
 * at the times `madeAt` (ms since the epoch): under every one of `limits`, a
 * room counting against a limit until that limit's window has passed since it
 * was made. A room said to be made after `now` counts: the clock was set back.
 */
export function mayMakeAnother(madeAt: readonly number[], now: number, limits: readonly MessageLimit[]): boolean {
  return limits.every((limit) => madeAt.filter((at) => at > now - limit.windowSeconds * 1000).length < limit.burst);
}

/** How long a room made has to be remembered for `limits` to be kept, in ms: the longest of their windows. */
export function makeMemoryMs(limits: readonly MessageLimit[]): number {
  return Math.max(0, ...limits.map((limit) => limit.windowSeconds * 1000));
}

/**
 * The codes of the rooms to drop so that no more than `config.maxStored`
 * entries are kept: those heard from longest ago. Empty when within the limit.
 */
export function beyondLimit(entries: ReadonlyMap<string, DirectoryEntry>, config: DirectoryConfig): string[] {
  const over = entries.size - config.maxStored;
  if (over <= 0) return [];
  return [...entries]
    .sort((a, b) => a[1].updatedAt - b[1].updatedAt || (a[0] < b[0] ? -1 : 1))
    .slice(0, over)
    .map(([code]) => code);
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
 *
 * With a `game`, only the rooms of that game, cut to the same length: so a
 * room the list of every game has no room for is still found by its game.
 */
export function listRooms(
  entries: readonly DirectoryEntry[],
  now: number,
  config: DirectoryConfig,
  game: GameId | null = null,
): RoomListing[] {
  const rank = (listing: RoomListing): number => (listing.playing ? 2 : 0) + (listing.players >= listing.maxPlayers ? 1 : 0);
  return entries
    .filter((entry) => !isStale(entry.updatedAt, now, config) && (game === null || entry.listing.game === game))
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

/**
 * How many rooms of each game there are to join, whether or not the list has
 * room to show them. Entries too old to trust are not counted.
 */
export function countRooms(entries: readonly DirectoryEntry[], now: number, config: DirectoryConfig): RoomCounts {
  const counts: RoomCounts = {};
  for (const entry of entries) {
    if (isStale(entry.updatedAt, now, config)) continue;
    counts[entry.listing.game] = (counts[entry.listing.game] ?? 0) + 1;
  }
  return counts;
}

/**
 * The rooms to try for someone who asks to be put straight into one, best
 * first: of `rooms`, those waiting for players with a place free, in the
 * order the list has them (the fullest first: it starts soonest). A room in a
 * game is not among them: whoever goes in only watches until it ends.
 */
export function quickPicks(rooms: readonly RoomListing[]): string[] {
  return rooms.filter((room) => !room.playing && room.players < room.maxPlayers).map((room) => room.code);
}

/** What the lobby shows of the list it was sent. */
export interface RoomsShown {
  /** The rows, in the order sent. */
  rooms: RoomListing[];
  /** How many rooms of each game there are. */
  counts: Record<GameId, number>;
  /** How many rooms there are of the game picked, or of every game. */
  total: number;
  /** How many of those are not among the rows. */
  more: number;
}

/**
 * What the lobby shows of the `rooms` and `counts` the directory sent, to
 * someone who picked `game` (`null` for every game). The rows are chosen
 * here too, so the list answers a pick before the directory has.
 *
 * Nothing is taken on trust: a room or a count of a game this page has not
 * heard of is left out (a newer server may send one), a count that is not a
 * whole number of rooms is none, and no game has fewer rooms than are shown
 * of it. A directory older than the counts sends none: the rooms sent are
 * then all the rooms there are known to be.
 */
export function roomsShown(rooms: readonly RoomListing[], counts: RoomCounts | undefined, game: GameId | null): RoomsShown {
  const known = rooms.filter((room) => isGameId(room.game));
  const shown = game === null ? known : known.filter((room) => room.game === game);
  const sent = (id: GameId): number => known.reduce((sum, room) => sum + (room.game === id ? 1 : 0), 0);
  const said = (id: GameId): number => {
    const count = counts?.[id];
    return typeof count === "number" && Number.isInteger(count) && count > 0 ? count : 0;
  };
  const all = Object.fromEntries(GAME_IDS.map((id) => [id, Math.max(said(id), sent(id))])) as Record<GameId, number>;
  const total = game === null ? GAME_IDS.reduce((sum, id) => sum + all[id], 0) : all[game];
  return { rooms: shown, counts: all, total, more: total - shown.length };
}
