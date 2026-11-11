import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/lay-the-grass/config.json";
import {
  CHOICES,
  abandon,
  applyAction,
  applyTimeout,
  awaited,
  canCut,
  checkAtMostFor,
  coveredBy,
  createGame,
  cutsOf,
  deadline,
  fits,
  isValidConfig,
  moveFor,
  optionOf,
  parseAction,
  scoreLines,
  shapeOf,
  shiftClock,
  tileOf,
  viewFor,
  waysFor,
  type ChoiceNo,
  type GrassAction,
  type GrassConfig,
  type GrassState,
  type Option,
} from "../../../src/shared/games/lay-the-grass/rules";

/** The game as shipped: one park, with the four either-or choices of the document. */
const CONFIG: GrassConfig = shipped;

/** An arbitrary moment the tests call the start of the game, in ms. */
const START = 2_000_000;
const CHOOSE_MS = CONFIG.chooseSeconds * 1000;
const MARK_MS = CONFIG.markSeconds * 1000;

/** A park with room for everything: six cells by six. */
const FIELD = ["######", "######", "######", "######", "######", "######"];

/** A game of players 0..count-1 started at START. */
function game(count: number, seed = 7, config: GrassConfig = CONFIG): GrassState {
  const created = createGame({ players: Array.from({ length: count }, (_, id) => id), seed, now: START }, config);
  if (!created.ok) throw new Error(`fixture game refused: ${created.reason}`);
  return created.state;
}

/** Applies an action that the test expects to be accepted. */
function act(state: GrassState, player: number, action: GrassAction, now = START + 1000, config: GrassConfig = CONFIG): GrassState {
  const result = applyAction(state, player, action, now, config);
  if (!result.ok) throw new Error(`fixture action refused: ${result.reason} (${action.type} by ${player} in ${state.phase})`);
  return result.state;
}

/** Why `action` by `player` is refused; the test expects it to be. */
function refusal(state: GrassState, player: number, action: GrassAction, now = START + 1000): string {
  const result = applyAction(state, player, action, now, CONFIG);
  if (result.ok) throw new Error("fixture: the action was taken");
  return result.reason;
}

/** The same game on a park of the test's own. */
function onPark(state: GrassState, rows: string[]): GrassState {
  return { ...state, park: { rows } };
}

/** Everyone still to choose chooses what `option` gives them. */
function chooseAll(state: GrassState, option: Option | ((player: number) => Option)): GrassState {
  let next = state;
  for (const player of awaited(state)) next = act(next, player, { type: "choose", option: typeof option === "function" ? option(player) : option });
  return next;
}

/** Everyone picks in turn what `tile` gives them. */
function pickAll(state: GrassState, tile: number | ((player: number) => number)): GrassState {
  let next = state;
  while (next.phase === "pick" && next.turn !== null) {
    const player = next.turn.player;
    next = act(next, player, { type: "pick", tile: typeof tile === "function" ? tile(player) : tile });
  }
  return next;
}

/** Whoever is to put manholes or a tree on the park puts none, each in turn, until the laying begins. */
function skipMarks(state: GrassState): GrassState {
  let next = state;
  while (next.phase === "manholes" || next.phase === "trees") next = moveFor(next, START + 5000, CONFIG);
  return next;
}

interface Setup {
  five?: Option | ((player: number) => Option);
  six?: Option | ((player: number) => Option);
  seven?: Option | ((player: number) => Option);
  eight?: Option | ((player: number) => Option);
  tile?: number | ((player: number) => number);
  park?: string[];
}

/** A game of `count` played up to the end of choice 8: whatever comes next (manholes, trees or the laying) is on. */
function upToMarks(count: number, setup: Setup = {}): GrassState {
  let state = onPark(game(count), setup.park ?? FIELD);
  // 정보 unless the test wants points: nobody starts ahead
  state = chooseAll(state, setup.five ?? 2);
  state = pickAll(state, setup.tile ?? 13);
  state = chooseAll(state, setup.six ?? 2);
  state = chooseAll(state, setup.seven ?? 2);
  return chooseAll(state, setup.eight ?? 1);
}

/** The same, with nothing put on the park: the laying is on. */
function upToLaying(count: number, setup: Setup = {}): GrassState {
  return skipMarks(upToMarks(count, setup));
}

/** The player on turn; an error when it is nobody's. */
function onTurn(state: GrassState): number {
  if (state.turn === null) throw new Error(`fixture: nobody is on turn in ${state.phase}`);
  return state.turn.player;
}

/** What `player` was given for the park just closed. */
function lineOf(state: GrassState, player: number): { tile: number; manholes: number; pair: number; check: number; total: number; laid: boolean } {
  const event = [...state.history].reverse().find((each) => each.type === "score");
  const line = event?.type === "score" ? event.lines.find((each) => each.player === player) : undefined;
  if (line === undefined) throw new Error("fixture: no points were counted");
  return line;
}

