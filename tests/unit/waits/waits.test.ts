import { describe, expect, it } from "vitest";
import { bingoWaits, codeWaits, divineWaits, eqWaits, fenceWaits, flagsWaits, gemWaits, gradWaits, grassWaits, hiddenWaits, hitWaits, janggiWaits, linkWaits, omokWaits, piggyWaits, rectWaits, towerWaits, underWaits, wallWaits } from "../../../src/shared/waits";

/** The player looking, and another. */
const ME = 3;
const OTHER = 5;

describe("grassWaits", () => {
  const view = (changes: Partial<Parameters<typeof grassWaits>[0]> = {}): Parameters<typeof grassWaits>[0] => ({ you: ME, phase: "place", turn: ME, choosing: null, ...changes });

  it("waits on the player whose turn it is, in each part of a turn", () => {
    for (const phase of ["pick", "manholes", "trees", "place"] as const) expect(grassWaits(view({ phase }))).toBe(true);
  });

  it("does not wait on them in another player's turn, nor between turns", () => {
    expect(grassWaits(view({ turn: OTHER }))).toBe(false);
    expect(grassWaits(view({ phase: "pause", turn: null }))).toBe(false);
  });

  it("waits on a player who has a choice to make, until they have made it", () => {
    expect(grassWaits(view({ phase: "choose", turn: null, choosing: { which: 5, chosen: [], mine: null } }))).toBe(true);
    expect(grassWaits(view({ phase: "choose", turn: null, choosing: { which: 5, chosen: [ME], mine: 1 } }))).toBe(false);
    expect(grassWaits(view({ phase: "choose", turn: null, choosing: null }))).toBe(false);
  });

  it("waits on nobody who is watching, and on nobody once the game is over", () => {
    expect(grassWaits(view({ you: null }))).toBe(false);
    expect(grassWaits(view({ you: null, phase: "choose", turn: null, choosing: { which: 5, chosen: [], mine: null } }))).toBe(false);
    expect(grassWaits(view({ phase: "ended" }))).toBe(false);
  });
});

describe("underWaits", () => {
  const view = (changes: Partial<Parameters<typeof underWaits>[0]> = {}): Parameters<typeof underWaits>[0] => ({ you: ME, phase: "place", turn: ME, asked: "place-or-pass", submitted: [], ...changes });

  it("waits on the player whose rock it is, when they are asked about it", () => {
    expect(underWaits(view({ asked: "place-or-pass" }))).toBe(true);
    expect(underWaits(view({ asked: "stand" }))).toBe(true);
  });

  it("does not wait on them for a rock the room places, nor for another player's", () => {
    expect(underWaits(view({ asked: "nothing" }))).toBe(false);
    expect(underWaits(view({ asked: null, turn: null }))).toBe(false);
    expect(underWaits(view({ turn: OTHER }))).toBe(false);
  });

  it("waits on a player who has a card and a chip to put in, until they have", () => {
    expect(underWaits(view({ phase: "submit", turn: null, asked: null, submitted: [OTHER] }))).toBe(true);
    expect(underWaits(view({ phase: "submit", turn: null, asked: null, submitted: [OTHER, ME] }))).toBe(false);
  });

  it("waits on nobody who is watching, and on nobody once the game is over", () => {
    expect(underWaits(view({ you: null }))).toBe(false);
    expect(underWaits(view({ you: null, phase: "submit", turn: null, asked: null }))).toBe(false);
    expect(underWaits(view({ phase: "ended" }))).toBe(false);
  });
});

describe("rectWaits", () => {
  const you = { player: ME, unit: 0 };

  it("waits on a player who has the third choice to make, until they have made it", () => {
    expect(rectWaits({ you, choosing: { card: "winners", yours: true, chosen: [], of: 3, mine: null } })).toBe(true);
    expect(rectWaits({ you, choosing: { card: "winners", yours: true, chosen: [ME], of: 3, mine: 1 } })).toBe(false);
  });

  it("does not wait on a player of a losing team whose leader makes its choice", () => {
    expect(rectWaits({ you, choosing: { card: "losers", yours: false, chosen: [], of: 4, mine: null } })).toBe(false);
  });

  it("does not wait while no choice is up, nor on one whose card is not theirs to see", () => {
    expect(rectWaits({ you, choosing: null })).toBe(false);
    expect(rectWaits({ you, choosing: { card: null, yours: false, chosen: [], of: 3, mine: null } })).toBe(false);
  });

  it("waits on nobody who is watching", () => {
    expect(rectWaits({ you: null, choosing: { card: "winners", yours: false, chosen: [], of: 3, mine: null } })).toBe(false);
  });
});

