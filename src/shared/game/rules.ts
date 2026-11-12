/**
 * Russian Roulette: the rules of one game, as pure functions over plain JSON.
 *
 * Design: design/game-brief.md (Core loop). The nine rules of the source
 * document are kept as written, read together with what the dealer explains
 * in the broadcast: what the table is told of a move, and how the credits for
 * a swap gather. The gaps both leave are filled as the brief lists them; each
 * is marked "(gap)" where this file decides it, so a later correction has one
 * place to go.
 *
 * The table: `seats` players sit in a circle, seat 0 first and the rest
 * clockwise. A cylinder with one chamber for each seat sits in the middle.
 * Some chambers hold a live round and nobody knows which. The muzzle points at
 * a seat. Chamber `j` is the one `j` places clockwise from the muzzle, so it
 * faces seat `muzzle + j`; turning the muzzle turns the cylinder with it, and
 * every chamber moves on to the next seat clockwise.
 *
 * What the table is told. A public look and a turn of the muzzle are told in
 * full. Of anything else the table hears only that the seat has made a hidden
 * action: a private look, credits put towards the swap, the swap itself and
 * the pass of a seat with no credits all sound the same. So nobody is told
 * who has run out of credits, how many credits have gathered, or that two
 * rounds have changed places.
 *
 * Nothing here reads the clock or `Math.random`: chance comes from the
 * generator state kept in the game. A state is plain JSON, is never modified
 * in place, and can be stored and reloaded at any point.
 */
import { randomInt, randomSource, seedFrom } from "./rng";

/** Tunable rule values. Loaded from `rules-config.json`. */
export interface RulesConfig {
  /** Seats at the table, and chambers in the cylinder (gap: six of each). */
  seats: number;
  /** Credits every player starts with. */
  startCredits: number;
  /** Credits a public look costs. */
  costPublic: number;
  /** Credits a private look costs. */
  costPrivate: number;
  /** Credits it costs to turn the muzzle one seat. */
  costRotate1: number;
  /** Credits it costs to turn the muzzle two seats. */
  costRotate2: number;
  /** Credits the table must gather, all seats together, for one swap. */
  tamperNeed: number;
  /** Most credits one seat may put towards the swap in a turn. */
  tamperMaxPerTurn: number;
  /** Live rounds in the cylinder. */
  bullets: number;
  /** The game ends as soon as this many players have no credits left. */
  endWhenOut: number;
  /** Seconds a player has for one move; 0 for no limit (gap: the document gives none). */
  turnSeconds: number;
  /** Credits a turn costs the seat that let its time run out (gap: the document has no clock). */
  costTimeout: number;
}

/** What a chamber holds: 1 is a live round, 0 is empty. */
export type Round = 0 | 1;

/** What someone knows of a chamber: its content, or `null` for nothing yet. */
export type Known = Round | null;

/**
 * Where a game stands. Transitions:
 * `turn` → `turn` (a look, a turn of the muzzle, credits that leave the table
 * short of the mark, a pass), `turn` → `swap` (credits that take the table to
 * the mark), `swap` → `turn` (the swap is made or forfeited), and `turn` →
 * `ended` (enough seats are out of credits).
 */
export type Phase = "turn" | "swap" | "ended";

/** Who is to sit at the table. `id` is the caller's own (a lobby slot). */
export interface Occupant {
  id: number;
  /** Whether a bot plays for this occupant. */
  bot: boolean;
}

/** One seat, as the server stores it. `credits` and `out` are secret to the seat. */
export interface SeatState {
  /** The id `createGame` was given for whoever sits here. */
  occupant: number;
  /** Whether a bot plays this seat. */
  bot: boolean;
  /** Credits left. */
  credits: number;
  /** Out of credits: passes every turn from now on. */
  out: boolean;
  /** Credits the whole table saw this seat spend. */
  seenSpent: number;
  /** Hidden actions the table has been told this seat made. */
  hiddenActs: number;
  /** Turns of this seat the clock ended. */
  timeouts: number;
}

