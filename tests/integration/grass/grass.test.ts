import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import shipped from "../../../src/shared/games/lay-the-grass/config.json";
import hostJson from "../../../src/shared/games/lay-the-grass/host-config.json";
import { parkSize, waysToLay, type ChoiceNo, type Option } from "../../../src/shared/games/lay-the-grass/rules";
import { advanceClock, closeAll, join, scheduledAlarm, tokenFor, type GrassMessage, type TestClient } from "../support";

const GAME = "lay-the-grass" as const;
const CHOOSE_MS = shipped.chooseSeconds * 1000;
const PICK_MS = shipped.pickSeconds * 1000;
const AWAY_MS = hostJson.awaySeconds * 1000;
const STAND_MS = hostJson.standSeconds * 1000;
/** A tile every test player picks unless the test is about the pick: seven cells, as a park is built of. */
const TILE = 9;

/** Connects to `room`, a room of 잔디 깔기, and joins as player `player`. */
function open(room: string, player: number, create = false): Promise<TestClient> {
  return join(room, { player, create, game: GAME });
}

/** Opens `room` with players 0..count-1, player 0 making it, and waits until all see each other. */
async function gardeners(room: string, count: number): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  for (let n = 0; n < count; n++) clients.push(await open(room, n, n === 0));
  await Promise.all(clients.map((client) => client.lobbyOf(count)));
  return clients;
}

/** Starts a game at `clients` and returns each client's first view of it, in client order: choice 5 is up. */
async function startGame(clients: TestClient[]): Promise<GrassMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.grassWhere()));
}

/**
 * Everyone makes choice `which`, which is up, each taking `option`; resolves
 * with what `watcher` sees once it is settled. The caller has seen the choice
 * come up: a choice sent before it is up would be refused.
 */
async function allChoose(clients: TestClient[], which: ChoiceNo, option: Option, watcher = clients[0]): Promise<GrassMessage> {
  for (const client of clients) client.send({ type: "action", action: { type: "choose", option } });
  return watcher.grassWhere((game) => game.view.choices.filter((chosen) => chosen.which === which).length === clients.length);
}

/** A game started and brought past choice 5, everyone taking 정보 so that nobody has points: the picking is on. */
async function toPicking(clients: TestClient[], watcher = clients[0]): Promise<GrassMessage> {
  clients[0].send({ type: "start", bots: false });
  await watcher.grassWhere((game) => game.view.choosing?.which === 5);
  return allChoose(clients, 5, 2, watcher);
}

/** Everyone picks `TILE` in turn; resolves with what `watcher` sees once the picking is over. */
async function allPick(clients: TestClient[], first: GrassMessage, watcher = clients[0]): Promise<GrassMessage> {
  let game = first;
  while (game.view.phase === "pick") {
    const picked = game.view.picks.length;
    clients[game.view.turn!].send({ type: "action", action: { type: "pick", tile: TILE } });
    game = await watcher.grassWhere((seen) => seen.view.picks.length > picked || seen.view.phase !== "pick");
  }
  return game;
}

/** Lets the room's clock run until `watcher` sees a game that satisfies `match`: each alarm is run when it is due. */
async function runClock(stub: DurableObjectStub, watcher: TestClient, match: (game: GrassMessage) => boolean): Promise<GrassMessage> {
  for (let step = 0; step < 120; step++) {
    const due = await scheduledAlarm(stub);
    advanceClock(Math.max(0, due - Date.now()) + 1);
    await runDurableObjectAlarm(stub);
    // everything the alarm made the room send has arrived by the time the room answers this
    watcher.send({ type: "action", action: { type: "lay", row: -99, col: -99, turns: 0 } });
    let last: GrassMessage | null = null;
    for (;;) {
      const message = await watcher.next();
      if (message.type === "game" && message.game === GAME) last = message;
      if (message.type === "refused") break;
    }
    if (last !== null && match(last)) return last;
  }
  throw new Error("the game did not get there by its clock");
}