describe("piggyWaits", () => {
  const question = (player: number) => ({ player, from: OTHER, bank: 1, colour: "black" as const, count: null, answered: false });
  const view = (over: Partial<Parameters<typeof piggyWaits>[0]>): Parameters<typeof piggyWaits>[0] => ({ you: ME, phase: "put", turn: OTHER, question: null, challenge: null, ...over });

  it("waits on whoever is to put coins in, on whoever is asked about a bank, and on whoever is naming the banks of a challenge", () => {
    expect(piggyWaits(view({ turn: ME }))).toBe(true);
    expect(piggyWaits(view({ phase: "answer", question: question(ME) }))).toBe(true);
    expect(piggyWaits(view({ phase: "challenge", challenge: { player: ME, result: null } }))).toBe(true);
  });

  it("does not wait on the others, nor on anyone for a suspicion, which is a race", () => {
    expect(piggyWaits(view({}))).toBe(false);
    expect(piggyWaits(view({ phase: "answer", turn: ME, question: question(OTHER) }))).toBe(false);
    expect(piggyWaits(view({ phase: "suspect", turn: OTHER, question: question(OTHER) }))).toBe(false);
    expect(piggyWaits(view({ phase: "challenge", turn: ME, challenge: { player: OTHER, result: null } }))).toBe(false);
  });

  it("waits on nobody who is watching, and on nobody once the game is over", () => {
    expect(piggyWaits(view({ you: null, turn: ME }))).toBe(false);
    expect(piggyWaits(view({ phase: "ended", turn: ME }))).toBe(false);
  });
});

describe("gemWaits", () => {
  const auction = (mine: number | null, bidders = [ME, OTHER]) => ({ bidders, made: mine === null ? [] : [ME], mine, again: false });
  const view = (over: Partial<Parameters<typeof gemWaits>[0]>): Parameters<typeof gemWaits>[0] => ({ you: ME, phase: "exchange", turn: OTHER, auction: null, ...over });

  it("waits on whoever has a bid to make, until they have made it, and on whoever's turn it is to exchange", () => {
    expect(gemWaits(view({ phase: "auction", turn: null, auction: auction(null) }))).toBe(true);
    expect(gemWaits(view({ phase: "auction", turn: null, auction: auction(0) }))).toBe(false);
    expect(gemWaits(view({ turn: ME }))).toBe(true);
  });

  it("does not wait on someone who is not bidding again, on the others' turns, nor for a look at a card or at a round's count", () => {
    expect(gemWaits(view({ phase: "auction", turn: null, auction: auction(null, [OTHER]) }))).toBe(false);
    expect(gemWaits(view({}))).toBe(false);
    expect(gemWaits(view({ phase: "seen", turn: ME }))).toBe(false);
    expect(gemWaits(view({ phase: "look", turn: null }))).toBe(false);
    expect(gemWaits(view({ phase: "reveal", turn: null }))).toBe(false);
  });

  it("waits on nobody who is watching, and on nobody once the game is over", () => {
    expect(gemWaits(view({ you: null, turn: ME }))).toBe(false);
    expect(gemWaits(view({ phase: "ended", turn: null }))).toBe(false);
  });
});

describe("bingoWaits", () => {
  const view = (over: Partial<Parameters<typeof bingoWaits>[0]>): Parameters<typeof bingoWaits>[0] => ({ you: ME, phase: "choose", out: [], choice: null, bid: null, ...over });

  it("waits on a player whose ticket is not in, and on one who has not bid", () => {
    expect(bingoWaits(view({}))).toBe(true);
    expect(bingoWaits(view({ phase: "bid", choice: "star" }))).toBe(true);
  });

  it("does not wait on a player who has done what the round is at, nor while a result is shown", () => {
    expect(bingoWaits(view({ choice: "star" }))).toBe(false);
    expect(bingoWaits(view({ phase: "bid", choice: "star", bid: { coins: [1], amount: 1 } }))).toBe(false);
    expect(bingoWaits(view({ phase: "result", choice: "star" }))).toBe(false);
    expect(bingoWaits(view({ phase: "ended" }))).toBe(false);
  });

  it("waits on nobody who is watching, and on nobody who is out of coins", () => {
    expect(bingoWaits(view({ you: null }))).toBe(false);
    expect(bingoWaits(view({ out: [ME] }))).toBe(false);
    expect(bingoWaits(view({ out: [OTHER] }))).toBe(true);
  });
});

