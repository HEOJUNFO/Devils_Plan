/**
 * Empty Chamber: the rules of one game, as pure functions over plain JSON.
 *
 * Design: design/game-brief.md (Core loop). The nine rules of the source
 * document are kept as written. The gaps it leaves are filled as the brief
 * lists them; each is marked "(gap)" where this file decides it, so a later
 * correction has one place to go.
 *
 * The table: `seats` players sit in a circle, seat 0 first and the rest
 * clockwise. A cylinder with one chamber for each seat sits in the middle.
 * Some chambers hold a live round and nobody knows which. The muzzle points at
 * a seat. Chamber `j` is the one `j` places clockwise from the muzzle, so it
 * faces seat `muzzle + j`; turning the muzzle turns the cylinder with it, and
 * every chamber moves on to the next seat clockwise (gap).
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
  /** Credits a player must gather to earn the swap. */
  tamperNeed: number;
  /** Most credits one hidden deposit may hold. */
  tamperMaxPerTurn: number;
  /** Live rounds in the cylinder. */
  bullets: number;
  /** The game ends as soon as this many players have no credits left. */
  endWhenOut: number;
  /** Seconds a player has for one move; 0 for no limit (gap: the document gives none). */
  turnSeconds: number;
}

/** What a chamber holds: 1 is a live round, 0 is empty. */
export type Round = 0 | 1;

/** What someone knows of a chamber: its content, or `null` for nothing yet. */
export type Known = Round | null;

/**
 * Where a game stands. Transitions:
 * `turn` → `turn` (a look, a turn of the muzzle, a deposit short of the mark),
 * `turn` → `swap` (a deposit that reaches the mark), `swap` → `turn` (the swap
 * is made or forfeited), and `turn` → `ended` (enough seats are out of credits).
 */
export type Phase = "turn" | "swap" | "ended";

/** Who is to sit at the table. `id` is the caller's own (a lobby slot). */
export interface Occupant {
  id: number;
  /** Whether a bot plays for this occupant. */
  bot: boolean;
}

/** One seat, as the server stores it. `credits` and `pot` are secret to the seat. */
export interface SeatState {
  /** The id `createGame` was given for whoever sits here. */
  occupant: number;
  /** Whether a bot plays this seat. */
  bot: boolean;
  /** Credits left. */
  credits: number;
  /** Credits gathered towards the swap. */
  pot: number;
  /** Out of credits: passes every turn from now on. */
  out: boolean;
  /** Credits the whole table saw this seat spend. */
  seenSpent: number;
  /** Hidden deposits made, each worth 1 to `tamperMaxPerTurn` credits. */
  hiddenDeposits: number;
}

