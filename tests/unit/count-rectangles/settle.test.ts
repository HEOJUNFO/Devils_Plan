import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/count-rectangles/config.json";
import {
  abandon,
  applyAction,
  applyTimeout,
  awaited,
  cardOf,
  createGame,
  deadline,
  endDuel,
  isValidConfig,
  moveFor,
  optionOf,
  scoreLines,
  shiftClock,
  viewFor,
  type Option,
  type RectConfig,
  type RectPlayer,
  type RectState,
} from "../../../src/shared/games/count-rectangles/rules";

/** The rules as shipped: the third choice follows the race. */
const CONFIG: RectConfig = shipped;

/** An arbitrary moment the tests call the start of the game, in ms. */
const START = 1_000_000;
const CHOOSE_MS = CONFIG.chooseSeconds * 1000;
const PROBLEM_MS = CONFIG.problemSeconds * 1000;

/** `count` players, each alone, ids 0..count-1. */
function alone(count: number): RectPlayer[] {
  return Array.from({ length: count }, (_, id) => ({ id, team: 0 }));
}

/** Teams of three from id 0 up (`teams` of them), then `others` players alone. */
function teamed(teams: number, others: number): RectPlayer[] {
  const players: RectPlayer[] = [];
  for (let team = 1; team <= teams; team++) for (let k = 0; k < 3; k++) players.push({ id: players.length, team });
  for (let k = 0; k < others; k++) players.push({ id: players.length, team: 0 });
  return players;
}

function game(players: RectPlayer[], config: RectConfig = CONFIG, seed = 7): RectState {
  const created = createGame({ players, seed, now: START }, config);
  if (!created.ok) throw new Error(`fixture game refused: ${created.reason}`);
  return created.state;
}

/** Applies an action that the test expects to be accepted. */
function act(state: RectState, player: number, action: Parameters<typeof applyAction>[2], now: number, config: RectConfig = CONFIG): RectState {
  const result = applyAction(state, player, action, now, config);
  if (!result.ok) throw new Error(`fixture action refused: ${result.reason}`);
  return result.state;
}

/** `player` buzzes at `now` and says the right number a second later. */
function solve(state: RectState, player: number, now: number, config: RectConfig = CONFIG): RectState {
  return act(act(state, player, { type: "buzz" }, now, config), player, { type: "answer", count: state.answer }, now + 1000, config);
}

/** `player` buzzes at `now` and says a wrong number a second later. */
function miss(state: RectState, player: number, now: number, config: RectConfig = CONFIG): RectState {
  return act(act(state, player, { type: "buzz" }, now, config), player, { type: "answer", count: state.answer + 1 }, now + 1000, config);
}

/**
 * The race played out: each of `winners` in turn (one player of each unit
 * that is to win) answers two problems right. Returns the game with the
 * third choice up, and a moment shortly after it came up.
 */
function raced(state: RectState, winners: number[], config: RectConfig = CONFIG): { state: RectState; now: number } {
  let now = START + 1000;
  let current = state;
  for (const player of winners) {
    for (let right = 0; right < config.winsNeeded; right++) {
      current = solve(current, player, now, config);
      now += 2000;
      if (current.pauseUntil !== null) {
        now = current.pauseUntil;
        current = applyTimeout(current, now, config);
        now += 1000;
      }
    }
  }
  if (current.phase !== "choose") throw new Error(`fixture: the race is not over (${current.phase})`);
  return { state: current, now };
}

/** Everyone in `options` chooses, in the order given. */
function choose(state: RectState, options: [number, Option][], now: number, config: RectConfig = CONFIG): RectState {
  return options.reduce((current, [player, option]) => act(current, player, { type: "choose", option }, now, config), state);
}

/** `player`'s points, as the game counted them. */
function pointsOf(state: RectState, player: number): number | undefined {
  return state.scores?.find((line) => line.player === player)?.total;
}

