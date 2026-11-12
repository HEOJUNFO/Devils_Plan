import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import hostConfig from "../../../src/shared/game/host-config.json";
import rulesConfig from "../../../src/shared/game/rules-config.json";
import tableSizes from "../../../src/shared/game/table-sizes.json";
import type { ClientMessage } from "../../../src/shared/protocol";
import roomConfig from "../../../src/shared/room-config.json";
import {
  advanceClock,
  closeAll,
  join,
  roomOf as table,
  scheduledAlarm,
  tokenFor,
  type HeardRecord,
  type RouletteMessage,
  type TestClient,
} from "../support";

type GameMessage = RouletteMessage;

/** The smallest and the largest table offered. */
const SMALLEST = Math.min(...Object.keys(tableSizes).map(Number));
const LARGEST = Math.max(...Object.keys(tableSizes).map(Number));
const AWAY_MS = roomConfig.awayTurnSeconds * 1000;
const AWAY_SLOT_MS = roomConfig.awaySlotSeconds * 1000;
/** How long a table none of whose players is connected goes on, with someone else in the room, before the room plays it out. */
const STAND_MS = hostConfig.standSeconds * 1000;
const STALE_MS = roomConfig.staleConnectionSeconds * 1000;

/** Connects to `room` and joins as player `player`. */
function open(room: string, player: number, create = false): Promise<TestClient> {
  return join(room, { player, create });
}

/** Starts a game at `clients` and returns each client's first view of it, in client order. */
async function startGame(clients: TestClient[]): Promise<GameMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.gameWhere()));
}

