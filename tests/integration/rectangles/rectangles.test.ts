import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GAMES } from "../../../src/shared/games";
import shipped from "../../../src/shared/games/count-rectangles/config.json";
import hostJson from "../../../src/shared/games/count-rectangles/host-config.json";
import { solutions } from "../../../src/shared/games/count-rectangles/rules";
import roomConfig from "../../../src/shared/room-config.json";
import { advanceClock, closeAll, join, scheduledAlarm, tokenFor, type RectanglesMessage, type TestClient } from "../support";

const GAME = "count-rectangles" as const;
const TEAM_SIZE = GAMES[GAME].teamSize;
const ANSWER_MS = shipped.answerSeconds * 1000;
const PROBLEM_MS = shipped.problemSeconds * 1000;
const PAUSE_MS = shipped.pauseSeconds * 1000;
const STAND_MS = hostJson.standSeconds * 1000;
/** How many changes of team a player may make before the room asks them to slow down. */
const CHOICES = roomConfig.messageLimits.choice.burst;
/** The game as the show played it: sixteen players, three teams among them, over once five sides have won. */
const SHOW_PLAYERS = 16;
const SHOW_TEAMS = 3;
const SHOW_WINNERS = 5;

/** Connects to `room`, a room of 네모 세기, and joins as player `player`. */
function open(room: string, player: number, create = false): Promise<TestClient> {
  return join(room, { player, create, game: GAME });
}

/** Opens `room` with players 0..count-1, player 0 making it, and waits until all see each other. */
async function racers(room: string, count: number): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  for (let n = 0; n < count; n++) clients.push(await open(room, n, n === 0));
  await Promise.all(clients.map((client) => client.lobbyOf(count)));
  return clients;
}

/** Starts a game at `clients` and returns each client's first view of it, in client order. */
async function startGame(clients: TestClient[]): Promise<RectanglesMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.rectWhere()));
}

/** How many rectangles make the target of the board in `game`: what a player would have to count. */
function count(game: RectanglesMessage): number {
  return solutions(game.view.board).length;
}

/**
 * Client `n` buzzes and says `said`; resolves with what `watcher` sees once
 * the answer is in. `watcher` reads forward to the buzz first, so what it
 * returns is the first thing sent after it in which nobody is answering.
 */
