import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import directoryConfig from "../../../src/shared/directory-config.json";
import type { RoomListing } from "../../../src/shared/directory";
import type { StoredWord } from "../../../src/shared/feedback";
import { DEFAULT_GAME, GAMES, GAME_IDS, type GameId } from "../../../src/shared/games";
import {
  DIRECTORY_NAME,
  DIRECTORY_PARTY,
  PARTY_NAME,
  type DirectoryMessage,
  type DirectoryRequest,
  type WatchingNote,
} from "../../../src/shared/protocol";
import roomConfig from "../../../src/shared/room-config.json";
import numbersConfig from "../../../src/shared/numbers-config.json";
import { dayOf, type DayNumbers } from "../../../src/shared/numbers";
import { COUNT_PATH, MAKE_PATH } from "../../../src/server/directory";
import { advanceClock, Inbox, join as open, socket, type TestClient } from "../support";

/** The most players the list says a room of the first game can have. */
const MOST = Math.min(roomConfig.maxPlayers, GAMES[DEFAULT_GAME].maxPlayers);

/** A game other than the one a room here is made for unless it says so. */
const OTHER_GAME: GameId = "count-rectangles";

/** Someone looking at the list of rooms. */
class Viewer extends Inbox<DirectoryMessage> {
  /** The next list. What the directory says of how many are looking is read past: `watching` reads that. */
  override async next(): Promise<DirectoryMessage> {
    for (;;) {
      const message = await super.next();
      if (message.type === "rooms") return message;
    }
  }

  /** How many the directory has said are looking at the list, each time it said so, oldest first. */
  watching(): WatchingNote[] {
    return this.raw.map((text) => JSON.parse(text) as { type: string }).filter((message): message is WatchingNote => message.type === "watching");
  }

