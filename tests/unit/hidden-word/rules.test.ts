import { describe, expect, it } from "vitest";
import configJson from "../../../src/shared/games/hidden-word/config.json";
import type { Lexicon } from "../../../src/shared/games/hidden-word/lexicon";
import {
  abandon,
  applyAction,
  applyTimeout,
  awaited,
  closeIfLeft,
  createGame,
  deadline,
  isValidConfig,
  parseAction,
  placesOf,
  shiftClock,
  tidy,
  totalsOf,
  viewFor,
  type HiddenAction,
  type HiddenConfig,
  type HiddenState,
} from "../../../src/shared/games/hidden-word/rules";
import {
  ANSWER_SECONDS,
  CLUES,
  CLUE_SECONDS,
  ENVELOPE,
  MULTIPLIERS,
  ROUNDS,
  SHOW_ENVELOPES,
  SHOW_ORDER_2,
  SHOW_PLACES,
  SHOW_PLAYERS,
  SHOW_POINTS,
  SHOW_ROUND_1,
  SHOW_ROUND_2,
  STAGES,
  THRESHOLD,
  chanceFor,
  scripted,
  showLexicon,
  type ShowTurn,
} from "./documented";

const config: HiddenConfig = configJson;
const T0 = 1_000_000;
const CLUE_MS = config.clueSeconds * 1000;
const ANSWER_MS = config.answerSeconds * 1000;

/** Three envelopes of plain words, and clues for the first word of the first: 뿌리 ends the giving of clues, 바람 does not. */
const WORDS = [
  ["나무", "의자", "편지", "모자", "기차"],
  ["바다", "연필", "시계", "구두", "피아노"],
  ["사과", "거울", "우산", "비누", "자전거"],
];
const lexicon = scripted(WORDS.flat(), { "나무 뿌리": 96.5, "나무 숲": 97, "나무 잎": 95, "나무 바람": 78.5, "나무 꾸중": 2.5 }, ["오답", "딴말", "도토리", "버섯", "소나무", "물", "돌", "흙", "꽃", "풀", "산", "강"]);
/** The draws that leave the list's words and the players in their own order, in both rounds. */
const PLAIN = Array.from({ length: 64 }, () => 0xffffffff);

function game(players: number[] = [0, 1, 2], over: { chance?: number[]; lexicon?: Lexicon; config?: HiddenConfig } = {}): HiddenState {
  const created = createGame({ players, seed: 3, now: T0, chance: over.chance ?? PLAIN }, over.config ?? config, over.lexicon ?? lexicon);
  if (!created.ok) throw new Error(created.reason);
  return created.state;
}

/** `state` after `player` did `action`, which the game must take. */
function did(state: HiddenState, player: number, action: HiddenAction, words: Lexicon = lexicon, rules: HiddenConfig = config): HiddenState {
  const result = applyAction(state, player, action, state.at + 1000, rules, words);
  if (!result.ok) throw new Error(`${action.type} by ${player}: ${result.reason}`);
  return result.state;
}

/** Why the game refuses `action` of `player`; `null` where it takes it. */
function refusal(state: HiddenState, player: number, action: HiddenAction): string | null {
  const result = applyAction(state, player, action, state.at + 1000, config, lexicon);
  return result.ok ? null : result.reason;
}

/** `state` once the clock of its step has run out. */
const late = (state: HiddenState, words: Lexicon = lexicon, rules: HiddenConfig = config): HiddenState => applyTimeout(state, state.until as number, rules, words);

/** `state` with everyone's first word left as their hidden word: the first setter gives clues. */
function chosen(state: HiddenState, words: Lexicon = lexicon): HiddenState {
  let next = state;
  for (const hand of state.hands) next = did(next, hand.player, { type: "choose", word: hand.words.find((word) => !hand.used.includes(word)) as string }, words);
  return next;
}

/** `state` with the answers of the stage written: the hidden word by those of `right`, something else by the others. */
function answered(state: HiddenState, right: number[], words: Lexicon = lexicon): HiddenState {
  const hidden = state.hands.find((hand) => hand.player === state.setter)?.chosen as string;
  let next = state;
  for (const player of state.players) if (player !== state.setter) next = did(next, player, { type: "answer", words: [right.includes(player) ? hidden : "오답"] }, words);
  return next;
}