/** Everything a room remembers about a game. Holds secrets: send only `viewFor` of it. */
export interface GameState {
  /** Bumped when this shape changes, so a room can tell a stored game from an older build. */
  version: 1;
  /** Index is the seat: 0 leads round 1, the rest follow clockwise. */
  seats: SeatState[];
  /** SECRET. `chambers[j]` is the chamber `j` places clockwise from the muzzle. */
  chambers: Round[];
  /** The seat the muzzle points at (gap: seat 0 at the start). */
  muzzle: number;
  /** Rounds played so far; seat `round % seats` leads the current one. */
  round: number;
  /** How many seats have had their turn in this round. */
  turn: number;
  /** The seat to move. */
  current: number;
  phase: Phase;
  /** The seat that has earned a swap and must make it, or `null`. */
  swapSeat: number | null;
  /** Seats out of credits. */
  outCount: number;
  /** What the whole table has seen of each chamber. */
  publicChambers: Known[];
  /** SECRET per seat. `privateChambers[seat][j]`: what that seat alone has seen. */
  privateChambers: Known[][];
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
  /** Deposit `amount` credits towards the swap; nobody else learns how many. */
  | { type: "tamper"; amount: number }
  /** Having earned the swap: exchange the contents of chambers `pair` and `pair + 1`. */
  | { type: "swap"; pair: number };

interface EventBase {
  /** The seat that moved. */
  seat: number;
  /** The move left that seat with no credits. */
  out: boolean;
  /** The move ended the game. */
  ended: boolean;
}

/** What happened, in full. `seen` of a private look and `amount` of a deposit are secret. */
export type GameEvent =
  | (EventBase & { type: "public"; pair: number; seen: [Round, Round] })
  | (EventBase & { type: "private"; pair: number; seen: [Round, Round] })
  | (EventBase & { type: "rotate"; steps: 1 | 2 })
  | (EventBase & { type: "tamper"; amount: number; earned: boolean; forced: boolean })
  | (EventBase & { type: "swap"; pair: number })
  | (EventBase & { type: "swap-forfeit" });

/** What happened, as one seat may be told: secrets it may not know are `null`. */
export type SeatEvent =
  | (EventBase & { type: "public"; pair: number; seen: [Round, Round] })
  | (EventBase & { type: "private"; pair: number; seen: [Round, Round] | null })
  | (EventBase & { type: "rotate"; steps: 1 | 2 })
  | (EventBase & { type: "tamper"; amount: number | null; earned: boolean; forced: boolean })
  | (EventBase & { type: "swap"; pair: number })
  | (EventBase & { type: "swap-forfeit" });

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
  /** The seat has no credits left and passes. */
  | "out-of-credits"
  /** The move costs more credits than the seat has. */
  | "not-enough-credits"
  /** No such pair of chambers. */
  | "bad-chamber"
  /** A deposit outside 1 to `tamperMaxPerTurn`. */
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
  /** The largest deposit allowed now; 0 when none is. */
  tamperMax: number;
  /** The seat has earned a swap and must make it. */
  swap: boolean;
}

/** How a seat came to know a chamber. */
export type KnowledgeSource = "public" | "private" | "inferred" | null;

/** A seat as everyone may see it. Carries no credits and no deposit. */
export interface SeatPublic {
  occupant: number;
  bot: boolean;
  out: boolean;
  /** The fewest credits this seat can have left, counted from what the table saw. */
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
  phase: Phase;
  round: number;
  turn: number;
  current: number;
  muzzle: number;
  swapSeat: number | null;
  outCount: number;
  /** The viewer's own credits; `null` for a spectator. */
  credits: number | null;
  /** The viewer's own deposit towards the swap; `null` for a spectator. */
  pot: number | null;
  /** What the viewer knows of each chamber, including what follows from counting the rounds. */
  chambers: Known[];
  /** How the viewer knows each chamber. */
  source: KnowledgeSource[];
  seats: SeatPublic[];
  /** Every move so far, with other seats' secrets removed. */
  history: SeatEvent[];
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
    publicChambers: [...state.publicChambers],
    privateChambers: state.privateChambers.map((row) => [...row]),
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
      version: 1,
      seats: order.map((occupant) => ({
        occupant: occupant.id,
        bot: occupant.bot,
        credits: config.startCredits,
        pot: 0,
        out: false,
        seenSpent: 0,
        hiddenDeposits: 0,
      })),
      chambers,
      muzzle: 0,
      round: 0,
      turn: 0,
      current: 0,
      phase: "turn",
      swapSeat: null,
      outCount: 0,
      publicChambers: new Array<Known>(n).fill(null),
      privateChambers: order.map(() => new Array<Known>(n).fill(null)),
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

/** What `seat` may do right now. Everything is `false` when it is not that seat's move. */
export function legalMoves(state: GameState, seat: number, config: RulesConfig): LegalMoves {
  const none: LegalMoves = { public: false, private: false, rotate1: false, rotate2: false, tamperMax: 0, swap: false };
  if (state.phase === "ended" || !isWhole(seat) || seat < 0 || seat >= state.seats.length) return none;
  if (state.phase === "swap") return state.swapSeat === seat ? { ...none, swap: true } : none;
  const actor = state.seats[seat];
  if (state.current !== seat || actor.out) return none;
  return {
    public: actor.credits >= config.costPublic,
    private: actor.credits >= config.costPrivate,
    rotate1: actor.credits >= config.costRotate1,
    rotate2: actor.credits >= config.costRotate2,
    tamperMax: Math.min(config.tamperMaxPerTurn, actor.credits),
    swap: false,
  };
}

/**
 * Reads a move from untrusted data. Returns `null` for anything that is not
 * one of the five moves with whole, non-negative numbers; whether the move is
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
    default:
      return null;
  }
}

/** Seat 0 leads round 1 and the lead moves one seat clockwise each round (rule 4); a seat with no credits passes (rule 8). */
function advance(state: GameState): void {
  const n = state.seats.length;
  for (let i = 0; i < n * 2; i++) {
    state.turn++;
    if (state.turn >= n) {
      state.turn = 0;
      state.round++;
    }
    state.current = (state.round + state.turn) % n;
    if (!state.seats[state.current].out) return;
  }
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
    // (gap) The game ends the moment the last needed seat runs dry, and the move that did it stands.
    if (state.outCount >= config.endWhenOut) {
      state.phase = "ended";
      event.ended = true;
    } else {
      advance(state);
    }
  }
  state.history.push(event);
}