  /** Waits until the directory has said that `count` are looking. */
  async toldOf(count: number): Promise<void> {
    await vi.waitFor(() => expect(this.watching().at(-1)?.count).toBe(count));
  }

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

/** Starts looking at the list of rooms, as the lobby screen does; from the address `from`, where one is given. */
async function watch(from?: string): Promise<Viewer> {
  return new Viewer(await socket(`/parties/${DIRECTORY_PARTY}/${DIRECTORY_NAME}`, from));
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

/** The rooms one address may make in a short while and in a long one. */
const [MAKE_SOON, MAKE_LATER] = directoryConfig.makeLimits;

/** Asks the directory as a room does, from inside the Worker, with `body` for what is asked. */
function askToMake(body: unknown): Promise<Response> {
  const directory = env.RoomDirectory.get(env.RoomDirectory.idFromName(DIRECTORY_NAME));
  return directory.fetch(`https://directory.internal${MAKE_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-partykit-room": DIRECTORY_NAME },
    body: JSON.stringify(body),
  });
}

/** Asks for rooms from `from` until one is refused or `most` are let through; how many were. */
async function letThrough(from: string, most: number): Promise<number> {
  for (let n = 0; n < most; n++) {
    const response = await askToMake({ from });
    expect(response.status).toBe(200);
    if (!((await response.json()) as { ok: boolean }).ok) return n;
  }
  return most;
}

afterEach(() => {
  vi.useRealTimers();
});

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

  it("lists a room under the game its host turns it to, with as many places as that game has", async () => {
    const viewer = await watch();
    const other = GAME_IDS.find((id) => GAMES[id].maxPlayers !== GAMES[DEFAULT_GAME].maxPlayers)!;
    const a = await open("DAAAX", { player: 0, create: true, listed: true });
    await viewer.roomWhere("DAAAX", present);

    a.send({ type: "pick", game: other });

    const listed = await viewer.roomWhere("DAAAX", (room) => room?.game === other);
    expect(listed).toMatchObject({ code: "DAAAX", game: other, players: 1, maxPlayers: Math.min(roomConfig.maxPlayers, GAMES[other].maxPlayers) });
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

  it("says with each list which game it is of: every game to begin with, then the one asked for", async () => {
    const viewer = await watch();
    const first = await viewer.next();

    // the directory is one for all the tests: a list sent for another's room, of the game asked for before, may come before the answer
    const listOf = async (game: GameId | null): Promise<DirectoryMessage> => {
      for (;;) {
        const list = await viewer.next();
        if (list.of === game) return list;
      }
    };

    viewer.show(OTHER_GAME);
    const answer = await listOf(OTHER_GAME);
    viewer.show(null);
    const back = await listOf(null);

    expect(first.of).toBeNull();
    expect(answer.of).toBe(OTHER_GAME);
    expect(back.of).toBeNull();
    viewer.close();
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

  it("holds an address that makes rooms slowly to the limit kept over a long while", async () => {
    const making = "203.0.113.40";
    let made = 0;

    // as many as the short limit lets through, then a wait for it to pass, over and over
    for (let round = 0; round * MAKE_SOON.burst <= MAKE_LATER.burst; round++) {
      const now = await letThrough(making, MAKE_SOON.burst + 1);
      made += now;
      if (now < MAKE_SOON.burst) break;
      expect(now).toBe(MAKE_SOON.burst);
      advanceClock(MAKE_SOON.windowSeconds * 1000);
    }

    expect(made).toBe(MAKE_LATER.burst);
    advanceClock(MAKE_LATER.windowSeconds * 1000);
    expect(await letThrough(making, 1)).toBe(1);
  });

  it("keeps of an address that made a room no more than a digest, and that no longer than the long limit", async () => {
    const making = "203.0.113.41";
    const directory = env.RoomDirectory.get(env.RoomDirectory.idFromName(DIRECTORY_NAME));
    const kept = (): Promise<string[]> =>
      runInDurableObject(directory, (_object, state) =>
        state.storage.sql
          .exec<{ key: string }>("SELECT key FROM made")
          .toArray()
          .map((row) => row.key),
      );
    const before = await kept();
    expect(await letThrough(making, 1)).toBe(1);

    const mine = (await kept()).filter((key) => !before.includes(key));
    advanceClock(MAKE_LATER.windowSeconds * 1000);
    // the next question, from anyone, clears what is past use
    expect(await letThrough("203.0.113.42", 1)).toBe(1);
    const after = await kept();

    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(after).not.toContain(mine[0]);
  });

  it("answers no question about making a room that names no address", async () => {
    for (const body of [{}, { from: "" }, { from: 7 }, { from: "x".repeat(46) }, null, "203.0.113.43"]) {
      expect((await askToMake(body)).status).toBe(400);
    }
  });

  it("lets nobody outside ask whether a room may be made", async () => {
    const asked = await exports.default.fetch(`http://example.com/parties/${DIRECTORY_PARTY}/${DIRECTORY_NAME}${MAKE_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "203.0.113.44" }),
    });

    expect(asked.status).toBe(404);
  });
});

/** What the directory answers a writer or a reader: what became of a word about the game, or the words kept. */
interface Answer {
  type: string;
  sent?: boolean;
  feedback?: boolean;
  words?: StoredWord[] | null;
  days?: DayNumbers[] | null;
}

/** The key the inbox is read with in these tests. */
const KEY = "a key of the reader's own";
const directoryStub = (): DurableObjectStub => env.RoomDirectory.get(env.RoomDirectory.idFromName(DIRECTORY_NAME));

/** Gives the directory a key to its inbox, and starts it with nothing kept, none of the day's words taken and no wrong key tried. */
async function withKey(key: string | null = KEY): Promise<void> {
  await runInDurableObject(directoryStub(), (object, state) => {
    for (const table of ["feedback", "words", "misses"]) state.storage.sql.exec(`DELETE FROM ${table}`);
    (object as unknown as { inboxKey(): string | null }).inboxKey = () => key;
  });
}

/** Puts the directory back to the key it has by itself: here, none. */
async function keyAsItIs(): Promise<void> {
  await runInDurableObject(directoryStub(), (object) => {
    delete (object as unknown as Record<string, unknown>).inboxKey;
  });
}

/** Someone in the lobby: a writer of a word about the game, or its reader. */
async function writer(): Promise<Inbox<Answer>> {
  const inbox = new Inbox<Answer>(await socket(`/parties/${DIRECTORY_PARTY}/${DIRECTORY_NAME}`));
  // the list comes first, to everyone who connects
  await inbox.next();
  return inbox;
}

