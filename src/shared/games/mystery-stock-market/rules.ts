/**
 * The rules of 미스터리 거래소 (Mystery Stock Market): everyone starts with
 * the same money and trades seven stocks over 24 rounds; each stock's price
 * moves at the end of a round by a rule of its own (`prices.ts`), of which
 * only a part is told at the start. Whoever has the most assets at the end
 * is first. Pure functions over plain data: nothing here reads the clock or
 * stores anything.
 *
 * Design: design/games/mystery-stock-market.md. The procedure is the show's
 * own, as its dealer gives it: seven stocks at 10,000 won that never go
 * under 100, 100,000 won to a player, 24 rounds of five minutes, buying and
 * selling at the round's price, the monitor at the start of each round
 * (prices, what was bought and sold, what is held in all, everyone's assets
 * and place), a further part of every rule opened at rounds 5, 10, 15 and
 * 20, one secret to a player that takes a stock off the monitor for the two
 * rounds after it is used (and everyone's assets with it), a piece for the
 * next part of one rule or for 10,000 won until the end of round 20, and the
 * last round's trades counted in the final assets. As the match was played:
 * whole shares, taken at once at the round's price with no fee; what was
 * bought and what was sold counted apart; a hidden stock traded like any
 * other, by players who then see neither their money nor their assets; a
 * round a secret hid never put back into the chart; whoever used a secret
 * told to nobody. What a room needs beyond that is filled in, and marked
 * (gap).
 */
import { emblemOf, pathOf, type LogoConfig } from "./logo";
import { STOCKS, isStock, nextPrices, perStock, type PerStock, type PriceConfig, type StockId } from "./prices";

