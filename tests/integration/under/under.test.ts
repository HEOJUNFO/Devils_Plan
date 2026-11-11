import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import shipped from "../../../src/shared/games/under-thirteen/config.json";
import type { Chip, Stand } from "../../../src/shared/games/under-thirteen/rules";
import { advanceClock, closeAll, join, scheduledAlarm, type TestClient, type UnderMessage } from "../support";

const GAME = "under-thirteen" as const;
const SUBMIT_MS = shipped.submitSeconds * 1000;
const ROUNDS = shipped.cards.length * shipped.sets;
/** With bots asked for, the room fills up to this many players. */
const WITH_BOTS = 4;
/** The most a room holds. */
const FULL_ROOM = 16;

/** Connects to `room`, a room of 13 미만, and joins as player `player`. */
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
async function startGame(clients: TestClient[]): Promise<UnderMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.underWhere()));
}

/** `client` puts in `card` and `chip`. */
function submit(client: TestClient, card: number, chip: Chip): void {
  client.send({ type: "action", action: { type: "submit", card, chip } });
}

/** `client` has their rock placed (on `stand`, with the rainbow chip). */
function place(client: TestClient, stand?: Stand): void {
  client.send({ type: "action", action: stand === undefined ? { type: "place" } : { type: "place", stand } });
}

/** Runs the room's next alarm at the moment it is due. */
async function runAlarm(stub: DurableObjectStub): Promise<void> {
  const due = await scheduledAlarm(stub);
  advanceClock(Math.max(0, due - Date.now()) + 1);
  await runDurableObjectAlarm(stub);
}

/** Everyone puts in what `picks` says, and the clock is run until the cards are shown: what each of `clients` then sees. */
async function toPlacing(stub: DurableObjectStub, clients: TestClient[], picks: [number, Chip][], round: number): Promise<UnderMessage[]> {
  picks.forEach(([card, chip], n) => submit(clients[n], card, chip));
  await Promise.all(clients.map((client) => client.underWhere((game) => game.view.phase === "chips" && game.view.round === round)));
  await runAlarm(stub);
  return Promise.all(clients.map((client) => client.underWhere((game) => game.view.phase === "place" && game.view.round === round)));
}

/** Each player whose rock comes up has it placed, until the round's end is shown: what `clients[0]` then sees. */
async function placeAll(clients: TestClient[], seen: UnderMessage): Promise<UnderMessage> {
  let last = seen;
  while (last.view.turn !== null) {
    const turn = last.view.turn;
    const count = last.view.placements.length;
    place(clients[turn], "red");
    last = await clients[0].underWhere((game) => game.view.placements.length > count || game.view.phase === "pause");
  }
  return last;
}