describe("wallWaits", () => {
  it("waits on whoever's turn it is, to place a counter, to move one, or to place a wall", () => {
    expect(wallWaits({ you: ME, turn: ME })).toBe(true);
  });

  it("does not wait on the others, on someone watching, or on anyone between the rounds and at the end, when the turn is nobody's", () => {
    expect(wallWaits({ you: ME, turn: OTHER })).toBe(false);
    expect(wallWaits({ you: null, turn: ME })).toBe(false);
    expect(wallWaits({ you: ME, turn: null })).toBe(false);
    expect(wallWaits({ you: null, turn: null })).toBe(false);
  });
});

describe("gradWaits", () => {
  const view = (changes: Partial<Parameters<typeof gradWaits>[0]> = {}): Parameters<typeof gradWaits>[0] => ({ you: ME, phase: "arrange", duel: [ME, OTHER], ready: [], turn: null, ...changes });

  it("waits on a player of the match whose cubes are not distributed, and on whoever is to submit a cup", () => {
    expect(gradWaits(view())).toBe(true);
    expect(gradWaits(view({ ready: [OTHER] }))).toBe(true);
    expect(gradWaits(view({ phase: "submit", turn: ME }))).toBe(true);
  });

  it("does not wait on a player who is done, whose opponent is to submit, or while numbers and results are shown", () => {
    expect(gradWaits(view({ ready: [ME] }))).toBe(false);
    expect(gradWaits(view({ phase: "submit", turn: OTHER }))).toBe(false);
    for (const phase of ["reveal", "between", "ended"] as const) expect(gradWaits(view({ phase, turn: null }))).toBe(false);
  });

  it("waits on nobody who waits for the match's winner, and on nobody who is watching", () => {
    expect(gradWaits(view({ duel: [OTHER, 7] }))).toBe(false);
    expect(gradWaits(view({ you: null }))).toBe(false);
    expect(gradWaits(view({ you: null, phase: "submit", turn: ME }))).toBe(false);
  });
});

describe("eqWaits", () => {
  const view = (changes: Partial<Parameters<typeof eqWaits>[0]> = {}): Parameters<typeof eqWaits>[0] => ({ you: ME, phase: "create", ready: [], ...changes });

  it("waits on a player who has no equation in yet, or no answer in the turn being played", () => {
    expect(eqWaits(view())).toBe(true);
    expect(eqWaits(view({ ready: [OTHER] }))).toBe(true);
    expect(eqWaits(view({ phase: "guess" }))).toBe(true);
  });

  it("does not wait on a player whose equation or answer is in, nor once the game is over", () => {
    expect(eqWaits(view({ ready: [ME] }))).toBe(false);
    expect(eqWaits(view({ phase: "guess", ready: [ME, OTHER] }))).toBe(false);
    expect(eqWaits(view({ phase: "ended" }))).toBe(false);
  });

  it("does not wait on someone watching", () => {
    expect(eqWaits(view({ you: null }))).toBe(false);
    expect(eqWaits(view({ you: null, phase: "guess" }))).toBe(false);
  });
});

