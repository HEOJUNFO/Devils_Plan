/**
 * What a room needs of a game in order to host it.
 *
 * A room knows nothing of how any game is played. It keeps what the game
 * gives it to keep (`S`, plain JSON), hands the game what players send and
 * the time, sets its one clock to the moment the game names, and sends each
 * player what the game says that player may see. Each game brings a
 * {@link GameHost}; `hosts.ts` lists them by the game's id.
 *
 * Players are told apart by their token, never by their lobby slot: a slot
 * freed by a leaver can be taken by someone new, who must not inherit a seat.
 */

/** Who is around, by token. */
export interface Presence {
  /** Players with a live connection. */
  connected: ReadonlySet<string>;
  /** Players who still hold a slot in the lobby, connected or not. */
  seated: ReadonlySet<string>;
}

/** A lobby player who could be in a new game. */
export interface Candidate {
  token: string;
  nick: string;
  slot: number;
  /** The order in which they came into the room; who came first is host. Absent: by slot. */
  seq?: number;
  /** The team they chose in the waiting room, in a game that has teams; 0 or absent for none. */
  team?: number;
  /** When they took that team, as a number that grows from one taking to the next: whoever took a team first leads it. */
  teamSince?: number;
}

/** How many numbers a room gives a game to draw its secrets from when it starts: more than any game draws. */
export const CHANCE_WORDS = 256;

/** What a room tells a game when asking it to start. */
export interface StartRequest {
  /** The token of whoever asked. Only the host may start. */
  by: string;
  /** Whether bots were asked for to fill places. */
  bots: boolean;
  /** Whether this room offers bots at all: only while developing. */
  allowBots: boolean;
  /** A number to seed the game's own random sequence with. */
  seed: number;
  /**
   * {@link CHANCE_WORDS} 32-bit numbers nobody could have guessed, fresh for
   * this game. A game draws from them what its players must not be able to
   * work out (`chanceOf` in `game/rng.ts` says why the seed will not do).
   * Absent where a game is started without a room, as in a test.
   */
  chance?: readonly number[];
  /** The time, in ms since the epoch. */
  now: number;
  /** The room's own limit on a turn, in seconds; 0 for none. A game without turns ignores it. */
  turnSeconds: number;
  /** Which of the game's variants the room asks for (`games.json`); absent for the game's first. A game without variants ignores it. */
  variant?: string;
}

/** What comes of asking a game for something: what to keep now, or why not. */
export type HostResult<S, R extends string> = { ok: true; session: S } | { ok: false; reason: R };

/**
 * A game as a room hosts it. `S` is what the room stores while a game is on
 * or just over; it holds secrets, and only {@link GameHost.view} of it is
 * ever sent. `R` is the reasons the game gives for refusing.
 *
 * Every method is a pure function of what it is given: nothing here reads
 * the clock, stores anything or sends anything.
 */
export interface GameHost<S, R extends string = string> {
  /** Starts a game for `players`, the lobby players connected now; `current` is the game before it, if any. */
  start(current: S | null, players: Candidate[], request: StartRequest, presence: Presence): HostResult<S, R>;
  /** What the player holding `token` asked for, as it came off the wire; the game checks it. */
  act(session: S | null, token: string, action: unknown, presence: Presence, now: number): HostResult<S, R>;
  /** The clock may have run out. Returns `session` itself when nothing is due, so asking twice is safe. */
  tick(session: S, presence: Presence, now: number): S;
  /** Someone connected, dropped or left. */
  attend(session: S, presence: Presence, now: number): S;
  /** What the player holding `viewer` is sent (`null`: someone who holds no token of the game). */
  view(session: S, viewer: string | null, presence: Presence, now: number): object;
  /** Whether the game is being played: started and not over. */
  running(session: S): boolean;
  /** Whether the game holds a place for `token` that an absence should not cost them. */
  holdsPlace(session: S, token: string): boolean;
  /** The moment the game next needs the clock, in ms since the epoch; `null` while it needs none. */
  deadline(session: S): number | null;
  /** Whether storing `next` in place of `current` would change nothing. */
  same(current: S, next: S): boolean;
  /** Whether something read back from storage is a game this code can carry on with. */
  usable(stored: unknown): boolean;
}