/** Lets the room's clock run until `watcher` sees a game that satisfies `match`: each alarm is run when it is due. */
async function runClock(stub: DurableObjectStub, watcher: TestClient, match: (game: UnderMessage) => boolean): Promise<UnderMessage> {
  for (let step = 0; step < 160; step++) {
    await runAlarm(stub);
    // everything the alarm made the room send has arrived by the time the room answers this
    watcher.send({ type: "action", action: { type: "peek" } });
    let last: UnderMessage | null = null;
    for (;;) {
      const message = await watcher.next();
      if (message.type === "game" && message.game === GAME) last = message;
      if (message.type === "refused") break;
    }
    if (last !== null && match(last)) return last;
  }
  throw new Error("the game did not get there by its clock");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: a room of 13 미만", () => {
  it("starts a game for those in the room: bare stands, a whole set each, the same first player for everyone", async () => {
    const clients = await players("UTAAA", 3);

    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "UTAAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "submit", round: 1, rounds: ROUNDS, you: n, limit: shipped.limit, submitted: [], chips: null, cards: null, mine: null });
      expect(game.view.stands).toEqual({ red: [], green: [], blue: [] });
      expect(game.view.hand).toEqual({ cards: shipped.cards, chips: ["red", "red", "green", "green", "blue", "blue", "rainbow"] });
      expect(game.view.first).toBe(games[0].view.first);
      expect(game.players.map((player) => player.nick)).toEqual(["p0", "p1", "p2"]);
    });
    expect([0, 1, 2]).toContain(games[0].view.first);
    expect(games[0].clock.phase).toBeGreaterThan(0);
    expect(games[0].clock.phase).toBeLessThanOrEqual(SUBMIT_MS);
    closeAll(clients);
  });

  it("keeps what a player put in from the others, shows the chips when all is in, and the cards and the order after", async () => {
    const stub = env.GameRoom.getByName("UTAAB");
    const clients = await players("UTAAB", 3);
    await startGame(clients);

    submit(clients[1], 5, "green");
    const waiting = await Promise.all(clients.map((client) => client.underWhere((game) => game.view.submitted.length === 1)));
    submit(clients[0], 2, "red");
    submit(clients[2], 6, "rainbow");
    const chips = await Promise.all(clients.map((client) => client.underWhere((game) => game.view.phase === "chips")));
    await runAlarm(stub);
    const cards = await Promise.all(clients.map((client) => client.underWhere((game) => game.view.phase === "place")));

    expect(waiting[1].view.mine).toEqual({ card: 5, chip: "green" });
    for (const other of [waiting[0], waiting[2]]) {
      expect(other.view.mine).toBeNull();
      expect(other.view.chips).toBeNull();
      expect(JSON.stringify(other.view)).not.toContain('"card"');
    }
    for (const game of chips) {
      expect(game.view.chips).toEqual([
        { player: 1, chip: "green" },
        { player: 0, chip: "red" },
        { player: 2, chip: "rainbow" },
      ]);
      expect(game.view.cards).toBeNull();
    }
    for (const game of cards) {
      expect(game.view.cards?.map((each) => [each.player, each.card])).toEqual([[1, 5], [0, 2], [2, 6]]);
      // the rainbow chip first, then the higher card
      expect(game.view.order).toEqual([2, 1, 0]);
      expect(game.view.turn).toBe(2);
    }
    closeAll(clients);
  });

  it("places rocks in turn, lets a player pass to the end, places the last in the order by its own clock, and refuses a rock out of turn", async () => {
    const stub = env.GameRoom.getByName("UTAAC");
    const clients = await players("UTAAC", 3);
    await startGame(clients);
    const placing = await toPlacing(stub, clients, [[2, "red"], [5, "green"], [6, "rainbow"]], 1);

    place(clients[0]);
    const early = await clients[0].refusal();
    clients[2].send({ type: "action", action: { type: "pass" } });
    const passed = await clients[0].underWhere((game) => game.view.passed.length === 1);
    place(clients[1]);
    const last = await clients[0].underWhere((game) => game.view.placements.length === 1);
    // player 0 is the last in the order: asked nothing, and with no pass to be had; the room places their rock
    clients[0].send({ type: "action", action: { type: "pass" } });
    const noPass = await clients[0].refusal();
    await runAlarm(stub);
    const back = await clients[2].underWhere((game) => game.view.placements.length === 2);
    // the rock passed comes up: with the rainbow chip its player still has the stand to name
    place(clients[2], "blue");
    const over = await Promise.all(clients.map((client) => client.underWhere((game) => game.view.phase === "pause")));

    expect(early.reason).toBe("not-your-turn");
    expect(noPass.reason).toBe("cannot-pass");
    expect([placing[0], passed, last, back].map((game) => [game.view.turn, game.view.asked])).toEqual([
      [2, "place-or-pass"],
      [1, "place-or-pass"],
      [0, "nothing"],
      [2, "stand"],
    ]);
    expect(last.clock.phase).toBeLessThanOrEqual(shipped.placeSeconds * 1000);
    for (const game of over) {
      expect(game.view.stands).toEqual({ red: [2], green: [5], blue: [6] });
      expect(game.view.placements.map((each) => [each.player, each.passed, each.forced])).toEqual([
        [1, false, false],
        [0, false, false],
        [2, true, false],
      ]);
    }
    closeAll(clients);
  });

  it("clears a stand that comes to thirteen or more, gives its player the rocks taken as penalty points, and the marker for the next round", async () => {
    const stub = env.GameRoom.getByName("UTAAD");
    const clients = await players("UTAAD", 2);
    await startGame(clients);
    // two sixes on red, then a five: seventeen
    await placeAll(clients, (await toPlacing(stub, clients, [[6, "red"], [6, "red"]], 1))[0]);
    await runAlarm(stub);
    await Promise.all(clients.map((client) => client.underWhere((game) => game.view.round === 2 && game.view.phase === "submit")));
    const second = await toPlacing(stub, clients, [[5, "red"], [0, "red"]], 2);

    const over = await placeAll(clients, second[0]);
    await runAlarm(stub);
    const third = await clients[1].underWhere((game) => game.view.round === 3);

    expect(second[0].view.stands.red).toEqual([6, 6]);
    expect(over.view.placements).toEqual([
      { player: 0, stand: "red", weight: 5, sum: 17, cleared: 2, passed: false, forced: false },
      { player: 1, stand: "red", weight: 0, sum: 5, cleared: 0, passed: false, forced: false },
    ]);
    expect(over.view.stands.red).toEqual([5, 0]);
    expect(over.view.standings).toEqual([
      { player: 1, points: 0, last: 0, place: 1 },
      { player: 0, points: 2, last: 1, place: 2 },
    ]);
    expect(third.view.first).toBe(0);
    closeAll(clients);
  });

  it("carries a game on after the room has slept: what was put in, and the stands", async () => {
    const stub = env.GameRoom.getByName("UTAAE");
    const clients = await players("UTAAE", 2);
    await startGame(clients);
    submit(clients[0], 4, "blue");
    await clients[1].underWhere((game) => game.view.submitted.length === 1);

    await evictDurableObject(stub);
    submit(clients[1], 3, "blue");
    await clients[0].underWhere((game) => game.view.phase === "chips");
    await runAlarm(stub);
    const placing = await clients[0].underWhere((game) => game.view.phase === "place");
    await evictDurableObject(stub);
    const over = await placeAll(clients, placing);

    expect(placing.view.order).toEqual([0, 1]);
    expect(over.view.stands.blue).toEqual([4, 3]);
    closeAll(clients);
  });

  it("plays its fourteen rounds out by the clock when nobody does anything, the room putting in and placing for everyone", async () => {
    const stub = env.GameRoom.getByName("UTAAF");
    const clients = await players("UTAAF", 2);
    await startGame(clients);

    const over = await runClock(stub, clients[0], (game) => game.view.phase === "ended");

    expect(over.view.round).toBe(ROUNDS);
    expect(over.view.history.at(-1)).toEqual({ type: "ended", reason: "rounds" });
    expect(over.view.hand).toEqual({ cards: [], chips: [] });
    expect(over.clock.phase).toBeNull();
    closeAll(clients);
  });

  it("does not start for one player alone, and is over when one of two leaves the room", async () => {
    const alone = await open("UTAAG", 0, true);
    await alone.lobbyOf(1);
    alone.send({ type: "start", bots: false });
    const refusal = await alone.refusal();
    alone.close();
    const clients = await players("UTAAH", 2);
    await startGame(clients);

    clients[1].send({ type: "leave" });
    const over = await clients[0].underWhere((game) => game.view.phase === "ended");

    expect(refusal.reason).toBe("too-few");
    expect(over.view.history.at(-1)).toEqual({ type: "ended", reason: "left" });
    closeAll(clients);
  });

  it("lets someone who comes in during a game watch it without a hand, and takes nothing from them", async () => {
    const clients = await players("UTAAJ", 2);
    await startGame(clients);

    const watcher = await open("UTAAJ", 2);
    const seen = await watcher.underWhere();
    submit(watcher, 3, "red");
    const refusal = await watcher.refusal();

    expect(seen.view).toMatchObject({ phase: "submit", you: null, hand: null, mine: null });
    expect(refusal.reason).toBe("not-seated");
    closeAll([...clients, watcher]);
  });
});