describe("the shipped rules of the third choice", () => {
  it("are playable", () => {
    expect(isValidConfig(CONFIG)).toBe(true);
  });

  it("keep the numbers the document gives", () => {
    expect(CONFIG).toMatchObject({
      winPoints: 7,
      losePoints: 3,
      hogLeader: 5,
      hogMember: 1,
      devoteLeader: 1,
      devoteMember: 3,
      sacrificeLeader: 3,
      blameMember: 2,
      safeLoss: 1,
      duelLoss: 3,
      duelPieces: 3,
    });
  });

  it("share out among a winning team exactly what a player alone wins", () => {
    expect(CONFIG.hogLeader + 2 * CONFIG.hogMember).toBe(CONFIG.winPoints);
    expect(CONFIG.devoteLeader + 2 * CONFIG.devoteMember).toBe(CONFIG.winPoints);
  });

  it.each([
    ["no word on whether the choice is made", { settle: undefined as unknown as boolean }],
    ["no time to choose in", { chooseSeconds: 0 }],
    ["an added contest of no problems", { duelProblems: 0 }],
    ["points below nought to win", { winPoints: -1 }],
    ["a share that is not whole", { devoteMember: 1.5 }],
    ["an option the room would choose that is neither of the two", { defaultOptions: { winners: 3, losers: 1, alone: 2 } }],
  ])("are not playable with %s", (_what, change) => {
    expect(isValidConfig({ ...CONFIG, ...change })).toBe(false);
  });
});

describe("the end of the race", () => {
  it("puts the third choice to everyone once half the units have won, and counts no points yet", () => {
    const { state } = raced(game(alone(2)), [1]);

    expect(state.phase).toBe("choose");
    expect(state.raced).toBe("half");
    expect(state.scores).toBeNull();
    expect(state.history.at(-1)).toEqual({ type: "raced", round: state.round, reason: "half" });
    expect(awaited(state)).toEqual([0, 1]);
  });

  it("puts it to everyone as well when the last problem allowed has been played", () => {
    const config = { ...CONFIG, maxProblems: 1 };

    const state = applyTimeout(game(alone(2), config), START + PROBLEM_MS, config);

    expect(state.phase).toBe("choose");
    expect(state.history.at(-1)).toEqual({ type: "raced", round: 1, reason: "problems" });
  });

  it("gives everyone the configured time to choose", () => {
    const { state } = raced(game(alone(2)), [1]);

    expect(deadline(state, CONFIG)).toBe((state.choosing?.since ?? 0) + CHOOSE_MS);
  });

  it("gives each player the card of how their side came out: a team that won, a team that did not, a player alone", () => {
    // teams 0-1-2 and 3-4-5, players 6 and 7 alone: the first team and player 6 win
    const { state } = raced(game(teamed(2, 2)), [0, 6]);

    expect([0, 1, 2].map((player) => cardOf(state, player))).toEqual(["winners", "winners", "winners"]);
    expect([3, 4, 5].map((player) => cardOf(state, player))).toEqual(["losers", "losers", "losers"]);
    expect([6, 7].map((player) => cardOf(state, player))).toEqual(["alone", "alone"]);
    expect(cardOf(state, 99)).toBeNull();
  });
});

describe("choosing", () => {
  it("takes either option from a player, and waits for the rest", () => {
    const { state, now } = raced(game(alone(3)), [1, 2]);

    const after = act(state, 0, { type: "choose", option: 2 }, now);

    expect(after.phase).toBe("choose");
    expect(optionOf(after, 0)).toBe(2);
    expect(awaited(after)).toEqual([1, 2]);
  });

  it.each([
    ["an option there is not", { type: "choose" as const, option: 3 }, "bad-action"],
    ["no whole option", { type: "choose" as const, option: 1.5 }, "bad-action"],
    ["a buzz: no problem is open", { type: "buzz" as const }, "not-open"],
  ])("refuses %s", (_what, action, reason) => {
    const { state, now } = raced(game(alone(2)), [1]);

    expect(applyAction(state, 0, action, now, CONFIG)).toEqual({ ok: false, reason });
  });

  it("refuses a second choice: one made stands", () => {
    const { state, now } = raced(game(alone(3)), [1, 2]);
    const after = act(state, 0, { type: "choose", option: 2 }, now);

    expect(applyAction(after, 0, { type: "choose", option: 1 }, now, CONFIG)).toEqual({ ok: false, reason: "already-chosen" });
  });

  it("refuses a choice while the race is on, and from someone who is not in the game", () => {
    const racing = game(alone(2));
    const { state, now } = raced(racing, [1]);

    expect(applyAction(racing, 0, { type: "choose", option: 1 }, START, CONFIG)).toEqual({ ok: false, reason: "not-choosing" });
    expect(applyAction(state, 9, { type: "choose", option: 1 }, now, CONFIG)).toEqual({ ok: false, reason: "not-playing" });
  });

  it("keeps what a player chose from everyone else until all have chosen", () => {
    const { state, now } = raced(game(alone(3)), [1, 2]);
    const after = act(state, 0, { type: "choose", option: 1 }, now);

    const own = viewFor(after, 0);
    const other = viewFor(after, 1);
    const watching = viewFor(after, null);

    expect(own.choosing).toEqual({ card: "alone", chosen: [0], mine: 1 });
    expect(other.choosing).toEqual({ card: "alone", chosen: [0], mine: null });
    expect(watching.choosing).toEqual({ card: null, chosen: [0], mine: null });
    expect(JSON.stringify(other)).not.toContain('"option"');
    expect(other.choices).toEqual([]);
  });

  it("does not change the state it was given", () => {
    const { state, now } = raced(game(alone(2)), [1]);
    const before = structuredClone(state);

    act(state, 0, { type: "choose", option: 2 }, now);

    expect(state).toEqual(before);
  });
});