describe("the numbers of 히든 워드", () => {
  it("are the wiki's", () => {
    expect(isValidConfig(config)).toBe(true);
    expect(config.rounds).toBe(ROUNDS);
    expect(config.multipliers).toEqual(MULTIPLIERS);
    expect(config.envelope).toBe(ENVELOPE);
    expect(config.clues).toBe(CLUES);
    expect(config.clueSeconds).toBe(CLUE_SECONDS);
    expect(config.threshold).toBe(THRESHOLD);
    expect(config.answerSeconds).toBe(ANSWER_SECONDS);
    expect(config.stages).toBe(STAGES);
  });

  it("have to make a game: a hidden word for every round, a worth for each", () => {
    expect(isValidConfig({ ...config, envelope: 1 })).toBe(false);
    expect(isValidConfig({ ...config, multipliers: [1] })).toBe(false);
    expect(isValidConfig({ ...config, threshold: 0 })).toBe(false);
    expect(isValidConfig({ ...config, clueSeconds: 0 })).toBe(false);
    expect(isValidConfig({ ...config, minPlayers: 1 })).toBe(false);
  });
});

describe("starting a game", () => {
  it("takes two to six players", () => {
    const start = (players: number[]) => createGame({ players, seed: 1, now: T0 }, config, showLexicon());
    expect(start([0])).toEqual({ ok: false, reason: "too-few" });
    expect(start([0, 1]).ok).toBe(true);
    expect(start([0, 1, 2, 3, 4, 5, 6])).toEqual({ ok: false, reason: "too-many" });
    expect(start([0, 1, 1])).toEqual({ ok: false, reason: "bad-players" });
    expect(start([0, 1, 2, 3, 4, 5]).ok).toBe(true);
    expect(createGame({ players: [0, 1, 2], seed: 1, now: T0 }, { ...config, clues: 0 }, lexicon)).toEqual({ ok: false, reason: "bad-config" });
  });

  it("is refused where the list cannot fill everyone's envelope", () => {
    expect(createGame({ players: [0, 1, 2, 3], seed: 1, now: T0 }, config, lexicon)).toEqual({ ok: false, reason: "too-few-words" });
  });

  it("deals everyone five words, no word twice, and waits for each to choose one", () => {
    const state = game([4, 2, 7], { chance: [] });
    expect(state.players).toEqual([2, 4, 7]);
    expect(state.hands.map((hand) => hand.words.length)).toEqual([5, 5, 5]);
    expect(new Set(state.hands.flatMap((hand) => hand.words)).size).toBe(15);
    expect(state.phase).toBe("choose");
    expect(state.round).toBe(1);
    expect(awaited(state)).toEqual([2, 4, 7]);
    expect(deadline(state)).toBe(T0 + config.chooseSeconds * 1000);
    expect(state.pieces).toEqual([2, 4, 7].map((player) => ({ player, left: config.pieces })));
  });

  it("keeps two words that score high against each other out of one envelope", () => {
    // 나무 and 의자 are near each other one way only, 편지 and 모자 the other way: neither pair shares an envelope
    const near = scripted(WORDS.flat(), { "나무 의자": 80, "모자 편지": 80 });
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const created = createGame({ players: [0, 1, 2], seed, now: T0 }, config, near);
      if (!created.ok) throw new Error(created.reason);
      for (const hand of created.state.hands) {
        expect(hand.words.includes("나무") && hand.words.includes("의자")).toBe(false);
        expect(hand.words.includes("편지") && hand.words.includes("모자")).toBe(false);
      }
    }
  });
});