/**
 * A game brought to the laying with nothing on the park: everyone took 정보,
 * picked `TILE`, then 방어 (and cuts nothing unless the test does), 견제 and
 * 가로수, and let the time for their tree run out.
 */
async function toLaying(stub: DurableObjectStub, clients: TestClient[], watcher = clients[0]): Promise<GrassMessage> {
  const picking = await toPicking(clients, watcher);
  await allPick(clients, picking, watcher);
  await allChoose(clients, 6, 2, watcher);
  await allChoose(clients, 7, 2, watcher);
  await allChoose(clients, 8, 1, watcher);
  return runClock(stub, watcher, (game) => game.view.phase === "place" || game.view.phase === "ended");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: a room of 잔디 깔기", () => {
  it("starts a game for those in the room, shows everyone the same park and puts choice 5 to them", async () => {
    const clients = await gardeners("LAAAA", 3);

    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "LAAAA", game: GAME, frozen: false });
      expect(game.view.you).toBe(n);
      expect(game.view).toMatchObject({ phase: "choose", round: 1, rounds: shipped.rounds, picks: [], choices: [] });
      expect(game.view.choosing).toEqual({ which: 5, chosen: [], mine: null });
      expect(game.view.park).toEqual(games[0].view.park);
      expect(game.players.map((player) => player.nick)).toEqual(["p0", "p1", "p2"]);
    });
    expect(parkSize(games[0].view.park)).toBe(shipped.cellsPerPlayer * 3 + shipped.extraCells);
    expect(games[0].clock.turn).toBeGreaterThan(0);
    expect(games[0].clock.turn).toBeLessThanOrEqual(CHOOSE_MS);
    closeAll(clients);
  });

  it("keeps a choice from the other players until everyone has made it, then shows it to all", async () => {
    const clients = await gardeners("LAAAB", 3);
    await startGame(clients);

    clients[1].send({ type: "action", action: { type: "choose", option: 1 } });
    const own = await clients[1].grassWhere((game) => game.view.choosing?.mine === 1);
    const other = await clients[0].grassWhere((game) => game.view.choosing?.chosen.length === 1);
    clients[0].send({ type: "action", action: { type: "choose", option: 2 } });
    clients[2].send({ type: "action", action: { type: "choose", option: 2 } });
    const settled = await Promise.all(clients.map((client) => client.grassWhere((game) => game.view.choices.length === 3)));

    expect(own.view.choosing).toEqual({ which: 5, chosen: [1], mine: 1 });
    expect(other.view.choosing).toEqual({ which: 5, chosen: [1], mine: null });
    expect(JSON.stringify(other.view)).not.toContain('"option"');
    for (const game of settled) {
      expect(game.view.phase).toBe("pick");
      expect(game.view.choices.find((chosen) => chosen.player === 1)).toMatchObject({ which: 5, option: 1, forced: false });
      // 점수 gives its points at once: the one who took them picks last
      expect(game.view.players.find((player) => player.id === 1)?.score).toBe(shipped.scoreBonus);
      expect(game.view.pickOrder.at(-1)).toBe(1);
    }
    // only those who chose 정보 may look at the choices to come
    expect(settled[0].view.preview).toEqual([6, 7, 8]);
    expect(settled[1].view.preview).toEqual([]);
    closeAll(clients);
  });

  it("refuses a second choice, and a choice when none is being made", async () => {
    const clients = await gardeners("LAAAC", 2);
    await startGame(clients);

    clients[0].send({ type: "action", action: { type: "choose", option: 1 } });
    await clients[0].grassWhere((game) => game.view.choosing?.mine === 1);
    clients[0].send({ type: "action", action: { type: "choose", option: 2 } });
    const twice = await clients[0].refusal();
    clients[1].send({ type: "action", action: { type: "choose", option: 2 } });
    const picking = await clients[1].grassWhere((game) => game.view.phase === "pick");
    clients[picking.view.turn!].send({ type: "action", action: { type: "choose", option: 1 } });
    const late = await clients[picking.view.turn!].refusal();

    expect(twice.reason).toBe("already-chosen");
    expect(late.reason).toBe("not-choosing");
    closeAll(clients);
  });

  it("takes a pick from the player whose turn it is, and shows it to everyone", async () => {
    const clients = await gardeners("LAAAD", 3);
    const picking = await toPicking(clients);
    const first = picking.view.turn!;

    clients[first].send({ type: "action", action: { type: "pick", tile: 11 } });

    const after = await Promise.all(clients.map((client) => client.grassWhere((game) => game.view.picks.length === 1)));
    for (const game of after) {
      expect(game.view.picks).toEqual([{ player: first, tile: 11 }]);
      expect(game.view.turn).toBe(picking.view.pickOrder[1]);
    }
    closeAll(clients);
  });

  it("refuses a pick out of turn, and a tile there is not, telling only the one who asked", async () => {
    const clients = await gardeners("LAAAE", 2);
    const picking = await toPicking(clients);
    const first = picking.view.turn!;
    const other = 1 - first;

    clients[other].send({ type: "action", action: { type: "pick", tile: TILE } });
    const outOfTurn = await clients[other].refusal();
    clients[first].send({ type: "action", action: { type: "pick", tile: 5 } });
    const noTile = await clients[first].refusal();
    clients[first].send({ type: "action", action: { type: "pick", tile: TILE } });
    const after = await clients[other].grassWhere((game) => game.view.picks.length === 1);

    expect(outOfTurn.reason).toBe("not-your-turn");
    expect(noTile.reason).toBe("no-such-tile");
    expect(after.view.picks).toEqual([{ player: first, tile: TILE }]);
    closeAll(clients);
  });

  it("puts choices 6, 7 and 8 to everyone once the tiles are picked", async () => {
    const clients = await gardeners("LAAAF", 2);
    const picking = await toPicking(clients);
    await allPick(clients, picking);

    const six = await allChoose(clients, 6, 1);
    const seven = await allChoose(clients, 7, 1);
    const eight = await allChoose(clients, 8, 2);

    expect(six.view.choosing?.which).toBe(7);
    expect(seven.view.choosing?.which).toBe(8);
    // both took 상생: they are a pair
    expect(seven.view.pairs).toHaveLength(1);
    expect(eight.view.phase).toBe("manholes");
    expect(eight.view.turn).toBe(eight.view.layOrder[0]);
    closeAll(clients);
  });

  it("has the 맨홀 players put a +1 and a -1 on the park in turn, and the 가로수 players a tree after them", async () => {
    const clients = await gardeners("LAAAG", 2);
    const picking = await toPicking(clients);
    await allPick(clients, picking);
    await allChoose(clients, 6, 2);
    await allChoose(clients, 7, 2);
    // player 0 the tree, player 1 the manholes
    clients[0].send({ type: "action", action: { type: "choose", option: 1 } });
    clients[1].send({ type: "action", action: { type: "choose", option: 2 } });
    const marking = await clients[0].grassWhere((game) => game.view.phase === "manholes");
    const cells: { row: number; col: number }[] = [];
    marking.view.park.rows.forEach((line, row) => Array.from(line).forEach((mark, col) => mark === "#" && cells.push({ row, col })));

    clients[0].send({ type: "action", action: { type: "manhole", ...cells[0] } });
    const outOfTurn = await clients[0].refusal();
    clients[1].send({ type: "action", action: { type: "manhole", ...cells[0] } });
    await clients[0].grassWhere((game) => game.view.manholes.length === 1);
    clients[1].send({ type: "action", action: { type: "manhole", ...cells[0] } });
    const taken = await clients[1].refusal();
    clients[1].send({ type: "action", action: { type: "manhole", ...cells[1] } });
    const trees = await clients[0].grassWhere((game) => game.view.phase === "trees");
    clients[0].send({ type: "action", action: { type: "tree", ...cells[0] } });
    const onManhole = await clients[0].refusal();
    clients[0].send({ type: "action", action: { type: "tree", ...cells[2] } });
    const after = await clients[1].grassWhere((game) => game.view.trees.length === 1);

    expect(marking.view.turn).toBe(1);
    expect(outOfTurn.reason).toBe("not-your-turn");
    expect(taken.reason).toBe("bad-cell");
    expect(trees.view.manholes).toEqual([
      { ...cells[0], value: 1, by: 1 },
      { ...cells[1], value: -1, by: 1 },
    ]);
    expect(trees.view.turn).toBe(0);
    expect(onManhole.reason).toBe("bad-cell");
    expect(after.view.trees).toEqual([{ ...cells[2], by: 0 }]);
    expect(["place", "ended"]).toContain(after.view.phase);
    closeAll(clients);
  });

  it("has the tiles laid in the order of their numbers, and counts each one laid for its number", async () => {
    const stub = env.GameRoom.getByName("LAAAH");
    const clients = await gardeners("LAAAH", 2);
    let game = await toLaying(stub, clients);

    expect(game.view.layOrder).toHaveLength(2);
    expect(game.view.trees).toEqual([]);
    while (game.view.phase === "place") {
      const laid = game.view.placed.length + game.view.failed.length;
      // 방어: a tile with no room whole is still on turn, to be laid cut; the test lays it whole where it can
      const way = waysToLay(game.view.park, game.view.placed, TILE)[0];
      if (way === undefined) break;
      clients[game.view.turn!].send({ type: "action", action: { type: "lay", ...way } });
      game = await clients[0].grassWhere((seen) => seen.view.placed.length + seen.view.failed.length > laid);
    }
    if (game.view.phase === "place") game = await runClock(stub, clients[0], (seen) => seen.view.phase === "ended");

    const score = game.view.history.find((event) => event.type === "score");
    const lines = score?.type === "score" ? score.lines : [];
    expect(game.view.phase).toBe("ended");
    expect(game.view.placed.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.tile).toBe(line.laid ? TILE : 0);
      // everyone took 견제: its points come when few enough tiles were laid
      expect(line.check).toBe(game.view.placed.length <= game.view.checkAtMost ? shipped.checkBonus : 0);
      expect(game.view.players.find((player) => player.id === line.player)?.score).toBe(line.total);
    }
    expect(game.clock).toEqual({ turn: null, next: null, stand: null });
    closeAll(clients);
  });

  it("lets a 방어 player cut a cell off the tile as it is laid", async () => {
    const stub = env.GameRoom.getByName("LAAAJ");
    const clients = await gardeners("LAAAJ", 2);
    const game = await toLaying(stub, clients);
    const turn = game.view.turn!;
    // the last cell of tile 9's column of five
    const cut = [{ row: 4, col: 1 }];
    const way = waysToLay(game.view.park, game.view.placed, TILE, { cut })[0];

    clients[turn].send({ type: "action", action: { type: "lay", ...way, cut: [{ row: 1, col: 1 }] } });
    const numbered = await clients[turn].refusal();
    clients[turn].send({ type: "action", action: { type: "lay", ...way, cut } });
    const after = await clients[1 - turn].grassWhere((seen) => seen.view.placed.length === 1);

    expect(numbered.reason).toBe("bad-cut");
    expect(after.view.placed[0]).toMatchObject({ player: turn, tile: TILE, cut });
    expect(after.view.history.find((event) => event.type === "lay")).toMatchObject({ player: turn, cut: 1, forced: false });
    closeAll(clients);
  });

  it("refuses a tile laid where it does not fit, and changes nothing", async () => {
    const stub = env.GameRoom.getByName("LAAAK");
    const clients = await gardeners("LAAAK", 2);
    const game = await toLaying(stub, clients);

    clients[game.view.turn!].send({ type: "action", action: { type: "lay", row: 50, col: 50, turns: 0 } });
    const refused = await clients[game.view.turn!].refusal();
    clients[game.view.turn!].send({ type: "action", action: { type: "lay", ...waysToLay(game.view.park, [], TILE)[0] } });
    const after = await clients[0].grassWhere((seen) => seen.view.placed.length === 1);

    expect(refused.reason).toBe("does-not-fit");
    expect(after.view.placed[0]).toMatchObject({ player: game.view.turn, tile: TILE });
    closeAll(clients);
  });

  it("refuses what is not a move of this game", async () => {
    const clients = await gardeners("LAAAL", 2);
    await startGame(clients);

    clients[0].send({ type: "action", action: { type: "buzz" } });

    expect((await clients[0].refusal()).reason).toBe("bad-action");
    closeAll(clients);
  });

  it("refuses a start with nobody to contend with, and from someone who is not the host", async () => {
    const clients = await gardeners("LAAAM", 2);
    const alone = await open("LAAAN", 0, true);
    await alone.lobbyOf(1);

    clients[1].send({ type: "start", bots: false });
    alone.send({ type: "start", bots: false });

    expect((await clients[1].refusal()).reason).toBe("not-host");
    expect((await alone.refusal()).reason).toBe("too-few");
    closeAll([...clients, alone]);
  });

  it("never sends a player anyone's token", async () => {
    const clients = await gardeners("LAAAP", 2);
    const picking = await toPicking(clients);
    await allPick(clients, picking);

    for (const client of clients) {
      for (const n of [0, 1]) expect(client.raw.join("\n")).not.toContain(tokenFor(n));
    }
    closeAll(clients);
  });
});