/** Reads forward to the directory's next answer of `type`. */
async function answerTo(inbox: Inbox<Answer>, type = "feedback"): Promise<Answer> {
  for (;;) {
    const message = await inbox.next();
    if (message.type === type) return message;
  }
}

function write(inbox: Inbox<Answer>, text: string): void {
  const request: DirectoryRequest = { type: "feedback", text, lang: "ko", build: "abc1234" };
  inbox.sendRaw(JSON.stringify(request));
}

/** Asks for the inbox with `key`, throwing the word `drop` away first where one is named, and gives what is answered: the words, or `null`. */
async function read(inbox: Inbox<Answer>, key: string = KEY, drop?: number): Promise<StoredWord[] | null | undefined> {
  const request: DirectoryRequest = drop === undefined ? { type: "inbox", key } : { type: "inbox", key, drop };
  inbox.sendRaw(JSON.stringify(request));
  return (await answerTo(inbox, "inbox")).words;
}

/** Writes `text` as a viewer of its own, so that only the limits on everyone together are met. */
async function writeAsNew(text: string): Promise<boolean | undefined> {
  const inbox = await writer();
  write(inbox, text);
  const answer = await answerTo(inbox);
  inbox.close();
  return answer.sent;
}

describe("RoomDirectory: how many are looking", () => {
  /** Waits for what the directory first says to `viewer` of how many are looking, and gives the number. */
  async function firstTold(viewer: Viewer): Promise<number> {
    await vi.waitFor(() => expect(viewer.watching().length).toBeGreaterThan(0));
    return viewer.watching()[0].count;
  }

  it("tells a viewer who comes how many are looking, themselves among them", async () => {
    const viewer = await watch();

    expect(await firstTold(viewer)).toBeGreaterThanOrEqual(1);
    viewer.close();
  });

  it("tells those already looking when another comes, and when that one goes", async () => {
    const first = await watch();
    const alone = await firstTold(first);

    const second = await watch();
    await first.toldOf(alone + 1);
    expect(await firstTold(second)).toBe(alone + 1);
    second.close();

    await first.toldOf(alone);
    first.close();
  });

  it("says only that there are more past the most it counts out, and then tells nobody of each coming", async () => {
    const first = await watch();
    const crowd: Viewer[] = [];
    // as many more as it takes for the number told to stop growing
    while (first.watching().at(-1)?.more !== true) {
      expect(crowd.length).toBeLessThanOrEqual(directoryConfig.watchingMost);
      const next = await watch();
      await firstTold(next);
      crowd.push(next);
    }
    expect(first.watching().at(-1)).toMatchObject({ count: directoryConfig.watchingMost, more: true });
    const toldSoFar = first.watching().length;

    const late = await watch();

    // the one who came is told, as everyone who comes is
    await vi.waitFor(() => expect(late.watching().at(-1)).toMatchObject({ count: directoryConfig.watchingMost, more: true }));
    // whatever the first was sent before this answer has arrived by now
    first.show(null);
    await first.next();
    expect(first.watching().length).toBe(toldSoFar);
    for (const viewer of [first, late, ...crowd]) viewer.close();
  });

  it("counts two connections from one address as one person looking", async () => {
    const first = await watch();
    const alone = await firstTold(first);
    const one = await watch("203.0.113.7");
    await first.toldOf(alone + 1);
    const toldSoFar = first.watching().length;

    const again = await watch("203.0.113.7");

    // the second tab is told the number as it stands, itself not one more in it
    expect(await firstTold(again)).toBe(alone + 1);
    // whatever the first was sent before this answer has arrived by now
    first.show(null);
    await first.next();
    expect(first.watching().length).toBe(toldSoFar);

    // and when one of the two tabs goes, the person is still there
    again.close();
    const other = await watch("203.0.113.8");
    await first.toldOf(alone + 2);
    for (const viewer of [first, one, other]) viewer.close();
  });

  it("still counts someone from an address after they asked for one game's rooms", async () => {
    const first = await watch();
    const alone = await firstTold(first);
    const one = await watch("203.0.113.9");
    await first.toldOf(alone + 1);
    one.show(OTHER_GAME);
    await one.next();
    const toldSoFar = first.watching().length;

    const again = await watch("203.0.113.9");

    expect(await firstTold(again)).toBe(alone + 1);
    first.show(null);
    await first.next();
    expect(first.watching().length).toBe(toldSoFar);
    for (const viewer of [first, one, again]) viewer.close();
  });

  it("tells nobody of a coming past the most it counts out, also when it has slept and forgotten what it last told", async () => {
    const first = await watch();
    const crowd: Viewer[] = [];
    while (first.watching().at(-1)?.more !== true) {
      expect(crowd.length).toBeLessThanOrEqual(directoryConfig.watchingMost);
      const next = await watch();
      await firstTold(next);
      crowd.push(next);
    }
    const toldSoFar = first.watching().length;
    // what sleep does to it: the fields of the object are gone, the connections are not
    await runInDurableObject(directoryStub(), (object) => {
      (object as unknown as { watchingTold: string | null }).watchingTold = null;
    });

    const late = await watch();

    await vi.waitFor(() => expect(late.watching().at(-1)).toMatchObject({ count: directoryConfig.watchingMost, more: true }));
    first.show(null);
    await first.next();
    expect(first.watching().length).toBe(toldSoFar);
    for (const viewer of [first, late, ...crowd]) viewer.close();
  });

  it("says nothing of who is looking: a number and whether there are more", async () => {
    const viewer = await watch();
    await firstTold(viewer);

    expect(Object.keys(viewer.watching()[0]).sort()).toEqual(["count", "more", "type"]);
    viewer.close();
  });
});

