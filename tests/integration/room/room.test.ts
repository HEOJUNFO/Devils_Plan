import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GAME } from "../../../src/shared/games";
import type { LobbyView } from "../../../src/shared/lobby";
import { CLOSE_LEFT, CLOSE_REJECTED, CLOSE_STALE } from "../../../src/shared/protocol";
import roomConfig from "../../../src/shared/room-config.json";
import { exports } from "cloudflare:workers";
import { PARTY_NAME } from "../../../src/shared/protocol";
import { advanceClock, connect, heardWere, join as open, scheduledAlarm, tokenFor, type HeardRecord } from "../support";

const EMPTY_ROOM_TTL_MS = roomConfig.emptyRoomTtlMinutes * 60_000;
const JOIN_TIMEOUT_MS = roomConfig.joinTimeoutSeconds * 1000;
const AWAY_SLOT_MS = roomConfig.awaySlotSeconds * 1000;
const STALE_MS = roomConfig.staleConnectionSeconds * 1000;

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
      you: 0,
      maxPlayers: roomConfig.maxPlayers,
      game: DEFAULT_GAME,
      listed: false,
      turnSeconds: 0,
      voice: true,
      host: 0,
      players: [{ slot: 0, nick: "ann", connected: true }],
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
    for (let n = 1; n < roomConfig.maxPlayers; n++) {
      clients.push(await open("AAAAG", { player: n }));
    }
    await clients.at(-1)!.next();

    const extra = await open("AAAAG", { player: roomConfig.maxPlayers });

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
    expect(lobby.players).toEqual([{ slot: 0, nick: "p0", connected: true }]);
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
    for (let n = 1; n < roomConfig.maxPlayers; n++) {
      clients.push(await open("AAAA2", { player: n }));
    }
    await clients.at(-1)!.next();
    clients[2].close();
    await clients[0].lobbyWhere((l) => connectedBySlot(l)[2] === false);

    const extra = await open("AAAA2", { player: roomConfig.maxPlayers, nick: "new" });

    const lobby = await extra.next();
    expect(lobby).toMatchObject({ type: "lobby", you: 2 });
    expect(lobby.type === "lobby" ? lobby.players : []).toHaveLength(roomConfig.maxPlayers);
    expect(lobby.type === "lobby" ? lobby.players[2] : null).toEqual({ slot: 2, nick: "new", connected: true });
    for (const c of clients.filter((_, n) => n !== 2)) c.close();
    extra.close();
  });

  it("gives the slot of the player away longest to a newcomer first", async () => {
    const clients = [await open("AAAA3", { player: 0, create: true })];
    for (let n = 1; n < roomConfig.maxPlayers; n++) {
      clients.push(await open("AAAA3", { player: n }));
    }
    await clients.at(-1)!.next();
    clients[4].close();
    await clients[0].lobbyWhere((l) => connectedBySlot(l)[4] === false);
    advanceClock(2000);
    clients[1].close();
    await clients[0].lobbyWhere((l) => connectedBySlot(l)[1] === false);

    const extra = await open("AAAA3", { player: roomConfig.maxPlayers });

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
    expect(lobby.players).toEqual([{ slot: 0, nick: "ann", connected: true }]);
    a.close();
  });
});