describe("choosing a hidden word", () => {
  it("takes a word of the player's own envelope, once", () => {
    const state = game();
    expect(state.hands[0].words).toEqual(WORDS[0]);
    expect(refusal(state, 0, { type: "choose", word: "바다" })).toBe("not-in-envelope");
    const next = did(state, 0, { type: "choose", word: "나무" });
    expect(next.phase).toBe("choose");
    expect(awaited(next)).toEqual([1, 2]);
    expect(refusal(next, 0, { type: "choose", word: "의자" })).toBe("already-chosen");
    expect(viewFor(next, 1).ready).toEqual([0]);
  });

  it("is over once everyone has: the order of setters is drawn and the first gives clues", () => {
    const state = chosen(game());
    expect(state.phase).toBe("clue");
    expect([...state.order].sort()).toEqual([0, 1, 2]);
    expect(state.setter).toBe(state.order[0]);
    expect(state.stage).toBe(1);
    expect(deadline(state)).toBe(state.at + CLUE_MS);
    expect(state.history.map((event) => event.type)).toEqual(["round", "order", "turn"]);
  });

  it("gives whoever has not chosen in time the first word of their envelope", () => {
    const state = late(did(game(), 1, { type: "choose", word: "시계" }));
    expect(state.phase).toBe("clue");
    expect(state.hands.map((hand) => hand.chosen)).toEqual(["나무", "시계", "사과"]);
  });

  it("draws the order anew by chance", () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const created = createGame({ players: [0, 1, 2], seed, now: T0 }, config, lexicon);
      if (!created.ok) throw new Error(created.reason);
      orders.add(chosen(created.state).order.join(""));
    }
    expect(orders.size).toBeGreaterThan(2);
  });
});

describe("choosing with nothing to try a word on", () => {
  it("has no pair of words scored: the user's decision of 2026-11-26", () => {
    expect(parseAction({ type: "check", reference: "나무", word: "뿌리" }, config)).toBeNull();
    expect(Object.keys(viewFor(game(), 0).hand ?? {}).sort()).toEqual(["chosen", "used", "words"]);
    expect("checks" in config).toBe(false);
  });
});

describe("giving clues", () => {
  const start = (): HiddenState => chosen(game());

  it("is the setter's, with words of the list other than the hidden word, each once", () => {
    const state = start();
    expect(state.setter).toBe(0);
    expect(refusal(state, 1, { type: "clue", word: "바람" })).toBe("not-setter");
    expect(refusal(state, 0, { type: "clue", word: "없는말" })).toBe("not-in-list");
    expect(refusal(state, 0, { type: "clue", word: "나무" })).toBe("same-as-hidden");
    const next = did(state, 0, { type: "clue", word: "바람" });
    expect(refusal(next, 0, { type: "clue", word: "바람" })).toBe("already-given");
    expect(refusal(next, 1, { type: "answer", words: ["나무"] })).toBe("not-answer-time");
  });

  it("shows everyone each clue with its score", () => {
    const state = did(did(start(), 0, { type: "clue", word: "바람" }), 0, { type: "clue", word: "꾸중" });
    expect(state.phase).toBe("clue");
    for (const viewer of [0, 1, 2, null]) {
      expect(viewFor(state, viewer).clues).toEqual([
        { word: "바람", score: 78.5, stage: 1, room: false },
        { word: "꾸중", score: 2.5, stage: 1, room: false },
      ]);
    }
  });

  it("ends at once with a clue of at least 95%", () => {
    const state = did(did(start(), 0, { type: "clue", word: "바람" }), 0, { type: "clue", word: "잎" });
    expect(state.phase).toBe("answer");
    expect(state.history.at(-1)).toEqual({ type: "clues-over", setter: 0, stage: 1, reason: "reached" });
    expect(deadline(state)).toBe(state.at + ANSWER_MS);
    expect(awaited(state)).toEqual([1, 2]);
    expect(refusal(state, 0, { type: "clue", word: "숲" })).toBe("not-clue-time");
  });

  it("ends with the tenth clue", () => {
    let state = start();
    const low = ["바람", "꾸중", "도토리", "버섯", "소나무", "물", "돌", "흙", "꽃", "풀"];
    for (const word of low.slice(0, 9)) state = did(state, 0, { type: "clue", word });
    expect(state.phase).toBe("clue");
    state = did(state, 0, { type: "clue", word: low[9] });
    expect(state.phase).toBe("answer");
    expect(state.history.at(-1)).toEqual({ type: "clues-over", setter: 0, stage: 1, reason: "count" });
  });

  it("ends after seven and a half minutes with the clues given so far", () => {
    const state = late(did(start(), 0, { type: "clue", word: "바람" }));
    expect(state.phase).toBe("answer");
    expect(state.clues.map((clue) => clue.word)).toEqual(["바람"]);
    expect(state.history.at(-1)).toEqual({ type: "clues-over", setter: 0, stage: 1, reason: "time" });
  });

  it("has the room give the word nearest the hidden word for a setter who gave none in time", () => {
    const state = late(start());
    expect(state.phase).toBe("answer");
    expect(state.clues).toEqual([{ word: "숲", score: 97, stage: 1, room: true }]);
  });
});