describe("RoomDirectory: a word about the game", () => {
  afterEach(async () => {
    await keyAsItIs();
  });

  it("says with the list that no feedback is taken where there is no key to read it with, and keeps none", async () => {
    await withKey(null);
    const inbox = new Inbox<Answer>(await socket(`/parties/${DIRECTORY_PARTY}/${DIRECTORY_NAME}`));
    const list = await inbox.next();

    write(inbox, "anyone there?");

    expect(list).toMatchObject({ type: "rooms", feedback: false });
    expect(await answerTo(inbox)).toEqual({ type: "feedback", sent: false });
    const kept = await runInDurableObject(directoryStub(), (_object, state) => state.storage.sql.exec("SELECT id FROM words").toArray());
    expect(kept).toEqual([]);
    inbox.close();
  });

  it("says with the list that feedback is taken where there is a key", async () => {
    await withKey();

    const inbox = new Inbox<Answer>(await socket(`/parties/${DIRECTORY_PARTY}/${DIRECTORY_NAME}`));

    expect(await inbox.next()).toMatchObject({ type: "rooms", feedback: true });
    inbox.close();
  });

  it("keeps a word about the game for its reader, with the language and build of its page and nothing of its writer", async () => {
    await withKey();
    const inbox = await writer();
    const before = Date.now();

    write(inbox, "  방 목록이 느려요 \n\n두 번째 줄  ");

    expect(await answerTo(inbox)).toEqual({ type: "feedback", sent: true });
    const words = await read(inbox);
    expect(words).toEqual([{ id: expect.any(Number), at: expect.any(Number), text: "방 목록이 느려요\n두 번째 줄", lang: "ko", build: "abc1234" }]);
    expect(words?.[0].at).toBeGreaterThanOrEqual(before);
    // what is kept is those five things and no more: no address, no connection, no name
    const columns = await runInDurableObject(directoryStub(), (_object, state) =>
      state.storage.sql.exec<{ name: string }>("SELECT name FROM pragma_table_info('words')").toArray().map((row) => row.name),
    );
    expect(columns.sort()).toEqual(["at", "build", "id", "lang", "text"]);
    inbox.close();
  });

  it("gives the reader the latest first", async () => {
    await withKey();
    await writeAsNew("first");
    await writeAsNew("second");
    const reader = await writer();

    const words = await read(reader);

    expect(words?.map((word) => word.text)).toEqual(["second", "first"]);
    reader.close();
  });

  it("opens the inbox for nobody without the key", async () => {
    await withKey();
    await writeAsNew("for the reader's eyes");
    const stranger = await writer();

    expect(await read(stranger, "not the key")).toBeNull();
    expect(await read(stranger, KEY.slice(0, -1))).toBeNull();
    stranger.close();
  });

  it("opens the inbox for no key at all where none is set", async () => {
    await withKey(null);
    const stranger = await writer();

    expect(await read(stranger, KEY)).toBeNull();
    stranger.close();
  });

  it("stops opening after so many wrong keys from everyone together, for the right one too, and opens again when the while has passed", async () => {
    await withKey();
    await writeAsNew("still here");
    const tries = directoryConfig.feedback.readLimit.burst;
    // each guess from a connection of its own: the count is of everyone together
    for (let n = 0; n < tries; n++) {
      const guesser = await writer();
      expect(await read(guesser, `guess ${n}`)).toBeNull();
      guesser.close();
    }
    const reader = await writer();

    const shut = await read(reader);
    advanceClock(directoryConfig.feedback.readLimit.windowSeconds * 1000 + 1);
    const open = await read(reader);

    expect(shut).toBeNull();
    expect(open?.map((word) => word.text)).toEqual(["still here"]);
    reader.close();
  });

  it("does not count the right key against the reader", async () => {
    await withKey();
    const reader = await writer();

    for (let n = 0; n <= directoryConfig.feedback.readLimit.burst; n++) expect(await read(reader)).toEqual([]);
    reader.close();
  });

  it("throws away the word its reader names, and no other", async () => {
    await withKey();
    await writeAsNew("keep me");
    await writeAsNew("drop me");
    const reader = await writer();
    const words = await read(reader);
    const drop = words?.find((word) => word.text === "drop me");

    const left = await read(reader, KEY, drop?.id);

    expect(left?.map((word) => word.text)).toEqual(["keep me"]);
    reader.close();
  });

  it("throws nothing away for someone without the key", async () => {
    await withKey();
    await writeAsNew("keep me");
    const reader = await writer();
    const id = (await read(reader))?.[0].id;
    const stranger = await writer();

    expect(await read(stranger, "not the key", id)).toBeNull();

    expect((await read(reader))?.map((word) => word.text)).toEqual(["keep me"]);
    reader.close();
    stranger.close();
  });

  it("keeps the latest so many, the oldest making way", async () => {
    await withKey();
    const keep = directoryConfig.feedback.keep;
    // put in as the directory keeps them, a day apart: writing so many would meet the day's limit first
    await runInDurableObject(directoryStub(), (_object, state) => {
      for (let n = 0; n < keep; n++) state.storage.sql.exec("INSERT INTO words (at, text, lang, build) VALUES (?, ?, 'ko', 'a')", n, `old ${n}`);
    });

    expect(await writeAsNew("the newest")).toBe(true);

    const reader = await writer();
    const words = await read(reader);
    expect(words).toHaveLength(keep);
    expect(words?.[0].text).toBe("the newest");
    expect(words?.map((word) => word.text)).not.toContain("old 0");
    expect(words?.at(-1)?.text).toBe("old 1");
    reader.close();
  });

  it("keeps nothing of a text with nothing in it", async () => {
    await withKey();
    const inbox = await writer();

    write(inbox, " \n \n");

    expect(await answerTo(inbox)).toEqual({ type: "feedback", sent: false });
    expect(await read(inbox)).toEqual([]);
    inbox.close();
  });

  it("takes only so many from one viewer in a while", async () => {
    await withKey();
    const inbox = await writer();
    const few = directoryConfig.feedback.viewerLimit.burst;

    const answers: Answer[] = [];
    for (let n = 0; n <= few; n++) {
      write(inbox, `word ${n}`);
      answers.push(await answerTo(inbox));
    }

    expect(answers.map((answer) => answer.sent)).toEqual([...Array<boolean>(few).fill(true), false]);
    expect(await read(inbox)).toHaveLength(few);
    inbox.close();
  });

  it("takes only so many in a day from everyone together, and again a day later", async () => {
    await withKey();
    const most = directoryConfig.feedback.dayLimit;
    for (let n = 0; n < most; n++) expect(await writeAsNew(`word ${n}`)).toBe(true);

    const over = await writeAsNew(`word ${most}`);
    advanceClock(86_400_000 + 1);
    const nextDay = await writeAsNew(`word ${most + 1}`);

    expect(over).toBe(false);
    expect(nextDay).toBe(true);
    const reader = await writer();
    expect(await read(reader)).toHaveLength(most + 1);
    reader.close();
  });

  it("writes to the log that a word was kept and that a wrong key was tried, and nothing of the word or the key", async () => {
    const said = vi.spyOn(console, "log").mockImplementation(() => {});
    await withKey();
    const inbox = await writer();

    write(inbox, "a secret between us");
    await answerTo(inbox);
    await read(inbox, "a wrong guess");

    const lines = said.mock.calls.map((call) => call.join(" "));
    said.mockRestore();
    expect(lines).toContain("feedback kept");
    expect(lines).toContain("inbox not opened: a wrong key");
    expect(lines.join("\n")).not.toContain("secret");
    expect(lines.join("\n")).not.toContain("guess");
    expect(lines.join("\n")).not.toContain(KEY);
    inbox.close();
  });
});