describe("players alone", () => {
  it("lose a point for 안전, winner and loser alike, and the game is over when nobody takes 도전", () => {
    const { state, now } = raced(game(alone(2)), [1]);

    const ended = choose(state, [[0, 2], [1, 2]], now);

    expect(ended.phase).toBe("ended");
    expect(ended.duel).toBeNull();
    expect(ended.scores).toEqual([
      { player: 0, race: -CONFIG.losePoints, choice: -CONFIG.safeLoss, pieces: 0, total: -CONFIG.losePoints - CONFIG.safeLoss },
      { player: 1, race: CONFIG.winPoints, choice: -CONFIG.safeLoss, pieces: 0, total: CONFIG.winPoints - CONFIG.safeLoss },
    ]);
    expect(ended.history.slice(-3).map((event) => event.type)).toEqual(["choice", "score", "ended"]);
    expect(ended.history.at(-1)).toEqual({ type: "ended", round: state.round, reason: "half" });
  });

  it("shows everyone what each chose once all have chosen", () => {
    const { state, now } = raced(game(alone(2)), [1]);

    const ended = choose(state, [[1, 2], [0, 2]], now);

    expect(viewFor(ended, null).choices).toEqual([
      { player: 1, option: 2, forced: false },
      { player: 0, option: 2, forced: false },
    ]);
    expect(viewFor(ended, null).choosing).toBeNull();
  });
});

describe("teams", () => {
  // teams 0-1-2 and 3-4-5, players 6 and 7 alone: the first team and player 6 win
  const fixture = () => raced(game(teamed(2, 2)), [1, 6]);
  const rest: [number, Option][] = [[6, 2], [7, 2]];

  it("decide by what most of their players chose", () => {
    const { state, now } = fixture();

    const ended = choose(state, [[0, 1], [1, 2], [2, 2], [3, 2], [4, 1], [5, 1], ...rest], now);

    expect(ended.decisions).toEqual([
      { unit: 0, option: 2 },
      { unit: 1, option: 1 },
    ]);
  });

  it("give a winning team's leader one point and the others three each with 헌신", () => {
    const { state, now } = fixture();

    const ended = choose(state, [[0, 1], [1, 2], [2, 2], [3, 1], [4, 1], [5, 1], ...rest], now);

    expect([0, 1, 2].map((player) => pointsOf(ended, player))).toEqual([CONFIG.devoteLeader, CONFIG.devoteMember, CONFIG.devoteMember]);
  });

  it("give a winning team's leader five points and the others one each with 독식", () => {
    const { state, now } = fixture();

    const ended = choose(state, [[0, 1], [1, 1], [2, 2], [3, 1], [4, 1], [5, 1], ...rest], now);

    expect([0, 1, 2].map((player) => pointsOf(ended, player))).toEqual([CONFIG.hogLeader, CONFIG.hogMember, CONFIG.hogMember]);
  });

  it("take three points from a losing team's leader alone with 희생", () => {
    const { state, now } = fixture();

    const ended = choose(state, [[0, 2], [1, 2], [2, 2], [3, 2], [4, 1], [5, 1], ...rest], now);

    expect([3, 4, 5].map((player) => pointsOf(ended, player))).toEqual([-CONFIG.sacrificeLeader, 0, 0]);
  });

  it("take two points from each of a losing team's other two with 질책", () => {
    const { state, now } = fixture();

    const ended = choose(state, [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 1], ...rest], now);

    expect([3, 4, 5].map((player) => pointsOf(ended, player))).toEqual([0, -CONFIG.blameMember, -CONFIG.blameMember]);
  });

  it("are led by whoever took the team first, and without that being known by their lowest player", () => {
    const players: RectPlayer[] = [
      { id: 0, team: 1, since: 5 },
      { id: 1, team: 1, since: 2 },
      { id: 2, team: 1, since: 9 },
      { id: 3, team: 2 },
      { id: 4, team: 2 },
      { id: 5, team: 2 },
    ];

    const state = game(players);

    expect(state.units.map((unit) => unit.leader)).toEqual([1, 3]);
  });

  it("have no leader where a player is alone", () => {
    expect(game(alone(2)).units.map((unit) => unit.leader)).toEqual([null, null]);
  });
});