/** The numbers of the game. Loaded from `config.json`. */
export interface MarketConfig extends PriceConfig {
  /** How many rounds a game has (the show: 24). */
  rounds: number;
  /** Seconds a round lasts (the show: five minutes). */
  roundSeconds: number;
  /** What every player starts with, in won (the show: 100,000). */
  startCash: number;
  /** The rounds at whose start a further part of every rule is opened to everyone (the show: 5, 10, 15, and everything at 20). */
  revealRounds: number[];
  /** How many rounds a secret keeps its stock off the monitor, from the round after it is used (the show: two). */
  secretRounds: number;
  /** (gap) How many pieces a player starts with: in the show each brought what they had won before. */
  pieces: number;
  /** What a piece is worth in won (the show: 10,000). */
  pieceCash: number;
  /** The last round in which a piece can be used (the show: 20). */
  pieceRounds: number;
  /** The final assets from which one piece, two pieces, three pieces are won (the show: 1.5, 3 and 6 million won). */
  awards: number[];
  /** The final assets from which the show gives its prize token (10 million won). */
  prizeAssets: number;
  /** How 알트엔터's path is drawn. */
  logo: LogoConfig;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const rising = (values: readonly number[]): boolean => values.every((value, at) => at === 0 || value > values[at - 1]);

/** Whether the numbers of `config` can make a game. */
export function isValidConfig(config: MarketConfig): boolean {
  const { rules, logo } = config;
  const whole = [config.rounds, config.roundSeconds, config.startCash, config.startPrice, config.floorPrice, config.secretRounds, config.pieces, config.pieceCash, config.pieceRounds, config.prizeAssets];
  return (
    whole.every(isWhole) &&
    config.rounds >= 1 &&
    config.roundSeconds >= 1 &&
    config.startCash >= 0 &&
    config.floorPrice >= 1 &&
    config.startPrice >= config.floorPrice &&
    Array.isArray(config.revealRounds) &&
    config.revealRounds.every((round) => isWhole(round) && round >= 1 && round <= config.rounds) &&
    rising(config.revealRounds) &&
    config.secretRounds >= 1 &&
    config.pieces >= 0 &&
    config.pieceCash >= 0 &&
    config.pieceRounds >= 0 &&
    Array.isArray(config.awards) &&
    config.awards.every((assets) => isWhole(assets) && assets >= 0) &&
    rising(config.awards) &&
    config.prizeAssets >= 0 &&
    [rules.finance.count, rules.finance.upPercent, rules.finance.downPercent, rules.build.upPercent, rules.build.downPercent, rules.steel.perShare].every((n) => isWhole(n) && n >= 0) &&
    [rules.open.upPercent, rules.open.down, rules.coyo.up, rules.coyo.down, rules.latter.from, rules.latter.to, rules.latter.up, rules.latter.down].every((n) => isWhole(n) && n >= 0) &&
    rules.finance.downPercent <= 100 &&
    rules.build.downPercent <= 100 &&
    rules.latter.from <= rules.latter.to &&
    [logo.turnsFrom, logo.turnsTo, logo.legRounds, logo.low, logo.high, logo.step, logo.levels].every(isWhole) &&
    logo.turnsFrom >= 1 &&
    logo.turnsTo >= logo.turnsFrom &&
    logo.legRounds >= 1 &&
    // every way the path goes has its rounds: it cannot turn more often than the game is long
    (logo.turnsTo + 1) * logo.legRounds <= config.rounds &&
    logo.step >= 1 &&
    logo.low >= config.floorPrice &&
    logo.low <= config.startPrice &&
    logo.high >= config.startPrice &&
    logo.swingFrom > 1 &&
    logo.swingTo >= logo.swingFrom &&
    logo.levels >= 2
  );
}

/** Where a game stands: a round is being played, or the game is over. Rounds follow one another with nothing between. */
export type MarketPhase = "trading" | "ended";

/** How a game ended: its rounds were played, too few were left to play it, or nobody was left to go on. */
export type MarketEnd = "rounds" | "left" | "abandoned";

/** What a player has. */
export interface Account {
  player: number;
  /** Their money, in won. */
  cash: number;
  shares: PerStock<number>;
  pieces: number;
  /** The stock they used their secret on and the round they did it in; `null` while they still have it. */
  secret: { stock: StockId; round: number } | null;
  /**
   * How many parts of each stock's rule beyond the first their pieces have
   * opened to them. A piece is for one part: the one after those they could
   * read when they gave it. Once everyone is shown that part they are no
   * further ahead.
   */
  peeks: PerStock<number>;
  /** The round in which they last bought or sold each stock; 0 for never. */
  traded: PerStock<number>;
  /** Whether they have said they are done with the round being played. */
  done: boolean;
  /**
   * What their assets came to when the round being played began: it is what
   * the monitor has of them until the next begins, whatever a piece brings
   * them in between.
   */
  opening: number;
  /** The least their assets have been at the start of a round: of two players level at the end, the one with the lower is the lower (the show's rule for last place). */
  lowest: number;
}

/** Something that happened, as everyone is told it. */
export type MarketEvent =
  | { type: "round"; round: number }
  /** A further part of every rule is open to everyone: now `stage` parts beyond the first. */
  | { type: "opened"; round: number; stage: number }
  /** A secret has taken `stock` off the monitor, from `round` to round `until`. Who used it is not told. */
  | { type: "hidden"; round: number; stock: StockId; until: number }
  | { type: "ended"; reason: MarketEnd };

/** One game, as the room stores it. Holds what players have and 알트엔터's path: send only {@link viewFor} of it. */
export interface MarketState {
  version: 1;
  /** The players, by the number each is known by. */
  players: number[];
  phase: MarketPhase;
  /** The round being played, from 1; the last one once the game is over. */
  round: number;
  /** When the round being played ends, in ms since the epoch. */
  until: number;
  /** Each stock's price after each round so far, the opening price first: the last is the price it trades at now. */
  prices: PerStock<number[]>;
  /** How many shares of each stock the players held between them when the round began. */
  held: PerStock<number>;
  /** What was bought and sold of each stock in the round before, as the monitor shows it. */
  lastBought: PerStock<number>;
  lastSold: PerStock<number>;
  /** What has been bought and sold of each stock in the round being played. Told to nobody until it ends. */
  bought: PerStock<number>;
  sold: PerStock<number>;
  accounts: Account[];
  /** 알트엔터's price after each round, the opening first. Never sent: the emblem is. */
  path: number[];
  history: MarketEvent[];
}

/** What a player can do in a round. */
export type MarketMove =
  /** Buy so many shares of a stock at the round's price. */
  | { type: "buy"; stock: StockId; shares: number }
  /** Sell so many of the shares they hold, at the round's price. */
  | { type: "sell"; stock: StockId; shares: number }
  /** Use their one secret on a stock. */
  | { type: "secret"; stock: StockId }
  /** Give a piece for the next part of a stock's rule. */
  | { type: "peek"; stock: StockId }
  /** Give a piece for money. */
  | { type: "cash" }
  /** Be done with the round: they do nothing more in it, and when everyone is done it ends. */
  | { type: "done" };

/**
 * What a player asks: a move, and the round it is meant for. (gap) A round
 * ends by the clock or by the last player's word, and what was sent a moment
 * before may arrive a moment after: an order would be taken at a price its
 * player never saw, or "done" would end their next round before it began.
 */
export type MarketAction = MarketMove & { round: number };

/** Why something asked was not done. */
export type MarketRefusal =
  /** The game is over. */
  | "game-over"
  /** The one asking is not a player of this game. */
  | "not-playing"
  /** What was sent is nothing the game knows. */
  | "bad-action"
  /** It was asked of a round that is not the one being played. */
  | "round-over"
  /** The player has said they are done with this round. */
  | "round-done"
  /** They have not the money for so many shares. */
  | "no-cash"
  /** They do not hold so many shares. */
  | "no-shares"
  /** They have used their secret. */
  | "secret-used"
  /** They have no piece left. */
  | "no-pieces"
  /** Pieces are no longer taken: the round until which they are is over. */
  | "pieces-closed"
  /** Nothing of that stock's rule is hidden from them any more. */
  | "nothing-hidden";

export type MarketResult = { ok: true; state: MarketState } | { ok: false; reason: MarketRefusal };

/** Why a game was not made. */
export type MarketStartRefusal = "bad-config" | "too-few" | "bad-players";

/** Where a player stands. */
export interface Standing {
  player: number;
  /** 1 for the most assets; players level in every way share a place. */
  rank: number;
  /** Their assets when the round being played began; once the game is over, what they ended with. */
  assets: number;
  /** The least their assets have been at the start of a round. */
  lowest: number;
}

/** A stock as a player is shown it. */
export interface StockView {
  id: StockId;
  /** What it trades at in this round; `null` while a secret keeps it off the monitor. */
  price: number | null;
  /** How far that is from its price a round ago, in won; `null` in the first round and where either price is kept back. */
  change: number | null;
  /** How many shares of it were bought and sold in the round before, and how many are held in all; `null` while a secret keeps it off the monitor. */
  bought: number | null;
  sold: number | null;
  held: number | null;
  /** Its price after each round so far, the opening first; `null` for a round a secret hid, which stays out of the chart. */
  chart: (number | null)[];
  /** How many parts of its rule beyond the first this player may read. */
  parts: number;
}

/** What one player, or someone watching, is sent of a game. */
export interface MarketView {
  phase: MarketPhase;
  round: number;
  rounds: number;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  players: number[];
  /** How many parts of every rule beyond the first are open to everyone. */
  stage: number;
  /** The stocks, in the monitor's order. */
  stocks: StockView[];
  /** The exchange's emblem: a height for the opening and for each round. */
  emblem: number[];
  /** Whether a secret is in effect: everyone's assets are then kept back, and their places are not. */
  veiled: boolean;
  /** Everyone's place, the first first. `assets` is `null` while a secret is in effect. */
  standings: { player: number; rank: number; assets: number | null; done: boolean }[];
  /**
   * What this player has; `null` for someone watching. Their money and their
   * assets are `null` while a secret hides a stock they hold, or have bought
   * or sold since it was hidden: either would give its price away.
   */
  mine: { cash: number | null; shares: PerStock<number>; pieces: number; secret: boolean; done: boolean; assets: number | null } | null;
  history: MarketEvent[];
}

/** The most shares that can be asked for at once: more than any game's money buys. */
const MOST_SHARES = 1_000_000_000;

function clone(state: MarketState): MarketState {
  return {
    ...state,
    players: [...state.players],
    prices: perStock((stock) => [...state.prices[stock]]),
    held: { ...state.held },
    lastBought: { ...state.lastBought },
    lastSold: { ...state.lastSold },
    bought: { ...state.bought },
    sold: { ...state.sold },
    accounts: state.accounts.map((account) => ({
      ...account,
      shares: { ...account.shares },
      peeks: { ...account.peeks },
      traded: { ...account.traded },
      secret: account.secret === null ? null : { ...account.secret },
    })),
    path: [...state.path],
    history: [...state.history],
  };
}

/** What `stock` trades at now: its price after the last round played. */
export function priceOf(state: MarketState, stock: StockId): number {
  const prices = state.prices[stock];
  return prices[prices.length - 1];
}

/** What an account comes to at the prices of now: its money and its shares. */
function worth(state: MarketState, account: Account): number {
  return STOCKS.reduce((sum, stock) => sum + account.shares[stock] * priceOf(state, stock), account.cash);
}

/** The assets of `player` at the prices of now; 0 for someone who is not playing. */
export function assetsOf(state: MarketState, player: number): number {
  const account = state.accounts.find((each) => each.player === player);
  return account === undefined ? 0 : worth(state, account);
}

/** How many shares of each stock the players hold between them. */
function totals(accounts: readonly Account[]): PerStock<number> {
  return perStock((stock) => accounts.reduce((sum, account) => sum + account.shares[stock], 0));
}

/** How many parts of every rule beyond the first are open to everyone in `round`. */
export function stageOf(round: number, config: MarketConfig): number {
  return config.revealRounds.filter((opened) => opened <= round).length;
}

/**
 * How many parts of `stock`'s rule beyond the first a player may read while
 * `stage` of them are open to everyone: those, or as many as their own
 * pieces have opened to them, whichever is more. Someone watching (no
 * account) reads what everyone does.
 */
function partsFor(account: Account | undefined, stock: StockId, stage: number): number {
  return Math.max(stage, account?.peeks[stock] ?? 0);
}

/**
 * Whether a secret keeps `stock` off the monitor in `round`: one was used on
 * it in one of the rounds just before, as many as a secret lasts.
 */
export function hiddenIn(state: MarketState, stock: StockId, round: number, config: MarketConfig): boolean {
  return state.accounts.some((account) => account.secret !== null && account.secret.stock === stock && round - account.secret.round >= 1 && round - account.secret.round <= config.secretRounds);
}

/** Starts a game for `players`. */
export function createGame(
  start: { players: readonly number[]; seed: number; now: number },
  config: MarketConfig,
): { ok: true; state: MarketState } | { ok: false; reason: MarketStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < 2) return { ok: false, reason: "too-few" };
  const players = [...start.players].sort((a, b) => a - b);
  return {
    ok: true,
    state: {
      version: 1,
      players,
      phase: "trading",
      round: 1,
      until: start.now + config.roundSeconds * 1000,
      prices: perStock(() => [config.startPrice]),
      held: perStock(() => 0),
      lastBought: perStock(() => 0),
      lastSold: perStock(() => 0),
      bought: perStock(() => 0),
      sold: perStock(() => 0),
      accounts: players.map((player) => ({
        player,
        cash: config.startCash,
        shares: perStock(() => 0),
        pieces: config.pieces,
        secret: null,
        peeks: perStock(() => 0),
        traded: perStock(() => 0),
        done: false,
        opening: config.startCash,
        lowest: config.startCash,
      })),
      path: pathOf(start.seed, config.rounds, config.startPrice, config.logo),
      history: [{ type: "round", round: 1 }],
    },
  };
}

