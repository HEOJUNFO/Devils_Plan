import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEXICON_KO } from "../../../src/shared/games/hidden-word/lexicon-ko";
import { advanceClock, closeAll, join, scheduledAlarm, type HiddenMessage, type TestClient } from "../support";

const GAME = "hidden-word" as const;
/** The game's own list of words: the test asks it what the room should have scored. */
const LIST = LEXICON_KO;

/** Connects to `room`, a room of 히든 워드, and joins as player `player`. */
function open(room: string, player: number, create = false): Promise<TestClient> {
  return join(room, { player, create, game: GAME });
}

/** Opens `room` with players 0..count-1, player 0 making it, and waits until all see each other. */
async function players(room: string, count: number): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  for (let n = 0; n < count; n++) clients.push(await open(room, n, n === 0));
  await Promise.all(clients.map((client) => client.lobbyOf(count)));
  return clients;
}

/** Starts a game at `clients` and returns each client's first view of it, in client order. */
async function startGame(clients: TestClient[]): Promise<HiddenMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.hiddenWhere()));
}

/** `client` asks `action` of the game. */
function act(client: TestClient, action: unknown): void {
  client.send({ type: "action", action });
}

/** Runs the room's next alarm at the moment it is due. */
async function runAlarm(stub: DurableObjectStub): Promise<void> {
  const due = await scheduledAlarm(stub);
  advanceClock(Math.max(0, due - Date.now()) + 1);
  await runDurableObjectAlarm(stub);
}