describe("the clock of the choice", () => {
  it("chooses for everyone who has not when the time is up: 헌신, 희생, 안전", () => {
    const { state } = raced(game(teamed(2, 2)), [1, 6]);
    const due = deadline(state, CONFIG)!;

    const ended = applyTimeout(state, due, CONFIG);

    expect(ended.phase).toBe("ended");
    expect(ended.choices.every((chosen) => chosen.forced)).toBe(true);
    expect([0, 3, 6].map((player) => optionOf(ended, player))).toEqual([
      CONFIG.defaultOptions.winners,
      CONFIG.defaultOptions.losers,
      CONFIG.defaultOptions.alone,
    ]);
    expect(CONFIG.defaultOptions).toEqual({ winners: 2, losers: 1, alone: 2 });
  });

  it("leaves a choice already made as it was", () => {
    const { state, now } = raced(game(alone(3)), [1, 2]);
    const chosen = act(state, 0, { type: "choose", option: 1 }, now);

    const after = applyTimeout(chosen, deadline(chosen, CONFIG)!, CONFIG);

    expect(after.choices[0]).toEqual({ player: 0, option: 1, forced: false });
    expect(after.choices.slice(1).every((each) => each.forced)).toBe(true);
  });

  it("does nothing before the time is up", () => {
    const { state } = raced(game(alone(2)), [1]);

    expect(applyTimeout(state, deadline(state, CONFIG)! - 1, CONFIG)).toBe(state);
  });

  it("is moved on with the game when it stood still", () => {
    const { state } = raced(game(alone(2)), [1]);

    const moved = shiftClock(state, 4000);

    expect(deadline(moved, CONFIG)).toBe(deadline(state, CONFIG)! + 4000);
  });
});

describe("a player the room does not wait for", () => {
  it("is given at once what the room would choose at the end of the time", () => {
    const { state, now } = raced(game(alone(3)), [1, 2]);

    const after = moveFor(state, 0, now, CONFIG);

    expect(after.choices).toEqual([{ player: 0, option: CONFIG.defaultOptions.alone, forced: true }]);
    expect(awaited(after)).toEqual([1, 2]);
  });

  it("settles the choice when theirs was the last awaited", () => {
    const { state, now } = raced(game(alone(2)), [1]);
    const one = act(state, 1, { type: "choose", option: 2 }, now);

    expect(moveFor(one, 0, now, CONFIG).phase).toBe("ended");
  });

  it("is left alone when no choice of theirs is awaited", () => {
    const { state, now } = raced(game(alone(2)), [1]);
    const chosen = act(state, 0, { type: "choose", option: 2 }, now);

    expect(moveFor(chosen, 0, now, CONFIG)).toBe(chosen);
    expect(moveFor(game(alone(2)), 0, START, CONFIG).phase).toBe("problem");
  });
});