/** Reads what a player asked as it came off the wire; `null` for anything else. */
export function parseAction(raw: unknown): MarketAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const round = data.round;
  if (!isWhole(round) || round < 1) return null;
  if (data.type === "done") return { type: "done", round };
  if (data.type === "cash") return { type: "cash", round };
  if (!isStock(data.stock)) return null;
  if (data.type === "secret" || data.type === "peek") return { type: data.type, round, stock: data.stock };
  if (data.type === "buy" || data.type === "sell") {
    return isWhole(data.shares) && data.shares >= 1 && data.shares <= MOST_SHARES ? { type: data.type, round, stock: data.stock, shares: data.shares } : null;
  }
  return null;
}

/**
 * Something asked by `player`. The state given is not changed. Whether the
 * round is now over, everyone being done, is for {@link moveOn}, which needs
 * to know who is still there.
 */
export function applyAction(state: MarketState, player: number, action: MarketAction, _now: number, config: MarketConfig): MarketResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (!state.players.includes(player)) return { ok: false, reason: "not-playing" };
  const move = parseAction(action);
  if (move === null) return { ok: false, reason: "bad-action" };
  if (move.round !== state.round) return { ok: false, reason: "round-over" };
  const next = clone(state);
  const account = next.accounts.find((each) => each.player === player);
  if (account === undefined) return { ok: false, reason: "not-playing" };
  if (account.done) return { ok: false, reason: "round-done" };

  if (move.type === "done") {
    account.done = true;
    return { ok: true, state: next };
  }
  if (move.type === "buy") {
    // a stock a secret hides is bought and sold like any other, at the price that is not shown
    const cost = move.shares * priceOf(state, move.stock);
    if (cost > account.cash) return { ok: false, reason: "no-cash" };
    account.cash -= cost;
    account.shares[move.stock] += move.shares;
    account.traded[move.stock] = state.round;
    next.bought[move.stock] += move.shares;
    return { ok: true, state: next };
  }
  if (move.type === "sell") {
    if (move.shares > account.shares[move.stock]) return { ok: false, reason: "no-shares" };
    account.cash += move.shares * priceOf(state, move.stock);
    account.shares[move.stock] -= move.shares;
    account.traded[move.stock] = state.round;
    next.sold[move.stock] += move.shares;
    return { ok: true, state: next };
  }
  if (move.type === "secret") {
    if (account.secret !== null) return { ok: false, reason: "secret-used" };
    account.secret = { stock: move.stock, round: state.round };
    return { ok: true, state: next };
  }
  // what is left is paid for with a piece
  if (state.round > config.pieceRounds) return { ok: false, reason: "pieces-closed" };
  if (account.pieces < 1) return { ok: false, reason: "no-pieces" };
  if (move.type === "peek") {
    const readable = partsFor(account, move.stock, stageOf(state.round, config));
    if (readable >= config.revealRounds.length) return { ok: false, reason: "nothing-hidden" };
    account.peeks[move.stock] = readable + 1;
  } else {
    account.cash += config.pieceCash;
  }
  account.pieces -= 1;
  return { ok: true, state: next };
}