/** Every string anywhere in `value`. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

/** Everyone hides the first word of their envelope; returns what each then sees, the first setter's turn begun. */
async function allChoose(clients: TestClient[], games: HiddenMessage[]): Promise<HiddenMessage[]> {
  games.forEach((game, n) => act(clients[n], { type: "choose", word: game.view.hand?.words[0] }));
  return Promise.all(clients.map((client) => client.hiddenWhere((game) => game.view.phase === "clue")));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: a room of 히든 워드", () => {
  it("plays a setter's turn for three: envelopes of five, a clue the room scores, answers shown together, a point for whoever wrote the hidden word", async () => {
    const clients = await players("HWAAA", 3);
    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "HWAAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "choose", round: 1, you: n, order: null, setter: null, clues: [], ready: [], result: null, answer: null });
      // (`checksLeft` and `checks` are there for pages of builds before 9b5e8dc, which throw on a hand without them)
      expect(game.view.hand).toEqual({ words: game.view.hand?.words, used: [], chosen: null, checksLeft: 0, checks: [] });
      expect(game.view.hand?.words).toHaveLength(5);
      expect(game.rules).toMatchObject({ rounds: 2, envelope: 5, clues: 10, clueSeconds: 450, threshold: 95, stages: 3, answerSeconds: 150, pieces: 3 });
      expect(game.rules).not.toHaveProperty("checks");
    });
    // no word is in two envelopes
    const dealt = games.flatMap((game) => game.view.hand?.words ?? []);
    expect(new Set(dealt).size).toBe(15);

    const turn = await allChoose(clients, games);
    const setter = turn[0].view.setter as number;
    const hidden = turn[setter].view.hand?.chosen as string;
    const guessers = [0, 1, 2].filter((n) => n !== setter);
    expect(hidden).toBe(games[setter].view.hand?.words[0]);
    for (const game of turn) {
      expect(game.view).toMatchObject({ stage: 1, clues: [], past: [] });
      expect(game.view.order).toHaveLength(3);
      expect(game.view.order?.[0]).toBe(setter);
    }
    // the hidden word is nowhere in what the others are sent
    for (const n of guessers) expect(strings(turn[n])).not.toContain(hidden);

    act(clients[guessers[0]], { type: "clue", word: hidden });
    expect((await clients[guessers[0]].nextOf("refused")).reason).toBe("not-setter");
    act(clients[setter], { type: "clue", word: hidden });
    expect((await clients[setter].nextOf("refused")).reason).toBe("same-as-hidden");

    // the nearest word of the list is a clue over the mark: it ends the clues
    const [clue] = LIST.nearest(hidden, 1);
    const expected = LIST.score(hidden, clue) as number;
    expect(expected).toBeGreaterThanOrEqual(95);
    act(clients[setter], { type: "clue", word: clue });
    const answering = await Promise.all(clients.map((client) => client.hiddenWhere((game) => game.view.phase === "answer")));
    for (const game of answering) expect(game.view.clues).toEqual([{ word: clue, score: expected, stage: 1, room: false }]);
    for (const n of guessers) expect(strings(answering[n])).not.toContain(hidden);

    act(clients[setter], { type: "answer", words: [hidden] });
    expect((await clients[setter].nextOf("refused")).reason).toBe("setter-cannot-answer");

    // one guesser buys a second answer with a Piece: it is taken at once, and everyone sees that it was
    const own = games[guessers[0]].view.hand?.words[1] as string;
    act(clients[guessers[0]], { type: "answer", words: [own, hidden] });
    const waiting = await Promise.all(clients.map((client) => client.hiddenWhere((game) => game.view.ready.length === 1)));
    for (const game of waiting) {
      expect(game.view.pieced).toEqual([guessers[0]]);
      expect(game.view.pieces.find((each) => each.player === guessers[0])?.left).toBe(2);
      expect(game.view.result).toBeNull();
    }
    // what one wrote is not shown to the others before the answers are revealed
    expect(waiting[guessers[0]].view.answer).toEqual([own, hidden]);
    expect(waiting[guessers[1]].view.answer).toBeNull();
    expect(strings(waiting[guessers[1]])).not.toContain(hidden);
    act(clients[guessers[0]], { type: "answer", words: [hidden] });
    expect((await clients[guessers[0]].nextOf("refused")).reason).toBe("already-answered");

    act(clients[guessers[1]], { type: "answer", words: [clue] });
    const revealed = await Promise.all(clients.map((client) => client.hiddenWhere((game) => game.view.phase === "reveal")));
    for (const game of revealed) {
      expect(game.view.result).toMatchObject({ round: 1, setter, stage: 1, each: 1, setterPoints: 0, over: true, word: hidden });
      expect(game.view.result?.answers).toEqual([
        { player: guessers[0], words: [own, hidden], right: true },
        { player: guessers[1], words: [clue], right: false },
      ]);
      expect(game.view.totals.map((each) => each.total)).toEqual([0, 1, 2].map((n) => (n === guessers[0] ? 1 : 0)));
      expect(game.view.past).toMatchObject([{ round: 1, setter, word: hidden, stage: 1, right: [guessers[0]], setterPoints: 0 }]);
    }
    closeAll(clients);
  });

  it("goes on by the room's own clock: a setter who gives no clue is given one, answers not written count as wrong, and the setter scores and gives clues again", async () => {
    const stub = env.GameRoom.getByName("HWAAB");
    const clients = await players("HWAAB", 3);
    const turn = await allChoose(clients, await startGame(clients));
    const setter = turn[0].view.setter as number;
    const hidden = turn[setter].view.hand?.chosen as string;

    // the 15 minutes pass without a clue: the room gives the nearest word, marked as its own
    await runAlarm(stub);
    const answering = await Promise.all(clients.map((client) => client.hiddenWhere((game) => game.view.phase === "answer")));
    const [nearest] = LIST.nearest(hidden, 1);
    for (const game of answering) expect(game.view.clues).toEqual([{ word: nearest, score: LIST.score(hidden, nearest), stage: 1, room: true }]);

    // the five minutes pass without an answer
    await runAlarm(stub);
    const revealed = await Promise.all(clients.map((client) => client.hiddenWhere((game) => game.view.phase === "reveal")));
    for (const game of revealed) {
      expect(game.view.result).toMatchObject({ setter, stage: 1, setterPoints: 1, over: false, word: null });
      expect(game.view.result?.answers.every((each) => each.words.length === 0 && !each.right)).toBe(true);
      expect(game.view.totals.find((each) => each.player === setter)?.total).toBe(1);
    }
    for (const n of [0, 1, 2].filter((each) => each !== setter)) expect(strings(revealed[n])).not.toContain(hidden);

    // the answers have been on show: the same setter's second stage
    await runAlarm(stub);
    const again = await Promise.all(clients.map((client) => client.hiddenWhere((game) => game.view.phase === "clue" && game.view.stage === 2)));
    for (const game of again) {
      expect(game.view.setter).toBe(setter);
      expect(game.view.clues).toEqual([{ word: nearest, score: LIST.score(hidden, nearest), stage: 1, room: true }]);
    }
    closeAll(clients);
  });
});