describe("잔디 깔기: the either-or choices, one after another", () => {
  it("takes the values the game ships with, and refuses choices the document does not have", () => {
    expect(isValidConfig(CONFIG)).toBe(true);
    expect(CONFIG.choices).toEqual([...CHOICES]);
    expect(isValidConfig({ ...CONFIG, choices: [5, 9] })).toBe(false);
    expect(isValidConfig({ ...CONFIG, choices: [5, 5] })).toBe(false);
    expect(isValidConfig({ ...CONFIG, cutMax: 3 })).toBe(false);
    expect(isValidConfig({ ...CONFIG, defaultOptions: { ...CONFIG.defaultOptions, "6": 3 } })).toBe(false);
  });

  it("puts choice 5 to everyone before any tile is picked", () => {
    const state = game(4);

    expect(state.phase).toBe("choose");
    expect(state.choosing).toEqual({ which: 5, since: START });
    expect(state.turn).toBeNull();
    expect(awaited(state).sort()).toEqual([0, 1, 2, 3]);
    expect(deadline(state, CONFIG)).toBe(START + CHOOSE_MS);
  });

  it("keeps what a player chose from the others until everyone has chosen", () => {
    const state = act(game(3), 1, { type: "choose", option: 2 });

    expect(viewFor(state, 1, CONFIG).choosing).toEqual({ which: 5, chosen: [1], mine: 2 });
    expect(viewFor(state, 0, CONFIG).choosing).toEqual({ which: 5, chosen: [1], mine: null });
    expect(viewFor(state, null, CONFIG).choosing).toEqual({ which: 5, chosen: [1], mine: null });
    for (const viewer of [0, 1, 2, null]) {
      const view = viewFor(state, viewer, CONFIG);
      expect(view.choices).toEqual([]);
      expect(view.history.some((event) => event.type === "choice")).toBe(false);
    }
  });

  it("shows the choice to all at once when everyone has made it, in the order of priority", () => {
    const state = chooseAll(game(3), (player) => (player === 1 ? 2 : 1));

    const event = state.history.at(-1);
    expect(event).toMatchObject({ type: "choice", round: 1, which: 5 });
    expect(event?.type === "choice" ? event.chosen.map((each) => each.player) : []).toEqual(state.players.map((player) => player.id));
    expect(viewFor(state, 0, CONFIG).choices).toHaveLength(3);
    expect(optionOf(state, 1, 5)).toBe(2);
    expect(optionOf(state, 0, 5)).toBe(1);
  });

  it("refuses a second choice from a player: a choice cannot be changed", () => {
    const state = act(game(3), 1, { type: "choose", option: 2 });

    expect(refusal(state, 1, { type: "choose", option: 1 })).toBe("already-chosen");
  });

  it("refuses a choice when none is being made, and anything else while one is", () => {
    const choosing = game(3);
    const picking = chooseAll(choosing, 1);

    expect(picking.phase).toBe("pick");
    expect(refusal(picking, onTurn(picking), { type: "choose", option: 1 })).toBe("not-choosing");
    expect(refusal(choosing, 0, { type: "pick", tile: 9 })).toBe("not-picking");
    expect(refusal(choosing, 0, { type: "lay", row: 0, col: 0, turns: 0 })).toBe("not-laying");
  });

  it("goes from choice 5 to the picking, and from the picking to choices 6, 7 and 8 in turn", () => {
    let state = chooseAll(game(3), 1);
    const seen: (ChoiceNo | string)[] = [state.phase];
    state = pickAll(state, 9);
    for (let step = 0; step < 3; step++) {
      seen.push(state.choosing?.which ?? state.phase);
      state = chooseAll(state, 1);
    }

    expect(seen).toEqual(["pick", 6, 7, 8]);
    expect(state.history.filter((event) => event.type === "choice").map((event) => (event.type === "choice" ? event.which : 0))).toEqual([5, 6, 7, 8]);
  });

  it("chooses for those who are out of time what the values name, and says so", () => {
    const state = act(game(3), 0, { type: "choose", option: 2 });

    const before = applyTimeout(state, START + CHOOSE_MS - 1, CONFIG);
    const after = applyTimeout(state, START + CHOOSE_MS, CONFIG);

    expect(before).toBe(state);
    const event = after.history.at(-1);
    const chosen = event?.type === "choice" ? event.chosen : [];
    expect(chosen.find((each) => each.player === 0)).toEqual({ player: 0, option: 2, forced: false });
    expect(chosen.filter((each) => each.player !== 0)).toEqual(
      state.players.filter((player) => player.id !== 0).map((player) => ({ player: player.id, option: CONFIG.defaultOptions["5"], forced: true })),
    );
    expect(after.phase).toBe("pick");
  });

  it("chooses for those out of time the option the values name for that choice, also when it is the second", () => {
    const state = pickAll(chooseAll(game(2), 2), 9);

    const after = applyTimeout(state, deadline(state, CONFIG)!, CONFIG);

    expect(state.choosing?.which).toBe(6);
    expect(CONFIG.defaultOptions["6"]).toBe(2);
    expect(after.choices.filter((chosen) => chosen.which === 6).map((chosen) => [chosen.option, chosen.forced])).toEqual([
      [2, true],
      [2, true],
    ]);
  });

  it("chooses for one player who is not there without waiting for the clock", () => {
    const state = game(2);

    const one = moveFor(state, START + 10, CONFIG, 0);
    const both = moveFor(one, START + 20, CONFIG, 1);

    expect(one.phase).toBe("choose");
    expect(awaited(one)).toEqual([1]);
    expect(both.phase).toBe("pick");
    expect(moveFor(both, START + 30, CONFIG, 99)).toBe(both);
  });

  it("moves the time of a choice on with the game's other clocks, and drops it when the game is given up", () => {
    const state = game(3);

    expect(shiftClock(state, 5000).choosing).toEqual({ which: 5, since: START + 5000 });
    expect(abandon(state)).toMatchObject({ phase: "ended", choosing: null, turn: null });
  });

  it("reads a choice off the wire, and nothing that is not one", () => {
    expect(parseAction({ type: "choose", option: 2 })).toEqual({ type: "choose", option: 2 });
    expect(parseAction({ type: "choose", option: 3 })).toBeNull();
    expect(parseAction({ type: "choose" })).toBeNull();
    expect(parseAction({ type: "manhole", row: 1, col: 2 })).toEqual({ type: "manhole", row: 1, col: 2 });
    expect(parseAction({ type: "tree", row: 1 })).toBeNull();
    expect(parseAction({ type: "lay", row: 0, col: 0, turns: 1, cut: [{ row: 0, col: 0 }] })).toEqual({ type: "lay", row: 0, col: 0, turns: 1, cut: [{ row: 0, col: 0 }] });
    expect(parseAction({ type: "lay", row: 0, col: 0, turns: 1, cut: [{ row: 0 }] })).toBeNull();
    expect(parseAction({ type: "lay", row: 0, col: 0, turns: 1, cut: "all" })).toBeNull();
  });
});