/** The index in `games` of the client whose seat is to move. */
function mover(games: GameMessage[]): number {
  return games.findIndex((game) => game.view.seat === game.view.current);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: playing a game", () => {
  it("starts a game for the players in the room and gives each their own seat", async () => {
    const clients = await table("GAAAA", SMALLEST);

    const games = await startGame(clients);

    const seats = games.map((game) => game.view.seat).sort();
    expect(seats).toEqual(Array.from({ length: SMALLEST }, (_, seat) => seat));
    for (const game of games) {
      expect(game).toMatchObject({ room: "GAAAA", turnEndsIn: null });
      expect(game.view).toMatchObject({ phase: "turn", credits: rulesConfig.startCredits });
      expect(game.players).toHaveLength(SMALLEST);
    }
    closeAll(clients);
  });

  it("names each seat after the player who sits in it", async () => {
    const clients = await table("GAAAB", SMALLEST);

    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game.players[game.view.seat!]).toEqual({ nick: `p${n}`, bot: false, connected: true, left: false });
    });
    closeAll(clients);
  });

  it("refuses a start from a player who is not the host", async () => {
    const clients = await table("GAAAC", SMALLEST);

    clients[1].send({ type: "start", bots: false });

    expect(await clients[1].refusal()).toEqual({ type: "refused", reason: "not-host" });
    closeAll(clients);
  });

  it("refuses a start with too few players for any table", async () => {
    const clients = await table("GAAAD", SMALLEST - 1);

    clients[0].send({ type: "start", bots: false });

    expect(await clients[0].refusal()).toEqual({ type: "refused", reason: "bad-player-count" });
    closeAll(clients);
  });

  it("refuses a second start while the game is being played", async () => {
    const clients = await table("GAAAE", SMALLEST);
    await startGame(clients);

    clients[0].send({ type: "start", bots: false });

    expect(await clients[0].refusal()).toEqual({ type: "refused", reason: "already-playing" });
    closeAll(clients);
  });

  it("makes a move and shows it to everyone, each from their own seat", async () => {
    const clients = await table("GAAAF", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);

    clients[acting].send({ type: "action", action: { type: "private", pair: 0 } });

    const after = await Promise.all(clients.map((client) => client.gameWhere((game) => game.view.history.length === 1)));
    after.forEach((game, n) => {
      // only the player who looked is told that it was a look, and what was there: the rest hear of a hidden action
      if (n === acting) expect(game.view.history[0]).toMatchObject({ type: "private", pair: 0 });
      else expect(game.view.history[0]).toEqual({ type: "hidden", seat: games[acting].view.seat, ended: false });
    });
    expect(after[acting].view.credits).toBe(rulesConfig.startCredits - rulesConfig.costPrivate);
    closeAll(clients);
  });

  it("sends the others nothing while a player who has earned the swap makes it, and then one hidden action", async () => {
    const clients = await table("GAAA6", SMALLEST);
    let games = await startGame(clients);
    // each in turn puts one credit towards the swap, until the table is one short of it
    for (let n = 0; n < rulesConfig.tamperNeed - 1; n++) {
      clients[mover(games)].send({ type: "action", action: { type: "tamper", amount: 1 } });
      games = await Promise.all(clients.map((client) => client.gameWhere((game) => game.view.history.length === n + 1)));
    }
    const acting = mover(games);

    clients[acting].send({ type: "action", action: { type: "tamper", amount: 1 } });
    const earned = await clients[acting].gameWhere((game) => game.view.phase === "swap");
    const meanwhile = await Promise.all(clients.filter((_, n) => n !== acting).map((client) => client.sentSoFar()));
    clients[acting].send({ type: "action", action: { type: "swap", pair: 0 } });
    const after = await Promise.all(clients.map((client) => client.gameWhere((game) => game.view.current !== earned.view.seat)));

    expect(earned.view.history.at(-1)).toMatchObject({ type: "tamper", earned: true });
    for (const sent of meanwhile) expect(sent).toEqual([]);
    after.forEach((game, n) => {
      // to the one who made it: the credits, then the swap. To everyone else: one more hidden action.
      expect(game.view.history.at(-1)?.type).toBe(n === acting ? "swap" : "hidden");
      expect(game.view.history).toHaveLength(rulesConfig.tamperNeed + (n === acting ? 1 : 0));
    });
    closeAll(clients);
  });

  it("tells a player whose move was refused why, and changes nothing", async () => {
    const clients = await table("GAAAG", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);
    const waiting = (acting + 1) % SMALLEST;

    clients[waiting].send({ type: "action", action: { type: "tamper", amount: 1 } });

    expect(await clients[waiting].refusal()).toEqual({ type: "refused", reason: "not-your-turn" });
    clients[acting].send({ type: "action", action: { type: "tamper", amount: 1 } });
    expect((await clients[waiting].gameWhere()).view.history).toHaveLength(1);
    closeAll(clients);
  });

  it("refuses a move that is not one of the game's moves, and changes nothing", async () => {
    const clients = await table("GAAAH", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);

    clients[acting].send({ type: "action", action: { type: "fire" } });
    const refusedFire = await clients[acting].refusal();
    clients[acting].send({ type: "action", action: { type: "tamper", amount: 1.5 } });
    const refusedFraction = await clients[acting].refusal();
    clients[acting].send({ type: "action", action: { type: "tamper", amount: 1 } });

    expect(refusedFire).toEqual({ type: "refused", reason: "bad-action" });
    expect(refusedFraction).toEqual({ type: "refused", reason: "bad-action" });
    // the next thing the room sends about the game is the result of the real move
    expect((await clients[acting].gameWhere()).view.history).toHaveLength(1);
    closeAll(clients);
  });

  it("takes from a move only what the move is made of", async () => {
    const clients = await table("GAAA2", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);
    const before = games[acting].view.credits!;

    // a page that is not ours adds a seat, a number of credits and the swap itself to its move
    clients[acting].send({ type: "action", action: { type: "tamper", amount: 1, seat: 0, credits: 99, earned: true } });

    const after = await clients[acting].gameWhere((game) => game.view.history.length === 1);
    expect(after.view.history[0]).toMatchObject({ type: "tamper", seat: games[acting].view.seat, amount: 1, earned: false });
    expect(after.view.credits).toBe(before - 1);
    closeAll(clients);
  });

  it("gives a player who reconnects their seat and what they knew back", async () => {
    const clients = await table("GAAAJ", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);
    clients[acting].send({ type: "action", action: { type: "private", pair: 0 } });
    const known = (await clients[acting].gameWhere((game) => game.view.history.length === 1)).view.chambers;
    clients[acting].close();

    const back = await open("GAAAJ", acting);

    const game = await back.gameWhere();
    expect(game.view.seat).toBe(games[acting].view.seat);
    expect(game.view.chambers).toEqual(known);
    closeAll(clients.filter((_, n) => n !== acting));
    back.close();
  });

  it("shows someone who joins during a game the table as a spectator", async () => {
    const clients = await table("GAAAK", SMALLEST);
    await startGame(clients);

    const late = await open("GAAAK", SMALLEST);

    const game = await late.gameWhere();
    expect(game.view).toMatchObject({ seat: null, credits: null });
    expect(game.view.chambers.every((known) => known === null)).toBe(true);
    closeAll([...clients, late]);
  });

  it("keeps the game when the room has hibernated", async () => {
    const clients = await table("GAAAL", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);
    clients[acting].send({ type: "action", action: { type: "tamper", amount: 2 } });
    await clients[acting].gameWhere((game) => game.view.history.length === 1);

    await evictDurableObject(env.GameRoom.getByName("GAAAL"));
    const late = await open("GAAAL", SMALLEST);

    const game = await late.gameWhere();
    expect(game.view.history).toHaveLength(1);
    expect(game.view.current).not.toBe(games[acting].view.seat);
    closeAll([...clients, late]);
  });

  it("starts a clock for a player who drops, and lets their turn go by when it runs out", async () => {
    const stub = env.GameRoom.getByName("GAAAM");
    const clients = await table("GAAAM", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);
    const watcher = clients[(acting + 1) % SMALLEST];

    clients[acting].close();
    const waiting = await watcher.gameWhere((game) => game.turnEndsIn !== null);
    await scheduledAlarm(stub);
    advanceClock(AWAY_MS + 1);
    await runDurableObjectAlarm(stub);

    const after = await watcher.gameWhere((game) => game.view.history.length === 1);
    expect(waiting.turnEndsIn).toBeGreaterThan(0);
    expect(waiting.turnEndsIn).toBeLessThanOrEqual(AWAY_MS);
    expect(waiting.players[games[acting].view.seat!]).toMatchObject({ connected: false, left: false });
    // the table sees whose time ran out, not what it cost them
    expect(after.view.history[0]).toEqual({ type: "timeout", seat: games[acting].view.seat, cost: null, ended: false });
    closeAll(clients.filter((_, n) => n !== acting));
  });

  it("plays the game out for someone waiting in the room once all its players have been away long enough", async () => {
    const stub = env.GameRoom.getByName("GAAA3");
    const clients = await table("GAAA3", SMALLEST);
    await startGame(clients);
    const late = await open("GAAA3", SMALLEST);
    await late.gameWhere();

    closeAll(clients);
    await late.gameWhere((game) => game.players.every((player) => !player.connected));
    const since = Date.now();
    // the room makes the awaited moves one at a time, each when its alarm is due, until the table has been deserted long enough
    let alarms = 0;
    for (; alarms < 12 && Date.now() - since <= STAND_MS; alarms++) {
      const due = await scheduledAlarm(stub);
      advanceClock(Math.max(0, due - Date.now()) + 1);
      await runDurableObjectAlarm(stub);
    }
    const ended = await late.gameWhere((game) => game.view.phase === "ended");

    // every move was the room's, and the last alarm made all that were left: a game has far more moves than there were alarms
    expect(ended.view.history.length).toBeGreaterThan(alarms * 2);
    expect(Date.now() - since).toBeLessThan(STAND_MS + AWAY_MS);
    expect(ended.turnEndsIn).toBeNull();
    late.close();
  });

  it("plays on at once for a player who leaves the room", async () => {
    const clients = await table("GAAAN", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);
    const watcher = clients[(acting + 1) % SMALLEST];

    clients[acting].send({ type: "leave" });

    const after = await watcher.gameWhere((game) => game.view.history.length === 1);
    expect(after.view.history[0]).toMatchObject({ type: "timeout", seat: games[acting].view.seat });
    expect(after.players[games[acting].view.seat!]).toMatchObject({ connected: false, left: true });
    closeAll(clients.filter((_, n) => n !== acting));
  });

  it("does not give a leaver's seat to whoever takes their slot", async () => {
    const clients = await table("GAAAP", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);
    clients[acting].send({ type: "leave" });
    await clients[(acting + 1) % SMALLEST].gameWhere((game) => game.view.history.length === 1);

    const newcomer = await open("GAAAP", SMALLEST + 1);

    expect((await newcomer.gameWhere()).view.seat).toBeNull();
    closeAll([...clients.filter((_, n) => n !== acting), newcomer]);
  });

  it("fills the table with bots when asked, where the room offers them", async () => {
    const alone = await open("GAAAQ", 0, true);
    await alone.lobbyOf(1);

    alone.send({ type: "start", bots: true });

    const game = await alone.gameWhere();
    expect(game.players).toHaveLength(LARGEST);
    expect(game.players.filter((player) => player.bot)).toHaveLength(LARGEST - 1);
    // the bots have played up to the person's move
    expect(game.view.current).toBe(game.view.seat);
    alone.close();
  });

  it("keeps the slot of a seated player who is away, for as long as the game lasts", async () => {
    const stub = env.GameRoom.getByName("GAAAS");
    const clients = await table("GAAAS", SMALLEST);
    const games = await startGame(clients);
    const resting = (mover(games) + 1) % SMALLEST;
    const watcher = clients[mover(games)];
    clients[resting].close();
    await watcher.gameWhere((game) => !game.players[games[resting].view.seat!].connected);
    advanceClock(AWAY_SLOT_MS * 10);

    await runDurableObjectAlarm(stub);

    const newcomer = await open("GAAAS", SMALLEST + 1);
    const lobby = await newcomer.next();
    expect(lobby.type === "lobby" ? lobby.players : []).toHaveLength(SMALLEST + 1);
    expect(lobby.type === "lobby" ? lobby.players[resting] : null).toMatchObject({ slot: resting, connected: false });
    closeAll([...clients.filter((_, n) => n !== resting), newcomer]);
  });

  it("frees the slot of a spectator who drops during a game once their time is up", async () => {
    const stub = env.GameRoom.getByName("GAAAT");
    const clients = await table("GAAAT", SMALLEST);
    await startGame(clients);
    const spectator = await open("GAAAT", SMALLEST + 1);
    await spectator.gameWhere();
    await clients[0].lobbyOf(SMALLEST + 1);
    spectator.close();
    await scheduledAlarm(stub);
    advanceClock(AWAY_SLOT_MS + 1);

    await runDurableObjectAlarm(stub);

    await clients[0].lobbyOf(SMALLEST);
    closeAll(clients);
  });

  it("frees the slot of a seated player who is still away when the game ends", async () => {
    const stub = env.GameRoom.getByName("GAAAU");
    const a = await open("GAAAU", 0, true);
    const b = await open("GAAAU", 1);
    await Promise.all([a.lobbyOf(2), b.lobbyOf(2)]);
    a.send({ type: "start", bots: true });
    let game = await a.gameWhere();
    await b.gameWhere();
    b.close();
    game = await a.gameWhere((seen) => seen.players.some((player) => !player.bot && !player.connected));
    // The one who is here spends all they have and passes from then on, the
    // turns of the one who is away go by each time their clock runs out, and
    // the bots play on by themselves, until enough seats are out for the game
    // to end. By then the clock is far past the time an idle slot is given away.
    for (let step = 0; game.view.phase !== "ended"; step++) {
      expect(step).toBeLessThan(200);
      const seen = game.view.history.length;
      if (game.view.current === game.view.seat) {
        a.send({ type: "action", action: game.view.credits === 0 ? { type: "pass" } : { type: "rotate", steps: 2 } });
      } else {
        await scheduledAlarm(stub);
        advanceClock(AWAY_MS + 1);
        // This test has now and then waited below without an end (2026-11-11:
        // twice on a build machine, twice here, then not once in 400 runs; not
        // explained). If the alarm is gone by now, say so instead of waiting.
        expect(await runDurableObjectAlarm(stub), `an alarm to run at step ${step}`).toBe(true);
      }
      game = await a.gameWhere((next) => next.view.history.length > seen);
    }
    const away = game.players.find((player) => player.nick === "p1");

    // the end of the game sets this alarm itself: nothing holds the slot any more
    await scheduledAlarm(stub);
    expect(await runDurableObjectAlarm(stub), "the alarm the end of the game sets").toBe(true);

    // kept while the game lasted, given up once it was over
    expect(away).toMatchObject({ connected: false, left: false });
    await a.lobbyOf(1);
    a.close();
  }, 20_000);

  it("runs no clock for a player who is here, unless the room has set one", async () => {
    const clients = await table("GAAAV", SMALLEST);

    const games = await startGame(clients);

    for (const game of games) expect(game).toMatchObject({ turnEndsIn: null, rules: { turnSeconds: 0 } });
    closeAll(clients);
  });

  it("gives every move the length of turn the host has set, and lets the turn go by, at its price, when it runs out", async () => {
    const stub = env.GameRoom.getByName("GAAAW");
    const clients = await table("GAAAW", SMALLEST);
    const seconds = Math.min(...roomConfig.turnSecondsChoices.filter((choice) => choice > 0));
    clients[0].send({ type: "clock", seconds });
    const games = await startGame(clients);
    const acting = mover(games);
    await scheduledAlarm(stub);
    advanceClock(seconds * 1000 + 1);

    await runDurableObjectAlarm(stub);

    const after = await clients[acting].gameWhere((game) => game.view.history.length === 1);
    expect(games[acting].rules.turnSeconds).toBe(seconds);
    expect(games[acting].turnEndsIn).toBeGreaterThan(0);
    expect(games[acting].turnEndsIn).toBeLessThanOrEqual(seconds * 1000);
    expect(after.view.history[0]).toMatchObject({ type: "timeout", seat: games[acting].view.seat, cost: rulesConfig.costTimeout });
    expect(after.view.credits).toBe(rulesConfig.startCredits - rulesConfig.costTimeout);
    expect(after.players[games[acting].view.seat!]).toMatchObject({ connected: true, left: false });
    // the next player's own time starts when the move is made
    expect(after.turnEndsIn).toBeGreaterThan(seconds * 1000 - 1000);
    closeAll(clients);
  });

  it("keeps the length of turn a game started with when the host changes it during the game", async () => {
    const clients = await table("GAAAX", SMALLEST);
    const [short, long] = roomConfig.turnSecondsChoices.filter((choice) => choice > 0);
    clients[0].send({ type: "clock", seconds: short });
    const games = await startGame(clients);
    const acting = mover(games);

    clients[0].send({ type: "clock", seconds: long });
    clients[acting].send({ type: "action", action: { type: "tamper", amount: 1 } });

    const after = await clients[acting].gameWhere((game) => game.view.history.length === 1);
    expect(after.rules.turnSeconds).toBe(short);
    closeAll(clients);
  });

  it("starts the clock of a player who went silent on their turn, once another page pokes the room", async () => {
    const stub = env.GameRoom.getByName("GAAAY");
    const clients = await table("GAAAY", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);
    const watcher = clients[(acting + 1) % SMALLEST];
    // every page has been pinging; the one whose turn it is stopped a while ago (client n holds slot n)
    const pings: Record<number, number> = {};
    for (let n = 0; n < SMALLEST; n++) pings[n] = n === acting ? Date.now() - STALE_MS - 1 : Date.now() + AWAY_MS * 2;
    await runInDurableObject(stub, (room) => {
      (room as unknown as HeardRecord).lastHeardAt = (connection) => {
        const state = connection.state as { kind?: string; slot?: number } | null;
        return state?.kind === "player" && state.slot !== undefined ? (pings[state.slot] ?? null) : null;
      };
    });

    watcher.send({ type: "poke" });

    const waiting = await watcher.gameWhere((game) => !game.players[games[acting].view.seat!].connected);
    expect(waiting.turnEndsIn).toBeGreaterThan(0);
    expect(waiting.turnEndsIn).toBeLessThanOrEqual(AWAY_MS);
    await scheduledAlarm(stub);
    advanceClock(AWAY_MS + 1);
    await runDurableObjectAlarm(stub);
    const after = await watcher.gameWhere((game) => game.view.history.length === 1);
    expect(after.view.history[0]).toMatchObject({ type: "timeout", seat: games[acting].view.seat });
    closeAll(clients.filter((_, n) => n !== acting));
  });

  it("tells everyone it is there when the room is poked, so the others need not ask, and sends nobody the game again", async () => {
    const clients = await table("GAAAZ", SMALLEST);
    await startGame(clients);

    clients[0].send({ type: "poke" });

    const sent = await Promise.all(clients.map((client) => client.sentSoFar()));
    // nothing in the game has changed: the word that the room is there is all anyone is sent
    for (const messages of sent) expect(messages).toEqual([{ type: "alive" }]);
    closeAll(clients);
  });

  it("answers whoever made a move with the game, also when the move changed nothing they see, and sends the others nothing", async () => {
    const stub = env.GameRoom.getByName("GAAA4");
    const clients = await table("GAAA4", SMALLEST);
    const games = await startGame(clients);
    // No game of ours takes a move that changes nothing, so the room is given one that does: the page that
    // asked waits for the answer whatever came of it.
    await runInDurableObject(stub, (room) => {
      const hosted = room as unknown as { host(): object };
      const real = hosted.host.bind(room);
      hosted.host = () => ({ ...real(), act: (session: unknown) => ({ ok: true, session }) });
    });
    const asker = mover(games);

    clients[asker].send({ type: "action", action: { type: "tamper", amount: 1 } });

    const answered = await clients[asker].gameWhere();
    const others = await Promise.all(clients.filter((_, n) => n !== asker).map((client) => client.sentSoFar()));
    expect(JSON.stringify(answered.view)).toBe(JSON.stringify(games[asker].view));
    for (const sent of others) expect(sent).toEqual([]);
    closeAll(clients);
  });

  it("sends a player only what changed for them: a move that shows on every screen goes to everyone, once", async () => {
    const clients = await table("GAAA5", SMALLEST);
    const games = await startGame(clients);

    clients[mover(games)].send({ type: "action", action: { type: "tamper", amount: 1 } });

    const sent = await Promise.all(clients.map((client) => client.sentSoFar()));
    for (const messages of sent) {
      expect(messages.map((message) => message.type)).toEqual(["game"]);
    }
    closeAll(clients);
  });

  it("never sends a player anyone's token", async () => {
    const clients = await table("GAAAR", SMALLEST);
    const games = await startGame(clients);
    clients[mover(games)].send({ type: "action", action: { type: "tamper", amount: 1 } });
    await Promise.all(clients.map((client) => client.gameWhere((game) => game.view.history.length === 1)));

    const sent = clients.flatMap((client) => client.raw).join("\n");

    for (let n = 0; n < SMALLEST; n++) expect(sent).not.toContain(tokenFor(n));
    closeAll(clients);
  });
});