/**
 * Ends the round being played: every price moves by its rule, the monitor
 * takes what was bought, sold and is held, and the next round begins at
 * `now`, or the game is over after the last. `state` is changed.
 */
function endRound(state: MarketState, now: number, config: MarketConfig): void {
  const round = state.round;
  const current = perStock((stock) => state.prices[stock][round - 1]);
  const earlier = round >= 2 ? perStock((stock) => state.prices[stock][round - 2]) : null;
  const heldNow = totals(state.accounts);
  const next = nextPrices(
    current,
    earlier,
    // 열림보안 goes by whether 후자전자 is off the monitor that the next round opens with
    { heldBefore: state.held, heldAfter: heldNow, bought: state.bought, latterHidden: hiddenIn(state, "latter", round + 1, config), alt: state.path[round] },
    config,
  );
  for (const stock of STOCKS) state.prices[stock].push(next[stock]);
  state.held = heldNow;
  state.lastBought = state.bought;
  state.lastSold = state.sold;
  state.bought = perStock(() => 0);
  state.sold = perStock(() => 0);
  for (const account of state.accounts) {
    account.done = false;
    account.opening = worth(state, account);
    account.lowest = Math.min(account.lowest, account.opening);
  }
  if (round >= config.rounds) {
    state.phase = "ended";
    state.history.push({ type: "ended", reason: "rounds" });
    return;
  }
  state.round = round + 1;
  state.until = now + config.roundSeconds * 1000;
  state.history.push({ type: "round", round: state.round });
  if (stageOf(state.round, config) > stageOf(round, config)) state.history.push({ type: "opened", round: state.round, stage: stageOf(state.round, config) });
  for (const stock of STOCKS) {
    // a secret used in the round just over takes its stock off the monitor from this one
    if (state.accounts.some((account) => account.secret !== null && account.secret.stock === stock && account.secret.round === round)) {
      state.history.push({ type: "hidden", round: state.round, stock, until: round + config.secretRounds });
    }
  }
}