describe("잔디 깔기: choice 5, 점수 or 정보", () => {
  it("gives 점수 its points at once, so that those who took them pick after those who did not", () => {
    const state = chooseAll(game(4), (player) => (player < 2 ? 1 : 2));

    expect(state.players.filter((player) => player.id < 2).map((player) => player.score)).toEqual([CONFIG.scoreBonus, CONFIG.scoreBonus]);
    expect(state.players.filter((player) => player.id >= 2).map((player) => player.score)).toEqual([0, 0]);
    expect(state.pickOrder.slice(0, 2).sort()).toEqual([2, 3]);
    expect(state.pickOrder.slice(2).sort()).toEqual([0, 1]);
  });

  it("lets 정보 look at the choices to come, and nobody else", () => {
    const state = chooseAll(game(3), (player) => (player === 1 ? 2 : 1));

    expect(viewFor(state, 1, CONFIG).preview).toEqual([6, 7, 8]);
    expect(viewFor(state, 0, CONFIG).preview).toEqual([]);
    expect(viewFor(state, null, CONFIG).preview).toEqual([]);
  });

  it("no longer counts a choice as one to come once it is put to everyone", () => {
    const picked = pickAll(chooseAll(game(3), (player) => (player === 1 ? 2 : 1)), 9);
    const seventh = chooseAll(picked, 1);

    expect(viewFor(picked, 1, CONFIG).preview).toEqual([7, 8]);
    expect(viewFor(seventh, 1, CONFIG).preview).toEqual([8]);
  });

  it("gives nobody a look ahead while choice 5 itself is being made", () => {
    const state = act(game(3), 1, { type: "choose", option: 2 });

    expect(viewFor(state, 1, CONFIG).preview).toEqual([]);
  });
});