describe("GameRoom: the clock of 잔디 깔기", () => {
  it("chooses for those who are out of time", async () => {
    const stub = env.GameRoom.getByName("LBAAA");
    const clients = await gardeners("LBAAA", 2);
    await startGame(clients);
    clients[0].send({ type: "action", action: { type: "choose", option: 2 } });
    await clients[0].grassWhere((game) => game.view.choosing?.mine === 2);

    await scheduledAlarm(stub);
    advanceClock(CHOOSE_MS + 1);
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const after = await clients[1].grassWhere((game) => game.view.phase === "pick");
    expect(after.view.choices).toEqual(
      expect.arrayContaining([
        { player: 0, which: 5, option: 2, forced: false },
        { player: 1, which: 5, option: shipped.defaultOptions["5"], forced: true },
      ]),
    );
    closeAll(clients);
  });

  it("picks for a player who is out of time", async () => {
    const stub = env.GameRoom.getByName("LBAAB");
    const clients = await gardeners("LBAAB", 2);
    const picking = await toPicking(clients);
    const first = picking.view.turn!;

    await scheduledAlarm(stub);
    advanceClock(PICK_MS + 1);
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const after = await clients[0].grassWhere((game) => game.view.picks.length === 1);
    expect(after.view.picks).toEqual([{ player: first, tile: shipped.defaultTile }]);
    expect(after.view.history.at(-1)).toMatchObject({ type: "pick", forced: true });
    closeAll(clients);
  });

  it("moves sooner for a player on turn who is not connected", async () => {
    const stub = env.GameRoom.getByName("LBAAC");
    const clients = await gardeners("LBAAC", 3);
    const picking = await toPicking(clients);
    const first = picking.view.turn!;
    const watcher = clients[(first + 1) % 3];

    clients[first].close();
    const waiting = await watcher.grassWhere((game) => !game.players[first].connected);
    advanceClock(AWAY_MS + 1);
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const after = await watcher.grassWhere((game) => game.view.picks.length === 1);
    expect(waiting.clock.turn).toBeLessThanOrEqual(AWAY_MS);
    expect(after.view.picks).toEqual([{ player: first, tile: shipped.defaultTile }]);
    closeAll(clients.filter((_, n) => n !== first));
  });

  it("moves at once for a player on turn who leaves the room, and chooses at once for one who leaves during a choice", async () => {
    const clients = await gardeners("LBAAD", 3);
    await startGame(clients);

    clients[2].send({ type: "leave" });
    const chosenFor = await clients[0].grassWhere((game) => game.view.choosing?.chosen.includes(2) === true);
    clients[0].send({ type: "action", action: { type: "choose", option: 2 } });
    clients[1].send({ type: "action", action: { type: "choose", option: 2 } });
    // the one who left was chosen 점수 for, so they pick last: the room picks for them the moment their turn comes
    let game = await clients[0].grassWhere((seen) => seen.view.phase === "pick");
    while (game.view.phase === "pick" && game.view.turn !== 2) {
      const picked = game.view.picks.length;
      clients[game.view.turn!].send({ type: "action", action: { type: "pick", tile: TILE } });
      game = await clients[0].grassWhere((seen) => seen.view.picks.length > picked);
    }

    expect(chosenFor.players[2]).toMatchObject({ left: true });
    expect(game.view.picks.find((pick) => pick.player === 2)).toEqual({ player: 2, tile: shipped.defaultTile });
    expect(game.view.phase).toBe("choose");
    closeAll(clients.slice(0, 2));
  });

  it("plays its one park to the end by the clock alone, and lets the host start another game after", async () => {
    const stub = env.GameRoom.getByName("LBAAE");
    const clients = await gardeners("LBAAE", 2);
    const games = await startGame(clients);

    const over = await runClock(stub, clients[0], (game) => game.view.phase === "ended");
    clients[0].send({ type: "start", bots: false });
    const again = await clients[1].grassWhere((game) => game.startedAt !== games[0].startedAt);

    expect(over.view.round).toBe(shipped.rounds);
    expect(over.view.history.at(-1)).toEqual({ type: "ended", round: shipped.rounds, reason: "rounds" });
    expect(over.view.choices.every((chosen) => chosen.forced)).toBe(true);
    expect(over.view.choices).toHaveLength(8);
    expect(over.clock).toEqual({ turn: null, next: null, stand: null });
    expect(again.view).toMatchObject({ phase: "choose", round: 1, choices: [] });
    expect(again.view.players.every((player) => player.score === 0)).toBe(true);
    closeAll(clients);
  });
});

