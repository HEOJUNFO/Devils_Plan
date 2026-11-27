import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceClock, closeAll, join, scheduledAlarm, type JanggiMessage, type TestClient } from "../support";

const GAME = "card-janggi" as const;
const ALL = ["rat", "monkey", "horse", "giraffe", "elephant"];
const FOUR = ["rat", "giraffe", "horse", "monkey"];
/** The board is six squares across: a4 and b4 on the left, f2 and e2 on the right. */
const [A4, B4, F2, E2] = [18, 19, 11, 10];

/** Connects to `room`, a room of 카드 장기, and joins as player `player`. */
function open(room: string, player: number, create = false): Promise<TestClient> {
  return join(room, { player, create, game: GAME });
}

/** Opens `room` with its two players, player 0 making it, and waits until they see each other. */
async function players(room: string): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  for (let n = 0; n < 2; n++) clients.push(await open(room, n, n === 0));
  await Promise.all(clients.map((client) => client.lobbyOf(2)));
  return clients;
}

/** Starts a game at `clients` and returns each client's first view of it, in client order. */
async function startGame(clients: TestClient[]): Promise<JanggiMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.janggiWhere()));
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

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: a room of 카드 장기", () => {
  it("plays the opening for two: both lay their cards unseen, the first are turned over together, and each moves a piece by the card face up", async () => {
    const clients = await players("CJGAA");
    const games = await startGame(clients);
    const first = games[0].view.first;
    const other = 1 - first;

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "CJGAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "arrange", round: 1, you: n, first, sides: [first, other], turn: null, moves: 0, last: null, log: [], winner: null, mine: [] });
      expect(game.view.board).toEqual({ width: 6, height: 5, cells: "......a....bAa..bBa....b......" });
      expect(game.view.homes).toEqual([12, 17]);
      expect(game.rules).toMatchObject({ secondCards: 4, rounds: 3, goal: 2, arrangeSeconds: 90, moveSeconds: 45 });
      expect(Object.keys(game.rules.cards).sort()).toEqual([...ALL].sort());
    });

    act(clients[first], { type: "arrange", order: ALL });
    const one = await Promise.all(clients.map((client) => client.janggiWhere((game) => game.view.hands.some((hand) => hand.player === first && hand.ready))));
    act(clients[other], { type: "arrange", order: FOUR });
    const both = await Promise.all(clients.map((client) => client.janggiWhere((game) => game.view.phase === "move")));
    act(clients[first], { type: "move", from: A4, to: B4 });
    const moved = await Promise.all(clients.map((client) => client.janggiWhere((game) => game.view.moves === 1)));
    act(clients[first], { type: "move", from: B4, to: B4 + 1 });
    const refused = await clients[first].nextOf("refused");
    act(clients[other], { type: "move", from: F2, to: E2 });
    const answered = await Promise.all(clients.map((client) => client.janggiWhere((game) => game.view.moves === 2)));

    // the first player's cards are laid, and nothing of them is in what the other is sent
    expect(one[first].view.mine).toEqual(ALL);
    expect(one[other].view.mine).toEqual([]);
    expect(one[other].view.hands.find((hand) => hand.player === first)).toEqual({ player: first, used: [], current: null, hidden: 5, ready: true, due: 5 });
    expect(JSON.stringify(one[other].view)).not.toContain("elephant");
    for (const game of both) {
      expect(game.view).toMatchObject({ turn: first, mover: first });
      expect(game.view.hands.find((hand) => hand.player === first)).toMatchObject({ used: [], current: "rat", hidden: 4 });
      expect(game.view.hands.find((hand) => hand.player === other)).toMatchObject({ used: [], current: "rat", hidden: 3 });
    }
    // the order of the rest goes to its player alone
    expect(both[other].view.mine).toEqual(FOUR);
    expect(JSON.stringify({ ...both[other].view, mine: null })).not.toContain("elephant");
    for (const game of moved) {
      expect(game.view).toMatchObject({ turn: other, last: { from: A4, to: B4, player: first } });
      expect(game.view.board.cells[B4]).toBe("a");
      expect(game.view.hands.find((hand) => hand.player === first)).toMatchObject({ used: ["rat"], current: "monkey", hidden: 3 });
    }
    expect(refused).toMatchObject({ reason: "not-your-turn" });
    for (const game of answered) {
      expect(game.view).toMatchObject({ turn: first, last: { from: F2, to: E2, player: other } });
      expect(game.view.board.cells[E2]).toBe("b");
      expect(game.view.hands.find((hand) => hand.player === other)).toMatchObject({ used: ["rat"], current: "giraffe", hidden: 2 });
    }
    closeAll(clients);
  });

  it("goes on by the room's own clock: cards not laid are laid by chance, a move not made is the opponent's to make, and then the room's", async () => {
    const stub = env.GameRoom.getByName("CJGAB");
    const clients = await players("CJGAB");
    const games = await startGame(clients);
    const first = games[0].view.first;
    const other = 1 - first;

    await runAlarm(stub);
    const laid = await Promise.all(clients.map((client) => client.janggiWhere((game) => game.view.phase === "move")));
    await runAlarm(stub);
    const late = await Promise.all(clients.map((client) => client.janggiWhere((game) => game.view.phase === "proxy")));
    await runAlarm(stub);
    const made = await Promise.all(clients.map((client) => client.janggiWhere((game) => game.view.moves === 1)));

    laid.forEach((game, n) => {
      expect(game.view).toMatchObject({ turn: first, mover: first });
      expect(game.view.history.filter((event) => event.type === "arranged")).toEqual(expect.arrayContaining([0, 1].map((player) => ({ type: "arranged", player, forced: true }))));
      expect(game.view.mine).toHaveLength(n === first ? 5 : 4);
    });
    for (const game of late) expect(game.view).toMatchObject({ turn: first, mover: other });
    for (const game of made) {
      expect(game.view).toMatchObject({ phase: "move", turn: other });
      expect(game.view.history.at(-1)).toMatchObject({ type: "moved", player: first, by: null });
    }
    closeAll(clients);
  });

  it("gives a round that is resigned to the other player, and has the other move first in the next, on the same sides", async () => {
    const stub = env.GameRoom.getByName("CJGAC");
    const clients = await players("CJGAC");
    const games = await startGame(clients);
    const first = games[0].view.first;
    const other = 1 - first;

    act(clients[first], { type: "resign" });
    const refused = await clients[first].nextOf("refused");
    act(clients[first], { type: "arrange", order: ALL });
    await Promise.all(clients.map((client) => client.janggiWhere((game) => game.view.hands.some((hand) => hand.player === first && hand.ready))));
    act(clients[other], { type: "arrange", order: FOUR });
    await Promise.all(clients.map((client) => client.janggiWhere((game) => game.view.phase === "move")));
    act(clients[first], { type: "resign" });
    const given = await Promise.all(clients.map((client) => client.janggiWhere((game) => game.view.phase === "show")));
    await runAlarm(stub);
    const next = await Promise.all(clients.map((client) => client.janggiWhere((game) => game.view.round === 2)));

    // a round is not resigned while the cards are being laid
    expect(refused).toMatchObject({ reason: "not-moving" });
    for (const game of given) {
      expect(game.view.log).toEqual([{ round: 1, winner: other, how: "resign", moves: 0 }]);
      expect(game.view.wins).toEqual([0, 1].map((player) => ({ player, wins: player === other ? 1 : 0 })));
    }
    for (const game of next) {
      expect(game.view).toMatchObject({ phase: "arrange", first: other, sides: [first, other], moves: 0 });
      expect(game.view.board.cells).toBe("......a....bAa..bBa....b......");
      expect(game.view.hands.map((hand) => [hand.player, hand.due]).sort()).toEqual([[first, 4], [other, 5]].sort());
    }
    closeAll(clients);
  });
});
