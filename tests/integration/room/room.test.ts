import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BUILD } from "../../../src/shared/build";
import directoryConfig from "../../../src/shared/directory-config.json";
import cubesConfig from "../../../src/shared/games/count-cubes/config.json";
import { DEFAULT_GAME, GAMES, GAME_IDS, type GameId } from "../../../src/shared/games";
import type { LobbyView } from "../../../src/shared/lobby";
import { CLOSE_LEFT, CLOSE_REJECTED, CLOSE_STALE } from "../../../src/shared/protocol";
import roomConfig from "../../../src/shared/room-config.json";
import { exports } from "cloudflare:workers";
import { PARTY_NAME } from "../../../src/shared/protocol";
import { advanceClock, connect, heardWere, join as open, knock, scheduledAlarm, tokenFor, type HeardRecord } from "../support";

/** How many players a room of `game` holds: worked out here, not by the code the tests are about. */
const holds = (game: GameId): number => Math.min(roomConfig.maxPlayers, GAMES[game].maxPlayers);
/** How many players a room of the first game holds. */
const MOST = holds(DEFAULT_GAME);
/** The game whose rooms hold the most players. */
const BIG_GAME = GAME_IDS.reduce<GameId>((most, id) => (GAMES[id].maxPlayers > GAMES[most].maxPlayers ? id : most), DEFAULT_GAME);
/** A game one player can start alone, to its end by the clock. */
const ALONE_GAME = "count-cubes" as const;
const EMPTY_ROOM_TTL_MS = roomConfig.emptyRoomTtlMinutes * 60_000;
const JOIN_TIMEOUT_MS = roomConfig.joinTimeoutSeconds * 1000;
const AWAY_SLOT_MS = roomConfig.awaySlotSeconds * 1000;
const STALE_MS = roomConfig.staleConnectionSeconds * 1000;
const HOST_IDLE_MS = roomConfig.hostIdleSeconds * 1000;
const HOST_ANSWER_MS = roomConfig.hostAnswerSeconds * 1000;
/** The rooms one address may make in a short while. */
const [MAKE_SOON] = directoryConfig.makeLimits;
/** How many tries a test gives a limit kept by address to show itself: far more than any such limit. */
const MANY = 400;
/** The room code a test makes its `n`th room under: `stem` and three more characters. */
const codeOf = (stem: string, n: number): string => {
  const letters = roomConfig.roomCodeAlphabet;
  const digit = (place: number): string => letters[Math.floor(n / letters.length ** place) % letters.length];
  return `${stem}${digit(2)}${digit(1)}${digit(0)}`;
};

afterEach(() => {
  vi.useRealTimers();
});

function connectedBySlot(lobby: LobbyView): Record<number, boolean> {
  return Object.fromEntries(lobby.players.map((p) => [p.slot, p.connected]));
}