/** A chamber as someone last saw it. */
export interface Sight {
  /** What it held. */
  round: Round;
  /** Whether the seat is alone in knowing it: seen in a private look, or moved by a swap of its own. */
  alone: boolean;
  /**
   * How many hidden actions of other seats the table had been told of when it
   * was seen. Any hidden action since may have been a swap that took the round
   * away, so the difference to the count now is how far the sight can be trusted.
   */
  after: number;
}

/** Everything a room remembers about a game. Holds secrets: send only `viewFor` of it. */
export interface GameState {
  /** Bumped when this shape changes, so a room can tell a stored game from an older build. */
  version: 2;
  /** Index is the seat: 0 leads round 1, the rest follow clockwise. */
  seats: SeatState[];
  /** SECRET. `chambers[j]` is the chamber `j` places clockwise from the muzzle. */
  chambers: Round[];
  /** The seat the muzzle points at (seat 0 at the start). */
  muzzle: number;
  /** Rounds played so far; seat `round % seats` leads the current one. */
  round: number;
  /** How many seats have had their turn in this round. */
  turn: number;
  /** The seat to move. */
  current: number;
  /** SECRET while it is `swap`: nobody but the seat that owes the swap is told one is owed. */
  phase: Phase;
  /** SECRET. The seat that has earned a swap and must make it, or `null`. */
  swapSeat: number | null;
  /** SECRET. Seats out of credits. */
  outCount: number;
  /** SECRET from every seat. Credits the table has put towards the swap since the last one was earned. */
  pot: number;
  /** Hidden actions the table has been told of, of all seats together. */
  hiddenActs: number;
  /** What the whole table last saw of each chamber: all that someone watching knows. */
  shown: (Sight | null)[];
  /** SECRET per seat. `seen[seat][j]`: what that seat last saw of chamber `j`, with the table or alone. */
  seen: (Sight | null)[][];
  /** Every move so far, in full. Holds secrets: views get `eventFor` of each. */
  history: GameEvent[];
  /** State of the random generator; see `rng.ts`. */
  rng: number;
}

/** A move a player asks for. */
export type Action =
  /** Look into chambers `pair` and `pair + 1`; the whole table sees the result. */
  | { type: "public"; pair: number }
  /** Look into chambers `pair` and `pair + 1`; only the player sees the result. */
  | { type: "private"; pair: number }
  /** Turn the muzzle, and the cylinder with it, one or two seats clockwise. */
  | { type: "rotate"; steps: 1 | 2 }
  /** Put `amount` credits towards the swap; nobody else learns how many. */
  | { type: "tamper"; amount: number }
  /** Having earned the swap: exchange the contents of chambers `pair` and `pair + 1`. */
  | { type: "swap"; pair: number }
  /** Having no credits: let the turn go by. */
  | { type: "pass" };

interface EventBase {
  /** The seat that moved. */
  seat: number;
  /** The move left that seat with no credits. */
  out: boolean;
  /** The move ended the game. */
  ended: boolean;
}

/** What happened, in full. Only a public look and a turn of the muzzle are told to the table as they are. */
export type GameEvent =
  | (EventBase & { type: "public"; pair: number; seen: [Round, Round] })
  | (EventBase & { type: "private"; pair: number; seen: [Round, Round] })
  | (EventBase & { type: "rotate"; steps: 1 | 2 })
  /** `earned`: the credits took the table to the mark, and the seat now makes the swap. */
  | (EventBase & { type: "tamper"; amount: number; earned: boolean })
  | (EventBase & { type: "swap"; pair: number })
  /** The seat had earned a swap and its time ran out before it made it. */
  | (EventBase & { type: "swap-forfeit" })
  | (EventBase & { type: "pass" })
  /** The seat's time ran out; `cost` is what that took from it, nothing if it had nothing. */
  | (EventBase & { type: "timeout"; cost: number });

interface ToldBase {
  /** The seat that moved. */
  seat: number;
  /** The move ended the game. */
  ended: boolean;
  /** The move left the seat with no credits. Told to that seat alone: absent from everyone else's. */
  out?: boolean;
}

/**
 * What happened, as one seat is told of it. Its own moves are told in full.
 * Of another seat's it is told a public look, a turn of the muzzle and a turn
 * the clock ended; anything else is `hidden`, with nothing to tell one kind
 * from another.
 */