describe("answering", () => {
  const start = (): HiddenState => did(chosen(game()), 0, { type: "clue", word: "뿌리" });

  it("is for everyone but the setter, once in a stage", () => {
    const state = start();
    expect(refusal(state, 0, { type: "answer", words: ["나무"] })).toBe("setter-cannot-answer");
    const next = did(state, 1, { type: "answer", words: ["오답"] });
    expect(refusal(next, 1, { type: "answer", words: ["나무"] })).toBe("already-answered");
    expect(awaited(next)).toEqual([2]);
  });

  it("keeps what was written to its writer until all is shown", () => {
    const state = did(start(), 1, { type: "answer", words: ["딴말"] });
    expect(viewFor(state, 1).answer).toEqual(["딴말"]);
    expect(viewFor(state, 2).answer).toBeNull();
    expect(viewFor(state, 2).ready).toEqual([1]);
    for (const viewer of [0, 2, null]) expect(JSON.stringify(viewFor(state, viewer))).not.toContain("딴말");
  });

  it("takes a word that is not in the list: it is only wrong", () => {
    const state = did(start(), 1, { type: "answer", words: ["없는말"] });
    expect(state.answers).toEqual([{ player: 1, words: ["없는말"] }]);
  });

  it("takes a second answer for a Piece, which everyone sees spent", () => {
    const state = did(start(), 1, { type: "answer", words: ["오답", "나무"] });
    expect(state.pieces.find((each) => each.player === 1)?.left).toBe(config.pieces - 1);
    expect(viewFor(state, 2).pieced).toEqual([1]);
    expect(state.history.at(-1)).toEqual({ type: "answered", player: 1, piece: true });
    expect(refusal(state, 2, { type: "answer", words: ["오답", "오답"] })).toBe("bad-answer");
  });

  it("takes one Piece of a player for one hidden word, whatever the stage", () => {
    // nobody is right in the first stage; in the second the same player asks for a second answer again
    let state = did(did(start(), 1, { type: "answer", words: ["오답", "딴말"] }), 2, { type: "answer", words: ["오답"] });
    state = did(late(state), 0, { type: "clue", word: "숲" });
    expect(state.stage).toBe(2);
    expect(refusal(state, 1, { type: "answer", words: ["나무", "돌"] })).toBe("piece-used");
    expect(refusal(state, 1, { type: "answer", words: ["나무"] })).toBeNull();
  });

  it("refuses a second answer to a player with no Piece left", () => {
    const state = game([0, 1, 2], { config: { ...config, pieces: 0 } });
    const next = did(chosen(state), 0, { type: "clue", word: "뿌리" });
    expect(applyAction(next, 1, { type: "answer", words: ["오답", "나무"] }, next.at, { ...config, pieces: 0 }, lexicon)).toEqual({ ok: false, reason: "no-pieces" });
  });

  it("shows the answers once everyone has written, or after two and a half minutes", () => {
    expect(answered(start(), []).phase).toBe("reveal");
    const timed = late(did(start(), 1, { type: "answer", words: ["나무"] }));
    expect(timed.phase).toBe("reveal");
    expect(timed.result?.answers).toEqual([
      { player: 1, words: ["나무"], right: true },
      { player: 2, words: [], right: false },
    ]);
  });
});