describe("잔디 깔기: choice 6, 공격 or 방어", () => {
  it("doubles what a tile laid earns for 공격", () => {
    let state = upToLaying(2, { six: (player) => (player === 0 ? 1 : 2), tile: 9 });
    while (state.phase === "place") state = moveFor(state, START + 9000, CONFIG);

    expect(lineOf(state, 0)).toMatchObject({ laid: true, tile: 18, total: 18 });
    expect(lineOf(state, 1)).toMatchObject({ laid: true, tile: 9, total: 9 });
  });

  it("takes points from 공격 when the tile cannot be laid, and nothing from anyone else", () => {
    // room for one tile of nine cells and no more; paired, so that 견제 gives nobody anything
    let state = upToLaying(2, { six: 1, seven: 1, tile: 13, park: ["###", "###", "###"] });
    const first = onTurn(state);
    const second = state.players.map((player) => player.id).find((id) => id !== first)!;
    state = act(state, first, { type: "lay", row: 0, col: 0, turns: 0 });

    expect(state.failed).toEqual([second]);
    expect(lineOf(state, first)).toMatchObject({ laid: true, tile: 26 });
    expect(lineOf(state, second)).toMatchObject({ laid: false, tile: -CONFIG.attackLoss, total: -CONFIG.attackLoss });
    expect(state.players.find((player) => player.id === second)?.score).toBe(-CONFIG.attackLoss);
  });

  it("gives a 방어 player whose tile was not laid nothing, and takes nothing", () => {
    // tile 3 has ten cells: no cut of two makes it fit nine
    const state = upToLaying(2, { six: 2, seven: 1, tile: 3, park: ["###", "###", "###"] });

    expect(state.phase).toBe("ended");
    expect(state.failed.sort()).toEqual([0, 1]);
    expect(lineOf(state, 0)).toMatchObject({ laid: false, tile: 0, total: 0 });
  });

  it("lets a 방어 player cut cells off the tile as it is laid", () => {
    // tile 13 less its bottom left cell
    const state = upToLaying(2, { six: 2, tile: 13, park: ["###", "###", ".##", "...", "###", "###", "###"] });
    const first = onTurn(state);
    const cut = [{ row: 2, col: 0 }];

    const next = act(state, first, { type: "lay", row: 0, col: 0, turns: 0, cut });

    expect(refusal(state, first, { type: "lay", row: 0, col: 0, turns: 0 })).toBe("does-not-fit");
    expect(next.placed[0]).toMatchObject({ player: first, tile: 13, row: 0, col: 0, turns: 0, cut });
    expect(next.history.find((event) => event.type === "lay")).toMatchObject({ player: first, tile: 13, cut: 1, forced: false });
  });

  it("keeps the cells cut off a tile free for the next tile", () => {
    const state = upToLaying(2, { six: 2, tile: 13, park: ["####", "####", "####", "####"] });
    const first = onTurn(state);

    const next = act(state, first, { type: "lay", row: 0, col: 0, turns: 0, cut: [{ row: 2, col: 0 }, { row: 2, col: 1 }] });

    const shape = shapeOf(13, next.placed[0].cut);
    expect(shape?.cells).toHaveLength(7);
    expect(coveredBy(shape!, 0, 0, 0).some((cell) => cell.row === 2 && cell.col === 0)).toBe(false);
    // a tile laid whole there afterwards would lie on the first: only the cut cells are free
    expect(fits(next.park, next.placed, 13, 1, 0, 0)).toBe(false);
    expect(fits(next.park, next.placed, 13, 0, 0, 0)).toBe(false);
  });

  it("gives the tile its whole number in points however much was cut off it", () => {
    let state = upToLaying(2, { six: 2, tile: 13, park: ["###", "###", ".##", "...", "###", "###", "###"] });
    const first = onTurn(state);
    state = act(state, first, { type: "lay", row: 0, col: 0, turns: 0, cut: [{ row: 2, col: 0 }] });
    while (state.phase === "place") state = moveFor(state, START + 9000, CONFIG);

    expect(lineOf(state, first)).toMatchObject({ laid: true, tile: 13, total: 13 });
  });

  it("refuses a cut from a player who chose 공격", () => {
    const state = upToLaying(2, { six: 1, tile: 13, park: ["###", "###", ".##", "...", "###", "###", "###"] });

    expect(refusal(state, onTurn(state), { type: "lay", row: 0, col: 0, turns: 0, cut: [{ row: 2, col: 0 }] })).toBe("bad-cut");
  });

  it("refuses a cut the card does not allow", () => {
    const state = upToLaying(2, { six: 2, tile: 13 });
    const player = onTurn(state);
    const lay = (cut: { row: number; col: number }[]): string => refusal(state, player, { type: "lay", row: 0, col: 0, turns: 0, cut });

    // the cell with the number; a cell in the middle; two cells apart; three cells; a cell that is not there
    expect(lay([{ row: 0, col: 2 }])).toBe("bad-cut");
    expect(lay([{ row: 1, col: 1 }])).toBe("bad-cut");
    expect(lay([{ row: 0, col: 0 }, { row: 2, col: 2 }])).toBe("bad-cut");
    expect(lay([{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }])).toBe("bad-cut");
    expect(lay([{ row: 5, col: 5 }])).toBe("bad-cut");
    expect(lay([{ row: 0.5, col: 0 }])).toBe("bad-cut");
  });

  it("does not fail a 방어 player whose tile has room once cut, and fails one who chose 공격", () => {
    const park = ["###", "###", ".##"];
    const defending = upToLaying(2, { six: 2, tile: 13, park });
    const attacking = upToLaying(2, { six: 1, tile: 13, park });

    expect(defending.phase).toBe("place");
    expect(defending.failed).toEqual([]);
    expect(attacking.phase).toBe("ended");
    expect(attacking.failed.sort()).toEqual([0, 1]);
  });

  it("cuts the tile for a 방어 player the room lays for, only when it has no room whole", () => {
    const tight = upToLaying(2, { six: 2, tile: 13, park: ["###", "###", ".##"] });
    const roomy = upToLaying(2, { six: 2, tile: 13 });

    const cutLaid = moveFor(tight, START + 9000, CONFIG);
    const wholeLaid = moveFor(roomy, START + 9000, CONFIG);

    expect(cutLaid.placed[0].cut).toHaveLength(1);
    expect(cutLaid.history.find((event) => event.type === "lay")).toMatchObject({ forced: true, cut: 1 });
    expect(wholeLaid.placed[0].cut).toBeUndefined();
    expect(waysFor(roomy, onTurn(roomy), CONFIG)[0].cut).toBeUndefined();
  });
});