async function answer(clients: TestClient[], n: number, said: number, watcher = clients[0]): Promise<RectanglesMessage> {
  clients[n].send({ type: "action", action: { type: "buzz" } });
  await watcher.rectWhere((game) => game.view.floor?.player === n);
  clients[n].send({ type: "action", action: { type: "answer", count: said } });
  return watcher.rectWhere((game) => game.view.floor === null);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: a room of 네모 세기", () => {
  it("tells those in it which game it was made for", async () => {
    const clients = await racers("NAAAA", 2);

    const lobby = await join("NAAAA", { player: 2 }).then((late) => {
      clients.push(late);
      return late.lobbyWhere();
    });

    expect(lobby.game).toBe(GAME);
    closeAll(clients);
  });

  it("starts a game for those in the room, each alone, and shows everyone the same board", async () => {
    const clients = await racers("NAAAB", 3);

    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "NAAAB", game: GAME, frozen: false });
      expect(game.view.you).toEqual({ player: n, unit: n });
      expect(game.view).toMatchObject({ phase: "problem", round: 1, winnersNeeded: 2 });
      expect(game.view.board).toEqual(games[0].view.board);
      expect(game.players.map((player) => player.nick)).toEqual(["p0", "p1", "p2"]);
    });
    closeAll(clients);
  });

  it("keeps the answer to itself while the problem is open", async () => {
    const clients = await racers("NAAAC", 2);

    const games = await startGame(clients);
    clients[1].send({ type: "action", action: { type: "buzz" } });
    const answering = await clients[0].rectWhere((game) => game.view.floor !== null);

    expect(answering.view.floor).not.toBeNull();
    // everything either player was sent about the game, not only what the test happened to read
    const sent = clients.flatMap((client) => client.raw.map((text) => JSON.parse(text) as { type: string; view?: RectanglesMessage["view"] }));
    const about = sent.filter((message) => message.type === "game");
    expect(about.length).toBeGreaterThanOrEqual(games.length + 1);
    for (const message of about) {
      expect(message.view?.answer).toBeNull();
      expect(message.view?.solutions).toBeNull();
    }
    closeAll(clients);
  });

  it("gives the first to buzz the answer, and refuses the others until it is given", async () => {
    const clients = await racers("NAAAD", 2);
    await startGame(clients);

    clients[1].send({ type: "action", action: { type: "buzz" } });
    const answering = await clients[0].rectWhere((game) => game.view.floor !== null);
    clients[0].send({ type: "action", action: { type: "buzz" } });
    const buzzRefused = await clients[0].refusal();
    clients[0].send({ type: "action", action: { type: "answer", count: 1 } });
    const answerRefused = await clients[0].refusal();

    expect(answering.view.floor).toEqual({ player: 1, unit: 1 });
    expect(answering.clock.answer).toBeGreaterThan(0);
    expect(answering.clock.answer).toBeLessThanOrEqual(ANSWER_MS);
    expect(buzzRefused.reason).toBe("not-open");
    expect(answerRefused.reason).toBe("not-your-answer");
    closeAll(clients);
  });

  it("counts a right answer, and then shows everyone the answer and the rectangles", async () => {
    const clients = await racers("NAAAE", 3);
    const games = await startGame(clients);
    const right = count(games[0]);

    const after = await answer(clients, 2, right);

    expect(after.view.outcome).toEqual({ kind: "right", player: 2, unit: 2 });
    expect(after.view.units[2]).toMatchObject({ wins: 1, place: 0 });
    expect(after.view.answer).toBe(right);
    expect(after.view.solutions).toHaveLength(right);
    expect(after.view.phase).toBe("pause");
    expect(after.clock.next).toBeGreaterThan(0);
    expect(after.clock.next).toBeLessThanOrEqual(PAUSE_MS);
    closeAll(clients);
  });

  it("shuts a player who answers wrong out of that problem, and leaves it open to the others", async () => {
    const clients = await racers("NAAAF", 3);
    const games = await startGame(clients);
    const right = count(games[0]);

    const after = await answer(clients, 1, right + 1);
    clients[1].send({ type: "action", action: { type: "buzz" } });
    const refused = await clients[1].refusal();
    const solved = await answer(clients, 2, right);

    expect(after.view).toMatchObject({ phase: "problem", wrong: [1], answer: null });
    expect(refused.reason).toBe("shut-out");
    expect(solved.view.outcome).toEqual({ kind: "right", player: 2, unit: 2 });
    closeAll(clients);
  });

  it("closes a problem every player got wrong", async () => {
    const clients = await racers("NAAAG", 2);
    const games = await startGame(clients);
    const right = count(games[0]);

    await answer(clients, 0, right + 1);
    const after = await answer(clients, 1, right + 2);

    expect(after.view.outcome).toEqual({ kind: "all-wrong" });
    expect(after.view.answer).toBe(right);
    closeAll(clients);
  });

  it("puts up the next problem when the pause is over", async () => {
    const stub = env.GameRoom.getByName("NAAAH");
    const clients = await racers("NAAAH", 3);
    const games = await startGame(clients);
    await answer(clients, 0, count(games[0]));

    await scheduledAlarm(stub);
    advanceClock(PAUSE_MS + 1);
    await runDurableObjectAlarm(stub);

    const next = await clients[1].rectWhere((game) => game.view.round === 2);
    expect(next.view).toMatchObject({ phase: "problem", wrong: [], outcome: null, answer: null });
    expect(next.clock.problem).toBe(PROBLEM_MS);
    closeAll(clients);
  });

  it("makes a player who is right twice a winner, and ends the game when half have won", async () => {
    const stub = env.GameRoom.getByName("NAAAJ");
    const clients = await racers("NAAAJ", 2);
    const games = await startGame(clients);

    await answer(clients, 1, count(games[0]));
    await scheduledAlarm(stub);
    advanceClock(PAUSE_MS + 1);
    await runDurableObjectAlarm(stub);
    const second = await clients[0].rectWhere((game) => game.view.round === 2);
    const over = await answer(clients, 1, count(second));

    expect(over.view.phase).toBe("ended");
    expect(over.view.units[1]).toMatchObject({ wins: shipped.winsNeeded, place: 1 });
    expect(over.view.history.at(-1)).toEqual({ type: "ended", round: 2, reason: "half" });
    expect(over.clock).toEqual({ answer: null, problem: null, next: null, stand: null });
    closeAll(clients);
  });

  it("lets the host start another game once one is over, and not before", async () => {
    const stub = env.GameRoom.getByName("NAAAK");
    const clients = await racers("NAAAK", 2);
    const games = await startGame(clients);

    clients[0].send({ type: "start", bots: false });
    const during = await clients[0].refusal();
    await answer(clients, 1, count(games[0]));
    await scheduledAlarm(stub);
    advanceClock(PAUSE_MS + 1);
    await runDurableObjectAlarm(stub);
    const second = await clients[0].rectWhere((game) => game.view.round === 2);
    await answer(clients, 1, count(second));
    clients[0].send({ type: "start", bots: false });
    const again = await clients[1].rectWhere((game) => game.startedAt !== games[0].startedAt);

    expect(during.reason).toBe("already-playing");
    expect(again.view).toMatchObject({ phase: "problem", round: 1 });
    expect(again.view.units.map((unit) => unit.wins)).toEqual([0, 0]);
    closeAll(clients);
  });

  it("counts an answer not given in time as a wrong one", async () => {
    const stub = env.GameRoom.getByName("NAAAL");
    const clients = await racers("NAAAL", 3);
    await startGame(clients);
    clients[1].send({ type: "action", action: { type: "buzz" } });
    await clients[0].rectWhere((game) => game.view.floor !== null);

    advanceClock(ANSWER_MS + 1);
    await runDurableObjectAlarm(stub);

    const after = await clients[0].rectWhere((game) => game.view.floor === null);
    expect(after.view).toMatchObject({ phase: "problem", wrong: [1] });
    expect(after.view.history.at(-1)).toEqual({ type: "silent", round: 1, player: 1 });
    closeAll(clients);
  });

  it("closes a problem nobody solved when its time is up", async () => {
    const stub = env.GameRoom.getByName("NAAAM");
    const clients = await racers("NAAAM", 2);
    const games = await startGame(clients);

    await scheduledAlarm(stub);
    advanceClock(PROBLEM_MS + 1);
    await runDurableObjectAlarm(stub);

    const after = await clients[1].rectWhere((game) => game.view.outcome !== null);
    expect(after.view.outcome).toEqual({ kind: "time" });
    expect(after.view.answer).toBe(count(games[0]));
    expect(after.view.phase).toBe("pause");
    closeAll(clients);
  });

  it("refuses what is not a move of this game, and tells only the one who sent it", async () => {
    const clients = await racers("NAAAN", 2);
    await startGame(clients);

    clients[0].send({ type: "action", action: { type: "rotate", steps: 1 } });
    const refused = await clients[0].refusal();
    clients[0].send({ type: "action", action: { type: "buzz" } });
    const after = await clients[1].rectWhere((game) => game.view.floor !== null);

    expect(refused.reason).toBe("bad-action");
    // the other player heard nothing of the refusal: the next thing they are sent is the buzz
    expect(after.view.history).toEqual([
      { type: "problem", round: 1 },
      { type: "buzz", round: 1, player: 0 },
    ]);
    expect(clients[1].raw.some((text) => text.includes("refused"))).toBe(false);
    closeAll(clients);
  });

  it("refuses a start with nobody to race", async () => {
    const alone = await open("NAAAP", 0, true);
    await alone.lobbyOf(1);

    alone.send({ type: "start", bots: false });

    expect((await alone.refusal()).reason).toBe("too-few");
    alone.close();
  });

  it("refuses a start from a player who is not the host", async () => {
    const clients = await racers("NAAAQ", 2);

    clients[1].send({ type: "start", bots: false });

    expect((await clients[1].refusal()).reason).toBe("not-host");
    closeAll(clients);
  });

  it("never sends a player anyone's token", async () => {
    const clients = await racers("NAAAR", 2);
    const games = await startGame(clients);
    await answer(clients, 0, count(games[0]));

    for (const client of clients) {
      for (const n of [0, 1]) expect(client.raw.join("\n")).not.toContain(tokenFor(n));
    }
    closeAll(clients);
  });
});