describe("hitWaits", () => {
  const hands = (chosen: boolean) => [
    { player: ME, chosen },
    { player: OTHER, chosen: false },
  ];
  const view = (changes: Partial<Parameters<typeof hitWaits>[0]> = {}): Parameters<typeof hitWaits>[0] => ({ you: ME, phase: "reveal", turn: null, hands: hands(false), ...changes });

  it("waits on a player who has not chosen the card to reveal, and on the player whose turn it is to bet, or to hit or stay", () => {
    expect(hitWaits(view())).toBe(true);
    expect(hitWaits(view({ phase: "bet", turn: ME }))).toBe(true);
    expect(hitWaits(view({ phase: "hit", turn: ME }))).toBe(true);
  });

  it("does not wait on a player who has chosen, on one whose turn it is not, nor while an outcome is on show", () => {
    expect(hitWaits(view({ hands: hands(true) }))).toBe(false);
    expect(hitWaits(view({ phase: "bet", turn: OTHER }))).toBe(false);
    expect(hitWaits(view({ phase: "hit", turn: OTHER }))).toBe(false);
    for (const phase of ["show", "ended"] as const) expect(hitWaits(view({ phase, turn: null }))).toBe(false);
  });

  it("does not wait on someone out of the game, nor on someone watching", () => {
    expect(hitWaits(view({ hands: [{ player: OTHER, chosen: false }] }))).toBe(false);
    expect(hitWaits(view({ you: null }))).toBe(false);
    expect(hitWaits(view({ you: null, phase: "bet", turn: ME }))).toBe(false);
  });
});

describe("flagsWaits", () => {
  const view = (changes: Partial<Parameters<typeof flagsWaits>[0]> = {}): Parameters<typeof flagsWaits>[0] => ({ you: ME, phase: "choose", playing: [ME, OTHER], ready: [], ...changes });

  it("waits on a player who has the flags laid out before them and has not submitted", () => {
    expect(flagsWaits(view())).toBe(true);
    expect(flagsWaits(view({ ready: [OTHER] }))).toBe(true);
  });

  it("does not wait on a player who has submitted, nor while flags go by, nor once the round is scored", () => {
    expect(flagsWaits(view({ ready: [ME] }))).toBe(false);
    for (const phase of ["show", "wait", "reveal", "ended"] as const) expect(flagsWaits(view({ phase }))).toBe(false);
  });

  it("does not wait on a player a tiebreaker round is not for, nor on someone watching", () => {
    expect(flagsWaits(view({ playing: [OTHER] }))).toBe(false);
    expect(flagsWaits(view({ you: null }))).toBe(false);
  });
});

describe("hiddenWaits", () => {
  const view = (changes: Partial<Parameters<typeof hiddenWaits>[0]> = {}): Parameters<typeof hiddenWaits>[0] => ({ you: ME, phase: "choose", setter: null, ready: [], ...changes });

  it("waits on a player who has yet to choose their hidden word", () => {
    expect(hiddenWaits(view())).toBe(true);
    expect(hiddenWaits(view({ ready: [OTHER] }))).toBe(true);
    expect(hiddenWaits(view({ ready: [ME] }))).toBe(false);
  });

  it("waits on the word setter while clues are given, and on nobody else", () => {
    expect(hiddenWaits(view({ phase: "clue", setter: ME }))).toBe(true);
    expect(hiddenWaits(view({ phase: "clue", setter: OTHER }))).toBe(false);
  });

  it("waits on everyone but the setter who has yet to write an answer", () => {
    expect(hiddenWaits(view({ phase: "answer", setter: OTHER }))).toBe(true);
    expect(hiddenWaits(view({ phase: "answer", setter: OTHER, ready: [ME] }))).toBe(false);
    expect(hiddenWaits(view({ phase: "answer", setter: ME }))).toBe(false);
  });

  it("does not wait while the answers are on show, once the game is over, or on someone watching", () => {
    for (const phase of ["reveal", "ended"] as const) expect(hiddenWaits(view({ phase, setter: OTHER }))).toBe(false);
    expect(hiddenWaits(view({ you: null }))).toBe(false);
  });
});

describe("towerWaits", () => {
  const view = (changes: Partial<Parameters<typeof towerWaits>[0]> = {}): Parameters<typeof towerWaits>[0] => ({ you: ME, phase: "think", buzzer: null, challenger: null, ...changes });

  it("waits on whoever pressed the buzzer and has yet to declare, and on the challenger moving blocks", () => {
    expect(towerWaits(view({ phase: "say", buzzer: ME }))).toBe(true);
    expect(towerWaits(view({ phase: "move", challenger: ME }))).toBe(true);
  });

  it("waits on nobody to press the buzzer or to declare fewer moves, nor on the others while one declares or moves", () => {
    expect(towerWaits(view())).toBe(false);
    expect(towerWaits(view({ phase: "more" }))).toBe(false);
    expect(towerWaits(view({ phase: "say", buzzer: OTHER }))).toBe(false);
    expect(towerWaits(view({ phase: "move", challenger: OTHER }))).toBe(false);
    expect(towerWaits(view({ phase: "result" }))).toBe(false);
    expect(towerWaits(view({ phase: "ended" }))).toBe(false);
  });

  it("does not wait on someone watching", () => {
    expect(towerWaits(view({ you: null, phase: "say", buzzer: OTHER }))).toBe(false);
    expect(towerWaits(view({ you: null, phase: "move", challenger: OTHER }))).toBe(false);
  });
});