describe("잔디 깔기: what may be cut off a tile", () => {
  const thirteen = tileOf(13)!;
  const nine = tileOf(9)!;

  it("allows cutting nothing, one cell, or two cells that lie together", () => {
    expect(canCut(thirteen, [], CONFIG.cutMax)).toBe(true);
    expect(canCut(thirteen, [{ row: 0, col: 0 }], CONFIG.cutMax)).toBe(true);
    expect(canCut(thirteen, [{ row: 0, col: 0 }, { row: 1, col: 0 }], CONFIG.cutMax)).toBe(true);
  });

  it("never the cell with the number on it", () => {
    expect(canCut(thirteen, [{ row: 0, col: 2 }], CONFIG.cutMax)).toBe(false);
    expect(canCut(nine, [{ row: 1, col: 1 }], CONFIG.cutMax)).toBe(false);
  });

  it("not two cells that do not lie together", () => {
    expect(canCut(thirteen, [{ row: 0, col: 0 }, { row: 2, col: 0 }], CONFIG.cutMax)).toBe(false);
    expect(canCut(thirteen, [{ row: 0, col: 0 }, { row: 1, col: 1 }], CONFIG.cutMax)).toBe(false);
  });

  it("not more cells than the card says", () => {
    expect(canCut(thirteen, [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }], 3)).toBe(true);
    expect(canCut(thirteen, [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }], CONFIG.cutMax)).toBe(false);
    expect(canCut(thirteen, [{ row: 2, col: 0 }], 0)).toBe(false);
  });

  it("not a cell that leaves an empty one shut in the middle of the tile", () => {
    expect(canCut(thirteen, [{ row: 1, col: 1 }], CONFIG.cutMax)).toBe(false);
    // the middle and the cell under it: the gap opens to the outside, so nothing is shut in
    expect(canCut(thirteen, [{ row: 1, col: 1 }, { row: 2, col: 1 }], CONFIG.cutMax)).toBe(true);
  });

  it("not a cell that leaves the tile in two pieces", () => {
    // tile 9 is a column of five with one cell beside it: cutting the column's third cell parts it
    expect(canCut(nine, [{ row: 2, col: 1 }], CONFIG.cutMax)).toBe(false);
    expect(canCut(nine, [{ row: 4, col: 1 }], CONFIG.cutMax)).toBe(true);
  });

  it("not a cell the tile does not have, nor the same cell twice", () => {
    expect(canCut(nine, [{ row: 0, col: 0 }], CONFIG.cutMax)).toBe(false);
    expect(canCut(thirteen, [{ row: 0, col: 0 }, { row: 0, col: 0 }], CONFIG.cutMax)).toBe(false);
  });

  it("lists every cut a tile allows, nothing cut first", () => {
    const cuts = cutsOf(thirteen, CONFIG.cutMax);

    expect(cuts[0]).toEqual([]);
    expect(cuts.every((cut) => canCut(thirteen, cut, CONFIG.cutMax))).toBe(true);
    expect(cuts.some((cut) => cut.some((cell) => cell.row === 0 && cell.col === 2))).toBe(false);
    // singles come before pairs
    expect(cuts.findIndex((cut) => cut.length === 2)).toBeGreaterThan(cuts.findIndex((cut) => cut.length === 1));
    expect(cutsOf(thirteen, 0)).toEqual([[]]);
  });
});