describe("the added contest", () => {
  // four alone: players 2 and 3 win the race; 0 (a loser) and 2 (a winner) take 도전
  const fixture = () => {
    const { state, now } = raced(game(alone(4)), [2, 3]);
    return { state: choose(state, [[0, 1], [1, 2], [2, 1], [3, 2]], now), now };
  };

  it("begins with a problem of its own once everyone has chosen, between those who took 도전", () => {
    const { state, now } = raced(game(alone(4)), [2, 3]);

    const duel = choose(state, [[0, 1], [1, 2], [2, 1], [3, 2]], now);

    expect(duel.phase).toBe("problem");
    expect(duel.duel).toEqual({ players: [0, 2], round: 1, winner: null });
    expect(duel.round).toBe(state.round + 1);
    expect(duel.history.slice(-3)).toEqual([
      expect.objectContaining({ type: "choice" }),
      { type: "duel", players: [0, 2] },
      { type: "problem", round: state.round + 1, duel: 1 },
    ]);
    expect(duel.scores).toBeNull();
  });

  it("is its players' alone: nobody else may buzz, and a winner of the race who is in it may", () => {
    const { state, now } = fixture();

    expect(applyAction(state, 1, { type: "buzz" }, now, CONFIG)).toEqual({ ok: false, reason: "not-in-duel" });
    expect(applyAction(state, 3, { type: "buzz" }, now, CONFIG)).toEqual({ ok: false, reason: "not-in-duel" });
    expect(applyAction(state, 2, { type: "buzz" }, now, CONFIG).ok).toBe(true);
  });

  it("is won by the first right answer: three pieces to the winner, three points off everyone else in it", () => {
    const { state, now } = fixture();

    const ended = solve(state, 0, now);

    expect(ended.phase).toBe("ended");
    expect(ended.duel).toEqual({ players: [0, 2], round: 1, winner: 0 });
    expect(ended.history.slice(-3).map((event) => event.type)).toEqual(["duel-over", "score", "ended"]);
    expect(ended.scores).toEqual([
      { player: 0, race: -CONFIG.losePoints, choice: 0, pieces: CONFIG.duelPieces, total: -CONFIG.losePoints },
      { player: 1, race: -CONFIG.losePoints, choice: -CONFIG.safeLoss, pieces: 0, total: -CONFIG.losePoints - CONFIG.safeLoss },
      { player: 2, race: CONFIG.winPoints, choice: -CONFIG.duelLoss, pieces: 0, total: CONFIG.winPoints - CONFIG.duelLoss },
      { player: 3, race: CONFIG.winPoints, choice: -CONFIG.safeLoss, pieces: 0, total: CONFIG.winPoints - CONFIG.safeLoss },
    ]);
  });

  it("does not count its right answer towards the race: nobody's wins or place change", () => {
    const { state, now } = fixture();

    const ended = solve(state, 0, now);

    expect(ended.units.map((unit) => [unit.wins, unit.place])).toEqual(state.units.map((unit) => [unit.wins, unit.place]));
  });

  it("shuts a player who answers wrong out of the problem, which goes on for the other", () => {
    const { state, now } = fixture();

    const after = miss(state, 0, now);

    expect(after.phase).toBe("problem");
    expect(applyAction(after, 0, { type: "buzz" }, now + 2000, CONFIG)).toEqual({ ok: false, reason: "shut-out" });
    expect(applyAction(after, 2, { type: "buzz" }, now + 2000, CONFIG).ok).toBe(true);
  });

  it("goes on to another problem when everyone in it was wrong, or its time ran out", () => {
    const { state, now } = fixture();

    const wrong = miss(miss(state, 0, now), 2, now + 2000);
    const second = applyTimeout(wrong, wrong.pauseUntil!, CONFIG);
    const timed = applyTimeout(second, second.openedAt + PROBLEM_MS, CONFIG);

    expect(wrong.phase).toBe("pause");
    expect(second.phase).toBe("problem");
    expect(second.duel).toMatchObject({ round: 2, winner: null });
    expect(second.history.at(-1)).toEqual({ type: "problem", round: state.round + 1, duel: 2 });
    expect(timed.phase).toBe("pause");
  });

  it("ends with nobody having won it after its last problem, and then everyone in it loses", () => {
    const config = { ...CONFIG, duelProblems: 2 };
    const start = raced(game(alone(4), config), [2, 3], config);
    let state = choose(start.state, [[0, 1], [1, 2], [2, 1], [3, 2]], start.now, config);

    state = applyTimeout(state, state.openedAt + PROBLEM_MS, config);
    state = applyTimeout(state, state.pauseUntil!, config);
    state = applyTimeout(state, state.openedAt + PROBLEM_MS, config);

    expect(state.phase).toBe("ended");
    expect(state.history.slice(-3)[0]).toEqual({ type: "duel-over", winner: null });
    expect([0, 2].map((player) => state.scores?.find((line) => line.player === player))).toEqual([
      { player: 0, race: -config.losePoints, choice: -config.duelLoss, pieces: 0, total: -config.losePoints - config.duelLoss },
      { player: 2, race: config.winPoints, choice: -config.duelLoss, pieces: 0, total: config.winPoints - config.duelLoss },
    ]);
  });

  it("is played against the problems alone by a player nobody joined", () => {
    const { state, now } = raced(game(alone(2)), [1]);

    const duel = choose(state, [[0, 2], [1, 1]], now);
    const won = solve(duel, 1, now + 1000);

    expect(duel.duel).toEqual({ players: [1], round: 1, winner: null });
    expect(won.scores?.find((line) => line.player === 1)).toEqual({ player: 1, race: CONFIG.winPoints, choice: 0, pieces: CONFIG.duelPieces, total: CONFIG.winPoints });
  });

  it("ends without a winner when none of its players is there to go on, and the rest of the game stands", () => {
    const { state } = fixture();

    const ended = endDuel(state, CONFIG);

    expect(ended.phase).toBe("ended");
    expect(ended.history.slice(-3).map((event) => event.type)).toEqual(["duel-over", "score", "ended"]);
    expect(pointsOf(ended, 0)).toBe(-CONFIG.losePoints - CONFIG.duelLoss);
    expect(pointsOf(ended, 3)).toBe(CONFIG.winPoints - CONFIG.safeLoss);
    expect(endDuel(ended, CONFIG)).toBe(ended);
    expect(endDuel(game(alone(2)), CONFIG).phase).toBe("problem");
  });

  it("shows its answer to nobody while its problem is open", () => {
    const { state } = fixture();

    expect(viewFor(state, 0).answer).toBeNull();
    expect(viewFor(state, 0).duel).toEqual({ players: [0, 2], round: 1, winner: null });
  });
});