export type SeatEvent =
  | (ToldBase & { type: "public"; pair: number; seen: [Round, Round] })
  | (ToldBase & { type: "private"; pair: number; seen: [Round, Round] })
  | (ToldBase & { type: "rotate"; steps: 1 | 2 })
  | (ToldBase & { type: "tamper"; amount: number; earned: boolean })
  | (ToldBase & { type: "swap"; pair: number })
  | (ToldBase & { type: "swap-forfeit" })
  | (ToldBase & { type: "pass" })
  /** `cost` is `null` to every seat but the one whose time ran out. */
  | (ToldBase & { type: "timeout"; cost: number | null })
  /** Another seat's hidden action: a private look, credits towards the swap, a swap, or a pass. */
  | (ToldBase & { type: "hidden" });

/** Why a move was refused. */
export type Refusal =
  /** The game has ended. */
  | "game-over"
  /** No such seat. */
  | "bad-seat"
  /** Not a move at all: wrong shape, or a number that is not a whole one. */
  | "bad-action"
  /** It is another seat's move. */
  | "not-your-turn"
  /** The seat has no credits left and can only pass. */
  | "out-of-credits"
  /** The seat has credits left and must spend some. */
  | "cannot-pass"
  /** The move costs more credits than the seat has. */
  | "not-enough-credits"
  /** No such pair of chambers. */
  | "bad-chamber"
  /** Credits towards the swap outside 1 to `tamperMaxPerTurn`. */
  | "bad-amount"
  /** The seat has earned a swap and must make it before anything else. */
  | "swap-pending"
  /** A swap was asked for, but none has been earned. */
  | "no-swap-pending";

/** Outcome of a move: the new state and what happened, or why it was refused. */
export type ApplyResult =
  | { ok: true; state: GameState; event: GameEvent }
  | { ok: false; reason: Refusal };

/** Outcome of {@link createGame}. */
export type CreateResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: "bad-config" | "bad-occupants" };

/** What a seat may do right now. */
export interface LegalMoves {
  public: boolean;
  private: boolean;
  rotate1: boolean;
  rotate2: boolean;
  /** The most credits it may put towards the swap now; 0 when none. */
  tamperMax: number;
  /** The seat has earned a swap and must make it. */
  swap: boolean;
  /** The seat has no credits and passes. */
  pass: boolean;
}

/** How a seat came to know a chamber. */
export type KnowledgeSource = "public" | "private" | "inferred" | null;

/** A seat as everyone may see it. Carries no credits. */
export interface SeatPublic {
  occupant: number;
  bot: boolean;
  /** Whether the seat is out of credits: `null` while that is the seat's own to know (another seat, in a game still on). */
  out: boolean | null;
  /** The fewest credits this seat can have left, counted from what the table has been told. */
  minCredits: number;
  /** The most credits this seat can have left, counted the same way. */
  maxCredits: number;
}

/** One shot of the final volley. */
export interface Shot {
  seat: number;
  chamber: number;
  hit: boolean;
}

/** The end of a game: every shot in order, who was hit, and what each chamber held. */
export interface VolleyResult {
  shots: Shot[];
  hitSeats: number[];
  chambers: Round[];
}

/** The game as one seat (or a spectator) is allowed to see it. Safe to send. */
export interface SeatView {
  /** The viewer's seat, or `null` for a spectator. */
  seat: number | null;
  /** `swap` only to the seat that owes the swap; to everyone else that seat's turn is still on. */
  phase: Phase;
  round: number;
  turn: number;
  current: number;
  muzzle: number;
  /** The viewer's own credits; `null` for a spectator. */
  credits: number | null;
  /** What the viewer last saw of each chamber, or can work out from what it knows for certain. */
  chambers: Known[];
  /** How the viewer knows each chamber. */
  source: KnowledgeSource[];
  /**
   * By chamber: hidden actions of other seats since the viewer saw it. Any of
   * them may have been a swap, so with one or more the chamber is known only
   * as it was. 0 for a chamber the viewer knows as it is now, or not at all.
   */
  doubt: number[];
  seats: SeatPublic[];
  /** Every move so far, as the viewer is told of it. */
  history: SeatEvent[];
  /**
   * Every move of the game in full, as the seat that made each was told of
   * it: there once the game is over, at a table that tells the hidden moves
   * then (the room's choice; see `viewFor`). `history` stays as it was told.
   */
  revealed?: SeatEvent[];
  /** The volley, once the game has ended; `null` before. */
  result: VolleyResult | null;
}