describe("omokWaits", () => {
  const view = (changes: Partial<Parameters<typeof omokWaits>[0]> = {}): Parameters<typeof omokWaits>[0] => ({ you: ME, phase: "select", selector: ME, ready: [], ...changes });

  it("waits on the round's selector while spots are marked, and on whoever has not bet once they are", () => {
    expect(omokWaits(view())).toBe(true);
    expect(omokWaits(view({ phase: "bet" }))).toBe(true);
    expect(omokWaits(view({ phase: "bet", selector: OTHER, ready: [OTHER] }))).toBe(true);
  });

  it("does not wait on the other player while spots are marked, on a player whose bets are in, nor once the game is over", () => {
    expect(omokWaits(view({ selector: OTHER }))).toBe(false);
    expect(omokWaits(view({ phase: "bet", ready: [ME] }))).toBe(false);
    expect(omokWaits(view({ phase: "ended" }))).toBe(false);
  });

  it("does not wait on someone watching", () => {
    expect(omokWaits(view({ you: null }))).toBe(false);
    expect(omokWaits(view({ you: null, phase: "bet" }))).toBe(false);
  });
});

describe("linkWaits", () => {
  const view = (changes: Partial<Parameters<typeof linkWaits>[0]> = {}): Parameters<typeof linkWaits>[0] => ({ you: ME, phase: "place", chooser: null, turn: ME, prover: null, ...changes });

  it("waits on whoever is to choose who goes first, whose turn it is to place, or who has to prove the connections", () => {
    expect(linkWaits(view())).toBe(true);
    expect(linkWaits(view({ phase: "choose", chooser: ME, turn: null }))).toBe(true);
    expect(linkWaits(view({ phase: "prove", turn: null, prover: ME }))).toBe(true);
  });

  it("does not wait on the other player, nor while a round's outcome is on show, nor once the game is over", () => {
    expect(linkWaits(view({ turn: OTHER }))).toBe(false);
    expect(linkWaits(view({ phase: "choose", chooser: OTHER, turn: null }))).toBe(false);
    expect(linkWaits(view({ phase: "prove", turn: null, prover: OTHER }))).toBe(false);
    expect(linkWaits(view({ phase: "show", turn: null }))).toBe(false);
    expect(linkWaits(view({ phase: "ended", turn: null }))).toBe(false);
  });

  it("does not wait on someone watching", () => {
    expect(linkWaits(view({ you: null }))).toBe(false);
    expect(linkWaits(view({ you: null, phase: "prove", turn: null, prover: OTHER }))).toBe(false);
  });
});

describe("janggiWaits", () => {
  type View = Parameters<typeof janggiWaits>[0];
  const hand = (player: number, ready: boolean): View["hands"][number] => ({ player, used: [], current: null, hidden: 0, ready, due: 5 });
  const view = (changes: Partial<View> = {}): View => ({ you: ME, phase: "move", hands: [hand(ME, true), hand(OTHER, true)], arranger: null, mover: ME, ...changes });

  it("waits on whoever has cards to lay, or is to choose the move: their own, or the opponent's when the opponent is out of time", () => {
    expect(janggiWaits(view())).toBe(true);
    expect(janggiWaits(view({ phase: "proxy" }))).toBe(true);
    expect(janggiWaits(view({ phase: "arrange", mover: null, hands: [hand(ME, false), hand(OTHER, true)] }))).toBe(true);
    expect(janggiWaits(view({ phase: "rearrange", mover: null, arranger: ME }))).toBe(true);
  });

  it("does not wait on a player whose cards are laid, on the other player's move, while a round's outcome is on show, nor once the game is over", () => {
    expect(janggiWaits(view({ mover: OTHER }))).toBe(false);
    expect(janggiWaits(view({ phase: "proxy", mover: OTHER }))).toBe(false);
    expect(janggiWaits(view({ phase: "arrange", mover: null, hands: [hand(ME, true), hand(OTHER, false)] }))).toBe(false);
    expect(janggiWaits(view({ phase: "rearrange", mover: null, arranger: OTHER }))).toBe(false);
    expect(janggiWaits(view({ phase: "show", mover: null }))).toBe(false);
    expect(janggiWaits(view({ phase: "ended", mover: null }))).toBe(false);
  });

  it("does not wait on someone watching", () => {
    expect(janggiWaits(view({ you: null }))).toBe(false);
    expect(janggiWaits(view({ you: null, phase: "arrange", hands: [hand(ME, false), hand(OTHER, false)] }))).toBe(false);
  });
});