describe("잔디 깔기: choice 7, 상생 or 견제", () => {
  it("pairs the 상생 players by priority, and leaves an odd one without a partner", () => {
    let state = pickAll(chooseAll(game(5), 2), 9);
    state = chooseAll(state, 1);
    const order = state.players.map((player) => player.id);

    const after = chooseAll(state, (player) => (player === order[4] ? 2 : 1));
    const all = chooseAll(state, (player) => (player === order[3] || player === order[4] ? 2 : 1));

    expect(after.pairs).toEqual([
      [order[0], order[1]],
      [order[2], order[3]],
    ]);
    expect(all.pairs).toEqual([[order[0], order[1]]]);
    expect(all.history.filter((event) => event.type === "alone")).toEqual([{ type: "alone", round: 1, player: order[2] }]);
    expect(viewFor(after, null, CONFIG).pairs).toEqual(after.pairs);
  });

  it("gives a pair a point for every side their two tiles share, halved between them", () => {
    let state = upToLaying(2, { seven: 1, tile: 13 });
    const [first, second] = state.layOrder;
    state = act(state, first, { type: "lay", row: 0, col: 0, turns: 0 });
    // one row lower: two sides of the three are shared
    state = act(state, second, { type: "lay", row: 1, col: 3, turns: 0 });

    expect(state.pairs).toHaveLength(1);
    expect(lineOf(state, first)).toMatchObject({ pair: 1, total: 14 });
    expect(lineOf(state, second)).toMatchObject({ pair: 1, total: 14 });
  });

  it("gives an odd point to the one of the pair who stands higher in the priority when they have the same points", () => {
    let state = upToLaying(2, { seven: 1, tile: 13 });
    const [first, second] = state.layOrder;
    state = act(state, first, { type: "lay", row: 0, col: 0, turns: 0 });
    // side by side: three sides shared
    state = act(state, second, { type: "lay", row: 0, col: 3, turns: 0 });
    const higher = state.players[0].id;
    const lower = state.players[1].id;

    expect(lineOf(state, higher).pair).toBe(2);
    expect(lineOf(state, lower).pair).toBe(1);
  });

  it("gives an odd point to the one of the pair with fewer points", () => {
    // player 1 took 점수 and is five ahead
    let state = upToLaying(2, { five: (player) => (player === 1 ? 1 : 2), seven: 1, tile: 13 });
    const [first, second] = state.layOrder;
    state = act(state, first, { type: "lay", row: 0, col: 0, turns: 0 });
    state = act(state, second, { type: "lay", row: 0, col: 3, turns: 0 });

    expect(lineOf(state, 0).pair).toBe(2);
    expect(lineOf(state, 1).pair).toBe(1);
  });

  it("gives a pair nothing when their tiles do not touch, or one of them was not laid", () => {
    let apart = upToLaying(2, { seven: 1, tile: 9 });
    const [first, second] = apart.layOrder;
    apart = act(apart, first, { type: "lay", row: 0, col: 0, turns: 0 });
    apart = act(apart, second, { type: "lay", row: 0, col: 4, turns: 0 });
    let alone = upToLaying(2, { seven: 1, tile: 13, park: ["###", "###", "###"] });
    alone = act(alone, onTurn(alone), { type: "lay", row: 0, col: 0, turns: 0 });

    expect(lineOf(apart, first).pair + lineOf(apart, second).pair).toBe(0);
    expect(lineOf(alone, 0).pair + lineOf(alone, 1).pair).toBe(0);
  });

  it("gives 견제 its points when few enough players lay their tile", () => {
    // four players, so two at most; the park has room for two tiles of nine
    let state = upToLaying(4, { seven: (player) => (player < 2 ? 2 : 1), six: 2, tile: 13, park: ["######", "######", "######"] });
    while (state.phase === "place") state = moveFor(state, START + 9000, CONFIG);

    expect(state.placed).toHaveLength(2);
    expect(lineOf(state, 0).check).toBe(CONFIG.checkBonus);
    expect(lineOf(state, 1).check).toBe(CONFIG.checkBonus);
    expect(lineOf(state, 2).check).toBe(0);
  });

  it("gives 견제 nothing when more players than that lay their tile", () => {
    let state = upToLaying(4, { seven: 2, tile: 9 });
    while (state.phase === "place") state = moveFor(state, START + 9000, CONFIG);

    expect(state.placed).toHaveLength(4);
    expect(state.players.map((player) => lineOf(state, player.id).check)).toEqual([0, 0, 0, 0]);
  });

  it("keeps the document's share for a smaller game: nine of sixteen", () => {
    expect(checkAtMostFor(16, CONFIG)).toBe(9);
    expect(checkAtMostFor(6, CONFIG)).toBe(3);
    expect(checkAtMostFor(4, CONFIG)).toBe(2);
    expect(checkAtMostFor(3, CONFIG)).toBe(1);
    expect(checkAtMostFor(2, CONFIG)).toBe(1);
    expect(viewFor(game(4), 0, CONFIG).checkAtMost).toBe(2);
  });
});