describe("RoomDirectory: the numbers of the day", () => {
  afterEach(async () => {
    await keyAsItIs();
  });

  /** Starts the directory with nothing counted and no address remembered. */
  async function countFromNothing(): Promise<void> {
    await runInDurableObject(directoryStub(), (_object, state) => {
      for (const table of ["numbers", "seen"]) state.storage.sql.exec(`DELETE FROM ${table}`);
    });
  }

  /** What is counted of the day `now` is on, as kept. */
  async function counted(now: number = Date.now()): Promise<Record<string, number>> {
    const rows = await runInDurableObject(directoryStub(), (_object, state) =>
      state.storage.sql.exec<{ what: string; n: number }>("SELECT what, n FROM numbers WHERE day = ?", dayOf(now, numbersConfig)).toArray(),
    );
    return Object.fromEntries(rows.map((row) => [row.what, row.n]));
  }

  /** Says to the directory what a room says of something that happened in it. */
  function say(event: unknown): Promise<Response> {
    return directoryStub().fetch(`https://directory.internal${COUNT_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-partykit-room": DIRECTORY_NAME },
      body: JSON.stringify(event),
    });
  }

  /** Asks for the numbers with `key`, and gives what is answered: the days, or `null`. */
  async function numbers(inbox: Inbox<Answer>, key: string = KEY): Promise<DayNumbers[] | null | undefined> {
    const request: DirectoryRequest = { type: "numbers", key };
    inbox.sendRaw(JSON.stringify(request));
    return (await answerTo(inbox, "numbers")).days;
  }

  it("counts each coming to the lobby as a visit, and the comings of one address as one person", async () => {
    await countFromNothing();

    const first = await watch("203.0.113.7");
    await first.next();
    const again = await watch("203.0.113.7");
    await again.next();
    const other = await watch("203.0.113.8");
    await other.next();

    await vi.waitFor(async () => expect(await counted()).toMatchObject({ visits: 3, people: 2, peak: 2 }));
    const hours = Object.entries(await counted()).filter(([what]) => what.startsWith("hour:"));
    expect(hours).toHaveLength(1);
    expect(hours[0][1]).toBe(3);
    for (const viewer of [first, again, other]) viewer.close();
  });

  it("keeps what an address was counted as for its day only", async () => {
    await countFromNothing();
    const yesterday = dayOf(Date.now(), numbersConfig) - 1;
    await runInDurableObject(directoryStub(), (_object, state) => {
      state.storage.sql.exec("INSERT INTO seen (day, key) VALUES (?, ?)", yesterday, "what an address was counted as");
    });

    const viewer = await watch("203.0.113.9");
    await viewer.next();

    await vi.waitFor(async () => expect(await counted()).toMatchObject({ visits: 1 }));
    const days = await runInDurableObject(directoryStub(), (_object, state) => state.storage.sql.exec<{ day: number }>("SELECT day FROM seen").toArray());
    expect(days).toEqual([{ day: yesterday + 1 }]);
    viewer.close();
  });

  it("adds up what rooms say happened in them", async () => {
    await countFromNothing();

    for (const event of [
      { type: "made", game: "under-thirteen", listed: true },
      { type: "started", game: "under-thirteen", players: 4 },
      { type: "started", game: "under-thirteen", players: 2 },
      { type: "ended", game: "under-thirteen", minutes: 11 },
      { type: "emptied", game: "under-thirteen", listed: true, games: 2, most: 4 },
      { type: "made", game: "count-cubes", listed: false },
      { type: "emptied", game: "count-cubes", listed: false, games: 0, most: 1 },
    ]) {
      expect((await say(event)).status).toBe(204);
    }

    expect(await counted()).toEqual({
      made: 2, "made-listed": 1, started: 2, "started:under-thirteen": 2, "players:under-thirteen": 6,
      ended: 1, "ended:under-thirteen": 1, "timed:under-thirteen": 1, "minutes:under-thirteen": 11, emptied: 2, alone: 1,
    });
  });

  it("counts nothing of what is not something a room says", async () => {
    await countFromNothing();

    expect((await say({ type: "made", game: "chess", listed: true })).status).toBe(400);
    expect((await say({ type: "started", game: "count-cubes", players: -3 })).status).toBe(400);
    expect((await say("made")).status).toBe(400);

    expect(await counted()).toEqual({});
  });

  it("is told by a room that it was made, and that it stood empty with nobody else having come", async () => {
    await countFromNothing();
    const player = await open("NUMBR", { player: 70, create: true, listed: true });
    await player.next();

    player.send({ type: "leave" });
    await player.closed;

    await vi.waitFor(async () => expect(await counted()).toMatchObject({ made: 1, "made-listed": 1, emptied: 1, alone: 1 }));
  });

  it("gives the numbers by the day, the latest first, to whoever has the key and to nobody else", async () => {
    await withKey();
    await countFromNothing();
    const today = dayOf(Date.now(), numbersConfig);
    await runInDurableObject(directoryStub(), (_object, state) => {
      state.storage.sql.exec("INSERT INTO numbers (day, what, n) VALUES (?, 'visits', 7), (?, 'made', 2)", today - 1, today - 1);
    });
    await say({ type: "started", game: "count-cubes", players: 1 });
    const reader = await writer();

    expect(await numbers(reader, "not the key")).toBeNull();
    const days = await numbers(reader);

    expect(days?.map((day) => day.day)).toEqual([today, today - 1]);
    expect(days?.[0].counts).toMatchObject({ started: 1, "started:count-cubes": 1, "players:count-cubes": 1 });
    expect(days?.[1].counts).toEqual({ visits: 7, made: 2 });
    reader.close();
  });

  it("gives nobody the numbers where no key is set", async () => {
    await withKey(null);
    const reader = await writer();

    expect(await numbers(reader)).toBeNull();
    reader.close();
  });

  it("counts a wrong key for the numbers with the wrong keys for the inbox, and opens neither after too many", async () => {
    await withKey();
    const reader = await writer();

    for (let n = 0; n < directoryConfig.feedback.readLimit.burst; n++) expect(await numbers(reader, `guess ${n}`)).toBeNull();

    expect(await numbers(reader)).toBeNull();
    expect(await read(reader)).toBeNull();
    reader.close();
  });

  it("keeps no more days than are set, and throws the rest away when the numbers are read", async () => {
    await withKey();
    await countFromNothing();
    const today = dayOf(Date.now(), numbersConfig);
    const [last, gone] = [today - numbersConfig.keepDays + 1, today - numbersConfig.keepDays];
    await runInDurableObject(directoryStub(), (_object, state) => {
      state.storage.sql.exec("INSERT INTO numbers (day, what, n) VALUES (?, 'made', 1), (?, 'made', 1)", last, gone);
    });
    const reader = await writer();

    const days = await numbers(reader);

    expect(days?.map((day) => day.day)).not.toContain(gone);
    expect(days?.map((day) => day.day)).toContain(last);
    const kept = await runInDurableObject(directoryStub(), (_object, state) => state.storage.sql.exec("SELECT day FROM numbers WHERE day = ?", gone).toArray());
    expect(kept).toEqual([]);
    reader.close();
  });
});