/**
 * (gap) Ends the round as soon as everyone who is `there` has said they are
 * done with it: the show's rounds last their five minutes, and a room would
 * sit through two hours of them. Returns `state` itself when someone is
 * still at work.
 */
export function moveOn(state: MarketState, there: (player: number) => boolean, now: number, config: MarketConfig): MarketState {
  if (state.phase !== "trading") return state;
  if (state.accounts.some((account) => there(account.player) && !account.done)) return state;
  const next = clone(state);
  endRound(next, now, config);
  return next;
}

/**
 * (gap) Ends the game if fewer than two of its players are `there`: there is
 * nobody to trade against. Returns `state` itself otherwise.
 */
export function closeIfLeft(state: MarketState, there: (player: number) => boolean): MarketState {
  if (state.phase === "ended" || state.players.filter(there).length >= 2) return state;
  const next = clone(state);
  next.phase = "ended";
  next.history.push({ type: "ended", reason: "left" });
  return next;
}

/** The moment the game next needs the clock. `null` once it is over. */
export function deadline(state: MarketState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * The round's time may have run out: then it ends, whoever is not done, and
 * the next gets its whole time from `now`. Returns `state` itself when
 * nothing is due.
 */
export function applyTimeout(state: MarketState, now: number, config: MarketConfig): MarketState {
  if (state.phase === "ended" || now < state.until) return state;
  const next = clone(state);
  endRound(next, now, config);
  return next;
}

/** Ends the game where it stands: nobody is left to go on with it. */
export function abandon(state: MarketState): MarketState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  next.phase = "ended";
  next.history.push({ type: "ended", reason: "abandoned" });
  return next;
}

