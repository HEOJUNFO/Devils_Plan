import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceClock, closeAll, join, scheduledAlarm, type LinkMessage, type TestClient } from "../support";

const GAME = "color-link" as const;
/** The first board is nine squares across: its bottom row from the left corner, six squares of it. */
const BOTTOM = [72, 73, 74, 75, 76, 77];
/** Paths for the two pairs the first board comes with, clear of the bottom row and of each other. */
const X_PATH = [10, 9, 18, 27, 36, 45, 54, 55, 56];
const Y_PATH = [15, 14, 13, 12, 11, 20, 29, 28];

/** Connects to `room`, a room of 컬러 링크, and joins as player `player`. */
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
async function startGame(clients: TestClient[]): Promise<LinkMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.linkWhere()));
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

describe("GameRoom: a room of 컬러 링크", () => {
  it("plays a round for two: the first player places a piece, the other declares the board impossible, and the first proves the connections for the point", async () => {
    const clients = await players("CLKAA");
    const games = await startGame(clients);
    const first = games[0].view.turn as number;
    const other = 1 - first;

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "CLKAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "place", round: 1, you: n, first, due: 1, room: true, pieces: 0, last: null, log: [], winner: null });
      expect(game.view.board).toMatchObject({ width: 9, height: 9 });
      expect(game.rules).toMatchObject({ letters: "ABCDEFGHIJKLMN", fixed: "XY", minPath: 6, goal: 3 });
    });
    act(clients[first], { type: "place", pieces: [{ letter: "A", cell: BOTTOM[0] }] });
    const placed = await Promise.all(clients.map((client) => client.linkWhere((game) => game.view.pieces === 1)));
    act(clients[other], { type: "declare" });
    const declared = await Promise.all(clients.map((client) => client.linkWhere((game) => game.view.phase === "prove")));
    act(clients[first], { type: "prove", partners: [{ letter: "A", cell: BOTTOM[5] }], paths: [BOTTOM, X_PATH, Y_PATH] });
    const proved = await Promise.all(clients.map((client) => client.linkWhere((game) => game.view.phase === "show")));

    for (const game of placed) {
      expect(game.view).toMatchObject({ turn: other, due: 2, last: first });
      expect(game.view.board.cells[BOTTOM[0]]).toBe("A");
    }
    for (const game of declared) expect(game.view).toMatchObject({ declarer: other, prover: first, turn: null });
    for (const game of proved) {
      expect(game.view.scores).toEqual([0, 1].map((player) => ({ player, points: player === first ? 1 : 0 })));
      expect(game.view.log).toHaveLength(1);
      expect(game.view.log[0]).toMatchObject({ round: 1, winner: first, how: "proved", declarer: other, prover: first, pieces: 1 });
      expect(game.view.log[0].paths).toEqual([BOTTOM, X_PATH, Y_PATH]);
      // the partner the proof placed is on the board both are shown
      expect(game.view.board.cells[BOTTOM[5]]).toBe("A");
    }
    closeAll(clients);
  });

  it("goes on by the room's own clock: a turn that runs out is the other player's point, the next board comes, and whoever lost and does not choose goes second", async () => {
    const stub = env.GameRoom.getByName("CLKAB");
    const clients = await players("CLKAB");
    const games = await startGame(clients);
    const first = games[0].view.turn as number;
    const other = 1 - first;

    await runAlarm(stub);
    const late = await Promise.all(clients.map((client) => client.linkWhere((game) => game.view.phase === "show")));
    await runAlarm(stub);
    const choosing = await Promise.all(clients.map((client) => client.linkWhere((game) => game.view.phase === "choose")));
    await runAlarm(stub);
    const second = await Promise.all(clients.map((client) => client.linkWhere((game) => game.view.phase === "place" && game.view.round === 2)));

    for (const game of late) expect(game.view.log[0]).toMatchObject({ winner: other, how: "late", declarer: null, prover: null });
    for (const game of choosing) {
      expect(game.view).toMatchObject({ round: 2, chooser: first, turn: null, pieces: 0 });
      expect(game.view.board).toMatchObject({ width: 11, height: 11 });
    }
    for (const game of second) {
      expect(game.view).toMatchObject({ first: other, turn: other });
      expect(game.view.history.at(-1)).toEqual({ type: "chose", player: first, first: other, forced: true });
    }
    closeAll(clients);
  });

  it("refuses a proof that is none and leaves the prover the rest of the time, and gives the declarer the point when the proof is given up", async () => {
    const clients = await players("CLKAC");
    const games = await startGame(clients);
    const first = games[0].view.turn as number;
    const other = 1 - first;

    act(clients[first], { type: "place", pieces: [{ letter: "A", cell: BOTTOM[0] }] });
    await Promise.all(clients.map((client) => client.linkWhere((game) => game.view.pieces === 1)));
    act(clients[other], { type: "declare" });
    await Promise.all(clients.map((client) => client.linkWhere((game) => game.view.phase === "prove")));
    act(clients[first], { type: "prove", partners: [{ letter: "A", cell: BOTTOM[5] }], paths: [BOTTOM] });
    const refused = await clients[first].nextOf("refused");
    act(clients[first], { type: "forfeit" });
    const given = await Promise.all(clients.map((client) => client.linkWhere((game) => game.view.phase === "show")));

    expect(refused).toMatchObject({ reason: "pair-missing" });
    for (const game of given) expect(game.view.log[0]).toMatchObject({ winner: other, how: "forfeit", paths: [] });
    closeAll(clients);
  });
});
