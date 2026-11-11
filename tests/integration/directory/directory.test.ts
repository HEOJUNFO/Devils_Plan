import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import directoryConfig from "../../../src/shared/directory-config.json";
import type { RoomListing } from "../../../src/shared/directory";
import { DEFAULT_GAME, GAMES, type GameId } from "../../../src/shared/games";
import {
  DIRECTORY_NAME,
  DIRECTORY_PARTY,
  PARTY_NAME,
  type DirectoryMessage,
  type DirectoryRequest,
} from "../../../src/shared/protocol";
import roomConfig from "../../../src/shared/room-config.json";
import { Inbox, join as open, socket, type TestClient } from "../support";

/** The most players the list says a room of the first game can have. */
const MOST = Math.min(roomConfig.maxPlayers, GAMES[DEFAULT_GAME].maxPlayers);

/** A game other than the one a room here is made for unless it says so. */
const OTHER_GAME: GameId = "count-rectangles";

/** Someone looking at the list of rooms. */
class Viewer extends Inbox<DirectoryMessage> {
  /**
   * Reads forward to the first list in which the room `code` is as `match`
   * wants it; `match` is given `undefined` when the room is not on the list.
   * Every test looks only at its own rooms: the directory is one for all.
   */
  async roomWhere(code: string, match: (room: RoomListing | undefined) => boolean): Promise<RoomListing | undefined> {
    for (;;) {
      const message = await this.next();
      const room = message.rooms.find((listed) => listed.code === code);
      if (match(room)) return room;
    }
  }

  /** Asks for the rooms of `game` only, or of every game, as the lobby does when a game is picked. */
  show(game: GameId | null): void {
    const request: DirectoryRequest = { type: "show", game };
    this.ws.send(JSON.stringify(request));
  }

  /**
   * Reads forward to the first list that has the room `code`, and gives every
   * list read on the way, that one included: what the viewer was sent meanwhile.
   */
  async listsUntil(code: string): Promise<DirectoryMessage[]> {
    const lists: DirectoryMessage[] = [];
    for (;;) {
      const message = await this.next();
      lists.push(message);
      if (message.rooms.some((listed) => listed.code === code)) return lists;
    }
  }
}

/** Starts looking at the list of rooms, as the lobby screen does. */
async function watch(): Promise<Viewer> {
  return new Viewer(await socket(`/parties/${DIRECTORY_PARTY}/${DIRECTORY_NAME}`));
}

/**
 * Makes a listed room and waits until the list shows it: whatever was said to
 * the directory before this returns has been dealt with, in order.
 */
async function marker(viewer: Viewer, code: string): Promise<TestClient> {
  const player = await open(code, { player: 90, create: true, listed: true });
  await viewer.roomWhere(code, (room) => room !== undefined);
  return player;
}

const present = (room: RoomListing | undefined): boolean => room !== undefined;
const absent = (room: RoomListing | undefined): boolean => room === undefined;

