import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceClock, closeAll, join, scheduledAlarm, type HitMessage, type TestClient } from "../support";

const GAME = "hit-stay" as const;

/** Connects to `room`, a room of HIT, STAY, and joins as player `player`. */
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
async function startGame(clients: TestClient[]): Promise<HitMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.hitWhere()));
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

/** What `game` shows of the hand of `player`. */
const seenHand = (game: HitMessage, player: number): HitMessage["view"]["hands"][number] => game.view.hands.find((hand) => hand.player === player) as HitMessage["view"]["hands"][number];

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: a room of HIT, STAY", () => {
  it("plays a round for two: cards are dealt unseen, one each is revealed, a bet is called, a card is taken face up, and a fold gives the pot away with no hand shown", async () => {
    const clients = await players("HSAAA", 2);
    const games = await startGame(clients);
    const first = games[0].view.first;
    const second = 1 - first;

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "HSAAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "reveal", round: 1, basic: 1, pot: 2, you: n, left: 29, turn: null });
      expect(game.view.mine?.cards).toHaveLength(3);
      expect(seenHand(game, 1 - n)).toMatchObject({ revealed: null, hidden: 3, chosen: false });
      expect(JSON.stringify(game)).not.toContain("deck");
      expect(JSON.stringify(game)).not.toContain("secret");
    });
    for (const client of clients) act(client, { type: "reveal", card: 0 });
    const betting = await Promise.all(clients.map((client) => client.hitWhere((game) => game.view.phase === "bet")));
    act(clients[first], { type: "bet", to: 3 });
    await Promise.all(clients.map((client) => client.hitWhere((game) => game.view.phase === "bet" && game.view.high === 3)));
    act(clients[second], { type: "call" });
    const hitting = await Promise.all(clients.map((client) => client.hitWhere((game) => game.view.phase === "hit")));
    act(clients[first], { type: "stay" });
    await Promise.all(clients.map((client) => client.hitWhere((game) => game.view.phase === "hit" && game.view.turn === second)));
    act(clients[second], { type: "hit" });
    const hit = await Promise.all(clients.map((client) => client.hitWhere((game) => seenHand(game, second).extra.length === 1)));
    act(clients[second], { type: "stay" });
    const again = await Promise.all(clients.map((client) => client.hitWhere((game) => game.view.phase === "bet" && game.view.betting === 2)));
    act(clients[first], { type: "fold" });
    const taken = await Promise.all(clients.map((client) => client.hitWhere((game) => game.view.phase === "show")));

    betting.forEach((game, n) => {
      expect(game.view).toMatchObject({ turn: first, betting: 1, most: 29, high: 0 });
      // the card the other revealed, and no more of their hand
      expect(seenHand(game, 1 - n)).toMatchObject({ revealed: games[1 - n].view.mine?.cards[0], hidden: 2 });
    });
    for (const game of hitting) expect(game.view).toMatchObject({ turn: first, pot: 8 });
    expect(seenHand(hit[0], second).extra).toEqual(seenHand(hit[1], second).extra);
    for (const game of hit) expect(game.view).toMatchObject({ turn: second, left: 28 });
    for (const game of again) expect(game.view).toMatchObject({ turn: first, high: 0, most: 26 });
    for (const game of taken) {
      expect(game.view.outcome).toMatchObject({ round: 1, how: "fold", pot: 8, hands: [], shares: [{ player: second, chips: 8 }], out: [] });
      expect(game.view.chips.find((each) => each.player === second)?.chips).toBe(34);
      expect(game.view.chips.find((each) => each.player === first)?.chips).toBe(26);
    }
    // whoever took the pot showed nothing
    expect(seenHand(taken[first], second).hidden).toBe(2);
    closeAll(clients);
  });

  it("goes on by the room's own clock: after a quarter of a minute the room reveals a card for whoever has chosen none, and the betting begins", async () => {
    const stub = env.GameRoom.getByName("HSAAB");
    const clients = await players("HSAAB", 2);
    await startGame(clients);
    act(clients[0], { type: "reveal", card: 2 });
    await Promise.all(clients.map((client) => client.hitWhere((game) => seenHand(game, 0).chosen)));

    await runAlarm(stub);
    const betting = await Promise.all(clients.map((client) => client.hitWhere((game) => game.view.phase === "bet")));

    for (const game of betting) {
      expect(game.view.history.at(-1)).toEqual({ type: "revealed", forced: [1] });
      expect(seenHand(game, 0).hidden).toBe(2);
      expect(seenHand(game, 1).hidden).toBe(2);
    }
    expect(betting[0].view.mine?.revealed).toBe(2);
    expect([0, 1, 2]).toContain(betting[1].view.mine?.revealed);
    closeAll(clients);
  });
});
