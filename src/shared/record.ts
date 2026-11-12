import { isGameId, type GameId } from "./games";
import type { ServerMessage } from "./protocol";

/**
 * A player's own record: how many games of each kind they have played to the
 * end, and in how many they were at the top. It is worked out by the page
 * from what the room sends at the end of a game and kept in the browser
 * (`src/client/record.ts`): no room and no server has it, and it is nobody's
 * but that browser's.
 */

/** What the room sends a player of a game. */
export type GameMessage = Extract<ServerMessage, { type: "game" }>;

/**
 * What being at the top of a game is called, which is what the game's own
 * results call it: alive at the end, a win, or first place.
 */
export type TopKind = "alive" | "won" | "first";

/** What the top of each game is called. */
export const TOP_KIND: Record<GameId, TopKind> = {
  "russian-roulette": "alive",
  "count-rectangles": "won",
  "lay-the-grass": "won",
  "count-cubes": "first",
  "memory-poker": "first",
  "under-thirteen": "first",
  "mystery-stock-market": "first",
};

/** A game played to its end: which game it was, by a key no other game has, and whether the player was at the top of it. */
export interface Finish {
  key: string;
  game: GameId;
  top: boolean;
}

/** Whether the game whose events are `history` was cut short: everybody left it, or too few were left to play it. */
function cutShort(history: readonly { type: string }[]): boolean {
  return history.some((event) => {
    const reason = (event as { reason?: unknown }).reason;
    return event.type === "ended" && (reason === "abandoned" || reason === "left");
  });
}

/**
 * Whether the player the message was sent to was at the top of its game:
 * what the game's own results lead with for them. `null` while the game is
 * played, for someone who watched, and for a game cut short.
 */
function topOf(message: GameMessage): boolean | null {
  if (message.view.phase !== "ended" || cutShort(message.view.history)) return null;
  switch (message.game) {
    case "russian-roulette": {
      const { seat, result } = message.view;
      return seat === null || result === null ? null : !result.hitSeats.includes(seat);
    }
    case "count-rectangles": {
      const { you, units } = message.view;
      return you === null ? null : (units[you.unit]?.place ?? 0) > 0;
    }
    case "lay-the-grass": {
      const { you, players } = message.view;
      const own = players.find((player) => player.id === you);
      return you === null || own === undefined ? null : own.score === Math.max(...players.map((player) => player.score));
    }
    case "count-cubes": {
      const { you, ranked } = message.view;
      return you === null ? null : ranked[0]?.player === you;
    }
    case "memory-poker":
    case "under-thirteen": {
      const { you, standings } = message.view;
      const own = standings.find((each) => each.player === you);
      return you === null || own === undefined ? null : own.place === 1;
    }
    case "mystery-stock-market": {
      const { you, standings } = message.view;
      const own = standings.find((each) => each.player === you);
      return you === null || own === undefined ? null : own.rank === 1;
    }
  }
}

/**
 * The game `message` shows the end of, for the record of the player it was
 * sent to. `null` while the game is played, for someone who watched, for a
 * game cut short, and for a game a bot sat in: bots are there to try a game
 * with, and a game against them is not one played.
 */
export function finishOf(message: GameMessage): Finish | null {
  if (message.players.some((player) => player.bot)) return null;
  const top = topOf(message);
  return top === null ? null : { key: `${message.room}.${message.startedAt}`, game: message.game, top };
}

/** How many games of one kind were played to the end, and in how many of them the player was at the top. */
export interface Tally {
  played: number;
  top: number;
}

/**
 * A player's record: the count of each game played, and the keys of the
 * games counted last (`RecordConfig.seenMost` of them, oldest first), by
 * which a game whose end is heard of again is not counted again.
 */
export interface MyRecord {
  games: Partial<Record<GameId, Tally>>;
  seen: string[];
}

/** `seenMost`: how many of the games counted last are remembered, so that none is counted twice. */
export interface RecordConfig {
  seenMost: number;
}

/** The record of someone who has played nothing. */
export function noRecord(): MyRecord {
  return { games: {}, seen: [] };
}

/**
 * `record` with the game `finish` counted in it; `record` itself when that
 * game has been counted already. The end of a game is sent again to a page
 * that reconnects or is loaded again, and to each tab of one browser.
 */
export function counted(record: MyRecord, finish: Finish, config: RecordConfig): MyRecord {
  if (record.seen.includes(finish.key)) return record;
  const before = record.games[finish.game] ?? { played: 0, top: 0 };
  return {
    games: { ...record.games, [finish.game]: { played: before.played + 1, top: before.top + (finish.top ? 1 : 0) } },
    seen: [...record.seen, finish.key].slice(-config.seenMost),
  };
}

/** Whether `record` has any game in it. */
export function playedAny(record: MyRecord): boolean {
  return Object.keys(record.games).length > 0;
}

/** `record` as it is kept. */
export function recordText(record: MyRecord): string {
  return JSON.stringify(record);
}

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * The record kept as `stored`: an empty one for nothing kept and for what
 * cannot be read. A game there no longer is and a count that cannot be one
 * are left out: the browser's store is the player's to write in.
 */
export function recordFrom(stored: string | null): MyRecord {
  const record = noRecord();
  let kept: unknown;
  try {
    kept = JSON.parse(stored ?? "null");
  } catch {
    return record;
  }
  if (typeof kept !== "object" || kept === null || Array.isArray(kept)) return record;
  const { games, seen } = kept as { games?: unknown; seen?: unknown };
  if (typeof games === "object" && games !== null) {
    for (const [game, tally] of Object.entries(games)) {
      const { played, top } = (tally ?? {}) as { played?: unknown; top?: unknown };
      if (isGameId(game) && isCount(played) && played > 0 && isCount(top) && top <= played) record.games[game] = { played, top };
    }
  }
  if (Array.isArray(seen)) record.seen = seen.filter((key): key is string => typeof key === "string");
  return record;
}