describe("GameRoom", () => {
  it("seats the creator in slot 0", async () => {
    const a = await open("AAAAA", { player: 0, nick: "ann", create: true });

    const lobby = await a.next();

    expect(lobby).toEqual({
      type: "lobby",
      room: "AAAAA",
      build: BUILD,
      you: 0,
      maxPlayers: MOST,
      game: DEFAULT_GAME,
      listed: false,
      turnSeconds: 0,
      // the first game is played one way only
      // the room's game is played its first way until the host says otherwise
      variant: "kept",
      knockout: false,
      voice: true,
      host: 0,
      players: [{ slot: 0, nick: "ann", connected: true, team: 0, leads: false, ready: false, pieces: 0, out: false, top: false, games: 0, wins: 0 }],
    });
    a.close();
  });

  it("starts a room on the list with the limit on a turn such rooms have", async () => {
    const a = await open("AAAA8", { player: 0, create: true, listed: true });

    expect(await a.next()).toMatchObject({ type: "lobby", listed: true, turnSeconds: roomConfig.listedTurnSeconds });
    a.close();
  });

  it("lets the host set how long a turn lasts, and tells everyone", async () => {
    const a = await open("AAAA9", { player: 0, create: true });
    const b = await open("AAAA9", { player: 1 });
    await b.next();
    const longest = Math.max(...roomConfig.turnSecondsChoices);

    a.send({ type: "clock", seconds: longest });

    expect(await a.lobbyWhere((l) => l.turnSeconds === longest)).toMatchObject({ turnSeconds: longest });
    expect(await b.lobbyWhere((l) => l.turnSeconds === longest)).toMatchObject({ turnSeconds: longest });
    a.close();
    b.close();
  });

  it("refuses a length of turn from someone who is not the host", async () => {
    const a = await open("AAAB2", { player: 0, create: true });
    const b = await open("AAAB2", { player: 1 });
    await b.next();

    b.send({ type: "clock", seconds: Math.max(...roomConfig.turnSecondsChoices) });

    for (;;) {
      const message = await b.next();
      if (message.type === "refused") {
        expect(message).toEqual({ type: "refused", reason: "not-host" });
        break;
      }
    }
    const c = await open("AAAB2", { player: 2 });
    expect(await c.next()).toMatchObject({ type: "lobby", turnSeconds: 0 });
    a.close();
    b.close();
    c.close();
  });

  it("refuses a length of turn the room does not offer", async () => {
    const a = await open("AAAB3", { player: 0, create: true });
    await a.next();

    a.send({ type: "clock", seconds: Math.max(...roomConfig.turnSecondsChoices) + 1 });

    for (;;) {
      const message = await a.next();
      // the room also says who is in voice when someone comes in; the answer to the setting is the refusal
      if (message.type !== "refused") continue;
      expect(message).toEqual({ type: "refused", reason: "bad-setting" });
      break;
    }
    a.close();
  });

  it("shows a second player to both players", async () => {
    const a = await open("AAAAB", { player: 0, create: true });
    await a.next();

    const b = await open("AAAAB", { player: 1 });

    const seenByB = await b.next();
    const seenByA = await a.lobbyWhere((l) => l.players.length === 2);
    expect(seenByB).toMatchObject({ you: 1 });
    expect(seenByA).toMatchObject({ you: 0 });
    expect(seenByA.players).toEqual(seenByB.type === "lobby" ? seenByB.players : null);
    a.close();
    b.close();
  });

  it("never sends one player's token to another", async () => {
    const a = await open("AAAAC", { player: 0, create: true });
    const b = await open("AAAAC", { player: 1 });

    const seenByB = await b.next();
    const seenByA = await a.lobbyWhere((l) => l.players.length === 2);

    expect(JSON.stringify([seenByA, seenByB])).not.toContain("player-token");
    a.close();
    b.close();
  });

  it("refuses to join a room nobody created", async () => {
    const a = await open("AAAAD", { player: 0 });

    expect(await a.next()).toEqual({ type: "error", reason: "not-found" });
    expect(await a.closed).toBe(CLOSE_REJECTED);
  });

  it("refuses a stranger who tries to create a code already in use", async () => {
    const a = await open("AAAAE", { player: 0, create: true });
    await a.next();

    const stranger = await open("AAAAE", { player: 1, create: true });

    expect(await stranger.next()).toEqual({ type: "error", reason: "code-taken" });
    a.close();
  });

  it("lets the maker of a room ask to make it again, as a reconnect does", async () => {
    const a = await open("AAAA7", { player: 0, nick: "ann", create: true });
    await a.next();

    const again = await open("AAAA7", { player: 0, nick: "ann", create: true });

    expect(await again.next()).toMatchObject({ type: "lobby", you: 0, players: [{ slot: 0, nick: "ann" }] });
    a.close();
    again.close();
  });

  it("turns away a connection to a name that cannot be a room, before any room is made for it", async () => {
    const upgrade = { headers: { Upgrade: "websocket" } };

    const malformed = await exports.default.fetch(`http://example.com/parties/${PARTY_NAME}/nope`, upgrade);
    const tooLong = await exports.default.fetch(`http://example.com/parties/${PARTY_NAME}/AAAAAA`, upgrade);
    const otherDirectory = await exports.default.fetch("http://example.com/parties/room-directory/other", upgrade);
    const noSuchParty = await exports.default.fetch("http://example.com/parties/nothing-here/AAAAA", upgrade);

    expect(malformed.status).toBe(404);
    expect(tooLong.status).toBe(404);
    expect(otherDirectory.status).toBe(404);
    expect(noSuchParty.status).not.toBe(101);
  });

  it("refuses a blank nickname", async () => {
    const a = await open("AAAAF", { player: 0, nick: "  ", create: true });

    expect(await a.next()).toEqual({ type: "error", reason: "bad-nick" });
  });

  it("refuses the player after the room is full", async () => {
    const clients = [await open("AAAAG", { player: 0, create: true })];
    for (let n = 1; n < MOST; n++) {
      clients.push(await open("AAAAG", { player: n }));
    }
    await clients.at(-1)!.next();

    const extra = await open("AAAAG", { player: MOST });

    expect(await extra.next()).toEqual({ type: "error", reason: "full" });
    for (const c of clients) c.close();
  });

  it("holds as many players as its game takes, in a game that takes more than the first", async () => {
    const most = holds(BIG_GAME);
    expect(most).toBeGreaterThan(MOST);
    const clients = [await open("AAAG2", { player: 0, create: true, game: BIG_GAME })];
    for (let n = 1; n < most; n++) clients.push(await open("AAAG2", { player: n }));

    const lobby = await clients.at(-1)!.next();
    const extra = await open("AAAG2", { player: most });

    expect(lobby).toMatchObject({ type: "lobby", you: most - 1, maxPlayers: most });
    expect(lobby.type === "lobby" ? lobby.players : []).toHaveLength(most);
    expect(await extra.next()).toEqual({ type: "error", reason: "full" });
    for (const c of clients) c.close();
  });

  it("marks a dropped player as disconnected and keeps their slot", async () => {
    const a = await open("AAAAH", { player: 0, create: true });
    const b = await open("AAAAH", { player: 1 });
    await b.next();

    b.close();

    const lobby = await a.lobbyWhere((l) => connectedBySlot(l)[1] === false);
    expect(connectedBySlot(lobby)).toEqual({ 0: true, 1: false });
    a.close();
  });

  it("returns a reconnecting player to the same slot", async () => {
    const a = await open("AAAAJ", { player: 0, create: true });
    const b = await open("AAAAJ", { player: 1 });
    await b.next();
    b.close();
    await a.lobbyWhere((l) => connectedBySlot(l)[1] === false);

    const back = await open("AAAAJ", { player: 1 });

    expect(await back.next()).toMatchObject({ you: 1 });
    const lobby = await a.lobbyWhere((l) => connectedBySlot(l)[1] === true);
    expect(lobby.players).toHaveLength(2);
    a.close();
    back.close();
  });

  it("keeps the lobby and live connections across hibernation", async () => {
    const a = await open("AAAAK", { player: 0, nick: "ann", create: true });
    await a.next();
    await evictDurableObject(env.GameRoom.getByName("AAAAK"));

    const b = await open("AAAAK", { player: 1, nick: "bob" });

    const seenByB = await b.next();
    expect(seenByB).toMatchObject({
      you: 1,
      players: [
        { slot: 0, nick: "ann", connected: true },
        { slot: 1, nick: "bob", connected: true },
      ],
    });
    expect(await a.lobbyWhere((l) => l.players.length === 2)).toMatchObject({ you: 0 });
    a.close();
    b.close();
  });

  it("frees the slot of a player who leaves", async () => {
    const a = await open("AAAAL", { player: 0, create: true });
    const b = await open("AAAAL", { player: 1 });
    await b.next();
    await a.lobbyWhere((l) => l.players.length === 2);

    b.send({ type: "leave" });

    expect(await b.closed).toBe(CLOSE_LEFT);
    await a.lobbyWhere((l) => l.players.length === 1);
    const c = await open("AAAAL", { player: 2 });
    expect(await c.next()).toMatchObject({ you: 1 });
    a.close();
    c.close();
  });

  it("removes the room when the last player leaves", async () => {
    const a = await open("AAAAM", { player: 0, create: true });
    await a.next();

    a.send({ type: "leave" });
    await a.closed;

    const b = await open("AAAAM", { player: 1 });
    expect(await b.next()).toEqual({ type: "error", reason: "not-found" });
  });

  it("clears an abandoned room once its countdown has run out", async () => {
    const stub = env.GameRoom.getByName("AAAAN");
    const a = await open("AAAAN", { player: 0, create: true });
    await a.next();
    a.close();
    await scheduledAlarm(stub);
    advanceClock(EMPTY_ROOM_TTL_MS + 1);

    const ran = await runDurableObjectAlarm(stub);

    expect(ran).toBe(true);
    const b = await open("AAAAN", { player: 1 });
    expect(await b.next()).toEqual({ type: "error", reason: "not-found" });
  });

  it("keeps an abandoned room when the alarm fires before the countdown ends", async () => {
    const stub = env.GameRoom.getByName("AAAAQ");
    const a = await open("AAAAQ", { player: 0, create: true });
    await a.next();
    a.close();
    const due = await scheduledAlarm(stub);

    await runDurableObjectAlarm(stub);

    const rearmed = await runInDurableObject(stub, (_room, state) => state.storage.getAlarm());
    expect(rearmed).toBe(due);
    const b = await open("AAAAQ", { player: 1 });
    expect(await b.next()).toMatchObject({ type: "lobby", you: 1 });
    b.close();
  });

  it("keeps a room whose countdown runs out after someone came back", async () => {
    const stub = env.GameRoom.getByName("AAAAP");
    const a = await open("AAAAP", { player: 0, create: true });
    await a.next();
    a.close();
    await scheduledAlarm(stub);
    const back = await open("AAAAP", { player: 0 });
    await back.next();
    advanceClock(EMPTY_ROOM_TTL_MS + 1);

    await runDurableObjectAlarm(stub);

    const b = await open("AAAAP", { player: 1 });
    expect(await b.next()).toMatchObject({ type: "lobby", you: 1 });
    back.close();
    b.close();
  });

  it("ignores credentials placed in the address", async () => {
    const query = `?token=${tokenFor(0)}&nick=ann&create=1`;
    const viaAddress = await connect("AAAAR", query);

    const b = await open("AAAAR", { player: 1 });

    expect(await b.next()).toEqual({ type: "error", reason: "not-found" });
    expect(viaAddress.unreadCount).toBe(0);
    viaAddress.close();
  });

  it("sends nothing to a connection that has not joined", async () => {
    const a = await open("AAAAS", { player: 0, create: true });
    await a.next();
    const watcher = await connect("AAAAS");

    const b = await open("AAAAS", { player: 1 });
    await b.next();
    await a.lobbyWhere((l) => l.players.length === 2);

    expect(watcher.unreadCount).toBe(0);
    a.close();
    b.close();
    watcher.close();
  });

  it("does not count a connection that has not joined as a player", async () => {
    const a = await open("AAAAT", { player: 0, create: true });
    await a.next();
    const watcher = await connect("AAAAT");

    const b = await open("AAAAT", { player: 1 });

    expect(await b.next()).toMatchObject({ you: 1, players: [{ slot: 0 }, { slot: 1 }] });
    a.close();
    b.close();
    watcher.close();
  });

  it("writes to the log that a room was made, with its game and nothing that names the room or its maker", async () => {
    const said = vi.spyOn(console, "log").mockImplementation(() => {});

    const a = await open("LMTAJ", { player: 0, nick: "maker", create: true, listed: true });
    await a.next();
    const b = await open("LMTAJ", { player: 1 });
    await b.next();

    const lines = said.mock.calls.map((call) => call.join(" ")).filter((line) => line.startsWith("room made"));
    said.mockRestore();
    // made once: the second player came into a room that was there
    expect(lines).toEqual([`room made: ${DEFAULT_GAME} listed`]);
    a.close();
    b.close();
  });

  it("writes to the log that a game started and that it ended, with its game and how many sat down to it", async () => {
    const said = vi.spyOn(console, "log").mockImplementation(() => {});
    const stub = env.GameRoom.getByName("LGTAA");
    const a = await open("LGTAA", { player: 0, create: true, game: ALONE_GAME });
    await a.lobbyOf(1);

    a.send({ type: "start", bots: false });
    await a.cubesWhere();
    await scheduledAlarm(stub);
    advanceClock(cubesConfig.problemSeconds * 1000 + 1);
    await runDurableObjectAlarm(stub);
    await a.cubesWhere((game) => game.view.phase === "ended");

    const lines = said.mock.calls.map((call) => call.join(" ")).filter((line) => line.startsWith("game "));
    said.mockRestore();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(`game started: ${ALONE_GAME} 1 players`);
    // how long it took, in whole minutes: the clock of a test is moved by the length of a problem
    expect(lines[1]).toMatch(new RegExp(`^game ended: ${ALONE_GAME} \\d+ min$`));
    a.close();
  });

  it("writes to the log that a room stands empty once its last player has left, with the most who were in it at once", async () => {
    const said = vi.spyOn(console, "log").mockImplementation(() => {});
    const a = await open("LGTAB", { player: 0, create: true, listed: true });
    const b = await open("LGTAB", { player: 1 });
    await b.next();
    await a.lobbyOf(2);

    a.send({ type: "leave" });
    await a.closed;
    const before = said.mock.calls.map((call) => call.join(" ")).filter((line) => line.startsWith("room emptied"));
    b.send({ type: "leave" });
    await b.closed;

    const lines = said.mock.calls.map((call) => call.join(" ")).filter((line) => line.startsWith("room emptied"));
    said.mockRestore();
    // not while someone is still in it; and nothing that names the room or who was in it
    expect(before).toEqual([]);
    expect(lines).toEqual([`room emptied: ${DEFAULT_GAME} listed games 0 most 2`]);
  });

  it("writes to the log that a room stands empty when the one who waited in it alone closed the page", async () => {
    const said = vi.spyOn(console, "log").mockImplementation(() => {});
    const stub = env.GameRoom.getByName("LGTAC");
    const a = await open("LGTAC", { player: 0, create: true });
    await a.next();

    a.close();
    await scheduledAlarm(stub);
    advanceClock(AWAY_SLOT_MS + 1);
    await runDurableObjectAlarm(stub);

    const lines = said.mock.calls.map((call) => call.join(" ")).filter((line) => line.startsWith("room emptied"));
    said.mockRestore();
    expect(lines).toEqual([`room emptied: ${DEFAULT_GAME} unlisted games 0 most 1`]);
  });

  it("counts a room from nothing again once it has stood empty", async () => {
    const said = vi.spyOn(console, "log").mockImplementation(() => {});
    const a = await open("LGTAD", { player: 0, create: true, game: ALONE_GAME });
    await a.lobbyOf(1);
    a.send({ type: "start", bots: false });
    await a.cubesWhere();
    a.send({ type: "leave" });
    await a.closed;

    const b = await open("LGTAD", { player: 1, create: true, game: ALONE_GAME });
    await b.lobbyOf(1);
    b.send({ type: "leave" });
    await b.closed;

    const lines = said.mock.calls.map((call) => call.join(" ")).filter((line) => line.startsWith("room emptied"));
    said.mockRestore();
    expect(lines).toEqual([`room emptied: ${ALONE_GAME} unlisted games 1 most 1`, `room emptied: ${ALONE_GAME} unlisted games 0 most 1`]);
  });

  it("says in the lobby it sends which build the room's code is from", async () => {
    const a = await open("LGTAE", { player: 0, create: true });

    const lobby = await a.lobbyWhere();

    expect(lobby.build).toBe(BUILD);
    a.close();
  });

  it("takes a join from a connection that sent a thing or two first", async () => {
    const a = await connect("LMTAA");
    for (let n = 0; n < roomConfig.maxStrayMessages; n++) a.send({ type: "poke" });

    a.send({ type: "join", token: tokenFor(0), nick: "p0", create: true, game: DEFAULT_GAME, listed: false, pings: false });

    expect(await a.next()).toMatchObject({ type: "lobby", you: 0 });
    a.close();
  });

  it("closes a connection that goes on sending without joining", async () => {
    const a = await connect("LMTAB");

    for (let n = 0; n <= roomConfig.maxStrayMessages; n++) a.send({ type: "poke" });

    expect(await a.closed).toBe(CLOSE_REJECTED);
  });

  it("counts what cannot be read as well, of a connection that has not joined", async () => {
    const a = await connect("LMTAC");

    for (let n = 0; n <= roomConfig.maxStrayMessages; n++) a.sendRaw("not a message");

    expect(await a.closed).toBe(CLOSE_REJECTED);
  });

  it("closes those that have waited longest to join, once more wait than a room keeps", async () => {
    // each a moment after the one before, so that which has waited longest is plain
    const first = await connect("LMTAD");
    advanceClock(10);
    const second = await connect("LMTAD");
    advanceClock(10);
    const rest = [];
    for (let n = 2; n < roomConfig.maxPendingConnections; n++) rest.push(await connect("LMTAD"));

    const one = await connect("LMTAD");
    const made = await open("LMTAD", { player: 0, create: true });

    expect(await first.next()).toEqual({ type: "error", reason: "join-timeout" });
    expect(await first.closed).toBe(CLOSE_REJECTED);
    expect(await second.next()).toEqual({ type: "error", reason: "join-timeout" });
    // the one who came last and means to join is let in
    expect(await made.next()).toMatchObject({ type: "lobby", you: 0 });
    for (const client of [...rest, one, made]) client.close();
  });

  it("counts a join sent again by a seated connection against that player's pace", async () => {
    const a = await open("LMTAE", { player: 0, create: true });
    await a.next();
    const again = { type: "join", token: tokenFor(0), nick: "p0", create: true, game: DEFAULT_GAME, listed: false, pings: false } as const;

    for (let n = 0; n <= roomConfig.messageLimits.other.burst; n++) a.send(again);

    for (;;) {
      const message = await a.next();
      if (message.type !== "refused") continue;
      expect(message).toEqual({ type: "refused", reason: "too-fast" });
      break;
    }
    a.close();
  });

  it("turns away an address that connects faster than the limit, and no other", async () => {
    const flooding = "203.0.113.7";
    let refused = -1;

    for (let n = 0; n < MANY && refused < 0; n++) {
      const response = await knock(`/parties/${PARTY_NAME}/${codeOf("LC", n)}`, flooding);
      if (response.status === 429) refused = n;
      else response.webSocket?.accept();
    }
    const other = await knock(`/parties/${PARTY_NAME}/LMTAF`, "203.0.113.8");

    // it was let in a good many times first: a house of players behind one address is not a flood
    expect(refused).toBeGreaterThanOrEqual(2 * roomConfig.maxPlayers);
    expect(other.status).toBe(101);
  });

  /** Makes rooms from `from` under `stem` until one is refused or `most` are made; how many were made. */
  const roomsMadeFrom = async (from: string | undefined, stem: string, most = MANY): Promise<number> => {
    for (let n = 0; n < most; n++) {
      const maker = await open(codeOf(stem, n), { player: 1, create: true, from });
      const answer = await maker.next();
      maker.close();
      if (answer.type === "error") {
        expect(answer.reason).toBe("code-taken");
        return n;
      }
    }
    return most;
  };

  it("makes exactly as many rooms for an address as the limit says, and still lets it into one that is there", async () => {
    const making = "203.0.113.20";
    const there = await open("LMTAG", { player: 0, create: true });
    await there.next();

    const made = await roomsMadeFrom(making, "LR");
    const guest = await open("LMTAG", { player: 1, from: making });
    const elsewhere = await open("LMTAH", { player: 2, create: true, from: "203.0.113.21" });

    // exactly: a count that is about right is one a script can outrun
    expect(made).toBe(MAKE_SOON.burst);
    expect(await guest.next()).toMatchObject({ type: "lobby", you: 1 });
    expect(await elsewhere.next()).toMatchObject({ type: "lobby", you: 0 });
    for (const client of [there, guest, elsewhere]) client.close();
  });

  it("makes rooms for an address again once the while the limit is kept over has passed", async () => {
    const making = "203.0.113.30";
    expect(await roomsMadeFrom(making, "LT")).toBe(MAKE_SOON.burst);

    advanceClock(MAKE_SOON.windowSeconds * 1000);

    expect(await roomsMadeFrom(making, "LU", 1)).toBe(1);
  });

  it("counts the rooms made from every address of one IPv6 network together", async () => {
    expect(await roomsMadeFrom("2001:db8:7:7::1", "LV")).toBe(MAKE_SOON.burst);

    expect(await roomsMadeFrom("2001:db8:7:7:aaaa:bbbb:cccc:dddd", "LW")).toBe(0);
    expect(await roomsMadeFrom("2001:db8:7:8::1", "LX", 1)).toBe(1);
  });

  it("makes a room once when two ask for the same code at the same moment", async () => {
    const [one, other] = await Promise.all([connect("LMTAK", "", "203.0.113.50"), connect("LMTAK", "", "203.0.113.51")]);
    one.send({ type: "join", token: tokenFor(0), nick: "one", create: true, game: DEFAULT_GAME, listed: false, pings: false });
    other.send({ type: "join", token: tokenFor(1), nick: "other", create: true, game: DEFAULT_GAME, listed: false, pings: false });

    const answers = [await one.next(), await other.next()];

    // the count is asked of the directory while the room waits, and the second request comes in that wait
    expect(answers.filter((answer) => answer.type === "lobby")).toHaveLength(1);
    expect(answers.filter((answer) => answer.type === "error")).toEqual([{ type: "error", reason: "code-taken" }]);
    one.close();
    other.close();
  });

  it("takes one request to join from a connection, and reads no second one sent while the first waits", async () => {
    const client = await connect("LMTAL", "", "203.0.113.60");
    client.send({ type: "join", token: tokenFor(0), nick: "first", create: true, game: DEFAULT_GAME, listed: false, pings: false });
    client.send({ type: "join", token: tokenFor(1), nick: "second", create: true, game: DEFAULT_GAME, listed: false, pings: false });

    const answer = await client.next();
    const guest = await open("LMTAL", { player: 2 });
    const seen = await guest.next();

    // the connection is the first player's, and still is: the room has one maker, here, and no player without a connection
    expect(answer).toMatchObject({ type: "lobby", you: 0, players: [{ slot: 0, nick: "first", connected: true }] });
    expect(seen).toMatchObject({ type: "lobby", you: 1, players: [{ nick: "first", connected: true }, { nick: "p2", connected: true }] });
    client.close();
    guest.close();
  });

  it("makes the room for its maker though someone asks after the same code, not yet there, while it is being made", async () => {
    const [maker, asking] = await Promise.all([connect("LMTAM", "", "203.0.113.61"), connect("LMTAM", "", "203.0.113.62")]);
    maker.send({ type: "join", token: tokenFor(0), nick: "maker", create: true, game: DEFAULT_GAME, listed: false, pings: false });
    asking.send({ type: "join", token: tokenFor(1), nick: "asking", create: false, game: DEFAULT_GAME, listed: false, pings: false });

    const made = await maker.next();
    const guest = await open("LMTAM", { player: 2 });
    const seen = await guest.next();
    const kept = await runInDurableObject(env.GameRoom.get(env.GameRoom.idFromName("LMTAM")), (_object, state) =>
      state.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM room_state").one().n,
    );

    // the one who asked too soon wiped nothing: the room is its maker's, and it is kept
    expect(made).toMatchObject({ type: "lobby", you: 0 });
    expect(seen).toMatchObject({ type: "lobby", you: 1 });
    expect(kept).toBeGreaterThan(0);
    maker.close();
    guest.close();
  });

  it("makes a room for a connection with no address: the limit is a guard, and a test or the Worker itself has none", async () => {
    expect(await roomsMadeFrom(undefined, "LY", MAKE_SOON.burst + 2)).toBe(MAKE_SOON.burst + 2);
  });

  it("closes a connection that never joined when the next one arrives after the deadline", async () => {
    const idle = await connect("AAAAU");
    advanceClock(JOIN_TIMEOUT_MS + 1);

    const a = await open("AAAAU", { player: 0, create: true });
    await a.next();

    expect(await idle.next()).toEqual({ type: "error", reason: "join-timeout" });
    expect(await idle.closed).toBe(CLOSE_REJECTED);
    a.close();
  });

  it("leaves a connection that has not joined alone before the deadline", async () => {
    const idle = await connect("AAAAV");
    advanceClock(JOIN_TIMEOUT_MS - 1000);

    const a = await open("AAAAV", { player: 0, create: true });
    await a.next();

    expect(idle.unreadCount).toBe(0);
    idle.close();
    a.close();
  });

  it("keeps the slot of a player who has been away a short while", async () => {
    const stub = env.GameRoom.getByName("AAAAX");
    const a = await open("AAAAX", { player: 0, create: true });
    const b = await open("AAAAX", { player: 1 });
    await b.next();
    b.close();
    await a.lobbyWhere((l) => connectedBySlot(l)[1] === false);
    await scheduledAlarm(stub);
    advanceClock(AWAY_SLOT_MS - 1000);

    await runDurableObjectAlarm(stub);

    const c = await open("AAAAX", { player: 2 });
    expect(await c.next()).toMatchObject({ you: 2, players: [{ slot: 0 }, { slot: 1, connected: false }, { slot: 2 }] });
    a.close();
    c.close();
  });

  it("frees the slot of a player who has been away too long", async () => {
    const stub = env.GameRoom.getByName("AAAAY");
    const a = await open("AAAAY", { player: 0, create: true });
    const b = await open("AAAAY", { player: 1 });
    await b.next();
    b.close();
    await a.lobbyWhere((l) => connectedBySlot(l)[1] === false);
    await scheduledAlarm(stub);
    advanceClock(AWAY_SLOT_MS + 1);

    await runDurableObjectAlarm(stub);

    const lobby = await a.lobbyWhere((l) => l.players.length === 1);
    expect(lobby.players).toEqual([{ slot: 0, nick: "p0", connected: true, team: 0, leads: false, ready: false, pieces: 0, out: false, top: false, games: 0, wins: 0 }]);
    const c = await open("AAAAY", { player: 2 });
    expect(await c.next()).toMatchObject({ you: 1 });
    a.close();
    c.close();
  });

  it("gives a player who comes back after losing their slot the next free one", async () => {
    const stub = env.GameRoom.getByName("AAAAZ");
    const a = await open("AAAAZ", { player: 0, create: true });
    const b = await open("AAAAZ", { player: 1 });
    await b.next();
    a.close();
    await b.lobbyWhere((l) => connectedBySlot(l)[0] === false);
    await scheduledAlarm(stub);
    advanceClock(AWAY_SLOT_MS + 1);
    await runDurableObjectAlarm(stub);
    await b.lobbyWhere((l) => l.players.length === 1);

    const back = await open("AAAAZ", { player: 0 });

    expect(await back.next()).toMatchObject({ you: 0, players: [{ slot: 0, connected: true }, { slot: 1, connected: true }] });
    b.close();
    back.close();
  });

  it("gives the slot of a player who is away to a newcomer when the room is full", async () => {
    const clients = [await open("AAAA2", { player: 0, create: true })];
    for (let n = 1; n < MOST; n++) {
      clients.push(await open("AAAA2", { player: n }));
    }
    await clients.at(-1)!.next();
    clients[2].close();
    await clients[0].lobbyWhere((l) => connectedBySlot(l)[2] === false);

    const extra = await open("AAAA2", { player: MOST, nick: "new" });

    const lobby = await extra.next();
    expect(lobby).toMatchObject({ type: "lobby", you: 2 });
    expect(lobby.type === "lobby" ? lobby.players : []).toHaveLength(MOST);
    expect(lobby.type === "lobby" ? lobby.players[2] : null).toEqual({ slot: 2, nick: "new", connected: true, team: 0, leads: false, ready: false, pieces: 0, out: false, top: false, games: 0, wins: 0 });
    for (const c of clients.filter((_, n) => n !== 2)) c.close();
    extra.close();
  });

  it("gives the slot of the player away longest to a newcomer first", async () => {
    const clients = [await open("AAAA3", { player: 0, create: true })];
    for (let n = 1; n < MOST; n++) {
      clients.push(await open("AAAA3", { player: n }));
    }
    await clients.at(-1)!.next();
    clients[4].close();
    await clients[0].lobbyWhere((l) => connectedBySlot(l)[4] === false);
    advanceClock(2000);
    clients[1].close();
    await clients[0].lobbyWhere((l) => connectedBySlot(l)[1] === false);

    const extra = await open("AAAA3", { player: MOST });

    expect(await extra.next()).toMatchObject({ type: "lobby", you: 4 });
    for (const c of clients.filter((_, n) => n !== 4 && n !== 1)) c.close();
    extra.close();
  });

  it("keeps a room everyone has dropped from, empty, for whoever has its code", async () => {
    const stub = env.GameRoom.getByName("AAAA4");
    const a = await open("AAAA4", { player: 0, create: true });
    await a.next();
    a.close();
    await scheduledAlarm(stub);
    advanceClock(AWAY_SLOT_MS + 1);
    await runDurableObjectAlarm(stub);

    const friend = await open("AAAA4", { player: 1, nick: "friend" });

    expect(await friend.next()).toMatchObject({
      type: "lobby",
      you: 0,
      players: [{ slot: 0, nick: "friend", connected: true }],
    });
    friend.close();
  });

  it("lets a kept room that everyone has dropped from be made again", async () => {
    const stub = env.GameRoom.getByName("AAAA5");
    const a = await open("AAAA5", { player: 0, create: true, listed: false });
    await a.next();
    a.close();
    await scheduledAlarm(stub);
    advanceClock(AWAY_SLOT_MS + 1);
    await runDurableObjectAlarm(stub);

    const maker = await open("AAAA5", { player: 1, nick: "maker", create: true, listed: true });

    expect(await maker.next()).toMatchObject({
      type: "lobby",
      you: 0,
      listed: true,
      players: [{ slot: 0, nick: "maker", connected: true }],
    });
    maker.close();
  });

  it("still refuses a stranger who tries to make a room whose player is only away", async () => {
    const a = await open("AAAA6", { player: 0, create: true });
    await a.next();
    a.close();

    const stranger = await open("AAAA6", { player: 1, create: true });

    expect(await stranger.next()).toEqual({ type: "error", reason: "code-taken" });
  });

  it("answers a ping, and remembers when", async () => {
    const stub = env.GameRoom.getByName("AAAC2");
    const a = await open("AAAC2", { player: 0, create: true, pings: true });
    await a.next();
    const before = Date.now();

    await a.ping();

    const last = await runInDurableObject(stub, (room) => {
      const [connection] = [...room.getConnections()];
      return (room as unknown as HeardRecord).lastHeardAt(connection);
    });
    expect(a.pongs).toBe(1);
    expect(last).not.toBeNull();
    expect(last!).toBeGreaterThanOrEqual(before - 1000);
    expect(last!).toBeLessThanOrEqual(Date.now() + 1000);
    a.close();
  });

  it("takes the joining of a page that pings as the first it heard from it", async () => {
    const stub = env.GameRoom.getByName("AAAC8");
    const before = Date.now();
    const a = await open("AAAC8", { player: 0, create: true, pings: true });
    await a.next();

    const last = await runInDurableObject(stub, (room) => {
      const [connection] = [...room.getConnections()];
      return (room as unknown as HeardRecord).lastHeardAt(connection);
    });

    expect(last).toBeGreaterThanOrEqual(before);
    expect(last).toBeLessThanOrEqual(Date.now());
    a.close();
  });

  it("keeps no time for a page that does not ping", async () => {
    const stub = env.GameRoom.getByName("AAAD6");
    const a = await open("AAAD6", { player: 0, create: true, pings: false });
    await a.next();

    const last = await runInDurableObject(stub, (room) => {
      const [connection] = [...room.getConnections()];
      return (room as unknown as HeardRecord).lastHeardAt(connection);
    });

    expect(last).toBeNull();
    a.close();
  });

  it("ends a connection whose page said it pings and then never did", async () => {
    const a = await open("AAAD7", { player: 0, create: true });
    const silent = await open("AAAD7", { player: 1, pings: true });
    await silent.next();
    await a.lobbyWhere((l) => l.players.length === 2);
    advanceClock(STALE_MS + 1);

    a.send({ type: "poke" });

    const lobby = await a.lobbyWhere((l) => connectedBySlot(l)[1] === false);
    expect(connectedBySlot(lobby)).toEqual({ 0: true, 1: false });
    expect(await silent.closed).toBe(CLOSE_STALE);
    a.close();
  });

  it("does not end a page that does not ping, however long it is silent", async () => {
    const a = await open("AAAD8", { player: 0, create: true });
    const old = await open("AAAD8", { player: 1, pings: false });
    await old.next();
    await a.lobbyWhere((l) => l.players.length === 2);
    advanceClock(STALE_MS * 5);

    a.send({ type: "poke" });
    const c = await open("AAAD8", { player: 2 });

    expect(await c.next()).toMatchObject({
      type: "lobby",
      players: [{ slot: 0, connected: true }, { slot: 1, connected: true }, { slot: 2, connected: true }],
    });
    a.close();
    old.close();
    c.close();
  });

  it("ends a connection that used to ping and has gone silent, when something next wakes the room", async () => {
    const stub = env.GameRoom.getByName("AAAC3");
    const a = await open("AAAC3", { player: 0, create: true });
    const b = await open("AAAC3", { player: 1 });
    await b.next();
    await a.lobbyWhere((l) => l.players.length === 2);
    await heardWere(stub, { 0: Date.now(), 1: Date.now() - STALE_MS - 1 });

    a.send({ type: "poke" });

    const lobby = await a.lobbyWhere((l) => connectedBySlot(l)[1] === false);
    expect(connectedBySlot(lobby)).toEqual({ 0: true, 1: false });
    expect(await b.closed).toBe(CLOSE_STALE);
    a.close();
  });

  it("keeps a connection whose last ping is within the limit", async () => {
    const stub = env.GameRoom.getByName("AAAC4");
    const a = await open("AAAC4", { player: 0, create: true });
    const b = await open("AAAC4", { player: 1 });
    await b.next();
    await a.lobbyWhere((l) => l.players.length === 2);
    await heardWere(stub, { 0: Date.now(), 1: Date.now() - STALE_MS + 5000 });

    a.send({ type: "poke" });
    const c = await open("AAAC4", { player: 2 });

    expect(await c.next()).toMatchObject({
      type: "lobby",
      players: [{ slot: 0, connected: true }, { slot: 1, connected: true }, { slot: 2, connected: true }],
    });
    a.close();
    b.close();
    c.close();
  });

  it("leaves alone a connection the room keeps no time for", async () => {
    const stub = env.GameRoom.getByName("AAAC5");
    const a = await open("AAAC5", { player: 0, create: true });
    const old = await open("AAAC5", { player: 1 });
    await old.next();
    await a.lobbyWhere((l) => l.players.length === 2);
    await heardWere(stub, { 0: Date.now(), 1: null });

    a.send({ type: "poke" });
    const c = await open("AAAC5", { player: 2 });

    expect(await c.next()).toMatchObject({
      type: "lobby",
      players: [{ slot: 0, connected: true }, { slot: 1, connected: true }, { slot: 2, connected: true }],
    });
    a.close();
    old.close();
    c.close();
  });

  it("looks for silent connections when someone new connects", async () => {
    const stub = env.GameRoom.getByName("AAAC6");
    const a = await open("AAAC6", { player: 0, create: true });
    const b = await open("AAAC6", { player: 1 });
    await b.next();
    await a.lobbyWhere((l) => l.players.length === 2);
    await heardWere(stub, { 0: Date.now(), 1: Date.now() - STALE_MS - 1 });

    const c = await open("AAAC6", { player: 2 });

    const lobby = await c.next();
    expect(lobby.type === "lobby" ? connectedBySlot(lobby) : null).toEqual({ 0: true, 1: false, 2: true });
    expect(await b.closed).toBe(CLOSE_STALE);
    a.close();
    c.close();
  });

  it("looks for silent connections when a timer wakes the room", async () => {
    const stub = env.GameRoom.getByName("AAAC9");
    const a = await open("AAAC9", { player: 0, create: true });
    const b = await open("AAAC9", { player: 1 });
    const c = await open("AAAC9", { player: 2 });
    await c.next();
    await a.lobbyWhere((l) => l.players.length === 3);
    c.close();
    await a.lobbyWhere((l) => connectedBySlot(l)[2] === false);
    await scheduledAlarm(stub);
    await heardWere(stub, { 0: Date.now(), 1: Date.now() - STALE_MS - 1 });

    await runDurableObjectAlarm(stub);

    const lobby = await a.lobbyWhere((l) => connectedBySlot(l)[1] === false);
    expect(connectedBySlot(lobby)).toEqual({ 0: true, 1: false, 2: false });
    expect(await b.closed).toBe(CLOSE_STALE);
    a.close();
  });

  it("lets a player whose connection was ended for silence come back to their slot", async () => {
    const stub = env.GameRoom.getByName("AAAC7");
    const a = await open("AAAC7", { player: 0, create: true });
    const b = await open("AAAC7", { player: 1 });
    await b.next();
    await a.lobbyWhere((l) => l.players.length === 2);
    await heardWere(stub, { 0: Date.now(), 1: Date.now() - STALE_MS - 1 });
    a.send({ type: "poke" });
    await b.closed;
    await heardWere(stub, { 0: Date.now() });

    const back = await open("AAAC7", { player: 1 });

    expect(await back.next()).toMatchObject({ type: "lobby", you: 1, players: [{ connected: true }, { connected: true }] });
    a.close();
    back.close();
  });

  it("refuses a player who changes the room's settings too fast, and keeps what was last accepted", async () => {
    const a = await open("AAAD2", { player: 0, create: true });
    await a.next();
    const limit = roomConfig.messageLimits.setting.burst;

    for (let n = 0; n <= limit; n++) a.send({ type: "listing", listed: n % 2 === 0 });

    for (;;) {
      const message = await a.next();
      if (message.type !== "refused") continue;
      expect(message).toEqual({ type: "refused", reason: "too-fast" });
      break;
    }
    const b = await open("AAAD2", { player: 1 });
    // the last change accepted was the limit-th: put on the list when that count is odd
    expect(await b.next()).toMatchObject({ type: "lobby", listed: limit % 2 === 1 });
    a.close();
    b.close();
  });

  it("lets a player change settings again once the window has passed", async () => {
    const a = await open("AAAD3", { player: 0, create: true });
    await a.next();
    for (let n = 0; n <= roomConfig.messageLimits.setting.burst; n++) a.send({ type: "listing", listed: n % 2 === 0 });
    for (;;) if ((await a.next()).type === "refused") break;
    advanceClock(roomConfig.messageLimits.setting.windowSeconds * 1000 + 1);
    const longest = Math.max(...roomConfig.turnSecondsChoices);

    a.send({ type: "clock", seconds: longest });

    expect(await a.lobbyWhere((l) => l.turnSeconds === longest)).toMatchObject({ turnSeconds: longest });
    a.close();
  });

  it("goes on refusing changes of setting until the whole window has passed", async () => {
    const a = await open("AAAG2", { player: 0, create: true });
    await a.next();
    const longest = Math.max(...roomConfig.turnSecondsChoices);
    for (let n = 0; n <= roomConfig.messageLimits.setting.burst; n++) a.send({ type: "listing", listed: n % 2 === 0 });
    for (;;) if ((await a.next()).type === "refused") break;
    advanceClock(roomConfig.messageLimits.setting.windowSeconds * 1000 - 1000);

    a.send({ type: "clock", seconds: longest });

    for (;;) {
      const message = await a.next();
      if (message.type === "lobby") expect(message.turnSeconds).not.toBe(longest);
      if (message.type !== "refused") continue;
      expect(message).toEqual({ type: "refused", reason: "too-fast" });
      break;
    }
    a.close();
  });

  it("counts each player's messages apart", async () => {
    const a = await open("AAAD4", { player: 0, create: true });
    const b = await open("AAAD4", { player: 1 });
    await b.next();
    await a.lobbyWhere((l) => l.players.length === 2);
    for (let n = 0; n <= roomConfig.messageLimits.setting.burst; n++) a.send({ type: "listing", listed: n % 2 === 0 });
    for (;;) if ((await a.next()).type === "refused") break;

    b.send({ type: "listing", listed: true });

    // the room looked at what was asked and refused it for its own reason: the other player's count is not this one's
    for (;;) {
      const message = await b.next();
      if (message.type !== "refused") continue;
      expect(message).toEqual({ type: "refused", reason: "not-host" });
      break;
    }
    a.close();
    b.close();
  });

  it("counts each sort of message apart", async () => {
    const a = await open("AAAD5", { player: 0, create: true });
    await a.next();
    const longest = Math.max(...roomConfig.turnSecondsChoices);
    // as many messages of another sort as would use up the settings' own allowance
    for (let n = 0; n < roomConfig.messageLimits.setting.burst; n++) a.send({ type: "voice", on: false, muted: false });

    a.send({ type: "clock", seconds: longest });

    expect(await a.lobbyWhere((l) => l.turnSeconds === longest)).toMatchObject({ turnSeconds: longest });
    a.close();
  });

  it("tells two connections apart even when they come with the same connection id", async () => {
    const a = await connect("AAAE2", "?_pk=same-id");
    a.send({ type: "join", token: tokenFor(0), nick: "p0", create: true, game: DEFAULT_GAME, listed: false, pings: false });
    const b = await connect("AAAE2", "?_pk=same-id");
    b.send({ type: "join", token: tokenFor(1), nick: "p1", create: false, game: DEFAULT_GAME, listed: false, pings: false });
    await b.next();
    await a.lobbyWhere((l) => l.players.length === 2);

    b.close();

    const lobby = await a.lobbyWhere((l) => connectedBySlot(l)[1] === false);
    expect(connectedBySlot(lobby)).toEqual({ 0: true, 1: false });
    a.close();
  });

  it("keeps a player connected when an older connection of theirs ends, as after a reconnect", async () => {
    const a = await open("AAAE3", { player: 0, create: true });
    await a.next();
    // a page that reconnects comes back with the connection id it had before
    const older = await connect("AAAE3", "?_pk=one-page");
    older.send({ type: "join", token: tokenFor(1), nick: "p1", create: false, game: DEFAULT_GAME, listed: false, pings: false });
    await older.next();
    const newer = await connect("AAAE3", "?_pk=one-page");
    newer.send({ type: "join", token: tokenFor(1), nick: "p1", create: false, game: DEFAULT_GAME, listed: false, pings: false });
    await newer.next();

    older.close();
    await older.closed;
    a.send({ type: "chat", text: "after the older one closed" });

    // nothing the room said between the close and this line may show the player as gone
    for (;;) {
      const message = await a.next();
      if (message.type === "lobby") expect(connectedBySlot(message)).toEqual({ 0: true, 1: true });
      if (message.type === "chat") break;
    }
    a.close();
    newer.close();
  });

  it("does not obey a connection whose slot is someone else's now", async () => {
    const stub = env.GameRoom.getByName("AAAE4");
    const a = await open("AAAE4", { player: 0, nick: "ann", create: true });
    const b = await open("AAAE4", { player: 1, nick: "bob" });
    await b.next();
    await a.lobbyWhere((l) => l.players.length === 2);
    b.send({ type: "leave" });
    await b.closed;
    await a.lobbyWhere((l) => l.players.length === 1);
    const c = await open("AAAE4", { player: 2, nick: "cat" });
    expect(await c.next()).toMatchObject({ type: "lobby", you: 1 });
    // A page can keep its socket open after leaving and go on sending. The
    // test's own socket cannot, so a spare connection is given what such a
    // socket remembers: the slot, and whose it was.
    const stale = await connect("AAAE4");
    await runInDurableObject(stub, (room) => {
      for (const connection of room.getConnections<{ kind: string }>()) {
        if (connection.state?.kind === "pending") {
          (connection as { setState(state: unknown): void }).setState({
            kind: "player",
            slot: 1,
            token: tokenFor(1),
            since: Date.now(),
            pings: false,
          });
        }
      }
    });

    stale.sendRaw(JSON.stringify({ type: "chat", text: "said through a stale socket" }));
    stale.sendRaw(JSON.stringify({ type: "leave" }));
    a.send({ type: "chat", text: "said by ann" });

    for (;;) {
      const message = await a.next();
      if (message.type !== "chat") continue;
      expect(message).toMatchObject({ from: 0, nick: "ann", text: "said by ann" });
      break;
    }
    const d = await open("AAAE4", { player: 3 });
    const lobby = await d.next();
    expect(lobby.type === "lobby" ? lobby.players.map((p) => p.nick) : []).toEqual(["ann", "cat", "p3"]);
    a.close();
    c.close();
    d.close();
    stale.close();
  });

  it("keeps as host the player who came first when a latecomer takes a lower slot", async () => {
    const a = await open("AAAF2", { player: 0, nick: "ann", create: true });
    const b = await open("AAAF2", { player: 1, nick: "bob" });
    await b.next();
    await a.lobbyWhere((l) => l.players.length === 2);
    a.send({ type: "leave" });
    await a.closed;
    await b.lobbyWhere((l) => l.players.length === 1);
    const longest = Math.max(...roomConfig.turnSecondsChoices);

    const c = await open("AAAF2", { player: 2, nick: "cat" });
    const seenByC = await c.next();
    c.send({ type: "clock", seconds: longest });
    c.send({ type: "start", bots: true });

    // the newcomer sits where the first host sat, and is not host for it
    expect(seenByC).toMatchObject({ type: "lobby", you: 0, host: 1 });
    for (const reason of ["not-host", "not-host"]) {
      for (;;) {
        const message = await c.next();
        if (message.type !== "refused") continue;
        expect(message).toEqual({ type: "refused", reason });
        break;
      }
    }
    b.send({ type: "clock", seconds: longest });
    expect(await b.lobbyWhere((l) => l.turnSeconds === longest)).toMatchObject({ host: 1, turnSeconds: longest });
    b.close();
    c.close();
  });

  it("passes the host on to whoever has been in the room longest when the host drops", async () => {
    const a = await open("AAAF3", { player: 0, create: true });
    const b = await open("AAAF3", { player: 1 });
    await b.next();
    const c = await open("AAAF3", { player: 2 });
    await c.next();
    await a.lobbyWhere((l) => l.players.length === 3);

    a.close();

    expect(await c.lobbyWhere((l) => connectedBySlot(l)[0] === false)).toMatchObject({ host: 1 });
    b.close();
    c.close();
  });

  it("leaves nothing stored and no alarm once the last player has left", async () => {
    const stub = env.GameRoom.getByName("AAAF4");
    const a = await open("AAAF4", { player: 0, create: true });
    await a.next();
    // a game with a limit on its turns, so the room has something stored and an alarm set
    a.send({ type: "clock", seconds: Math.min(...roomConfig.turnSecondsChoices.filter((choice) => choice > 0)) });
    a.send({ type: "start", bots: true });
    await scheduledAlarm(stub);

    a.send({ type: "leave" });
    await a.closed;

    const left = await vi.waitFor(async () => {
      const found = await runInDurableObject(stub, async (_room, state) => ({
        tables: state.storage.sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").toArray().map((row) => row.name),
        alarm: await state.storage.getAlarm(),
      }));
      expect(found.alarm).toBeNull();
      expect(found.tables.filter((name) => name === "room_state" || name === "timers")).toEqual([]);
      return found;
    });
    expect(left.alarm).toBeNull();
  });

  it("leaves nothing stored when a room that does not exist is asked for", async () => {
    const stub = env.GameRoom.getByName("AAAF5");

    const a = await open("AAAF5", { player: 0 });
    expect(await a.next()).toEqual({ type: "error", reason: "not-found" });
    await a.closed;

    const tables = await vi.waitFor(async () => {
      const names = await runInDurableObject(stub, (_room, state) =>
        state.storage.sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").toArray().map((row) => row.name),
      );
      expect(names.filter((name) => name === "room_state" || name === "timers")).toEqual([]);
      return names;
    });
    expect(tables).not.toContain("room_state");
  });

  it("leaves nothing stored when a connection opened ahead to a room nobody made is let go", async () => {
    const stub = env.GameRoom.getByName("AAAH4");

    // what a page does while its form for a new room is on show: a connection, and nothing said on it
    const ahead = await connect("AAAH4");
    ahead.close();
    await ahead.closed;

    const tables = await vi.waitFor(async () => {
      const names = await runInDurableObject(stub, (_room, state) =>
        state.storage.sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").toArray().map((row) => row.name),
      );
      expect(names.filter((name) => name === "room_state" || name === "timers")).toEqual([]);
      return names;
    });
    expect(tables).not.toContain("room_state");
  });

  it("keeps a room nobody has made yet while another connection opened ahead to it is still open", async () => {
    const first = await connect("AAAH2");
    const second = await connect("AAAH2");
    first.close();
    await first.closed;

    // the one still open makes the room, as if nothing had been let go beside it
    second.send({ type: "join", token: "token-of-the-one-who-stayed", nick: "Stayed", create: true, game: DEFAULT_GAME, listed: false, pings: false });
    expect(await second.next()).toMatchObject({ type: "lobby", you: 0 });
    second.close();
  });

  it("keeps a room with someone in it when a connection that never joined is let go", async () => {
    const stub = env.GameRoom.getByName("AAAH3");
    const a = await open("AAAH3", { player: 0, create: true });
    await a.next();

    const ahead = await connect("AAAH3");
    ahead.close();
    await ahead.closed;

    // the room answers its player as before, and what it kept is still there
    const seconds = Math.min(...roomConfig.turnSecondsChoices.filter((choice) => choice > 0));
    a.send({ type: "clock", seconds });
    expect(await a.lobbyWhere((lobby) => lobby.turnSeconds === seconds)).toMatchObject({ you: 0 });
    const kept = await runInDurableObject(stub, (_room, state) =>
      state.storage.sql.exec<{ k: string }>("SELECT k FROM room_state").toArray().map((row) => row.k),
    );
    expect(kept).toContain("lobby");
    a.close();
  });

  it("can be made again under the same code after it has been wiped", async () => {
    const a = await open("AAAF6", { player: 0, create: true });
    await a.next();
    a.send({ type: "leave" });
    await a.closed;

    const again = await open("AAAF6", { player: 1, nick: "new", create: true, listed: true });

    expect(await again.next()).toMatchObject({
      type: "lobby",
      you: 0,
      listed: true,
      players: [{ slot: 0, nick: "new", connected: true }],
    });
    again.close();
  });

  it("starts waiting to be cleared when the last connected player leaves and only away players remain", async () => {
    const stub = env.GameRoom.getByName("AAAF7");
    const a = await open("AAAF7", { player: 0, create: true });
    const b = await open("AAAF7", { player: 1 });
    await b.next();
    b.close();
    await a.lobbyWhere((l) => connectedBySlot(l)[1] === false);

    a.send({ type: "leave" });
    await a.closed;
    advanceClock(EMPTY_ROOM_TTL_MS + 1);
    await scheduledAlarm(stub);
    await runDurableObjectAlarm(stub);

    const late = await open("AAAF7", { player: 2 });
    expect(await late.next()).toEqual({ type: "error", reason: "not-found" });
  });

  it("starts waiting to be cleared on waking, when it was cut off without being told", async () => {
    const stub = env.GameRoom.getByName("AAAF8");
    const a = await open("AAAF8", { player: 0, create: true });
    await a.next();
    a.close();
    await scheduledAlarm(stub);
    // what a deploy leaves behind: the room and its player stored, every
    // connection gone, and no countdown to clearing it ever set
    await runInDurableObject(stub, async (_room, state) => {
      state.storage.sql.exec("DELETE FROM timers");
      await state.storage.deleteAlarm();
    });
    await evictDurableObject(stub);

    // anything that wakes the room: here, a connection that never joins
    const probe = await connect("AAAF8");

    const due = await scheduledAlarm(stub);
    expect(due).toBeGreaterThan(Date.now());
    advanceClock(EMPTY_ROOM_TTL_MS + 1);
    probe.close();
    await runDurableObjectAlarm(stub);
    const late = await open("AAAF8", { player: 1 });
    expect(await late.next()).toEqual({ type: "error", reason: "not-found" });
  });

  it("gives every connection an id of its own, whatever id it came with", async () => {
    const stub = env.GameRoom.getByName("AAAG3");
    const a = await connect("AAAG3", "?_pk=chosen-by-the-page");
    const b = await connect("AAAG3", "?_pk=chosen-by-the-page");
    a.send({ type: "join", token: tokenFor(0), nick: "p0", create: true, game: DEFAULT_GAME, listed: false, pings: false });
    await a.next();

    const ids = await runInDurableObject(stub, (room) => [...room.getConnections()].map((connection) => connection.id));

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain("chosen-by-the-page");
    a.close();
    b.close();
  });

  it("does not carry on with a stored game it does not know the version of", async () => {
    const stub = env.GameRoom.getByName("AAAG4");
    const a = await open("AAAG4", { player: 0, create: true });
    await a.next();
    a.send({ type: "start", bots: true });
    for (;;) if ((await a.next()).type === "game") break;
    a.close();
    await a.closed;
    await runInDurableObject(stub, (_room, state) => {
      state.storage.sql.exec("UPDATE room_state SET v = json_set(v, '$.state.version', 99) WHERE k = 'game'");
    });
    await evictDurableObject(stub);

    const back = await open("AAAG4", { player: 0 });
    await back.next();
    back.send({ type: "chat", text: "after coming back" });

    // everything the room said up to the echo of that line: no game among it
    const types: string[] = [];
    for (;;) {
      const message = await back.next();
      types.push(message.type);
      if (message.type === "chat") break;
    }
    expect(types).not.toContain("game");
    const stored = await runInDurableObject(stub, (_room, state) =>
      state.storage.sql.exec<{ k: string }>("SELECT k FROM room_state").toArray().map((row) => row.k),
    );
    expect(stored).not.toContain("game");
    back.close();
  });

  it("ignores a second join on a seated connection", async () => {
    const a = await open("AAAAW", { player: 0, nick: "ann", create: true });
    await a.next();
    const b = await open("AAAAW", { player: 1 });
    await b.next();
    await a.lobbyWhere((l) => l.players.length === 2);

    a.send({ type: "join", token: tokenFor(5), nick: "imp", create: false, game: DEFAULT_GAME, listed: false, pings: false });
    b.send({ type: "leave" });

    const lobby = await a.lobbyWhere((l) => l.players.length === 1);
    expect(lobby.players).toEqual([{ slot: 0, nick: "ann", connected: true, team: 0, leads: false, ready: false, pieces: 0, out: false, top: false, games: 0, wins: 0 }]);
    a.close();
  });
});