describe("GameRoom: 13 미만 with bots", () => {
  it("fills the places with bots that put in and place for themselves: a round is played with nothing done for anyone", async () => {
    const stub = env.GameRoom.getByName("UTAAK");
    const person = await open("UTAAK", 0, true);
    await person.lobbyOf(1);

    person.send({ type: "start", bots: true });
    const game = await person.underWhere();
    submit(person, 0, "red");
    // The bots put theirs in, the chips are seen and the cards shown, and the rocks go on by the room's clock: each
    // bot's own a moment into its turn, the last in the order by the room. The person's nought is the last unless a
    // bot put in a nought too and sits after them: then the person is asked, and answers.
    const asked = (seen: UnderMessage): boolean => seen.view.phase === "place" && seen.view.turn === 0 && seen.view.asked !== "nothing";
    let over = await runClock(stub, person, (seen) => seen.view.phase === "pause" || asked(seen));
    if (asked(over)) {
      place(person);
      over = await person.underWhere((seen) => seen.view.placements.some((each) => each.player === 0));
      if (over.view.phase !== "pause") over = await runClock(stub, person, (seen) => seen.view.phase === "pause");
    }

    expect(game.players.map((player) => player.bot)).toEqual([false, true, true, true]);
    expect(game.players).toHaveLength(WITH_BOTS);
    expect(over.view.placements.map((each) => each.forced)).toEqual([false, false, false, false]);
    expect(over.view.placements.find((each) => each.player === 0)).toMatchObject({ stand: "red", weight: 0 });
    person.close();
  });
});

describe("GameRoom: a full room of 13 미만", () => {
  it("takes sixteen players through a round: sixteen rocks on the stands or taken off them", async () => {
    const stub = env.GameRoom.getByName("UTAAL");
    const clients = await players("UTAAL", FULL_ROOM);
    await startGame(clients);
    const chips: Chip[] = ["red", "green", "blue"];
    const placing = await toPlacing(stub, clients, clients.map((_, n) => [n % shipped.cards.length, chips[n % 3]]), 1);

    const over = await placeAll(clients, placing[0]);

    const onStands = over.view.stands.red.length + over.view.stands.green.length + over.view.stands.blue.length;
    const taken = over.view.standings.reduce((sum, each) => sum + each.points, 0);
    expect(placing[0].view.order).toHaveLength(FULL_ROOM);
    expect(over.view.placements).toHaveLength(FULL_ROOM);
    expect(onStands + taken).toBe(FULL_ROOM);
    closeAll(clients);
  });
});