describe("잔디 깔기: choice 8, 가로수 or 맨홀", () => {
  it("has the 맨홀 players put a +1 and then a -1 on the park, in the order of laying, before any tree", () => {
    const state = upToMarks(3, { eight: (player) => (player === 0 ? 1 : 2), tile: (player) => [9, 7, 13][player] });
    const first = onTurn(state);

    const one = act(state, first, { type: "manhole", row: 0, col: 0 });
    const two = act(one, first, { type: "manhole", row: 0, col: 1 }, START + 2000);

    expect(state.phase).toBe("manholes");
    // tiles 7 and 13 chose manholes: the lower number goes first
    expect(first).toBe(1);
    expect(deadline(state, CONFIG)).toBe(state.turn!.since + MARK_MS);
    expect(one.manholes).toEqual([{ row: 0, col: 0, value: 1, by: 1 }]);
    expect(onTurn(one)).toBe(1);
    expect(two.manholes[1]).toEqual({ row: 0, col: 1, value: -1, by: 1 });
    expect(onTurn(two)).toBe(2);
    expect(two.phase).toBe("manholes");
  });

  it("goes on to the trees once the manholes are down, and to the laying once the trees are", () => {
    let state = upToMarks(2, { eight: (player) => (player === 0 ? 1 : 2) });
    state = act(state, 1, { type: "manhole", row: 0, col: 0 });
    state = act(state, 1, { type: "manhole", row: 0, col: 1 });
    const trees = state;
    state = act(state, 0, { type: "tree", row: 5, col: 5 });

    expect(trees.phase).toBe("trees");
    expect(onTurn(trees)).toBe(0);
    expect(state.trees).toEqual([{ row: 5, col: 5, by: 0 }]);
    expect(state.phase).toBe("place");
    expect(viewFor(state, null, CONFIG)).toMatchObject({ manholes: state.manholes, trees: state.trees });
  });

  it("passes over the manholes when nobody chose them, and over the trees when nobody chose those", () => {
    expect(upToMarks(2, { eight: 1 }).phase).toBe("trees");
    const manholes = upToMarks(2, { eight: 2 });
    let state = manholes;
    while (state.phase === "manholes") state = moveFor(state, START + 5000, CONFIG);

    expect(manholes.phase).toBe("manholes");
    expect(state.phase).toBe("place");
  });

  it("refuses a manhole off the park, on another manhole, or out of turn", () => {
    const state = act(upToMarks(2, { eight: 2, park: ["###", "###", "###", "..."] }), 0, { type: "manhole", row: 0, col: 0 });
    const turn = onTurn(state);
    const other = turn === 0 ? 1 : 0;

    expect(refusal(state, turn, { type: "manhole", row: 3, col: 0 })).toBe("bad-cell");
    expect(refusal(state, turn, { type: "manhole", row: 0, col: 0 })).toBe("bad-cell");
    expect(refusal(state, turn, { type: "manhole", row: 0.5, col: 0 })).toBe("bad-cell");
    expect(refusal(state, other, { type: "manhole", row: 1, col: 1 })).toBe("not-your-turn");
    expect(refusal(state, turn, { type: "tree", row: 1, col: 1 })).toBe("not-marking");
  });

  it("refuses a tree on a manhole or on another tree", () => {
    let state = upToMarks(3, { eight: (player) => (player === 0 ? 2 : 1) });
    state = act(state, 0, { type: "manhole", row: 0, col: 0 });
    state = act(state, 0, { type: "manhole", row: 0, col: 1 });
    const first = onTurn(state);
    const planted = act(state, first, { type: "tree", row: 2, col: 2 });

    expect(refusal(state, first, { type: "tree", row: 0, col: 0 })).toBe("bad-cell");
    expect(refusal(planted, onTurn(planted), { type: "tree", row: 2, col: 2 })).toBe("bad-cell");
    expect(refusal(state, first, { type: "manhole", row: 3, col: 3 })).toBe("not-marking");
  });

  it("puts nothing on the park for a player who is out of time, and says how much was left", () => {
    const state = act(upToMarks(2, { eight: (player) => (player === 0 ? 2 : 1) }), 0, { type: "manhole", row: 0, col: 0 }, START + 2000);

    const manholesOver = applyTimeout(state, START + 2000 + MARK_MS, CONFIG);
    const treesOver = applyTimeout(manholesOver, START + 2000 + MARK_MS * 2, CONFIG);

    expect(applyTimeout(state, START + 2000 + MARK_MS - 1, CONFIG)).toBe(state);
    expect(manholesOver.history.at(-1)).toEqual({ type: "skip", round: 1, player: 0, what: "manhole", left: 1 });
    expect(manholesOver.manholes).toHaveLength(1);
    expect(manholesOver.phase).toBe("trees");
    expect(treesOver.history.at(-1)).toEqual({ type: "skip", round: 1, player: 1, what: "tree", left: 1 });
    expect(treesOver.trees).toEqual([]);
    expect(treesOver.phase).toBe("place");
  });

  it("lets only a holed cell of a tile lie over a tree", () => {
    const park = { rows: ["###", "###", "###", ".#."] };
    const middle = [{ row: 1, col: 1 }];
    const corner = [{ row: 0, col: 2 }];

    // tile 13: holes everywhere but the cell with its number, top right; tile 3 has no hole at all
    expect(fits(park, [], 13, 0, 0, 0, { trees: middle })).toBe(true);
    expect(fits(park, [], 13, 0, 0, 0, { trees: corner })).toBe(false);
    expect(fits(park, [], 13, 0, 0, 1, { trees: corner })).toBe(true);
    expect(fits(park, [], 3, 0, 0, 0, { trees: middle })).toBe(false);
    expect(fits(park, [], 3, 0, 0, 0)).toBe(true);
  });

  it("fails a player whose tile has no room left because of a tree", () => {
    // 공격: nothing can be cut off the tile to keep it clear of the tree
    let state = upToMarks(2, { six: 1, eight: 1, tile: 3, park: ["###", "###", "###", ".#.", "...", "###", "###", "###", ".#."] });
    state = act(state, onTurn(state), { type: "tree", row: 1, col: 1 });
    state = act(state, onTurn(state), { type: "tree", row: 6, col: 1 });

    expect(state.phase).toBe("ended");
    expect(state.failed.sort()).toEqual([0, 1]);
  });

  it("lets a 방어 player keep clear of a tree by cutting the cells that would lie on it", () => {
    let state = upToMarks(2, { six: 2, eight: 1, tile: 3, park: ["###", "###", "###", ".#."] });
    state = act(state, onTurn(state), { type: "tree", row: 1, col: 1 });
    state = skipMarks(state);
    const player = onTurn(state);

    // the middle cell and the one to its left: the gap opens to the side, and the tile stays in one piece
    const cut = [{ row: 1, col: 0 }, { row: 1, col: 1 }];
    const next = act(state, player, { type: "lay", row: 0, col: 0, turns: 0, cut });

    expect(refusal(state, player, { type: "lay", row: 0, col: 0, turns: 0 })).toBe("does-not-fit");
    expect(next.placed[0].cut).toEqual(cut);
  });

  it("gives a point for each +1 manhole under a tile and takes one for each -1", () => {
    let state = upToMarks(2, { eight: 2, tile: 13 });
    // both of the first player's under where the first tile will lie, the second player's apart
    const first = onTurn(state);
    state = act(state, first, { type: "manhole", row: 0, col: 0 });
    state = act(state, first, { type: "manhole", row: 5, col: 5 });
    const second = onTurn(state);
    state = act(state, second, { type: "manhole", row: 1, col: 1 });
    state = act(state, second, { type: "manhole", row: 5, col: 4 });
    const [one, other] = state.layOrder;
    state = act(state, one, { type: "lay", row: 0, col: 0, turns: 0 });
    state = act(state, other, { type: "lay", row: 3, col: 3, turns: 0 });

    // the first tile lies on two +1; the second on two -1
    expect(lineOf(state, one)).toMatchObject({ manholes: 2, total: 15 });
    expect(lineOf(state, other)).toMatchObject({ manholes: -2, total: 11 });
  });

  it("does not double what the manholes give for 공격", () => {
    let state = upToMarks(2, { six: 1, seven: 1, eight: 2, tile: 13 });
    const first = onTurn(state);
    state = act(state, first, { type: "manhole", row: 0, col: 0 });
    state = act(state, first, { type: "manhole", row: 5, col: 5 });
    state = skipMarks(state);
    const [one] = state.layOrder;
    state = act(state, one, { type: "lay", row: 0, col: 0, turns: 0 });

    expect(scoreLines(state, CONFIG).find((line) => line.player === one)).toMatchObject({ tile: 26, manholes: 1, total: 27 });
  });
});

describe("잔디 깔기: the end of a park played with its choices", () => {
  it("counts the points line by line, adds them up, and ends the game after its one park", () => {
    let state = upToLaying(3, { five: 1, tile: 9 });
    while (state.phase === "place") state = moveFor(state, START + 9000, CONFIG);

    const score = state.history.at(-2);
    expect(state.phase).toBe("ended");
    expect(state.history.at(-1)).toEqual({ type: "ended", round: 1, reason: "rounds" });
    expect(score?.type === "score" ? score.lines.map((line) => line.player) : []).toEqual(state.players.map((player) => player.id));
    for (const player of state.players) {
      const line = lineOf(state, player.id);
      expect(line.total).toBe(line.tile + line.manholes + line.pair + line.check);
      // the five of 점수 and the nine of the tile
      expect(player.score).toBe(CONFIG.scoreBonus + line.total);
    }
  });

  it("leaves the state it was given as it was", () => {
    const state = upToMarks(2, { eight: 2 });
    const before = JSON.stringify(state);

    act(state, onTurn(state), { type: "manhole", row: 0, col: 0 });
    moveFor(state, START + 5000, CONFIG);

    expect(JSON.stringify(state)).toBe(before);
  });
});