describe("GameRoom: being ready, and the host", () => {
  /** The alarm the room has set, or `null` when it waits for nothing. */
  const alarmOf = (stub: DurableObjectStub): Promise<number | null> => runInDurableObject(stub, (_room, state) => state.storage.getAlarm());

  /** Moves the clock to the alarm the room has set and runs it. */
  async function runNextAlarm(stub: DurableObjectStub): Promise<void> {
    const due = await scheduledAlarm(stub);
    advanceClock(Math.max(0, due - Date.now()) + 1);
    expect(await runDurableObjectAlarm(stub), "the alarm the room has set").toBe(true);
  }

  it("shows everyone a player who says they are ready, and that they no longer are", async () => {
    const a = await open("RDYAA", { player: 0, create: true });
    const b = await open("RDYAA", { player: 1 });
    await a.lobbyOf(2);

    b.send({ type: "ready", ready: true });

    expect((await a.lobbyWhere((l) => l.players.some((p) => p.ready))).players.map((p) => p.ready)).toEqual([false, true]);
    expect((await b.lobbyWhere((l) => l.players.some((p) => p.ready))).players.map((p) => p.ready)).toEqual([false, true]);
    b.send({ type: "ready", ready: false });
    expect((await a.lobbyWhere((l) => l.players.every((p) => !p.ready))).players.map((p) => p.ready)).toEqual([false, false]);
    a.close();
    b.close();
  });

  it("does not take the host's word that they are ready: the host starts", async () => {
    const a = await open("RDYAB", { player: 0, create: true });
    const b = await open("RDYAB", { player: 1 });
    await a.lobbyOf(2);

    a.send({ type: "ready", ready: true });
    b.send({ type: "ready", ready: true });

    // the room answers in the order it was asked: had it taken the host's word, that would have been said first
    expect((await a.lobbyWhere()).players.map((p) => p.ready)).toEqual([false, true]);
    a.close();
    b.close();
  });

  it("takes back everyone's word once a game has started", async () => {
    const a = await open("RDYAC", { player: 0, create: true, game: ALONE_GAME });
    const b = await open("RDYAC", { player: 1, game: ALONE_GAME });
    await a.lobbyOf(2);
    b.send({ type: "ready", ready: true });
    await a.lobbyWhere((l) => l.players.some((p) => p.ready));

    a.send({ type: "start", bots: false });

    expect((await a.lobbyWhere()).players.map((p) => p.ready)).toEqual([false, false]);
    await a.nextOf("game");
    a.close();
    b.close();
  });

  it("makes another player the host when the host says so", async () => {
    const a = await open("RDYAD", { player: 0, create: true });
    const b = await open("RDYAD", { player: 1 });
    await a.lobbyOf(2);
    b.send({ type: "ready", ready: true });
    await a.lobbyWhere((l) => l.players.some((p) => p.ready));

    a.send({ type: "host", to: 1 });

    const lobby = await b.lobbyWhere((l) => l.host === 1);
    // the new host starts, and is no longer someone who waits to
    expect(lobby.players.map((p) => p.ready)).toEqual([false, false]);
    expect(await a.lobbyWhere((l) => l.host === 1)).toMatchObject({ host: 1, you: 0 });
    a.close();
    b.close();
  });

  it("keeps the host it was given when the one before comes back", async () => {
    const a = await open("RDYAE", { player: 0, create: true });
    const b = await open("RDYAE", { player: 1 });
    await a.lobbyOf(2);
    a.send({ type: "host", to: 1 });
    await b.lobbyWhere((l) => l.host === 1);
    a.close();
    await b.lobbyWhere((l) => !l.players[0].connected);

    const back = await open("RDYAE", { player: 0 });

    expect(await back.lobbyWhere()).toMatchObject({ host: 1, you: 0 });
    back.close();
    b.close();
  });

  it("refuses to pass the host on for someone who is not the host", async () => {
    const a = await open("RDYAF", { player: 0, create: true });
    const b = await open("RDYAF", { player: 1 });
    await a.lobbyOf(2);
    await b.lobbyOf(2);

    b.send({ type: "host", to: 1 });

    expect(await b.refusal()).toEqual({ type: "refused", reason: "not-host" });
    a.close();
    b.close();
  });

  it("refuses to pass the host to oneself, to an empty place, or to someone who is away", async () => {
    const a = await open("RDYAG", { player: 0, create: true });
    const b = await open("RDYAG", { player: 1 });
    await a.lobbyOf(2);
    b.close();
    await a.lobbyWhere((l) => !l.players[1].connected);

    a.send({ type: "host", to: 0 });
    expect(await a.refusal()).toEqual({ type: "refused", reason: "bad-setting" });
    a.send({ type: "host", to: 5 });
    expect(await a.refusal()).toEqual({ type: "refused", reason: "bad-setting" });
    a.send({ type: "host", to: 1 });
    expect(await a.refusal()).toEqual({ type: "refused", reason: "bad-setting" });
    a.close();
  });

  it("sends a player out when the host says so, and does not let them back in", async () => {
    const a = await open("RDYAH", { player: 0, create: true });
    const b = await open("RDYAH", { player: 1 });
    const c = await open("RDYAH", { player: 2 });
    await a.lobbyOf(3);
    await c.lobbyOf(3);

    a.send({ type: "kick", slot: 1 });

    expect(await b.nextOf("error")).toEqual({ type: "error", reason: "kicked" });
    expect(await b.closed).toBe(CLOSE_REJECTED);
    // those who stay are told the player was sent out, and then of the room without them: what comes next is that room
    expect(await a.nextOf("sent-out")).toEqual({ type: "sent-out", slot: 1 });
    const next = await a.next();
    expect(next.type === "lobby" ? next.players.map((p) => p.slot) : next.type).toEqual([0, 2]);
    expect(await c.nextOf("sent-out")).toEqual({ type: "sent-out", slot: 1 });
    expect((await c.lobbyWhere((l) => l.players.length === 2)).players.map((p) => p.slot)).toEqual([0, 2]);
    const back = await open("RDYAH", { player: 1 });
    expect(await back.next()).toEqual({ type: "error", reason: "kicked" });
    expect(await back.closed).toBe(CLOSE_REJECTED);
    // the place is free for someone else
    const d = await open("RDYAH", { player: 3 });
    expect(await d.lobbyWhere()).toMatchObject({ you: 1 });
    a.close();
    c.close();
    d.close();
  });

  it("still keeps out a player it sent out after the room has slept", async () => {
    const stub = env.GameRoom.getByName("RDYAJ");
    const a = await open("RDYAJ", { player: 0, create: true });
    const b = await open("RDYAJ", { player: 1 });
    await a.lobbyOf(2);
    a.send({ type: "kick", slot: 1 });
    await b.closed;
    await a.lobbyWhere((l) => l.players.length === 1);
    a.close();
    await a.closed;

    await evictDurableObject(stub);

    const back = await open("RDYAJ", { player: 1 });
    expect(await back.next()).toEqual({ type: "error", reason: "kicked" });
  });

  it("refuses to send anyone out for someone who is not the host", async () => {
    const a = await open("RDYAK", { player: 0, create: true });
    const b = await open("RDYAK", { player: 1 });
    await a.lobbyOf(2);
    await b.lobbyOf(2);

    b.send({ type: "kick", slot: 0 });

    expect(await b.refusal()).toEqual({ type: "refused", reason: "not-host" });
    a.send({ type: "kick", slot: 0 });
    expect(await a.refusal()).toEqual({ type: "refused", reason: "bad-setting" });
    a.send({ type: "kick", slot: 5 });
    expect(await a.refusal()).toEqual({ type: "refused", reason: "bad-setting" });
    a.close();
    b.close();
  });

  it("sends nobody out of a game that is being played", async () => {
    const a = await open("RDYAL", { player: 0, create: true, game: ALONE_GAME });
    const b = await open("RDYAL", { player: 1, game: ALONE_GAME });
    await a.lobbyOf(2);
    a.send({ type: "start", bots: false });
    await a.nextOf("game");

    a.send({ type: "kick", slot: 1 });

    expect(await a.refusal()).toEqual({ type: "refused", reason: "already-playing" });
    a.close();
    b.close();
  });

  it("asks the host whether they are there once everyone else has been ready a while, and passes on with no answer", async () => {
    const stub = env.GameRoom.getByName("RDYAM");
    const a = await open("RDYAM", { player: 0, create: true, game: ALONE_GAME });
    const b = await open("RDYAM", { player: 1, game: ALONE_GAME });
    const c = await open("RDYAM", { player: 2, game: ALONE_GAME });
    await a.lobbyOf(3);
    c.send({ type: "ready", ready: true });
    await a.lobbyWhere((l) => l.players[2].ready);
    // not yet: one of the others is not ready
    expect(await alarmOf(stub)).toBeNull();
    const since = Date.now();
    b.send({ type: "ready", ready: true });
    await a.lobbyWhere((l) => l.players[1].ready);

    expect(await scheduledAlarm(stub)).toBeGreaterThanOrEqual(since + HOST_IDLE_MS);
    await runNextAlarm(stub);

    expect(await a.nextOf("host-check")).toEqual({ type: "host-check" });
    const asked = Date.now();
    expect(await scheduledAlarm(stub)).toBeLessThanOrEqual(asked + HOST_ANSWER_MS);
    await runNextAlarm(stub);
    // of those ready, the one who came in first; the host it left is still in the room
    expect(await c.lobbyWhere((l) => l.host !== 0)).toMatchObject({ host: 1 });
    expect((await a.lobbyWhere((l) => l.host !== 0)).players.map((p) => p.slot)).toEqual([0, 1, 2]);
    // and the room no longer waits: its old host is not ready
    expect(await alarmOf(stub)).toBeNull();
    a.close();
    b.close();
    c.close();
  });

  it("does not wait on the host of a room with fewer players than its game takes", async () => {
    const stub = env.GameRoom.getByName("RDYAT");
    const a = await open("RDYAT", { player: 0, create: true });
    const b = await open("RDYAT", { player: 1 });
    await a.lobbyOf(2);

    b.send({ type: "ready", ready: true });
    await a.lobbyWhere((l) => l.players[1].ready);
    // the room has answered what was asked of it up to here
    b.say("ready when you are");
    await b.nextOf("chat");

    expect(GAMES[DEFAULT_GAME].minPlayers).toBeGreaterThan(2);
    expect(await alarmOf(stub)).toBeNull();
    a.close();
    b.close();
  });

  it("asks only the host", async () => {
    const stub = env.GameRoom.getByName("RDYAN");
    const a = await open("RDYAN", { player: 0, create: true, game: ALONE_GAME });
    const b = await open("RDYAN", { player: 1, game: ALONE_GAME });
    await a.lobbyOf(2);
    await b.lobbyOf(2);
    b.send({ type: "ready", ready: true });
    await b.lobbyWhere((l) => l.players[1].ready);

    await runNextAlarm(stub);
    await a.nextOf("host-check");
    // what the room says next to the other player is that the room has passed to them, with nothing before it
    await runNextAlarm(stub);

    expect(await b.next()).toMatchObject({ type: "lobby", host: 1 });
    a.close();
    b.close();
  });

  it("leaves the room with a host whose page answers, and asks again later", async () => {
    const stub = env.GameRoom.getByName("RDYAP");
    const a = await open("RDYAP", { player: 0, create: true, game: ALONE_GAME });
    const b = await open("RDYAP", { player: 1, game: ALONE_GAME });
    await a.lobbyOf(2);
    b.send({ type: "ready", ready: true });
    await a.lobbyWhere((l) => l.players[1].ready);
    await runNextAlarm(stub);
    await a.nextOf("host-check");
    const answered = Date.now();

    a.send({ type: "here" });

    // the wait starts over, a whole one
    await vi.waitFor(async () => expect(await alarmOf(stub)).toBeGreaterThanOrEqual(answered + HOST_IDLE_MS));
    await runNextAlarm(stub);
    expect(await a.nextOf("host-check")).toEqual({ type: "host-check" });
    // nothing was said of another host in between
    b.send({ type: "ready", ready: false });
    expect(await b.lobbyWhere((l) => !l.players[1].ready)).toMatchObject({ host: 0 });
    a.close();
    b.close();
  });

  it("does not take an answer from anyone but the host", async () => {
    const stub = env.GameRoom.getByName("RDYAQ");
    const a = await open("RDYAQ", { player: 0, create: true, game: ALONE_GAME });
    const b = await open("RDYAQ", { player: 1, game: ALONE_GAME });
    await a.lobbyOf(2);
    b.send({ type: "ready", ready: true });
    await a.lobbyWhere((l) => l.players[1].ready);
    await runNextAlarm(stub);
    await a.nextOf("host-check");

    b.send({ type: "here" });
    b.say("still waiting");
    await b.nextOf("chat");

    await runNextAlarm(stub);
    expect(await b.lobbyWhere((l) => l.host !== 0)).toMatchObject({ host: 1 });
    a.close();
    b.close();
  });

  it("stops waiting on the host when someone is no longer ready", async () => {
    const stub = env.GameRoom.getByName("RDYAR");
    const a = await open("RDYAR", { player: 0, create: true, game: ALONE_GAME });
    const b = await open("RDYAR", { player: 1, game: ALONE_GAME });
    await a.lobbyOf(2);
    b.send({ type: "ready", ready: true });
    await a.lobbyWhere((l) => l.players[1].ready);
    await scheduledAlarm(stub);

    b.send({ type: "ready", ready: false });
    await a.lobbyWhere((l) => !l.players[1].ready);

    await vi.waitFor(async () => expect(await alarmOf(stub)).toBeNull());
    a.close();
    b.close();
  });

  it("does not ask the host while a game is being played", async () => {
    const stub = env.GameRoom.getByName("RDYAS");
    const a = await open("RDYAS", { player: 0, create: true, game: ALONE_GAME });
    const b = await open("RDYAS", { player: 1, game: ALONE_GAME });
    await a.lobbyOf(2);
    b.send({ type: "ready", ready: true });
    await a.lobbyWhere((l) => l.players[1].ready);
    await scheduledAlarm(stub);

    a.send({ type: "start", bots: false });
    await a.nextOf("game");

    // the room keeps its waits by name: the one for its host is gone, whatever the game has set for itself
    const waits = await runInDurableObject(stub, (room) => {
      const timers = (room as unknown as { timers: { get(kind: string): number | null } }).timers;
      return [timers.get("host"), timers.get("host-answer")];
    });
    expect(waits).toEqual([null, null]);
    a.close();
    b.close();
  });
});