describe("RoomDirectory", () => {
  it("lists a room made for everyone with its game, its host and how many are in", async () => {
    const viewer = await watch();

    const a = await open("DAAAA", { player: 0, nick: "ann", create: true, listed: true });

    const room = await viewer.roomWhere("DAAAA", present);
    expect(room).toEqual({ code: "DAAAA", game: DEFAULT_GAME, host: "ann", players: 1, maxPlayers: MOST, playing: false });
    a.close();
    viewer.close();
  });

  it("tells the players of a room whether it is on the list", async () => {
    const a = await open("DAAAB", { player: 0, create: true, listed: true });
    const b = await open("DAAAC", { player: 0, create: true, listed: false });

    expect(await a.lobbyWhere()).toMatchObject({ listed: true, game: DEFAULT_GAME });
    expect(await b.lobbyWhere()).toMatchObject({ listed: false, game: DEFAULT_GAME });
    a.close();
    b.close();
  });

  it("does not list a room reached by its code alone", async () => {
    const viewer = await watch();
    const hidden = await open("DAAAD", { player: 0, create: true, listed: false });
    await hidden.lobbyWhere();

    const shown = await marker(viewer, "DAAAE");

    const lists: DirectoryMessage[] = [];
    const again = await watch();
    lists.push(await again.next());
    expect(lists[0].rooms.map((room) => room.code)).toContain("DAAAE");
    expect(lists[0].rooms.map((room) => room.code)).not.toContain("DAAAD");
    hidden.close();
    shown.close();
    viewer.close();
    again.close();
  });

  it("counts a second player as they come in", async () => {
    const viewer = await watch();
    const a = await open("DAAAF", { player: 0, create: true, listed: true });
    await viewer.roomWhere("DAAAF", present);

    const b = await open("DAAAF", { player: 1 });

    expect(await viewer.roomWhere("DAAAF", (room) => room?.players === 2)).toMatchObject({ players: 2, host: "p0" });
    a.close();
    b.close();
    viewer.close();
  });

  it("sends the list as it stands to someone who starts looking later", async () => {
    const early = await watch();
    const a = await open("DAAAG", { player: 0, nick: "ann", create: true, listed: true });
    await early.roomWhere("DAAAG", present);

    const late = await watch();

    const first = await late.next();
    expect(first.type).toBe("rooms");
    expect(first.rooms.find((room) => room.code === "DAAAG")).toMatchObject({ host: "ann", players: 1 });
    a.close();
    early.close();
    late.close();
  });

  it("takes a room off the list when its last player drops", async () => {
    const viewer = await watch();
    const a = await open("DAAAH", { player: 0, create: true, listed: true });
    await viewer.roomWhere("DAAAH", present);

    a.close();

    expect(await viewer.roomWhere("DAAAH", absent)).toBeUndefined();
    viewer.close();
  });

  it("lists a room again when someone comes back to it", async () => {
    const viewer = await watch();
    const a = await open("DAAAJ", { player: 0, nick: "ann", create: true, listed: true });
    await viewer.roomWhere("DAAAJ", present);
    a.close();
    await viewer.roomWhere("DAAAJ", absent);

    const back = await open("DAAAJ", { player: 0, nick: "ann" });

    expect(await viewer.roomWhere("DAAAJ", present)).toMatchObject({ host: "ann", players: 1 });
    back.close();
    viewer.close();
  });

  it("takes a room off the list when its last player leaves", async () => {
    const viewer = await watch();
    const a = await open("DAAAK", { player: 0, create: true, listed: true });
    await viewer.roomWhere("DAAAK", present);

    a.send({ type: "leave" });

    expect(await viewer.roomWhere("DAAAK", absent)).toBeUndefined();
    viewer.close();
  });

  it("names the next player as host when the host drops", async () => {
    const viewer = await watch();
    const a = await open("DAAAL", { player: 0, nick: "ann", create: true, listed: true });
    const b = await open("DAAAL", { player: 1, nick: "bob" });
    await viewer.roomWhere("DAAAL", (room) => room?.players === 2);

    a.close();

    expect(await viewer.roomWhere("DAAAL", (room) => room?.players === 1)).toMatchObject({ host: "bob", players: 1 });
    b.close();
    viewer.close();
  });

  it("takes a room off the list when its host makes it private, and puts it back", async () => {
    const viewer = await watch();
    const a = await open("DAAAM", { player: 0, create: true, listed: true });
    await viewer.roomWhere("DAAAM", present);

    a.send({ type: "listing", listed: false });
    const hidden = await viewer.roomWhere("DAAAM", absent);
    const toldHidden = await a.lobbyWhere((lobby) => !lobby.listed);
    a.send({ type: "listing", listed: true });
    const shown = await viewer.roomWhere("DAAAM", present);
    const toldShown = await a.lobbyWhere((lobby) => lobby.listed);

    expect(hidden).toBeUndefined();
    expect(toldHidden.listed).toBe(false);
    expect(shown).toMatchObject({ code: "DAAAM", players: 1 });
    expect(toldShown.listed).toBe(true);
    a.close();
    viewer.close();
  });

  it("refuses a change of listing from someone who is not the host", async () => {
    const viewer = await watch();
    const a = await open("DAAAN", { player: 0, create: true, listed: true });
    const b = await open("DAAAN", { player: 1 });
    await viewer.roomWhere("DAAAN", (room) => room?.players === 2);

    b.send({ type: "listing", listed: false });

    expect(await b.nextOf("refused")).toEqual({ type: "refused", reason: "not-host" });
    const after = await marker(viewer, "DAAAP");
    const again = await watch();
    expect((await again.next()).rooms.map((room) => room.code)).toContain("DAAAN");
    a.close();
    b.close();
    after.close();
    viewer.close();
    again.close();
  });

  it("marks a room in which a game is being played", async () => {
    const viewer = await watch();
    const a = await open("DAAAQ", { player: 0, create: true, listed: true });
    await viewer.roomWhere("DAAAQ", present);

    a.send({ type: "start", bots: true });

    expect(await viewer.roomWhere("DAAAQ", (room) => room?.playing === true)).toMatchObject({ playing: true, players: 1 });
    a.close();
    viewer.close();
  });

  it("lets nothing but a WebSocket in from outside", async () => {
    const viewer = await watch();
    const forged = {
      code: "DAAAR",
      listing: { code: "DAAAR", game: DEFAULT_GAME, host: "mallory", players: 1, maxPlayers: MOST, playing: false },
    };

    const toDirectory = await exports.default.fetch(`http://example.com/parties/${DIRECTORY_PARTY}/${DIRECTORY_NAME}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(forged),
    });
    const toRoom = await exports.default.fetch(`http://example.com/parties/${PARTY_NAME}/DAAAR`);

    expect(toDirectory.status).toBe(404);
    expect(toRoom.status).toBe(404);
    const after = await marker(viewer, "DAAAS");
    const again = await watch();
    expect((await again.next()).rooms.map((room) => room.code)).not.toContain("DAAAR");
    after.close();
    viewer.close();
    again.close();
  });

  it("takes no report from a viewer", async () => {
    const viewer = await watch();
    const forged = {
      code: "DAAAT",
      listing: { code: "DAAAT", game: DEFAULT_GAME, host: "mallory", players: 1, maxPlayers: MOST, playing: false },
    };

    viewer.sendRaw(JSON.stringify(forged));
    viewer.sendRaw(JSON.stringify({ type: "report", ...forged }));

    const after = await marker(viewer, "DAAAU");
    const again = await watch();
    expect((await again.next()).rooms.map((room) => room.code)).not.toContain("DAAAT");
    after.close();
    viewer.close();
    again.close();
  });

  it("answers a viewer who asks for one game with the rooms of that game only", async () => {
    const viewer = await watch();
    const first = await open("DABAA", { player: 0, create: true, listed: true });
    const other = await open("DABAB", { player: 1, create: true, listed: true, game: OTHER_GAME });
    await viewer.roomWhere("DABAA", present);
    await viewer.roomWhere("DABAB", present);

    viewer.show(OTHER_GAME);

    const lists = await viewer.listsUntil("DABAB");
    const answer = lists[lists.length - 1];
    expect(answer.rooms.map((room) => room.game)).toEqual(answer.rooms.map(() => OTHER_GAME));
    expect(answer.rooms.map((room) => room.code)).not.toContain("DABAA");
    first.close();
    other.close();
    viewer.close();
  });

  it("goes on sending a viewer who asked for one game only that game's rooms", async () => {
    const viewer = await watch();
    const other = await open("DABAC", { player: 0, create: true, listed: true, game: OTHER_GAME });
    await viewer.roomWhere("DABAC", present);
    viewer.show(OTHER_GAME);
    await viewer.listsUntil("DABAC");

    const first = await open("DABAD", { player: 1, create: true, listed: true });
    await first.lobbyWhere();
    const later = await open("DABAE", { player: 2, create: true, listed: true, game: OTHER_GAME });

    const lists = await viewer.listsUntil("DABAE");
    for (const list of lists) expect(list.rooms.map((room) => room.code)).not.toContain("DABAD");
    other.close();
    first.close();
    later.close();
    viewer.close();
  });

  it("sends the rooms of every game again to a viewer who asks for them", async () => {
    const viewer = await watch();
    const first = await open("DABAF", { player: 0, create: true, listed: true });
    await viewer.roomWhere("DABAF", present);
    viewer.show(OTHER_GAME);
    await viewer.roomWhere("DABAF", absent);

    viewer.show(null);

    expect(await viewer.roomWhere("DABAF", present)).toMatchObject({ code: "DABAF", game: DEFAULT_GAME });
    first.close();
    viewer.close();
  });

  it("leaves other viewers the rooms of every game when one asks for a game", async () => {
    const picky = await watch();
    const viewer = await watch();
    picky.show(OTHER_GAME);

    const first = await open("DABAG", { player: 0, create: true, listed: true });

    expect(await viewer.roomWhere("DABAG", present)).toMatchObject({ code: "DABAG" });
    first.close();
    picky.close();
    viewer.close();
  });

  it("says how many rooms of each game there are, whichever game a viewer asked for", async () => {
    const viewer = await watch();
    const first = await open("DABAH", { player: 0, create: true, listed: true });
    const other = await open("DABAJ", { player: 1, create: true, listed: true, game: OTHER_GAME });
    await viewer.roomWhere("DABAH", present);
    await viewer.roomWhere("DABAJ", present);

    viewer.show(OTHER_GAME);

    const lists = await viewer.listsUntil("DABAJ");
    const answer = lists[lists.length - 1];
    const listed = (game: GameId): number => answer.rooms.filter((room) => room.game === game).length;
    expect(listed(DEFAULT_GAME)).toBe(0);
    expect(answer.counts?.[DEFAULT_GAME]).toBeGreaterThanOrEqual(1);
    expect(answer.counts?.[OTHER_GAME]).toBeGreaterThanOrEqual(listed(OTHER_GAME));
    first.close();
    other.close();
    viewer.close();
  });

  it("takes a request it cannot read for no request", async () => {
    const viewer = await watch();
    const first = await open("DABAK", { player: 0, create: true, listed: true });
    await viewer.roomWhere("DABAK", present);

    viewer.sendRaw(JSON.stringify({ type: "show", game: "no-such-game" }));
    viewer.sendRaw("show");

    const after = await marker(viewer, "DABAL");
    const again = await watch();
    expect((await again.next()).rooms.map((room) => room.code)).toContain("DABAK");
    first.close();
    after.close();
    viewer.close();
    again.close();
  });

  it("stops answering a viewer who asks far faster than a page does", async () => {
    const viewer = await watch();
    for (let n = 0; n < directoryConfig.showLimit.burst; n++) viewer.show(OTHER_GAME);

    viewer.show(null);

    const first = await open("DABAM", { player: 0, create: true, listed: true });
    await first.lobbyWhere();
    const other = await open("DABAN", { player: 1, create: true, listed: true, game: OTHER_GAME });
    const lists = await viewer.listsUntil("DABAN");
    for (const list of lists) expect(list.rooms.map((room) => room.code)).not.toContain("DABAM");
    first.close();
    other.close();
    viewer.close();
  });
});