function refuse(reason: Refusal): ApplyResult {
  return { ok: false, reason };
}

function mod(value: number, n: number): number {
  return ((value % n) + n) % n;
}

function isWhole(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function swapAt<T>(list: T[], a: number, b: number): void {
  const held = list[a];
  list[a] = list[b];
  list[b] = held;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    seats: state.seats.map((seat) => ({ ...seat })),
    chambers: [...state.chambers],
    shown: [...state.shown],
    seen: state.seen.map((row) => [...row]),
    history: [...state.history],
  };
}

/** Whether `config` describes a game that can be played. */
export function isValidConfig(config: RulesConfig): boolean {
  const whole = [
    config.seats,
    config.startCredits,
    config.costPublic,
    config.costPrivate,
    config.costRotate1,
    config.costRotate2,
    config.tamperNeed,
    config.tamperMaxPerTurn,
    config.bullets,
    config.endWhenOut,
    // a turn the clock ends has to cost something, or a table could sit out its turns for ever
    config.costTimeout,
  ];
  if (!whole.every((value) => isWhole(value) && value >= 1)) return false;
  if (typeof config.turnSeconds !== "number" || !(config.turnSeconds >= 0)) return false;
  return config.seats >= 3 && config.bullets < config.seats && config.endWhenOut <= config.seats;
}

/**
 * What changes with the number of players. Loaded from `table-sizes.json`,
 * keyed by the number of seats.
 */
export type TableSizes = Record<string, { bullets: number; endWhenOut: number }>;

/**
 * The rules for a table of `players` seats (gap: the document describes one
 * table, which the six-seat entry reproduces; the smaller tables are this
 * game's own scaling of it). Returns `null` when no table of that size is
 * offered.
 */
export function rulesForPlayers(base: RulesConfig, players: number, sizes: TableSizes): RulesConfig | null {
  if (!isWhole(players)) return null;
  const size = sizes[String(players)];
  if (size === undefined) return null;
  const config: RulesConfig = { ...base, seats: players, bullets: size.bullets, endWhenOut: size.endWhenOut };
  return isValidConfig(config) ? config : null;
}

/**
 * Starts a game. The occupants are drawn into seats at random (rule 3), the
 * live rounds are placed at random where nobody can see them (gap), and seat 0
 * leads the first round (rule 4). `seed` fixes every draw.
 *
 * `occupants` must hold exactly `config.seats` entries with different ids.
 */
export function createGame(
  setup: { occupants: Occupant[]; seed: number },
  config: RulesConfig,
): CreateResult {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  const n = config.seats;
  const occupants = setup.occupants;
  if (!Array.isArray(occupants) || occupants.length !== n) return { ok: false, reason: "bad-occupants" };
  const ids = new Set<number>();
  for (const occupant of occupants) {
    if (typeof occupant !== "object" || occupant === null || !isWhole(occupant.id)) {
      return { ok: false, reason: "bad-occupants" };
    }
    ids.add(occupant.id);
  }
  if (ids.size !== n) return { ok: false, reason: "bad-occupants" };

  const random = randomSource(seedFrom(setup.seed));
  const order = occupants.map((occupant) => ({ id: occupant.id, bot: occupant.bot === true }));
  for (let i = n - 1; i > 0; i--) swapAt(order, i, randomInt(random.next, i + 1));
  const chambers: Round[] = new Array<Round>(n).fill(0);
  for (let placed = 0; placed < config.bullets; ) {
    const j = randomInt(random.next, n);
    if (chambers[j] === 0) {
      chambers[j] = 1;
      placed++;
    }
  }
  return {
    ok: true,
    state: {
      version: 2,
      seats: order.map((occupant) => ({
        occupant: occupant.id,
        bot: occupant.bot,
        credits: config.startCredits,
        out: false,
        seenSpent: 0,
        hiddenActs: 0,
        timeouts: 0,
      })),
      chambers,
      muzzle: 0,
      round: 0,
      turn: 0,
      current: 0,
      phase: "turn",
      swapSeat: null,
      outCount: 0,
      pot: 0,
      hiddenActs: 0,
      shown: new Array<Sight | null>(n).fill(null),
      seen: order.map(() => new Array<Sight | null>(n).fill(null)),
      history: [],
      rng: random.state,
    },
  };
}