describe("GameRoom: another game for the room", () => {
  /** A game one player can start other than `ALONE_GAME`, and the game with the fewest places. */
  const OTHER_ALONE_GAME = GAME_IDS.find((id) => id !== ALONE_GAME && GAMES[id].minPlayers === 1)!;
  const SMALL_GAME = GAME_IDS.reduce((least, id) => (GAMES[id].maxPlayers < GAMES[least].maxPlayers ? id : least));

  it("makes the room one for the game the host picks, and tells everyone", async () => {
    const a = await open("PCKAA", { player: 0, create: true });
    const b = await open("PCKAA", { player: 1 });
    await a.lobbyOf(2);
    await b.lobbyOf(2);

    a.send({ type: "pick", game: BIG_GAME });

    expect(await a.lobbyWhere((l) => l.game !== DEFAULT_GAME)).toMatchObject({ game: BIG_GAME, maxPlayers: holds(BIG_GAME), host: 0 });
    expect(await b.lobbyWhere((l) => l.game !== DEFAULT_GAME)).toMatchObject({ game: BIG_GAME, maxPlayers: holds(BIG_GAME), you: 1 });
    a.close();
    b.close();
  });

  it("is still the room of the game picked after it has slept", async () => {
    const stub = env.GameRoom.getByName("PCKAB");
    const a = await open("PCKAB", { player: 0, create: true });
    await a.lobbyOf(1);
    a.send({ type: "pick", game: BIG_GAME });
    await a.lobbyWhere((l) => l.game === BIG_GAME);
    a.close();
    await a.closed;

    await evictDurableObject(stub);

    const back = await open("PCKAB", { player: 0 });
    expect(await back.lobbyWhere()).toMatchObject({ game: BIG_GAME });
    back.close();
  });

  it("takes back everyone's word that they are ready: it was for another game", async () => {
    const a = await open("PCKAC", { player: 0, create: true });
    const b = await open("PCKAC", { player: 1 });
    await a.lobbyOf(2);
    b.send({ type: "ready", ready: true });
    await a.lobbyWhere((l) => l.players[1].ready);

    a.send({ type: "pick", game: BIG_GAME });

    expect((await b.lobbyWhere((l) => l.game === BIG_GAME)).players.map((p) => p.ready)).toEqual([false, false]);
    a.close();
    b.close();
  });

  it("refuses another game from someone who is not the host", async () => {
    const a = await open("PCKAD", { player: 0, create: true });
    const b = await open("PCKAD", { player: 1 });
    await a.lobbyOf(2);
    await b.lobbyOf(2);

    b.send({ type: "pick", game: BIG_GAME });

    expect(await b.refusal()).toEqual({ type: "refused", reason: "not-host" });
    const c = await open("PCKAD", { player: 2 });
    expect(await c.lobbyWhere()).toMatchObject({ game: DEFAULT_GAME });
    a.close();
    b.close();
    c.close();
  });

  it("refuses another game while one is being played", async () => {
    const a = await open("PCKAE", { player: 0, create: true, game: ALONE_GAME });
    await a.lobbyOf(1);
    a.send({ type: "start", bots: false });
    await a.nextOf("game");

    a.send({ type: "pick", game: OTHER_ALONE_GAME });

    expect(await a.refusal()).toEqual({ type: "refused", reason: "already-playing" });
    a.close();
  });

  it("refuses a game with fewer places than are taken", async () => {
    const most = holds(SMALL_GAME);
    const clients = [await open("PCKAF", { player: 0, create: true, game: BIG_GAME })];
    for (let n = 1; n <= most; n++) clients.push(await open("PCKAF", { player: n, game: BIG_GAME }));
    await clients[0].lobbyOf(most + 1);

    clients[0].send({ type: "pick", game: SMALL_GAME });

    expect(holds(BIG_GAME)).toBeGreaterThan(most);
    expect(await clients[0].refusal()).toEqual({ type: "refused", reason: "bad-setting" });
    for (const client of clients) client.close();
  });

  it("lets go of the end of the last game, and starts a game of the one picked", async () => {
    const stub = env.GameRoom.getByName("PCKAG");
    const a = await open("PCKAG", { player: 0, create: true, game: ALONE_GAME });
    await a.lobbyOf(1);
    a.send({ type: "start", bots: false });
    await a.cubesWhere();
    await scheduledAlarm(stub);
    advanceClock(cubesConfig.problemSeconds * 1000 + 1);
    await runDurableObjectAlarm(stub);
    await a.cubesWhere((game) => game.view.phase === "ended");

    a.send({ type: "pick", game: OTHER_ALONE_GAME });
    await a.lobbyWhere((l) => l.game === OTHER_ALONE_GAME);

    const stored = await runInDurableObject(stub, (_room, state) =>
      state.storage.sql.exec<{ k: string }>("SELECT k FROM room_state").toArray().map((row) => row.k),
    );
    expect(stored).not.toContain("game");
    // someone who comes in now is told of no game: the one that ended was of the game the room had
    const b = await open("PCKAG", { player: 1, game: ALONE_GAME });
    b.say("hello");
    const types: string[] = [];
    for (;;) {
      const message = await b.next();
      types.push(message.type);
      if (message.type === "chat") break;
    }
    expect(types).not.toContain("game");
    a.send({ type: "start", bots: false });
    expect(await a.nextOf("game")).toMatchObject({ game: OTHER_ALONE_GAME });
    a.close();
    b.close();
  });

  it("writes to the log which game the room turned to, and from which", async () => {
    const said = vi.spyOn(console, "log").mockImplementation(() => {});
    const a = await open("PCKAH", { player: 0, create: true });
    await a.lobbyOf(1);

    a.send({ type: "pick", game: BIG_GAME });
    await a.lobbyWhere((l) => l.game === BIG_GAME);

    const lines = said.mock.calls.map((call) => call.join(" ")).filter((line) => line.startsWith("game changed"));
    said.mockRestore();
    expect(lines).toEqual([`game changed: ${DEFAULT_GAME} to ${BIG_GAME}`]);
    expect(lines.join(" ")).not.toContain("PCKAH");
    a.close();
  });
});