describe("GameRoom: teams in 네모 세기", () => {
  it("puts a player in the team they choose, and tells everyone in the room", async () => {
    const clients = await racers("NBAAA", 3);

    clients[1].send({ type: "team", team: 2 });

    const lobbies = await Promise.all(clients.map((client) => client.lobbyWhere((lobby) => lobby.players[1].team === 2)));
    for (const lobby of lobbies) expect(lobby.players.map((player) => player.team)).toEqual([0, 2, 0]);
    closeAll(clients);
  });

  it("lets a player go back to playing alone", async () => {
    const clients = await racers("NBAAB", 2);
    clients[0].send({ type: "team", team: 1 });
    await clients[1].lobbyWhere((lobby) => lobby.players[0].team === 1);

    clients[0].send({ type: "team", team: 0 });

    expect((await clients[1].lobbyWhere((lobby) => lobby.players[0].team === 0)).players[0].team).toBe(0);
    closeAll(clients);
  });

  it("tells someone who comes in later the teams already chosen", async () => {
    const clients = await racers("NBAAC", 2);
    clients[1].send({ type: "team", team: 1 });
    await clients[0].lobbyWhere((lobby) => lobby.players[1].team === 1);

    const late = await join("NBAAC", { player: 2 });

    expect((await late.lobbyWhere()).players.map((player) => player.team)).toEqual([0, 1, 0]);
    closeAll([...clients, late]);
  });

  it("refuses a team the room has no room for", async () => {
    const clients = await racers("NBAAD", 2);
    const teams = Math.floor(Math.min(roomConfig.maxPlayers, GAMES[GAME].maxPlayers) / TEAM_SIZE);

    clients[1].send({ type: "team", team: teams + 1 });

    expect((await clients[1].refusal()).reason).toBe("bad-setting");
    closeAll(clients);
  });

  it("refuses every team in a room of a game everyone plays alone", async () => {
    const maker = await join("NBAAE", { player: 0, create: true });
    await maker.lobbyOf(1);

    maker.send({ type: "team", team: 1 });

    expect((await maker.refusal()).reason).toBe("bad-setting");
    maker.close();
  });

  it("starts with the players of a team that is not full each alone, so one player's choice holds up nobody", async () => {
    const clients = await racers("NBAAF", 3);
    clients[0].send({ type: "team", team: 1 });
    clients[1].send({ type: "team", team: 1 });
    await clients[2].lobbyWhere((lobby) => lobby.players[1].team === 1);

    const games = await startGame(clients);

    expect(games[0].view.units.map((unit) => unit.members)).toEqual([[0], [1], [2]]);
    expect(games[1].view.you).toEqual({ player: 1, unit: 1 });
    closeAll(clients);
  });

  it("plays a full team as one against a player alone: one wrong answer shuts the whole team out", async () => {
    const clients = await racers("NBAAG", TEAM_SIZE + 1);
    for (let n = 0; n < TEAM_SIZE; n++) clients[n].send({ type: "team", team: 1 });
    await clients[TEAM_SIZE].lobbyWhere((lobby) => lobby.players.filter((player) => player.team === 1).length === TEAM_SIZE);

    const games = await startGame(clients);
    const right = count(games[0]);
    const wrong = await answer(clients, 1, right + 1);
    clients[2].send({ type: "action", action: { type: "buzz" } });
    const mate = await clients[2].refusal();
    const solved = await answer(clients, TEAM_SIZE, right);

    expect(games[0].view.units.map((unit) => unit.members)).toEqual([[0, 1, 2], [TEAM_SIZE]]);
    expect(games[2].view.you).toEqual({ player: 2, unit: 0 });
    expect(games[0].view.winnersNeeded).toBe(1);
    expect(wrong.view.wrong).toEqual([0]);
    expect(mate.reason).toBe("shut-out");
    expect(solved.view.units[1].wins).toBe(1);
    closeAll(clients);
  });

  it("counts what any player of a team gets right for the team", async () => {
    const stub = env.GameRoom.getByName("NBAAH");
    const clients = await racers("NBAAH", TEAM_SIZE + 1);
    for (let n = 0; n < TEAM_SIZE; n++) clients[n].send({ type: "team", team: 2 });
    await clients[TEAM_SIZE].lobbyWhere((lobby) => lobby.players.filter((player) => player.team === 2).length === TEAM_SIZE);
    const games = await startGame(clients);

    await answer(clients, 0, count(games[0]));
    await scheduledAlarm(stub);
    advanceClock(PAUSE_MS + 1);
    await runDurableObjectAlarm(stub);
    const second = await clients[0].rectWhere((game) => game.view.round === 2);
    const over = await answer(clients, 2, count(second));

    expect(over.view.units[0]).toMatchObject({ members: [0, 1, 2], wins: 2, place: 1 });
    expect(over.view.phase).toBe("ended");
    closeAll(clients);
  });

  it("keeps a team as it was when the game started, whatever is chosen during it", async () => {
    const clients = await racers("NBAAJ", TEAM_SIZE + 1);
    for (let n = 0; n < TEAM_SIZE; n++) clients[n].send({ type: "team", team: 1 });
    await clients[TEAM_SIZE].lobbyWhere((lobby) => lobby.players.filter((player) => player.team === 1).length === TEAM_SIZE);
    const games = await startGame(clients);

    clients[1].send({ type: "team", team: 0 });
    await clients[0].lobbyWhere((lobby) => lobby.players[1].team === 0);
    const after = await answer(clients, 1, count(games[0]) + 1);

    expect(after.view.units.map((unit) => unit.members)).toEqual([[0, 1, 2], [TEAM_SIZE]]);
    expect(after.view.wrong).toEqual([0]);
    closeAll(clients);
  });

  it("asks a player who keeps changing team to slow down, having made every change before that", async () => {
    const clients = await racers("NBAAK", 2);
    /** The team asked for in change number `n`: a different one each time. */
    const asked = (n: number): number => 1 + (n % 2);

    for (let n = 0; n < CHOICES + 1; n++) clients[1].send({ type: "team", team: asked(n) });
    const refused = await clients[1].refusal();
    // someone who comes in now is told how things stand after all of it
    const late = await join("NBAAK", { player: 2 });
    const lobby = await late.lobbyWhere();

    expect(refused.reason).toBe("too-fast");
    expect(asked(CHOICES)).not.toBe(asked(CHOICES - 1));
    expect(lobby.players[1].team).toBe(asked(CHOICES - 1));
    closeAll([...clients, late]);
  });
});