describe("GameRoom: coming and going during 잔디 깔기", () => {
  it("gives a player who reconnects their place back, with the choice they had made", async () => {
    const clients = await gardeners("LCAAA", 3);
    await startGame(clients);
    clients[1].send({ type: "action", action: { type: "choose", option: 2 } });
    await clients[0].grassWhere((game) => game.view.choosing?.chosen.length === 1);
    clients[1].close();
    await clients[0].grassWhere((game) => !game.players[1].connected);

    const back = await open("LCAAA", 1);

    const game = await back.grassWhere();
    expect(game.view.you).toBe(1);
    expect(game.view.choosing).toEqual({ which: 5, chosen: [1], mine: 2 });
    expect(game.players[1]).toMatchObject({ connected: true, left: false });
    closeAll([clients[0], clients[2], back]);
  });

  it("shows someone who joins during a game the park, and takes no moves from them", async () => {
    const clients = await gardeners("LCAAB", 2);
    await startGame(clients);

    const watcher = await open("LCAAB", 2);
    const game = await watcher.grassWhere();
    watcher.send({ type: "action", action: { type: "choose", option: 1 } });

    expect(game.view.you).toBeNull();
    expect(game.view.choosing).toEqual({ which: 5, chosen: [], mine: null });
    expect(game.players).toHaveLength(2);
    expect((await watcher.refusal()).reason).toBe("not-seated");
    closeAll([...clients, watcher]);
  });

  it("keeps the game when the room has hibernated", async () => {
    const clients = await gardeners("LCAAC", 2);
    const picking = await toPicking(clients);
    const first = picking.view.turn!;
    clients[first].send({ type: "action", action: { type: "pick", tile: 13 } });
    await clients[0].grassWhere((game) => game.view.picks.length === 1);

    await evictDurableObject(env.GameRoom.getByName("LCAAC"));
    const late = await open("LCAAC", 2);

    const game = await late.grassWhere();
    expect(game.view.park).toEqual(picking.view.park);
    expect(game.view.picks).toEqual([{ player: first, tile: 13 }]);
    expect(game.view.choices).toHaveLength(2);
    closeAll([...clients, late]);
  });

  it("stands still while none of its players is connected, and goes on when one is back", async () => {
    const clients = await gardeners("LCAAD", 2);
    await startGame(clients);
    const watcher = await open("LCAAD", 2);
    await watcher.grassWhere();

    closeAll(clients);
    const standing = await watcher.grassWhere((game) => game.frozen);
    const back = await open("LCAAD", 0);
    const going = await watcher.grassWhere((game) => !game.frozen);

    expect(standing.clock.stand).toBeGreaterThan(0);
    expect(standing.clock.stand).toBeLessThanOrEqual(STAND_MS);
    expect(going.view.phase).toBe("choose");
    expect(going.clock.stand).toBeNull();
    closeAll([watcher, back]);
  });

  it("ends a game that has stood too long, also after the room was put to sleep", async () => {
    const stub = env.GameRoom.getByName("LCAAE");
    const clients = await gardeners("LCAAE", 2);
    await startGame(clients);
    const watcher = await open("LCAAE", 2);
    await watcher.grassWhere();
    closeAll(clients);
    await watcher.grassWhere((game) => game.frozen);

    await evictDurableObject(stub);
    advanceClock(STAND_MS + 1);
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const over = await watcher.grassWhere((game) => game.view.phase === "ended");
    expect(over.view.history.at(-1)).toEqual({ type: "ended", round: 1, reason: "abandoned" });
    expect(over.frozen).toBe(false);
    watcher.close();
  });

  it("ends the game at once when all its players have left the room", async () => {
    const clients = await gardeners("LCAAF", 2);
    await startGame(clients);
    const watcher = await open("LCAAF", 2);
    await watcher.grassWhere();

    clients[0].send({ type: "leave" });
    clients[1].send({ type: "leave" });

    const over = await watcher.grassWhere((game) => game.view.phase === "ended");
    expect(over.view.history.at(-1)).toEqual({ type: "ended", round: 1, reason: "abandoned" });
    watcher.close();
  });
});