describe("scoring a stage", () => {
  const start = (): HiddenState => did(chosen(game()), 0, { type: "clue", word: "뿌리" });

  it("gives everyone who was right a point and ends the setter's turn", () => {
    const state = answered(start(), [1, 2]);
    expect(totalsOf(state).map((each) => each.total)).toEqual([0, 1, 1]);
    expect(state.result).toMatchObject({ setter: 0, stage: 1, each: 1, setterPoints: 0, over: true, word: "나무" });
    expect(state.past).toEqual([{ round: 1, setter: 0, word: "나무", stage: 1, right: [1, 2], setterPoints: 0 }]);
    const next = late(state);
    expect(next.phase).toBe("clue");
    expect(next.setter).toBe(1);
    expect(next.stage).toBe(1);
    expect(next.clues).toEqual([]);
  });

  it("gives the setter a point when nobody was right, and has them give clues again without showing the word", () => {
    const state = answered(start(), []);
    expect(totalsOf(state).map((each) => each.total)).toEqual([1, 0, 0]);
    expect(state.result).toMatchObject({ setterPoints: 1, over: false, word: null });
    for (const viewer of [1, 2, null]) expect(JSON.stringify(viewFor(state, viewer))).not.toContain("나무");
    const next = late(state);
    expect(next.phase).toBe("clue");
    expect(next.setter).toBe(0);
    expect(next.stage).toBe(2);
    // the clues of the first stage stay on show, and one of them is not given again
    expect(next.clues.map((clue) => clue.word)).toEqual(["뿌리"]);
    expect(refusal(next, 0, { type: "clue", word: "뿌리" })).toBe("already-given");
  });

  it("gives the setter 1, 2 and 3 points over three stages, and then shows the word", () => {
    let state = late(answered(start(), []));
    state = late(answered(did(state, 0, { type: "clue", word: "숲" }), []));
    expect(totalsOf(state)[0].total).toBe(3);
    expect(state.stage).toBe(3);
    state = answered(did(state, 0, { type: "clue", word: "잎" }), []);
    expect(totalsOf(state)[0].total).toBe(6);
    expect(state.result).toMatchObject({ stage: 3, setterPoints: 3, over: true, word: "나무" });
    expect(state.past).toEqual([{ round: 1, setter: 0, word: "나무", stage: 3, right: [], setterPoints: 6 }]);
    expect(late(state).setter).toBe(1);
  });

  it("lets a setter keep the points of the stages before the one in which the word was found", () => {
    let state = late(answered(start(), []));
    state = answered(did(state, 0, { type: "clue", word: "숲" }), [2]);
    expect(totalsOf(state).map((each) => each.total)).toEqual([1, 0, 1]);
    expect(state.past[0]).toMatchObject({ stage: 2, right: [2], setterPoints: 1 });
  });
});

/** The clues of {@link roundPlayed}, one for each stage: each ends the giving of clues. */
const STAGE_CLUES = ["숲", "잎", "뿌리"];

/** `state` with every turn of its round played: one clue ends each giving of clues, and those of `right` find the word. */
function roundPlayed(state: HiddenState, right: number[], words: Lexicon): HiddenState {
  let next = state;
  const round = state.round;
  while (next.phase !== "ended" && next.round === round) {
    next = did(next, next.setter as number, { type: "clue", word: STAGE_CLUES[next.stage - 1] }, words);
    next = late(answered(next, right, words), words);
  }
  return next;
}

describe("a game of two rounds", () => {
  // every clue of the three scores 96 for every hidden word of these two rounds
  const words = scripted(WORDS.flat(), Object.fromEntries(["나무", "바다", "사과", "의자", "연필", "거울"].flatMap((hidden) => STAGE_CLUES.map((clue) => [`${hidden} ${clue}`, 96]))), ["오답"]);

  it("has everyone set a word in each round, a new one in the second, which counts double", () => {
    let state = roundPlayed(chosen(game([0, 1, 2], { lexicon: words }), words), [2], words);
    expect(state.round).toBe(2);
    expect(state.phase).toBe("choose");
    expect(state.hands.map((hand) => hand.used)).toEqual([["나무"], ["바다"], ["사과"]]);
    expect(state.hands.map((hand) => hand.chosen)).toEqual([null, null, null]);
    // 2 found two words; with its own word nobody but 2 could be right, so 2 scored there as the setter of three stages
    expect(totalsOf(state).map((each) => each.rounds[0])).toEqual([0, 0, 2 + 6]);
    expect(applyAction(state, 0, { type: "choose", word: "나무" }, state.at, config, words)).toEqual({ ok: false, reason: "not-in-envelope" });
    expect(viewFor(state, 0).hand?.used).toEqual(["나무"]);

    state = chosen(state, words);
    expect(state.hands.map((hand) => hand.chosen)).toEqual(["의자", "연필", "거울"]);
    state = roundPlayed(state, [0], words);
    expect(state.phase).toBe("ended");
    expect(state.ended).toBe("played");
    expect(totalsOf(state).map((each) => each.rounds)).toEqual([
      [0, 2 * (2 + 6)],
      [0, 0],
      [8, 0],
    ]);
    expect(placesOf(state)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 3 },
      { player: 2, place: 2 },
    ]);
    expect(deadline(state)).toBeNull();
  });

  it("gives players level on points one place", () => {
    const state = roundPlayed(chosen(game([0, 1, 2], { lexicon: words }), words), [0, 1, 2], words);
    const end = roundPlayed(chosen(state, words), [0, 1, 2], words);
    // everyone found both words of the others in both rounds: 2 + 4 points each
    expect(totalsOf(end).map((each) => each.total)).toEqual([6, 6, 6]);
    expect(placesOf(end)?.map((each) => each.place)).toEqual([1, 1, 1]);
  });
});