function step(
  state: GameState,
  seat: number,
  action: Action,
  config: RulesConfig,
  forced: boolean,
): ApplyResult {
  if (state.phase === "ended") return refuse("game-over");
  const n = state.seats.length;
  if (!isWhole(seat) || seat < 0 || seat >= n) return refuse("bad-seat");
  const move = parseAction(action);
  if (move === null) return refuse("bad-action");

  if (state.phase === "swap") {
    if (state.swapSeat !== seat) return refuse("not-your-turn");
    if (move.type !== "swap") return refuse("swap-pending");
    if (move.pair >= n) return refuse("bad-chamber");
    const next = cloneState(state);
    const a = move.pair;
    const b = (a + 1) % n;
    swapAt(next.chambers, a, b);
    // What anyone knew of a round goes with the round.
    swapAt(next.publicChambers, a, b);
    for (const row of next.privateChambers) swapAt(row, a, b);
    next.phase = "turn";
    next.swapSeat = null;
    const event: GameEvent = { type: "swap", seat, pair: a, out: false, ended: false };
    settle(next, seat, event, config);
    return { ok: true, state: next, event };
  }

  if (state.seats[seat].out) return refuse("out-of-credits");
  if (state.current !== seat) return refuse("not-your-turn");
  if (move.type === "swap") return refuse("no-swap-pending");
  const credits = state.seats[seat].credits;

  if (move.type === "public" || move.type === "private") {
    if (move.pair >= n) return refuse("bad-chamber");
    const cost = move.type === "public" ? config.costPublic : config.costPrivate;
    if (credits < cost) return refuse("not-enough-credits");
    const next = cloneState(state);
    const a = move.pair;
    const b = (a + 1) % n;
    const seen: [Round, Round] = [next.chambers[a], next.chambers[b]];
    next.seats[seat].credits -= cost;
    next.seats[seat].seenSpent += cost;
    const known = move.type === "public" ? next.publicChambers : next.privateChambers[seat];
    known[a] = seen[0];
    known[b] = seen[1];
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
  const actor = next.seats[seat];
  actor.credits -= move.amount;
  // A deposit the clock forced is one credit and everyone knows it; any other hides its size.
  if (forced) actor.seenSpent += move.amount;
  else actor.hiddenDeposits++;
  actor.pot += move.amount;
  // (gap) Each seat gathers its own deposit; reaching the mark earns the swap at once and anything over it is lost.
  const earned = actor.pot >= config.tamperNeed;
  if (earned) {
    actor.pot = 0;
    next.phase = "swap";
    next.swapSeat = seat;
  }
  const event: GameEvent = { type: "tamper", seat, amount: move.amount, earned, forced, out: false, ended: false };
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
  return step(state, seat, action, config, false);
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
 * clock). On its turn the seat deposits one credit, the cheapest move there
 * is, and the table is told the deposit was forced. With a swap pending, the
 * swap is forfeited and the turn passes on.
 */
export function applyTimeout(state: GameState, config: RulesConfig): ApplyResult {
  if (state.phase === "ended") return refuse("game-over");
  if (state.phase === "swap") {
    const seat = state.swapSeat;
    if (seat === null) return refuse("no-swap-pending");
    const next = cloneState(state);
    next.phase = "turn";
    next.swapSeat = null;
    const event: GameEvent = { type: "swap-forfeit", seat, out: false, ended: false };
    settle(next, seat, event, config);
    return { ok: true, state: next, event };
  }
  return step(state, state.current, { type: "tamper", amount: 1 }, config, true);
}

/**
 * A move as `viewer` may be told of it (gap: who did what to which chambers is
 * public; what a private look found and how much a deposit held are not).
 */
export function eventFor(event: GameEvent, viewer: number | null): SeatEvent {
  switch (event.type) {
    case "public":
      return { ...event, seen: [event.seen[0], event.seen[1]] };
    case "private":
      return { ...event, seen: event.seat === viewer ? [event.seen[0], event.seen[1]] : null };
    case "tamper":
      return { ...event, amount: event.seat === viewer || event.forced ? event.amount : null };
    default:
      return { ...event };
  }
}

/**
 * The final volley (rule 9): from the seat the muzzle points at, clockwise,
 * the chamber facing each seat is fired at it (gap: one shot for every seat).
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
 * The game as `viewer` may see it: its own credits and deposit, what the
 * table has seen, what it has seen alone, and what follows from counting the
 * rounds. Never another seat's credits, deposits or private looks (rule 7).
 * Pass `null` for a spectator. Once the game has ended, every chamber and the
 * volley are shown to all.
 */
export function viewFor(state: GameState, viewer: number | null, config: RulesConfig): SeatView {
  const n = state.seats.length;
  const seat = isWhole(viewer) && viewer >= 0 && viewer < n ? viewer : null;
  const ended = state.phase === "ended";
  const chambers: Known[] = [];
  const source: KnowledgeSource[] = [];
  let live = 0;
  let empty = 0;
  for (let j = 0; j < n; j++) {
    const open = ended ? state.chambers[j] : state.publicChambers[j];
    const own = seat === null ? null : state.privateChambers[seat][j];
    const known = open !== null ? open : own;
    chambers.push(known);
    source.push(open !== null ? "public" : own !== null ? "private" : null);
    if (known === 1) live++;
    else if (known === 0) empty++;
  }
  // With every round found the rest are empty, and with every empty chamber found the rest are live.
  const rest: Known = live >= config.bullets ? 0 : empty >= n - config.bullets ? 1 : null;
  if (rest !== null) {
    for (let j = 0; j < n; j++) {
      if (chambers[j] === null) {
        chambers[j] = rest;
        source[j] = "inferred";
      }
    }
  }
  return {
    seat,
    phase: state.phase,
    round: state.round,
    turn: state.turn,
    current: state.current,
    muzzle: state.muzzle,
    swapSeat: state.swapSeat,
    outCount: state.outCount,
    credits: seat === null ? null : state.seats[seat].credits,
    pot: seat === null ? null : state.seats[seat].pot,
    chambers,
    source,
    seats: state.seats.map((p) => {
      const most = config.startCredits - p.seenSpent - p.hiddenDeposits;
      const least = config.startCredits - p.seenSpent - p.hiddenDeposits * config.tamperMaxPerTurn;
      return {
        occupant: p.occupant,
        bot: p.bot,
        out: p.out,
        // A seat still in the game has at least one credit; one that is out has none.
        minCredits: p.out ? 0 : Math.max(1, least),
        maxCredits: p.out ? 0 : Math.max(1, most),
      };
    }),
    history: state.history.map((event) => eventFor(event, seat)),
    result: ended ? volley(state) : null,
  };
}