/** The chamber facing `seat`: the one that will be fired at it if nothing changes. */
export function chamberFacing(state: Pick<GameState, "muzzle" | "seats">, seat: number): number {
  return mod(seat - state.muzzle, state.seats.length);
}

/** The seat that chamber `chamber` faces. */
export function seatFacing(state: Pick<GameState, "muzzle" | "seats">, chamber: number): number {
  return mod(state.muzzle + chamber, state.seats.length);
}

/**
 * Which turn of the game is being played, counted from 0: it goes up by one
 * each time the move passes to the next seat, and stays where it is while a
 * seat that has earned a swap makes it.
 */
export function turnNumber(state: Pick<GameState, "round" | "turn" | "seats">): number {
  return state.round * state.seats.length + state.turn;
}

/** What `seat` may do right now. Everything is `false` when it is not that seat's move. */
export function legalMoves(state: GameState, seat: number, config: RulesConfig): LegalMoves {
  const none: LegalMoves = { public: false, private: false, rotate1: false, rotate2: false, tamperMax: 0, swap: false, pass: false };
  if (state.phase === "ended" || !isWhole(seat) || seat < 0 || seat >= state.seats.length) return none;
  if (state.phase === "swap") return state.swapSeat === seat ? { ...none, swap: true } : none;
  if (state.current !== seat) return none;
  const actor = state.seats[seat];
  if (actor.out) return { ...none, pass: true };
  return {
    public: actor.credits >= config.costPublic,
    private: actor.credits >= config.costPrivate,
    rotate1: actor.credits >= config.costRotate1,
    rotate2: actor.credits >= config.costRotate2,
    tamperMax: Math.min(config.tamperMaxPerTurn, actor.credits),
    swap: false,
    pass: false,
  };
}

/**
 * Reads a move from untrusted data. Returns `null` for anything that is not
 * one of the six moves with whole, non-negative numbers; whether the move is
 * allowed is for {@link applyAction} to say.
 */
export function parseAction(raw: unknown): Action | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as { type?: unknown; pair?: unknown; steps?: unknown; amount?: unknown };
  switch (data.type) {
    case "public":
    case "private":
    case "swap":
      return isWhole(data.pair) && data.pair >= 0 ? { type: data.type, pair: data.pair } : null;
    case "rotate":
      return data.steps === 1 || data.steps === 2 ? { type: "rotate", steps: data.steps } : null;
    case "tamper":
      return isWhole(data.amount) && data.amount >= 1 ? { type: "tamper", amount: data.amount } : null;
    case "pass":
      return { type: "pass" };
    default:
      return null;
  }
}

/** The hidden actions the table has been told of that were not `seat`'s own. */
function othersActs(state: GameState, seat: number): number {
  return state.hiddenActs - state.seats[seat].hiddenActs;
}

/** The table is told that `seat` has made a hidden action, and nothing more. */
function announce(state: GameState, seat: number): void {
  state.hiddenActs++;
  state.seats[seat].hiddenActs++;
}

/**
 * Seat 0 leads round 1 and the lead moves one seat clockwise each round
 * (rule 4). A seat with no credits is not passed over: its turn comes, it
 * passes (rule 8), and the table hears of a hidden action like any other.
 */
function advance(state: GameState): void {
  const n = state.seats.length;
  state.turn++;
  if (state.turn >= n) {
    state.turn = 0;
    state.round++;
  }
  state.current = (state.round + state.turn) % n;
}

/** After a move: mark a seat that ran dry, end the game or pass the turn on, and record the move. */
function settle(state: GameState, seat: number, event: GameEvent, config: RulesConfig): void {
  const actor = state.seats[seat];
  if (actor.credits <= 0 && !actor.out) {
    actor.out = true;
    state.outCount++;
    event.out = true;
  }
  if (state.phase === "turn") {
    // The game ends the moment the last needed seat runs dry, and the move that did it stands.
    if (state.outCount >= config.endWhenOut) {
      state.phase = "ended";
      event.ended = true;
    } else {
      advance(state);
    }
  }
  state.history.push(event);
}