/** Moves the game's clock on by `by` ms: the time it stood still does not count. */
export function shiftClock(state: MarketState, by: number): MarketState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, until: state.until + by };
}

/**
 * Where everyone stands, the most assets first: by what each had when the
 * round being played began, which is what the show's monitor is given at the
 * start of a round, and once the game is over by what each ended with. (gap)
 * Of players with the same assets, the one whose assets were ever the lower
 * at the start of a round is the lower, which is the show's rule for telling
 * two last players apart; players level in both share a place.
 */
export function standingsOf(state: MarketState): Standing[] {
  const over = state.phase === "ended";
  const all = state.accounts.map((account) => ({ player: account.player, assets: over ? worth(state, account) : account.opening, lowest: account.lowest }));
  const better = (a: (typeof all)[number], b: (typeof all)[number]): boolean => a.assets > b.assets || (a.assets === b.assets && a.lowest > b.lowest);
  return all.map((each) => ({ ...each, rank: 1 + all.filter((other) => better(other, each)).length })).sort((a, b) => a.rank - b.rank || a.player - b.player);
}

/**
 * The game as `player` may see it (`null`: someone watching). What others
 * hold and what is being traded in the round are never in it; a stock a
 * secret hides has no price in it, and while one does nobody's assets are
 * told. Once the game is over nothing is kept back but 알트엔터's path,
 * which by then is its chart.
 */
export function viewFor(state: MarketState, player: number | null, config: MarketConfig): MarketView {
  const you = player !== null && state.players.includes(player) ? player : null;
  const account = you === null ? undefined : state.accounts.find((each) => each.player === you);
  const over = state.phase === "ended";
  const stage = stageOf(state.round, config);
  // the round whose monitor a price was, or is, shown on: the price after round n opens round n + 1
  const hidden = (stock: StockId, after: number): boolean => !over && hiddenIn(state, stock, after + 1, config);
  const latest = (stock: StockId): number => state.prices[stock].length - 1;
  const veiled = STOCKS.some((stock) => hidden(stock, latest(stock)));

  const stocks = STOCKS.map((stock): StockView => {
    const prices = state.prices[stock];
    const at = latest(stock);
    const off = hidden(stock, at);
    const chart = prices.map((price, after) => (hidden(stock, after) ? null : price));
    const before = at >= 1 ? chart[at - 1] : null;
    return {
      id: stock,
      price: off ? null : prices[at],
      change: off || before === null ? null : prices[at] - before,
      bought: off ? null : state.lastBought[stock],
      sold: off ? null : state.lastSold[stock],
      held: off ? null : state.held[stock],
      chart,
      parts: partsFor(account, stock, stage),
    };
  });

  // The show's terminals: whoever holds a hidden stock, or has bought or sold it, sees neither their money nor
  // their assets. (gap) "Has bought or sold" is taken as: since it was last seen on the monitor. Shown again
  // sooner, the money of someone who bought in one hidden round and sold in the next would tell how the price moved.
  const blind =
    account !== undefined &&
    STOCKS.some((stock) => {
      if (!hidden(stock, latest(stock))) return false;
      let since = state.round;
      while (since > 1 && hiddenIn(state, stock, since - 1, config)) since -= 1;
      return account.shares[stock] > 0 || account.traded[stock] >= since;
    });
  return {
    phase: state.phase,
    round: state.round,
    rounds: config.rounds,
    you,
    players: [...state.players],
    stage,
    stocks,
    emblem: emblemOf(state.path, config.logo.levels),
    veiled,
    standings: standingsOf(state).map((each) => ({
      player: each.player,
      rank: each.rank,
      assets: veiled ? null : each.assets,
      done: state.accounts.find((one) => one.player === each.player)?.done ?? false,
    })),
    mine:
      account === undefined
        ? null
        : {
            cash: blind ? null : account.cash,
            shares: { ...account.shares },
            pieces: account.pieces,
            secret: account.secret === null,
            done: account.done,
            assets: blind ? null : worth(state, account),
          },
    history: state.history.map((event) => ({ ...event })),
  };
}