describe("GameRoom: bots in 잔디 깔기", () => {
  it("fills the game with bots when asked, where the room offers them, and they play it to its end", async () => {
    const stub = env.GameRoom.getByName("LDAAA");
    const alone = await open("LDAAA", 0, true);
    await alone.lobbyOf(1);

    alone.send({ type: "start", bots: true });
    const game = await alone.grassWhere();
    // the person never moves: the bots, and the room for the person, play the park through
    const over = await runClock(stub, alone, (seen) => seen.view.phase === "ended");

    expect(game.players.filter((player) => player.bot)).toHaveLength(3);
    expect(game.view.you).toBe(0);
    // the bots had chosen before the person was sent the game
    expect(game.view.choosing?.chosen.sort()).toEqual([1, 2, 3]);
    expect(over.view.picks).toHaveLength(4);
    expect(over.view.placed.length + over.view.failed.length).toBe(4);
    expect(over.view.history.filter((event) => event.type === "choice")).toHaveLength(4);
    alone.close();
  });

  it("refuses bots in a room that is not offered them", async () => {
    // the test runtime offers bots; what a deployed room does is in the unit tests of the host
    const alone = await open("LDAAB", 0, true);
    await alone.lobbyOf(1);

    alone.send({ type: "start", bots: false });

    expect((await alone.refusal()).reason).toBe("too-few");
    alone.close();
  });
});