function step(state: GameState, seat: number, action: Action, config: RulesConfig): ApplyResult {
  if (state.phase === "ended") return refuse("game-over");
  const n = state.seats.length;
  if (!isWhole(seat) || seat < 0 || seat >= n) return refuse("bad-seat");
  const move = parseAction(action);
  if (move === null) return refuse("bad-action");

  if (state.phase === "swap") {
    // to every other seat this is the plain refusal of a move out of turn: that a swap is owed is not theirs to hear
    if (state.swapSeat !== seat) return refuse("not-your-turn");
    if (move.type !== "swap") return refuse("swap-pending");
    if (move.pair >= n) return refuse("bad-chamber");
    const next = cloneState(state);
    const a = move.pair;
    const b = (a + 1) % n;
    swapAt(next.chambers, a, b);
    // Nobody is told that two rounds changed places, let alone which: what the seat that did it had
    // seen of them goes with them, and what anyone else had seen stays where it was, right or not.
    const own = next.seen[seat];
    swapAt(own, a, b);
    for (const j of [a, b]) {
      const sight = own[j];
      if (sight !== null) own[j] = { ...sight, alone: true };
    }
    next.phase = "turn";
    next.swapSeat = null;
    // the credits and the swap are one hidden action to the table, told when the turn is over
    announce(next, seat);
    const event: GameEvent = { type: "swap", seat, pair: a, out: false, ended: false };
    settle(next, seat, event, config);
    return { ok: true, state: next, event };
  }

  if (state.current !== seat) return refuse("not-your-turn");
  if (move.type === "swap") return refuse("no-swap-pending");
  const actor = state.seats[seat];
  if (move.type === "pass") {
    // (gap) Only a seat with nothing left passes; one with credits has to spend at least one on its turn.
    if (!actor.out) return refuse("cannot-pass");
    const next = cloneState(state);
    announce(next, seat);
    const event: GameEvent = { type: "pass", seat, out: false, ended: false };
    settle(next, seat, event, config);
    return { ok: true, state: next, event };
  }
  if (actor.out) return refuse("out-of-credits");
  const credits = actor.credits;

  if (move.type === "public" || move.type === "private") {
    if (move.pair >= n) return refuse("bad-chamber");
    const open = move.type === "public";
    const cost = open ? config.costPublic : config.costPrivate;
    if (credits < cost) return refuse("not-enough-credits");
    const next = cloneState(state);
    const a = move.pair;
    const b = (a + 1) % n;
    const seen: [Round, Round] = [next.chambers[a], next.chambers[b]];
    next.seats[seat].credits -= cost;
    if (open) {
      next.seats[seat].seenSpent += cost;
      for (const j of [a, b]) {
        const round = next.chambers[j];
        next.shown[j] = { round, alone: false, after: next.hiddenActs };
        next.seen.forEach((row, viewer) => {
          row[j] = { round, alone: false, after: othersActs(next, viewer) };
        });
      }
    } else {
      for (const j of [a, b]) next.seen[seat][j] = { round: next.chambers[j], alone: true, after: othersActs(next, seat) };
      announce(next, seat);
    }
    const event: GameEvent = { type: move.type, seat, pair: a, seen, out: false, ended: false };
    settle(next, seat, event, config);
    return { ok: true, state: next, event };
  }

  if (move.type === "rotate") {
    const cost = move.steps === 2 ? config.costRotate2 : config.costRotate1;
    if (credits < cost) return refuse("not-enough-credits");
    const next = cloneState(state);
    next.seats[seat].credits -= cost;
    next.seats[seat].seenSpent += cost;
    next.muzzle = (next.muzzle + move.steps) % n;
    const event: GameEvent = { type: "rotate", seat, steps: move.steps, out: false, ended: false };
    settle(next, seat, event, config);
    return { ok: true, state: next, event };
  }

  if (move.amount > config.tamperMaxPerTurn) return refuse("bad-amount");
  if (move.amount > credits) return refuse("not-enough-credits");
  const next = cloneState(state);
  next.seats[seat].credits -= move.amount;
  // The credits of the whole table gather in one place. The seat whose credits take them to the
  // mark makes the swap, in the same turn; what is over the mark is lost and the count starts again.
  next.pot += move.amount;
  const earned = next.pot >= config.tamperNeed;
  if (earned) {
    next.pot = 0;
    next.phase = "swap";
    next.swapSeat = seat;
  } else {
    announce(next, seat);
  }
  const event: GameEvent = { type: "tamper", seat, amount: move.amount, earned, out: false, ended: false };
  settle(next, seat, event, config);
  return { ok: true, state: next, event };
}