describe("the points of the sixteen in the document", () => {
  it("come out as its table has them: three teams and seven alone, of whom two took the added contest", () => {
    // teams 0-1-2, 3-4-5, 6-7-8 and players 9..15 alone. The first team and players 9, 10, 11, 12 win
    // the race; players 13, 14, 15 and the other two teams do not.
    const { state, now } = raced(game(teamed(3, 7)), [0, 9, 10, 11, 12]);
    const votes: [number, Option][] = [
      // the winning team takes 헌신, the two losing teams 희생
      [0, 2], [1, 2], [2, 2],
      [3, 1], [4, 1], [5, 1],
      [6, 1], [7, 1], [8, 1],
      // two of the winners alone take 도전, everyone else alone 안전
      [9, 1], [10, 1], [11, 2], [12, 2], [13, 2], [14, 2], [15, 2],
    ];

    const duel = choose(state, votes, now);
    const ended = solve(duel, 9, now + 1000);

    const totals = ended.scores?.map((line) => line.total).sort((a, b) => b - a);
    expect(totals).toEqual([7, 6, 6, 4, 3, 3, 1, 0, 0, 0, 0, -3, -3, -4, -4, -4]);
    expect(ended.scores?.filter((line) => line.pieces > 0)).toEqual([{ player: 9, race: 7, choice: 0, pieces: 3, total: 7 }]);
  });
});

describe("a game given up", () => {
  it("ends without points when it is given up while the choice is being made", () => {
    const { state } = raced(game(alone(2)), [1]);

    const ended = abandon(state);

    expect(ended.phase).toBe("ended");
    expect(ended.scores).toBeNull();
    expect(ended.choosing).toBeNull();
    expect(ended.history.at(-1)).toEqual({ type: "ended", round: state.round, reason: "abandoned" });
  });

  it("counts for a team that never decided what the room would have chosen for it", () => {
    const { state } = raced(game(teamed(2, 0)), [0]);

    const lines = scoreLines(state, CONFIG);

    expect(lines.map((line) => line.total)).toEqual([CONFIG.devoteLeader, CONFIG.devoteMember, CONFIG.devoteMember, -CONFIG.sacrificeLeader, 0, 0]);
  });
});