/** One turn of the show's game played into `state`. */
function showTurn(state: HiddenState, turn: ShowTurn, words: Lexicon, rules: HiddenConfig): HiddenState {
  let next = state;
  expect(next.setter).toBe(turn.setter);
  turn.stages.forEach((stage, at) => {
    expect(next.phase).toBe("clue");
    expect(next.stage).toBe(at + 1);
    for (const [word] of stage.clues) next = did(next, turn.setter, { type: "clue", word }, words, rules);
    expect(next.phase).toBe("answer");
    for (const player of next.players) {
      if (player === turn.setter) continue;
      const answer = [stage.right.includes(player) ? turn.word : "오답"];
      if (stage.pieces.includes(player)) answer.push("딴말");
      next = did(next, player, { type: "answer", words: answer }, words, rules);
    }
    expect(next.phase).toBe("reveal");
    expect(next.result?.answers.filter((each) => each.right).map((each) => each.player)).toEqual(stage.right);
    expect(next.result?.over).toBe(at === turn.stages.length - 1);
    next = late(next, words, rules);
  });
  return next;
}

describe("a game of two players", () => {
  it("has one guesser for each hidden word: right, they score and the turn is over; wrong, the setter scores and gives clues again", () => {
    let state = chosen(game([0, 1]));
    expect(state.order).toEqual([0, 1]);
    expect(state.setter).toBe(0);
    // 1 is wrong in the first stage of 0's word, and right in the second
    state = answered(did(state, 0, { type: "clue", word: "뿌리" }), []);
    expect(state.result).toMatchObject({ setter: 0, stage: 1, setterPoints: 1, over: false, word: null });
    expect(state.result?.answers).toEqual([{ player: 1, words: ["오답"], right: false }]);
    state = late(state);
    expect(state).toMatchObject({ phase: "clue", setter: 0, stage: 2 });
    state = answered(did(state, 0, { type: "clue", word: "숲" }), [1]);
    expect(state.result).toMatchObject({ setter: 0, stage: 2, setterPoints: 0, over: true, word: "나무" });
    expect(totalsOf(state).map((each) => each.total)).toEqual([1, 1]);
    // the other sets their word next
    state = late(state);
    expect(state).toMatchObject({ phase: "clue", setter: 1, stage: 1 });
    expect(awaited(state)).toEqual([1]);
  });

  it("is played through both rounds, four turns in all, and ends when one of the two leaves", () => {
    const words = scripted(WORDS.flat(), Object.fromEntries(WORDS.flat().map((word) => [`${word} 숲`, 96])), ["오답"]);
    let state = game([0, 1], { lexicon: words });
    for (let turn = 0; turn < 4; turn++) {
      if (state.phase === "choose") state = chosen(state, words);
      const setter = state.setter as number;
      state = late(answered(did(state, setter, { type: "clue", word: "숲" }, words), [1 - setter], words), words);
    }
    expect(state.phase).toBe("ended");
    expect(state.ended).toBe("played");
    expect(state.past.map((turn) => [turn.round, turn.setter])).toEqual([
      [1, 0],
      [1, 1],
      [2, 0],
      [2, 1],
    ]);
    // each was right once a round: 1 point, then 2
    expect(totalsOf(state).map((each) => each.total)).toEqual([3, 3]);
    expect(placesOf(state)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 1 },
    ]);
    const cut = closeIfLeft(chosen(game([0, 1])), (player) => player === 0, T0 + 5000, config);
    expect(cut.ended).toBe("left");
  });
});