/**
 * One move by `seat`. Returns the new state and what happened, or why the
 * move was refused; the input state is not modified. Safe to call with moves
 * straight from a client: anything not allowed for that seat right now is
 * refused.
 */
export function applyAction(state: GameState, seat: number, action: Action, config: RulesConfig): ApplyResult {
  return step(state, seat, action, config);
}

/**
 * The time the seat now to move has for it, as data for whoever keeps the
 * clock: `null` when the rules set no limit or the game has ended.
 */
export function turnAllowance(state: GameState, config: RulesConfig): { seat: number; seconds: number } | null {
  if (state.phase === "ended" || !(config.turnSeconds > 0)) return null;
  const seat = state.phase === "swap" && state.swapSeat !== null ? state.swapSeat : state.current;
  return { seat, seconds: config.turnSeconds };
}

/**
 * The clock ran out for the seat that was to move (gap: the document has no
 * clock). Its turn goes by and costs it `costTimeout` credits, or what it has
 * left of them: they go nowhere, not towards the swap, so a table is neither
 * helped nor set back by a seat nobody is playing. The table sees a turn the
 * clock ended for what it is, not as a hidden action. With a swap pending the
 * swap is forfeited; the credits that earned it were a move of the seat's own
 * and are told as any hidden action is.
 */
export function applyTimeout(state: GameState, config: RulesConfig): ApplyResult {
  if (state.phase === "ended") return refuse("game-over");
  const next = cloneState(state);
  if (state.phase === "swap") {
    const seat = state.swapSeat;
    if (seat === null) return refuse("no-swap-pending");
    next.phase = "turn";
    next.swapSeat = null;
    announce(next, seat);
    const event: GameEvent = { type: "swap-forfeit", seat, out: false, ended: false };
    settle(next, seat, event, config);
    return { ok: true, state: next, event };
  }
  const seat = state.current;
  const actor = next.seats[seat];
  const cost = Math.min(config.costTimeout, actor.credits);
  actor.credits -= cost;
  actor.timeouts++;
  const event: GameEvent = { type: "timeout", seat, cost, out: false, ended: false };
  settle(next, seat, event, config);
  return { ok: true, state: next, event };
}

/**
 * A move as `viewer` is told of it, or `null` when it is told nothing yet.
 * The seat that made the move is told all of it. Anyone else is told a public
 * look, a turn of the muzzle and a turn the clock ended; of the rest only that
 * the seat made a hidden action, once its turn is over: credits that earn the
 * swap are not told apart from the swap that follows them.
 */
export function eventFor(event: GameEvent, viewer: number | null): SeatEvent | null {
  if (event.seat === viewer) {
    if (event.type === "public" || event.type === "private") return { ...event, seen: [event.seen[0], event.seen[1]] };
    return { ...event };
  }
  const told = { seat: event.seat, ended: event.ended };
  switch (event.type) {
    case "public":
      return { ...told, type: "public", pair: event.pair, seen: [event.seen[0], event.seen[1]] };
    case "rotate":
      return { ...told, type: "rotate", steps: event.steps };
    case "timeout":
      return { ...told, type: "timeout", cost: null };
    case "tamper":
      return event.earned ? null : { ...told, type: "hidden" };
    default:
      return { ...told, type: "hidden" };
  }
}

/**
 * The final volley (rule 9): from the seat the muzzle points at, clockwise,
 * the chamber facing each seat is fired at it, one shot for every seat.
 */