describe("divineWaits", () => {
  type View = Parameters<typeof divineWaits>[0];
  const at = (player: number, done: number | null = null, left = false): View["standings"][number] => ({ player, placed: 1, lines: 0, moves: 0, done, left });
  const view = (changes: Partial<View> = {}): View => ({ you: ME, phase: "play", standings: [at(ME), at(OTHER)], ...changes });

  it("waits on every player whose board has not passed", () => {
    expect(divineWaits(view())).toBe(true);
    expect(divineWaits(view({ standings: [at(ME), at(OTHER, 5000)] }))).toBe(true);
  });

  it("does not wait on a player whose board has passed, nor once the game is over", () => {
    expect(divineWaits(view({ standings: [at(ME, 5000), at(OTHER)] }))).toBe(false);
    expect(divineWaits(view({ phase: "ended" }))).toBe(false);
  });

  it("does not wait on someone watching", () => {
    expect(divineWaits(view({ you: null }))).toBe(false);
  });
});

describe("fenceWaits", () => {
  type View = Parameters<typeof fenceWaits>[0];
  const at = (player: number, done: number | null = null, left = false): View["standings"][number] => ({ player, lines: 3, wrong: 0, done, left });
  const view = (changes: Partial<View> = {}): View => ({ you: ME, phase: "play", standings: [at(ME), at(OTHER)], ...changes });

  it("waits on every player whose fence has not passed", () => {
    expect(fenceWaits(view())).toBe(true);
    expect(fenceWaits(view({ standings: [at(ME), at(OTHER, 5000)] }))).toBe(true);
  });

  it("does not wait on a player whose fence has passed, nor once the game is over", () => {
    expect(fenceWaits(view({ standings: [at(ME, 5000), at(OTHER)] }))).toBe(false);
    expect(fenceWaits(view({ phase: "ended" }))).toBe(false);
  });

  it("does not wait on someone watching", () => {
    expect(fenceWaits(view({ you: null }))).toBe(false);
  });
});

describe("codeWaits", () => {
  type View = Parameters<typeof codeWaits>[0];
  const seat = (player: number, changes: Partial<View["seats"][number]> = {}): View["seats"][number] => ({ player, safe: null, wrong: false, misses: 0, left: false, ...changes });
  const view = (changes: Partial<View> = {}): View => ({ you: ME, phase: "round", seats: [seat(ME), seat(OTHER)], ...changes });

  it("waits on every player who can still answer in the round", () => {
    expect(codeWaits(view())).toBe(true);
    expect(codeWaits(view({ seats: [seat(ME), seat(OTHER, { wrong: true })] }))).toBe(true);
  });

  it("does not wait on a player who is safe or was wrong in the round, nor while a code is shown, nor once the game is over", () => {
    expect(codeWaits(view({ seats: [seat(ME, { safe: 1 }), seat(OTHER)] }))).toBe(false);
    expect(codeWaits(view({ seats: [seat(ME, { wrong: true, misses: 1 }), seat(OTHER)] }))).toBe(false);
    expect(codeWaits(view({ phase: "show" }))).toBe(false);
    expect(codeWaits(view({ phase: "ended" }))).toBe(false);
  });

  it("does not wait on someone watching", () => {
    expect(codeWaits(view({ you: null }))).toBe(false);
  });
});