describe("the show's game", () => {
  it("comes out as the wiki's table of results has it", () => {
    const words = showLexicon();
    // the show's players came with pieces of their own: more than a room deals
    const rules = { ...config, pieces: 10 };
    let state = game(SHOW_PLAYERS, { lexicon: words, config: rules, chance: chanceFor(SHOW_ENVELOPES.flat().length, SHOW_PLAYERS.length, SHOW_ORDER_2) });
    expect(state.hands.map((hand) => hand.words)).toEqual(SHOW_ENVELOPES);

    for (const turn of SHOW_ROUND_1) state = did(state, turn.setter, { type: "choose", word: turn.word }, words, rules);
    expect(state.order).toEqual(SHOW_ROUND_1.map((turn) => turn.setter));
    for (const turn of SHOW_ROUND_1) state = showTurn(state, turn, words, rules);
    expect(state.round).toBe(2);
    expect(totalsOf(state).map((each) => each.rounds[0])).toEqual(SHOW_POINTS.map((each) => each[0]));

    for (const turn of SHOW_ROUND_2) state = did(state, turn.setter, { type: "choose", word: turn.word }, words, rules);
    expect(state.order).toEqual(SHOW_ORDER_2);
    for (const turn of SHOW_ROUND_2) state = showTurn(state, turn, words, rules);

    expect(state.phase).toBe("ended");
    expect(totalsOf(state).map((each) => each.rounds)).toEqual(SHOW_POINTS);
    expect(totalsOf(state).map((each) => each.total)).toEqual([8, 16, 4, 10, 7, 11]);
    expect(placesOf(state)?.map((each) => each.place)).toEqual(SHOW_PLACES);
    expect(state.past.map((turn) => turn.word)).toEqual([...SHOW_ROUND_1, ...SHOW_ROUND_2].map((turn) => turn.word));
  });
});

describe("what a player is shown", () => {
  it("is their own envelope and hidden word, and nobody else's", () => {
    const state = did(game(), 0, { type: "choose", word: "편지" });
    expect(viewFor(state, 0).hand).toMatchObject({ words: WORDS[0], used: [], chosen: "편지" });
    expect(viewFor(state, 1).hand).toMatchObject({ words: WORDS[1], chosen: null });
    expect(viewFor(state, null).hand).toBeNull();
    expect(viewFor(state, null).you).toBeNull();
    for (const word of WORDS[0]) {
      expect(JSON.stringify(viewFor(state, 1))).not.toContain(word);
      expect(JSON.stringify(viewFor(state, null))).not.toContain(word);
    }
  });

  it("has the hidden word for the others only once its turn is over", () => {
    const clued = did(chosen(game()), 0, { type: "clue", word: "뿌리" });
    expect(JSON.stringify(viewFor(clued, 1))).not.toContain("나무");
    const over = answered(clued, [1]);
    expect(viewFor(over, 2).result?.word).toBe("나무");
    expect(viewFor(over, null).past[0].word).toBe("나무");
    // the words of the others' envelopes that were not set stay theirs
    expect(JSON.stringify(viewFor(over, 2))).not.toContain("의자");
  });

  it("does not change with the time", () => {
    const state = chosen(game());
    expect(viewFor(state, 1)).toEqual(viewFor(shiftClock(state, 0), 1));
    expect(viewFor(state, 1).order).toEqual(state.order);
    expect(viewFor(game(), 1).order).toBeNull();
  });
});