export function volley(state: GameState): VolleyResult {
  const n = state.seats.length;
  const shots: Shot[] = [];
  for (let k = 0; k < n; k++) {
    shots.push({ seat: (state.muzzle + k) % n, chamber: k, hit: state.chambers[k] === 1 });
  }
  return {
    shots,
    hitSeats: shots.filter((shot) => shot.hit).map((shot) => shot.seat),
    chambers: [...state.chambers],
  };
}

/**
 * The game as `viewer` may see it: its own credits, what it last saw of each
 * chamber with the table or alone, how far each of those can still be
 * trusted, and what follows for certain from counting the rounds. Never
 * another seat's credits or private looks (rule 7), and nothing that tells
 * one hidden action from another: not who is out of credits, not how many
 * credits have gathered for the swap, not that a swap is owed or was made.
 * Pass `null` for a spectator. Once the game has ended, every chamber, the
 * volley and who had run out are shown to all.
 */
export function viewFor(state: GameState, viewer: number | null, config: RulesConfig, reveal = false): SeatView {
  const n = state.seats.length;
  const seat = isWhole(viewer) && viewer >= 0 && viewer < n ? viewer : null;
  const ended = state.phase === "ended";
  const memory = seat === null ? state.shown : state.seen[seat];
  const acts = seat === null ? state.hiddenActs : othersActs(state, seat);
  const chambers: Known[] = [];
  const source: KnowledgeSource[] = [];
  const doubt: number[] = [];
  let live = 0;
  let empty = 0;
  for (let j = 0; j < n; j++) {
    const sight = memory[j];
    const known: Known = ended ? state.chambers[j] : sight === null ? null : sight.round;
    const since = ended || sight === null ? 0 : acts - sight.after;
    chambers.push(known);
    source.push(ended ? "public" : sight === null ? null : sight.alone ? "private" : "public");
    doubt.push(since);
    if (known !== null && since === 0) {
      if (known === 1) live++;
      else empty++;
    }
  }
  // With every round found for certain the rest are empty, and with every empty chamber found for
  // certain the rest are live: whatever was remembered of them from before is settled by that.
  const rest: Known = live >= config.bullets ? 0 : empty >= n - config.bullets ? 1 : null;
  if (rest !== null) {
    for (let j = 0; j < n; j++) {
      if (chambers[j] === null || doubt[j] > 0) {
        chambers[j] = rest;
        source[j] = "inferred";
        doubt[j] = 0;
      }
    }
  }
  // A hidden action costs a seat with credits one of them at the least (the smallest amount put
  // towards the swap) and at the most the dearer of a private look and the largest such amount.
  const dearest = Math.max(config.costPrivate, config.tamperMaxPerTurn);
  const history: SeatEvent[] = [];
  for (const event of state.history) {
    const told = eventFor(event, seat);
    if (told !== null) history.push(told);
  }
  // Once it is over, a table that plays so is told what each hidden move was: everyone the same, beside what
  // they were told as it went, which is not rewritten.
  const revealed: SeatEvent[] = [];
  if (reveal && ended) {
    for (const event of state.history) {
      const told = eventFor(event, event.seat);
      if (told !== null) revealed.push(told);
    }
  }
  return {
    ...(reveal && ended ? { revealed } : {}),
    seat,
    phase: state.phase === "swap" && state.swapSeat !== seat ? "turn" : state.phase,
    round: state.round,
    turn: state.turn,
    current: state.current,
    muzzle: state.muzzle,
    credits: seat === null ? null : state.seats[seat].credits,
    chambers,
    source,
    doubt,
    seats: state.seats.map((p, i) => {
      // that a seat is out is its own to know until the game is over
      const told = ended || i === seat;
      const open = config.startCredits - p.seenSpent - p.timeouts * config.costTimeout;
      return {
        occupant: p.occupant,
        bot: p.bot,
        out: told ? p.out : null,
        // a seat with nothing left passes, which is a hidden action that costs nothing: never under zero
        minCredits: told && p.out ? 0 : Math.max(0, open - p.hiddenActs * dearest),
        maxCredits: told && p.out ? 0 : Math.max(0, open - p.hiddenActs),
      };
    }),
    history,
    result: ended ? volley(state) : null,
  };
}