describe("GameRoom: a full room of 네모 세기", () => {
  it("makes ten sides of the sixteen the game is documented for, three teams and seven alone, and ends at five winners", async () => {
    const clients = await racers("NBS96", SHOW_PLAYERS);
    const teamed = SHOW_TEAMS * TEAM_SIZE;
    for (let n = 0; n < teamed; n++) clients[n].send({ type: "team", team: Math.floor(n / TEAM_SIZE) + 1 });
    await clients[0].lobbyWhere((lobby) => lobby.players.filter((player) => player.team > 0).length === teamed);

    const games = await startGame(clients);

    const sizes = games[0].view.units.map((unit) => unit.members.length).sort((a, b) => a - b);
    expect(games[0].players).toHaveLength(SHOW_PLAYERS);
    expect(sizes).toEqual([...Array.from({ length: SHOW_PLAYERS - teamed }, () => 1), ...Array.from({ length: SHOW_TEAMS }, () => TEAM_SIZE)]);
    expect(games[0].view.winnersNeeded).toBe(SHOW_WINNERS);
    for (const game of games) expect(game.view.board).toEqual(games[0].view.board);
    closeAll(clients);
  });
});

describe("GameRoom: coming and going during 네모 세기", () => {
  it("gives a player who reconnects their place back", async () => {
    const clients = await racers("NCAAA", 3);
    await startGame(clients);
    clients[1].close();
    await clients[0].rectWhere((game) => !game.players[1].connected);

    const back = await open("NCAAA", 1);

    const game = await back.rectWhere();
    expect(game.view.you).toEqual({ player: 1, unit: 1 });
    expect(game.players[1]).toMatchObject({ connected: true, left: false });
    closeAll([clients[0], clients[2], back]);
  });

  it("shows someone who joins during a game the board, and takes no moves from them", async () => {
    const clients = await racers("NCAAB", 2);
    await startGame(clients);

    const watcher = await open("NCAAB", 2);
    const game = await watcher.rectWhere();
    watcher.send({ type: "action", action: { type: "buzz" } });

    expect(game.view.you).toBeNull();
    expect(game.players).toHaveLength(2);
    expect((await watcher.refusal()).reason).toBe("not-seated");
    closeAll([...clients, watcher]);
  });

  it("keeps the game when the room has hibernated", async () => {
    const clients = await racers("NCAAC", 2);
    const games = await startGame(clients);
    await answer(clients, 0, count(games[0]) + 1);

    await evictDurableObject(env.GameRoom.getByName("NCAAC"));
    const late = await open("NCAAC", 2);

    const game = await late.rectWhere();
    expect(game.view.board).toEqual(games[0].view.board);
    expect(game.view).toMatchObject({ round: 1, wrong: [0], phase: "problem" });
    closeAll([...clients, late]);
  });

  it("keeps the place of a player who is away for as long as the game lasts", async () => {
    const stub = env.GameRoom.getByName("NCAAD");
    const clients = await racers("NCAAD", 3);
    await startGame(clients);
    clients[2].close();
    await clients[0].rectWhere((game) => !game.players[2].connected);
    advanceClock(roomConfig.awaySlotSeconds * 1000 * 3);

    await runDurableObjectAlarm(stub);

    const newcomer = await open("NCAAD", 3);
    const lobby = await newcomer.lobbyWhere();
    expect(lobby.players.map((player) => [player.slot, player.connected])).toEqual([
      [0, true],
      [1, true],
      [2, false],
      [3, true],
    ]);
    closeAll([clients[0], clients[1], newcomer]);
  });

  it("stands still while none of its players is connected, and goes on when one is back", async () => {
    const clients = await racers("NCAAE", 2);
    await startGame(clients);
    const watcher = await open("NCAAE", 2);
    await watcher.rectWhere();

    closeAll(clients);
    const standing = await watcher.rectWhere((game) => game.frozen);
    const back = await open("NCAAE", 0);
    const going = await watcher.rectWhere((game) => !game.frozen);

    expect(standing.clock.stand).toBeGreaterThan(0);
    expect(standing.clock.stand).toBeLessThanOrEqual(STAND_MS);
    expect(going.view.phase).toBe("problem");
    expect(going.clock.stand).toBeNull();
    expect(going.players[0].connected).toBe(true);
    closeAll([watcher, back]);
  });

  it("ends a game that has stood too long, and lets those in the room start another", async () => {
    const stub = env.GameRoom.getByName("NCAAF");
    const clients = await racers("NCAAF", 2);
    const games = await startGame(clients);
    const watchers = [await open("NCAAF", 2), await open("NCAAF", 3)];
    await Promise.all(watchers.map((watcher) => watcher.rectWhere()));
    closeAll(clients);
    await watchers[0].rectWhere((game) => game.frozen);

    await scheduledAlarm(stub);
    advanceClock(STAND_MS + 1);
    await runDurableObjectAlarm(stub);
    const over = await watchers[0].rectWhere((game) => game.view.phase === "ended");
    watchers[0].send({ type: "start", bots: false });
    const again = await watchers[1].rectWhere((game) => game.startedAt !== games[0].startedAt);

    expect(over.view.history.at(-1)).toEqual({ type: "ended", round: 1, reason: "abandoned" });
    expect(over.frozen).toBe(false);
    expect(again.view.you).toEqual({ player: 3, unit: 1 });
    expect(again.players.map((player) => player.id)).toEqual([2, 3]);
    closeAll(watchers);
  });

  it("still stands after the room has been put to sleep, and is ended when its time comes", async () => {
    const stub = env.GameRoom.getByName("NCAAK");
    const clients = await racers("NCAAK", 2);
    await startGame(clients);
    const watcher = await open("NCAAK", 2);
    await watcher.rectWhere();
    closeAll(clients);
    await watcher.rectWhere((game) => game.frozen);

    await evictDurableObject(stub);
    advanceClock(STAND_MS + 1);
    await runDurableObjectAlarm(stub);

    const over = await watcher.rectWhere((game) => game.view.phase === "ended");
    expect(over.view.history.at(-1)).toEqual({ type: "ended", round: 1, reason: "abandoned" });
    watcher.close();
  });

  it("ends the game at once when everyone who could still win has left the room", async () => {
    const clients = await racers("NCAAG", 2);
    await startGame(clients);
    const watcher = await open("NCAAG", 2);
    await watcher.rectWhere();

    clients[0].send({ type: "leave" });
    clients[1].send({ type: "leave" });

    const over = await watcher.rectWhere((game) => game.view.phase === "ended");
    expect(over.view.history.at(-1)).toEqual({ type: "ended", round: 1, reason: "abandoned" });
    expect(over.players.map((player) => player.left)).toEqual([true, true]);
    watcher.close();
  });

  it("goes on for those who stay when one player leaves", async () => {
    const clients = await racers("NCAAH", 3);
    const games = await startGame(clients);

    clients[2].send({ type: "leave" });
    const after = await clients[0].rectWhere((game) => game.players[2].left);
    const solved = await answer(clients, 1, count(games[0]));

    expect(after.view.phase).toBe("problem");
    expect(after.frozen).toBe(false);
    expect(solved.view.units[1].wins).toBe(1);
    closeAll([clients[0], clients[1]]);
  });

  it("closes a problem the only player left has answered wrong, without waiting out its time for one who has gone", async () => {
    const clients = await racers("NCAAL", 2);
    const games = await startGame(clients);
    clients[1].send({ type: "leave" });
    await clients[0].rectWhere((game) => game.players[1].left);

    const after = await answer(clients, 0, count(games[0]) + 1);

    expect(after.view.outcome).toEqual({ kind: "all-wrong" });
    expect(after.view.phase).toBe("pause");
    expect(after.view.answer).toBe(count(games[0]));
    clients[0].close();
  });

  it("closes a problem at the moment the last player who could still answer drops", async () => {
    const clients = await racers("NCAAM", 2);
    const games = await startGame(clients);
    const open = await answer(clients, 0, count(games[0]) + 1);

    clients[1].close();

    const after = await clients[0].rectWhere((game) => game.view.outcome !== null);
    expect(open.view).toMatchObject({ phase: "problem", wrong: [0] });
    expect(after.view.outcome).toEqual({ kind: "all-wrong" });
    clients[0].close();
  });

  it("ends a game in which problem after problem runs out with nobody buzzing", async () => {
    const stub = env.GameRoom.getByName("NCAAN");
    const clients = await racers("NCAAN", 2);
    await startGame(clients);

    // the first problem runs out, its pause, then the second problem runs out
    for (const wait of [PROBLEM_MS, PAUSE_MS, PROBLEM_MS]) {
      await scheduledAlarm(stub);
      advanceClock(wait + 1);
      await runDurableObjectAlarm(stub);
    }

    const over = await clients[0].rectWhere((game) => game.view.phase === "ended");
    expect(over.view.history.at(-1)).toEqual({ type: "ended", round: 2, reason: "abandoned" });
    closeAll(clients);
  });

  it("does not take whoever takes a leaver's slot for the leaver", async () => {
    const clients = await racers("NCAAJ", 3);
    await startGame(clients);
    clients[1].send({ type: "leave" });
    await clients[0].rectWhere((game) => game.players[1].left);

    const newcomer = await open("NCAAJ", 5);
    const lobby = await newcomer.lobbyWhere();
    const game = await newcomer.rectWhere();
    newcomer.send({ type: "action", action: { type: "buzz" } });

    expect(lobby.you).toBe(1);
    expect(game.view.you).toBeNull();
    expect((await newcomer.refusal()).reason).toBe("not-seated");
    closeAll([clients[0], clients[2], newcomer]);
  });
});

describe("GameRoom: bots in 네모 세기", () => {
  it("fills the game with bots when asked, where the room offers them, and they play", async () => {
    const stub = env.GameRoom.getByName("NDAAA");
    const alone = await open("NDAAA", 0, true);
    await alone.lobbyOf(1);

    alone.send({ type: "start", bots: true });
    const game = await alone.rectWhere();
    const due = await scheduledAlarm(stub);
    advanceClock(due - Date.now() + 1);
    await runDurableObjectAlarm(stub);
    const after = await alone.rectWhere((seen) => seen.view.history.some((event) => event.type === "buzz"));

    expect(game.players.filter((player) => player.bot)).toHaveLength(3);
    expect(game.view.units).toHaveLength(4);
    expect(game.view.you).toEqual({ player: 0, unit: 0 });
    const buzz = after.view.history.find((event) => event.type === "buzz");
    expect(buzz !== undefined && "player" in buzz && after.players.find((player) => player.id === buzz.player)?.bot).toBe(true);
    alone.close();
  });
});