describe("players who leave", () => {
  const without =
    (...gone: number[]) =>
    (player: number): boolean =>
      !gone.includes(player);

  it("end the game when fewer than two are left", () => {
    const state = closeIfLeft(chosen(game()), without(1, 2), T0 + 5000, config);
    expect(state.phase).toBe("ended");
    expect(state.ended).toBe("left");
    expect(placesOf(state)).toBeNull();
  });

  it("are not waited for: not to choose, and not to answer", () => {
    const choosing = did(did(game(), 0, { type: "choose", word: "나무" }), 1, { type: "choose", word: "바다" });
    expect(closeIfLeft(choosing, without(2), choosing.at, config).phase).toBe("clue");
    const answering = did(did(chosen(game()), 0, { type: "clue", word: "뿌리" }), 1, { type: "answer", words: ["나무"] });
    const scored = closeIfLeft(answering, without(2), answering.at, config);
    expect(scored.phase).toBe("reveal");
    expect(scored.result?.answers).toEqual([
      { player: 1, words: ["나무"], right: true },
      { player: 2, words: [], right: false },
    ]);
  });

  it("have their turn as setter passed over, with the word shown", () => {
    const state = chosen(game());
    const next = closeIfLeft(state, without(0), state.at, config);
    expect(next.setter).toBe(1);
    expect(next.phase).toBe("clue");
    expect(next.past).toEqual([{ round: 1, setter: 0, word: "나무", stage: 0, right: [], setterPoints: 0 }]);
    expect(next.history.some((event) => event.type === "passed" && event.setter === 0)).toBe(true);
    // one who left before their turn came is passed over when it does
    const later = closeIfLeft(state, without(1), state.at, config);
    expect(later.setter).toBe(0);
    const on = late(answered(did(later, 0, { type: "clue", word: "뿌리" }), [2]));
    expect(on.setter).toBe(2);
    expect(on.past.map((turn) => turn.setter)).toEqual([0, 1]);
  });

  it("give no more clues for a word nobody found: the next setter has their turn", () => {
    const failed = answered(did(chosen(game()), 0, { type: "clue", word: "뿌리" }), []);
    const next = late(closeIfLeft(failed, without(0), failed.at, config));
    expect(next.setter).toBe(1);
    expect(next.past[0]).toEqual({ round: 1, setter: 0, word: "나무", stage: 1, right: [], setterPoints: 1 });
  });

  it("change nothing while everyone is there", () => {
    const state = chosen(game());
    expect(closeIfLeft(state, () => true, state.at, config)).toBe(state);
  });
});

describe("the clock", () => {
  it("brings nothing before its time, and stands still with the game", () => {
    const state = chosen(game());
    expect(applyTimeout(state, (state.until as number) - 1, config, lexicon)).toBe(state);
    const moved = shiftClock(state, 7000);
    expect(moved.until).toBe((state.until as number) + 7000);
    expect(shiftClock(state, 0)).toBe(state);
  });

  it("is stopped by giving the game up", () => {
    const state = abandon(chosen(game()));
    expect(state.phase).toBe("ended");
    expect(state.ended).toBe("abandoned");
    expect(deadline(state)).toBeNull();
    expect(applyAction(state, 0, { type: "clue", word: "뿌리" }, T0, config, lexicon)).toEqual({ ok: false, reason: "game-over" });
    expect(abandon(state)).toBe(state);
  });
});

describe("what a player sends", () => {
  it("is read as a word of Hangul without its spaces", () => {
    expect(tidy(" 영화 관 ", 10)).toBe("영화관");
    expect(tidy("tree", 10)).toBeNull();
    expect(tidy("나무1", 10)).toBeNull();
    expect(tidy("", 10)).toBeNull();
    expect(tidy("가나다라마바사아자차카", 10)).toBeNull();
    expect(tidy(7, 10)).toBeNull();
    // a word typed as separate jamo sequences is the same word
    expect(tidy("나무".normalize("NFD"), 10)).toBe("나무");
  });

  it("is one of three things to ask, or nothing", () => {
    expect(parseAction({ type: "choose", word: "나무 " }, config)).toEqual({ type: "choose", word: "나무" });
    expect(parseAction({ type: "clue", word: "뿌리" }, config)).toEqual({ type: "clue", word: "뿌리" });
    expect(parseAction({ type: "answer", words: ["나무", "숲"] }, config)).toEqual({ type: "answer", words: ["나무", "숲"] });
    expect(parseAction({ type: "answer", words: [] }, config)).toBeNull();
    expect(parseAction({ type: "answer", words: ["가", "나", "다"] }, config)).toBeNull();
    expect(parseAction({ type: "answer", words: ["tree"] }, config)).toBeNull();
    expect(parseAction({ type: "clue" }, config)).toBeNull();
    expect(parseAction({ type: "pass" }, config)).toBeNull();
    expect(parseAction(null, config)).toBeNull();
  });
});
