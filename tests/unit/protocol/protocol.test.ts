import { describe, expect, it } from "vitest";
import { QUICK_WORDS } from "../../../src/shared/chat";
import { DEFAULT_GAME } from "../../../src/shared/games";
import { gameReader } from "../../../src/shared/parts";
import roomConfig from "../../../src/shared/room-config.json";
import {
  MAX_CLIENT_MESSAGE_LENGTH,
  MAX_DIRECTORY_REQUEST_LENGTH,
  PING,
  PONG,
  parseClientMessage,
  parseDirectoryMessage,
  parseDirectoryRequest,
  parseFeedbackAnswer,
  parseInboxAnswer,
  parseNumbersAnswer,
  parseComingNote,
  parseWantingNote,
  parseServerMessage,
  parseWatchingNote,
} from "../../../src/shared/protocol";

/** A well-formed join request as the browser sends it. */
function joinJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "join",
    token: "player-token-0001",
    nick: "ann",
    create: false,
    ...overrides,
  });
}

describe("parseClientMessage", () => {
  it("reads a join with its token, nickname and create flag", () => {
    expect(parseClientMessage(joinJson({ create: true }))).toEqual({
      type: "join",
      token: "player-token-0001",
      nick: "ann",
      create: true,
      game: DEFAULT_GAME,
      listed: false,
      pings: false,
      parts: false,
    });
  });

  it("reads the host turning 탈락전 on or off, and nothing of one that says neither", () => {
    expect(parseClientMessage(JSON.stringify({ type: "knockout", on: true }))).toEqual({ type: "knockout", on: true });
    expect(parseClientMessage(JSON.stringify({ type: "knockout", on: false }))).toEqual({ type: "knockout", on: false });
    expect(parseClientMessage(JSON.stringify({ type: "knockout", on: "yes" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "knockout" }))).toBeNull();
  });

  it("reads whether the page says it reads a game sent as parts, and takes anything but yes as no", () => {
    expect(parseClientMessage(joinJson({ parts: true }))).toMatchObject({ parts: true });
    expect(parseClientMessage(joinJson({ parts: 1 }))).toMatchObject({ parts: false });
    expect(parseClientMessage(joinJson())).toMatchObject({ parts: false });
  });

  it("reads whether the page says it pings, and takes anything but yes as no", () => {
    expect(parseClientMessage(joinJson({ pings: true }))).toMatchObject({ pings: true });
    expect(parseClientMessage(joinJson({ pings: "true" }))).toMatchObject({ pings: false });
    expect(parseClientMessage(joinJson())).toMatchObject({ pings: false });
  });

  it("reads the game and the listing a new room is asked to have", () => {
    const raw = joinJson({ create: true, game: DEFAULT_GAME, listed: true });

    expect(parseClientMessage(raw)).toMatchObject({ game: DEFAULT_GAME, listed: true });
  });

  it("gives a join that names no game, or a game nobody has heard of, the first game", () => {
    expect(parseClientMessage(joinJson())).toMatchObject({ game: DEFAULT_GAME });
    expect(parseClientMessage(joinJson({ game: "tiddlywinks" }))).toMatchObject({ game: DEFAULT_GAME });
    expect(parseClientMessage(joinJson({ game: "toString" }))).toMatchObject({ game: DEFAULT_GAME });
  });

  it("treats any listed value other than true as not listed", () => {
    expect(parseClientMessage(joinJson({ listed: "yes" }))).toMatchObject({ listed: false });
  });

  it("reads a change of listing", () => {
    expect(parseClientMessage(JSON.stringify({ type: "listing", listed: true }))).toEqual({ type: "listing", listed: true });
    expect(parseClientMessage(JSON.stringify({ type: "listing", listed: false }))).toEqual({ type: "listing", listed: false });
    expect(parseClientMessage(JSON.stringify({ type: "ready", ready: true }))).toEqual({ type: "ready", ready: true });
    expect(parseClientMessage(JSON.stringify({ type: "ready", ready: false }))).toEqual({ type: "ready", ready: false });
    expect(parseClientMessage(JSON.stringify({ type: "reading", reading: true }))).toEqual({ type: "reading", reading: true });
    expect(parseClientMessage(JSON.stringify({ type: "reading", reading: false }))).toEqual({ type: "reading", reading: false });
    expect(parseClientMessage(JSON.stringify({ type: "wish", game: DEFAULT_GAME }))).toEqual({ type: "wish", game: DEFAULT_GAME });
    expect(parseClientMessage(JSON.stringify({ type: "wish", game: null }))).toEqual({ type: "wish", game: null });
    expect(parseClientMessage(JSON.stringify({ type: "when", at: 1_800_000_000_000 }))).toEqual({ type: "when", at: 1_800_000_000_000 });
    expect(parseClientMessage(JSON.stringify({ type: "when", at: null }))).toEqual({ type: "when", at: null });
    expect(parseClientMessage(JSON.stringify({ type: "host", to: 3 }))).toEqual({ type: "host", to: 3 });
    expect(parseClientMessage(JSON.stringify({ type: "kick", slot: 0 }))).toEqual({ type: "kick", slot: 0 });
    expect(parseClientMessage(JSON.stringify({ type: "here", extra: 1 }))).toEqual({ type: "here" });
    expect(parseClientMessage(JSON.stringify({ type: "pick", game: "count-cubes" }))).toEqual({ type: "pick", game: "count-cubes" });
  });

  it("reads a chat line as it was typed", () => {
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: "  hi  " }))).toEqual({ type: "chat", text: "  hi  " });
  });

  it("reads a word said with one press", () => {
    const [word] = QUICK_WORDS;

    expect(parseClientMessage(JSON.stringify({ type: "quick", word }))).toEqual({ type: "quick", word });
  });

  it("rejects a word said with one press that is not one of them", () => {
    expect(parseClientMessage(JSON.stringify({ type: "quick" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "quick", word: "a sentence of my own" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "quick", word: 3 }))).toBeNull();
  });

  it("reads a player pointed out: who by their slot, and the lines that go with it", () => {
    expect(parseClientMessage(JSON.stringify({ type: "flag", slot: 2, lines: ["one", "two"] }))).toEqual({ type: "flag", slot: 2, lines: ["one", "two"] });
    expect(parseClientMessage(JSON.stringify({ type: "flag", slot: 0, lines: [] }))).toEqual({ type: "flag", slot: 0, lines: [] });
  });

  it("rejects a player pointed out by what is no slot, with what are not lines, or with more lines than a page sends", () => {
    for (const slot of [-1, 1.5, "2", null, undefined]) expect(parseClientMessage(JSON.stringify({ type: "flag", slot, lines: [] }))).toBeNull();
    for (const lines of [undefined, "one", [1], [["one"]], Array.from({ length: 9 }, () => "x")]) {
      expect(parseClientMessage(JSON.stringify({ type: "flag", slot: 1, lines }))).toBeNull();
    }
  });

  it("reads a line said to one player only, as a page of an earlier build sends it: a list of the one slot", () => {
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: "psst", to: 3 }))).toEqual({ type: "chat", text: "psst", to: [3] });
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: "psst", to: 0 }))).toEqual({ type: "chat", text: "psst", to: [0] });
  });

  it("reads a line said to a few players: their slots, each once and lowest first", () => {
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: "psst", to: [4, 1, 4] }))).toEqual({ type: "chat", text: "psst", to: [1, 4] });
  });

  it("rejects a line said to what is no slot, to nobody, or to more than a room holds, rather than say it to everyone", () => {
    const everySeat = Array.from({ length: roomConfig.maxPlayers }, (_none, slot) => slot);
    for (const to of [-1, 1.5, "2", null, {}, [], [1, "2"], everySeat]) expect(parseClientMessage(JSON.stringify({ type: "chat", text: "psst", to }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: "psst", to: everySeat.slice(1) }))).toEqual({ type: "chat", text: "psst", to: everySeat.slice(1) });
  });

  it("rejects a chat line that is not text", () => {
    expect(parseClientMessage(JSON.stringify({ type: "chat" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: 5 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: ["hi"] }))).toBeNull();
  });

  it("reads a change of the length of a turn", () => {
    expect(parseClientMessage(JSON.stringify({ type: "clock", seconds: 60 }))).toEqual({ type: "clock", seconds: 60 });
    expect(parseClientMessage(JSON.stringify({ type: "clock", seconds: 0 }))).toEqual({ type: "clock", seconds: 0 });
  });

  it("rejects a length of a turn that is not a number", () => {
    expect(parseClientMessage(JSON.stringify({ type: "clock" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "clock", seconds: "60" }))).toBeNull();
    expect(parseClientMessage('{"type":"clock","seconds":1e999}')).toBeNull();
  });

  it("reads a choice of how the room's games are played", () => {
    expect(parseClientMessage(JSON.stringify({ type: "variant", variant: "show" }))).toEqual({ type: "variant", variant: "show" });
    expect(parseClientMessage(JSON.stringify({ type: "variant", variant: "" }))).toEqual({ type: "variant", variant: "" });
  });

  it("rejects such a choice that is not a word", () => {
    expect(parseClientMessage(JSON.stringify({ type: "variant" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "variant", variant: 1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "variant", variant: null }))).toBeNull();
  });

  it("reads coming into voice and going out of it", () => {
    expect(parseClientMessage(JSON.stringify({ type: "voice", on: true, muted: true }))).toEqual({ type: "voice", on: true, muted: true });
    expect(parseClientMessage(JSON.stringify({ type: "voice" }))).toEqual({ type: "voice", on: false, muted: false });
  });

  it("reads a voice signal for another player", () => {
    const signal = { kind: "offer", sdp: "v=0" };

    expect(parseClientMessage(JSON.stringify({ type: "rtc", to: 2, signal }))).toEqual({ type: "rtc", to: 2, signal });
  });

  it("rejects a voice signal that is for nobody, or is no signal", () => {
    const signal = { kind: "offer", sdp: "v=0" };

    expect(parseClientMessage(JSON.stringify({ type: "rtc", signal }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "rtc", to: -1, signal }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "rtc", to: 1.5, signal }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "rtc", to: 1, signal: { kind: "bye" } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "rtc", to: 1 }))).toBeNull();
  });

  it("reads a poke", () => {
    expect(parseClientMessage(JSON.stringify({ type: "poke", extra: 1 }))).toEqual({ type: "poke" });
  });

  it("does not take the ping for a message of the protocol", () => {
    expect(parseClientMessage(PING)).toBeNull();
    expect(parseServerMessage(PONG)).toBeNull();
  });

  it("rejects a change of listing that does not say which way", () => {
    expect(parseClientMessage(JSON.stringify({ type: "listing" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "listing", listed: "true" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "ready" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "ready", ready: 1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "reading" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "reading", reading: "yes" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "wish" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "when" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "when", at: "21:00" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "when", at: -1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "when", at: 1.5 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "wish", game: "no-such-game" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "host" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "host", to: -1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "host", to: 1.5 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "host", to: "1" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "kick" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "kick", slot: -1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "kick", slot: 0.5 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "pick" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "pick", game: "no-such-game" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "pick", game: 3 }))).toBeNull();
  });

  it("treats a join without a create flag as not creating", () => {
    const raw = JSON.stringify({ type: "join", token: "player-token-0001", nick: "ann" });

    expect(parseClientMessage(raw)).toMatchObject({ create: false });
  });

  it("treats any create value other than true as not creating", () => {
    expect(parseClientMessage(joinJson({ create: "1" }))).toMatchObject({ create: false });
  });

  it("rejects a join whose token is not a string", () => {
    expect(parseClientMessage(joinJson({ token: 12345 }))).toBeNull();
  });

  it("rejects a join without a nickname", () => {
    expect(parseClientMessage(JSON.stringify({ type: "join", token: "t" }))).toBeNull();
  });

  it("drops fields the protocol does not define", () => {
    expect(parseClientMessage(JSON.stringify({ type: "leave", slot: 3 }))).toEqual({
      type: "leave",
    });
  });

  it("rejects a message of an unknown type", () => {
    expect(parseClientMessage(JSON.stringify({ type: "shoot" }))).toBeNull();
  });

  it("rejects text that is not JSON", () => {
    expect(parseClientMessage("join please")).toBeNull();
  });

  it("rejects JSON that is not an object", () => {
    expect(parseClientMessage('["join"]')).toBeNull();
  });

  it("rejects binary data", () => {
    expect(parseClientMessage(new ArrayBuffer(8))).toBeNull();
  });

  it("accepts a message exactly at the length limit", () => {
    const base = joinJson({ nick: "" });
    const raw = joinJson({ nick: "n".repeat(MAX_CLIENT_MESSAGE_LENGTH - base.length) });

    expect(raw).toHaveLength(MAX_CLIENT_MESSAGE_LENGTH);
    expect(parseClientMessage(raw)).not.toBeNull();
  });

  it("rejects a message one character over the length limit", () => {
    const base = joinJson({ nick: "" });
    const raw = joinJson({ nick: "n".repeat(MAX_CLIENT_MESSAGE_LENGTH - base.length + 1) });

    expect(parseClientMessage(raw)).toBeNull();
  });

  it("reads a start, asking for bots only when it says so plainly", () => {
    const plain = JSON.stringify({ type: "start" });
    const withBots = JSON.stringify({ type: "start", bots: true });
    const sloppy = JSON.stringify({ type: "start", bots: "yes" });

    expect(parseClientMessage(plain)).toEqual({ type: "start", bots: false });
    expect(parseClientMessage(withBots)).toEqual({ type: "start", bots: true });
    expect(parseClientMessage(sloppy)).toEqual({ type: "start", bots: false });
  });

  it("passes on what is asked of the game as it came, for the game itself to check", () => {
    const raw = JSON.stringify({ type: "action", seat: 3, action: { type: "rotate", steps: 2 } });

    // what a move may be differs from game to game: the game's host reads it, not the wire
    expect(parseClientMessage(raw)).toEqual({ type: "action", action: { type: "rotate", steps: 2 } });
  });

  it("rejects an action that is not a thing with parts", () => {
    expect(parseClientMessage(JSON.stringify({ type: "action" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "action", action: "buzz" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "action", action: null }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "action", action: ["buzz"] }))).toBeNull();
  });

  it("reads a choice of team", () => {
    expect(parseClientMessage(JSON.stringify({ type: "team", team: 2, slot: 5 }))).toEqual({ type: "team", team: 2 });
    expect(parseClientMessage(JSON.stringify({ type: "team", team: 0 }))).toEqual({ type: "team", team: 0 });
  });

  it("rejects a team that is not a whole number from 0", () => {
    expect(parseClientMessage(JSON.stringify({ type: "team" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "team", team: -1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "team", team: 1.5 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "team", team: "1" }))).toBeNull();
  });
});

describe("parseWatchingNote", () => {
  it("reads how many are looking at the list, and whether there are more than it says", () => {
    expect(parseWatchingNote(JSON.stringify({ type: "watching", count: 3, more: false }))).toEqual({ type: "watching", count: 3, more: false });
    expect(parseWatchingNote(JSON.stringify({ type: "watching", count: 20, more: true }))).toEqual({ type: "watching", count: 20, more: true });
  });

  it("reads nothing else as that: a list of rooms, a number that is no count", () => {
    expect(parseWatchingNote(JSON.stringify({ type: "rooms", rooms: [] }))).toBeNull();
    expect(parseWatchingNote(JSON.stringify({ type: "watching" }))).toBeNull();
    expect(parseWatchingNote(JSON.stringify({ type: "watching", count: -1 }))).toBeNull();
    expect(parseWatchingNote(JSON.stringify({ type: "watching", count: 1.5 }))).toBeNull();
    expect(parseWatchingNote(JSON.stringify({ type: "watching", count: "3" }))).toBeNull();
  });
});

describe("parseServerMessage", () => {
  it("reads a game sent as what has changed in it as the game it stands for, through the connection's reader", () => {
    const read = gameReader();
    const game = { type: "game", room: "ABCDE", game: DEFAULT_GAME, round: 1 };

    const whole = parseServerMessage(JSON.stringify(game), read);
    const made = parseServerMessage(JSON.stringify({ type: "game-part", room: "ABCDE", answer: true, part: { o: { round: { s: 2 } } } }), read);

    expect(whole).toEqual(game);
    expect(made).toEqual({ ...game, round: 2, answer: true });
  });

  it("reads who a game of 탈락전 put out and who has won, and nothing of one that does not say", () => {
    const told = { type: "knocked", out: [2, 3], champion: null };

    expect(parseServerMessage(JSON.stringify(told))).toEqual(told);
    expect(parseServerMessage(JSON.stringify({ ...told, champion: 1 }))).toEqual({ ...told, champion: 1 });
    expect(parseServerMessage(JSON.stringify({ type: "knocked", out: "2", champion: null }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "knocked", out: [2] }))).toBeNull();
  });

  it("makes nothing of a part of a game with no reader, or with no game before it", () => {
    const part = JSON.stringify({ type: "game-part", room: "ABCDE", part: { o: {} } });

    expect(parseServerMessage(part)).toBeNull();
    expect(parseServerMessage(part, gameReader())).toBeNull();
  });

  it("reads a word said with one press, and nothing said so that is not one of them", () => {
    const said = { type: "quick", room: "ABCDE", from: 1, nick: "ann", word: QUICK_WORDS[0], at: 5 };

    expect(parseServerMessage(JSON.stringify(said))).toEqual(said);
    expect(parseServerMessage(JSON.stringify({ ...said, word: "a sentence" }))).toBeNull();
  });

  it("accepts the room's question to its host", () => {
    expect(parseServerMessage(JSON.stringify({ type: "host-check" }))).toEqual({ type: "host-check" });
  });

  it("accepts the word that the host sent a player out, with the slot they held", () => {
    expect(parseServerMessage(JSON.stringify({ type: "sent-out", slot: 2 }))).toEqual({ type: "sent-out", slot: 2 });
    expect(parseServerMessage(JSON.stringify({ type: "sent-out" }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "sent-out", slot: "2" }))).toBeNull();
  });

  it("accepts the reason a player sent out by the host is given", () => {
    expect(parseServerMessage(JSON.stringify({ type: "error", reason: "kicked" }))).toEqual({ type: "error", reason: "kicked" });
  });

  it("reads an error with its reason", () => {
    const raw = JSON.stringify({ type: "error", reason: "full" });

    expect(parseServerMessage(raw)).toEqual({ type: "error", reason: "full" });
  });

  it("reads a refusal with its reason", () => {
    const raw = JSON.stringify({ type: "refused", reason: "not-your-turn" });

    expect(parseServerMessage(raw)).toEqual({ type: "refused", reason: "not-your-turn" });
  });

  it("reads a game message", () => {
    const raw = JSON.stringify({ type: "game", room: "AAAAA", players: [], turnEndsIn: null, view: { seat: null } });

    expect(parseServerMessage(raw)).toMatchObject({ type: "game", room: "AAAAA", turnEndsIn: null });
  });

  it("rejects a message of an unknown type", () => {
    expect(parseServerMessage(JSON.stringify({ type: "hello" }))).toBeNull();
  });
});

describe("parseDirectoryMessage", () => {
  it("reads the list of rooms", () => {
    const rooms = [{ code: "ABCDE", game: DEFAULT_GAME, host: "ann", players: 2, maxPlayers: 6, playing: false }];

    expect(parseDirectoryMessage(JSON.stringify({ type: "rooms", rooms }))).toEqual({ type: "rooms", rooms });
  });

  it("reads an empty list", () => {
    expect(parseDirectoryMessage(JSON.stringify({ type: "rooms", rooms: [] }))).toEqual({ type: "rooms", rooms: [] });
  });

  it("reads which game the list is of: one game, or every game", () => {
    expect(parseDirectoryMessage(JSON.stringify({ type: "rooms", rooms: [], of: DEFAULT_GAME }))).toEqual({ type: "rooms", rooms: [], of: DEFAULT_GAME });
    expect(parseDirectoryMessage(JSON.stringify({ type: "rooms", rooms: [], of: null }))).toEqual({ type: "rooms", rooms: [], of: null });
  });

  it("reads a list of a game it has not heard of as a list that does not say which game it is of", () => {
    expect(parseDirectoryMessage(JSON.stringify({ type: "rooms", rooms: [], of: "a-game-not-made-yet" }))).toEqual({ type: "rooms", rooms: [] });
  });

  it("rejects a message of another type", () => {
    expect(parseDirectoryMessage(JSON.stringify({ type: "lobby", rooms: [] }))).toBeNull();
  });

  it("rejects a list that is not a list", () => {
    expect(parseDirectoryMessage(JSON.stringify({ type: "rooms", rooms: "none" }))).toBeNull();
  });

  it("rejects text that is not JSON", () => {
    expect(parseDirectoryMessage("rooms")).toBeNull();
  });

  it("reads how many rooms of each game there are", () => {
    const counts = { [DEFAULT_GAME]: 42 };

    expect(parseDirectoryMessage(JSON.stringify({ type: "rooms", rooms: [], counts }))).toEqual({ type: "rooms", rooms: [], counts });
  });

  it("reads a list without counts, as a directory older than them sends it", () => {
    expect(parseDirectoryMessage(JSON.stringify({ type: "rooms", rooms: [] }))?.counts).toBeUndefined();
  });

  it("reads which build the directory's code is from, and takes anything but text as not said", () => {
    expect(parseDirectoryMessage(JSON.stringify({ type: "rooms", rooms: [], build: "abc1234" }))).toEqual({ type: "rooms", rooms: [], build: "abc1234" });
    expect(parseDirectoryMessage(JSON.stringify({ type: "rooms", rooms: [], build: 7 }))).toEqual({ type: "rooms", rooms: [] });
  });

  it("reads whether a word about the game can be sent from here, and takes anything but yes or no as not said", () => {
    expect(parseDirectoryMessage(JSON.stringify({ type: "rooms", rooms: [], feedback: true }))).toEqual({ type: "rooms", rooms: [], feedback: true });
    expect(parseDirectoryMessage(JSON.stringify({ type: "rooms", rooms: [], feedback: "yes" }))).toEqual({ type: "rooms", rooms: [] });
  });

  it("drops counts that are not counts by game, keeping the list", () => {
    const rooms = [{ code: "ABCDE", game: DEFAULT_GAME, host: "ann", players: 2, maxPlayers: 6, playing: false }];

    for (const counts of [7, "many", null, [1, 2]]) {
      expect(parseDirectoryMessage(JSON.stringify({ type: "rooms", rooms, counts }))).toEqual({ type: "rooms", rooms });
    }
  });
});

describe("parseFeedbackAnswer", () => {
  it("reads whether the word about the game went on its way", () => {
    expect(parseFeedbackAnswer(JSON.stringify({ type: "feedback", sent: true }))).toEqual({ type: "feedback", sent: true });
    expect(parseFeedbackAnswer(JSON.stringify({ type: "feedback", sent: false }))).toEqual({ type: "feedback", sent: false });
  });

  it("rejects a list of rooms, and an answer that does not say", () => {
    expect(parseFeedbackAnswer(JSON.stringify({ type: "rooms", rooms: [] }))).toBeNull();
    expect(parseFeedbackAnswer(JSON.stringify({ type: "feedback" }))).toBeNull();
    expect(parseFeedbackAnswer("feedback")).toBeNull();
  });
});

describe("parseInboxAnswer", () => {
  it("reads the words kept", () => {
    const word = { id: 3, at: 1_700_000_000_000, text: "the list is slow", lang: "en", build: "abc1234" };

    expect(parseInboxAnswer(JSON.stringify({ type: "inbox", words: [word] }))).toEqual({ type: "inbox", words: [word] });
    expect(parseInboxAnswer(JSON.stringify({ type: "inbox", words: [] }))).toEqual({ type: "inbox", words: [] });
  });

  it("reads a player pointed out in a room among them: who, and in which game", () => {
    const word = { id: 4, at: 1_700_000_000_000, text: "a line of theirs", lang: "en", build: "", flag: { nick: "rude", game: "count-cubes" } };

    expect(parseInboxAnswer(JSON.stringify({ type: "inbox", words: [word] }))).toEqual({ type: "inbox", words: [word] });
  });

  it("reads a word whose flag is not one as a word, without it", () => {
    const word = { id: 3, at: 1, text: "kept", lang: "ko", build: "a" };

    for (const flag of [null, "rude", {}, { nick: "rude" }, { nick: 1, game: "g" }]) {
      expect(parseInboxAnswer(JSON.stringify({ type: "inbox", words: [{ ...word, flag }] }))).toEqual({ type: "inbox", words: [word] });
    }
  });

  it("reads that the inbox did not open", () => {
    expect(parseInboxAnswer(JSON.stringify({ type: "inbox", words: null }))).toEqual({ type: "inbox", words: null });
  });

  it("leaves out what is not a word as they are kept", () => {
    const word = { id: 3, at: 1, text: "kept", lang: "ko", build: "a" };
    const raw = JSON.stringify({ type: "inbox", words: [word, null, { ...word, id: "3" }, { ...word, lang: "xx" }, { ...word, text: 7 }, "word"] });

    expect(parseInboxAnswer(raw)).toEqual({ type: "inbox", words: [word] });
  });

  it("rejects anything else", () => {
    expect(parseInboxAnswer(JSON.stringify({ type: "rooms", rooms: [] }))).toBeNull();
    expect(parseInboxAnswer(JSON.stringify({ type: "inbox" }))).toBeNull();
    expect(parseInboxAnswer(JSON.stringify({ type: "inbox", words: "none" }))).toBeNull();
    expect(parseInboxAnswer("inbox")).toBeNull();
  });
});

describe("parseDirectoryRequest", () => {
  it("reads a word about the game, with the language and the build of the page it was written on", () => {
    const raw = JSON.stringify({ type: "feedback", text: "the list is slow", lang: "en", build: "abc1234" });

    expect(parseDirectoryRequest(raw)).toEqual({ type: "feedback", text: "the list is slow", lang: "en", build: "abc1234" });
  });

  it("keeps only the fields of a word about the game, and cuts a build's name short", () => {
    const raw = JSON.stringify({ type: "feedback", text: "hi", lang: "ko", build: "x".repeat(200), nick: "ann", token: "secret" });

    expect(parseDirectoryRequest(raw)).toEqual({ type: "feedback", text: "hi", lang: "ko", build: "x".repeat(16) });
  });

  it("rejects a word about the game with no text, or in a language there are no words for", () => {
    expect(parseDirectoryRequest(JSON.stringify({ type: "feedback", lang: "en", build: "a" }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "feedback", text: 7, lang: "en", build: "a" }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "feedback", text: "hi", lang: "xx", build: "a" }))).toBeNull();
  });

  it("reads a request for the inbox, with its key, and with the word to throw away where one is named", () => {
    expect(parseDirectoryRequest(JSON.stringify({ type: "inbox", key: "my key" }))).toEqual({ type: "inbox", key: "my key" });
    expect(parseDirectoryRequest(JSON.stringify({ type: "inbox", key: "my key", drop: 12, more: 1 }))).toEqual({ type: "inbox", key: "my key", drop: 12 });
  });

  it("reads a hand going up for a game, and going down", () => {
    expect(parseDirectoryRequest(JSON.stringify({ type: "want", game: "under-thirteen", more: 1 }))).toEqual({ type: "want", game: "under-thirteen" });
    expect(parseDirectoryRequest(JSON.stringify({ type: "want", game: null }))).toEqual({ type: "want", game: null });
  });

  it("rejects a hand for a game there is not, or for none said", () => {
    expect(parseDirectoryRequest(JSON.stringify({ type: "want", game: "chess" }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "want" }))).toBeNull();
  });

  it("reads a word given for a meeting, and one taken back", () => {
    const who = "000102030405060708090a0b0c0d0e0f";
    expect(parseDirectoryRequest(JSON.stringify({ type: "going", meet: 1_800_000_000_000, who, on: true, more: 1 }))).toEqual({ type: "going", meet: 1_800_000_000_000, who, on: true });
    expect(parseDirectoryRequest(JSON.stringify({ type: "going", meet: 1_800_000_000_000, who, on: false }))).toEqual({ type: "going", meet: 1_800_000_000_000, who, on: false });
  });

  it("rejects a word for no meeting, from nobody, or that says neither yes nor no", () => {
    const who = "000102030405060708090a0b0c0d0e0f";
    expect(parseDirectoryRequest(JSON.stringify({ type: "going", who, on: true }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "going", meet: 1.5, who, on: true }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "going", meet: "1800000000000", who, on: true }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "going", meet: 1_800_000_000_000, who: "me", on: true }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "going", meet: 1_800_000_000_000, on: true }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "going", meet: 1_800_000_000_000, who }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "going", meet: 1_800_000_000_000, who, on: 1 }))).toBeNull();
  });

  it("reads a request for the numbers, with its key and nothing else", () => {
    expect(parseDirectoryRequest(JSON.stringify({ type: "numbers", key: "my key", drop: 3 }))).toEqual({ type: "numbers", key: "my key" });
  });

  it("rejects a request for the numbers with no key, or a key too long to be one", () => {
    expect(parseDirectoryRequest(JSON.stringify({ type: "numbers" }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "numbers", key: "" }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "numbers", key: "k".repeat(201) }))).toBeNull();
  });

  it("rejects a request for the inbox with no key, a key too long to be one, or a word to throw away that names none", () => {
    expect(parseDirectoryRequest(JSON.stringify({ type: "inbox" }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "inbox", key: "" }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "inbox", key: 5 }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "inbox", key: "k".repeat(201) }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "inbox", key: "k", drop: -1 }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "inbox", key: "k", drop: 1.5 }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "inbox", key: "k", drop: "1" }))).toBeNull();
  });

  it("reads a request for the rooms of one game", () => {
    expect(parseDirectoryRequest(JSON.stringify({ type: "show", game: DEFAULT_GAME }))).toEqual({ type: "show", game: DEFAULT_GAME });
  });

  it("reads a request for the rooms of every game", () => {
    expect(parseDirectoryRequest(JSON.stringify({ type: "show", game: null }))).toEqual({ type: "show", game: null });
  });

  it("keeps only the fields of a request", () => {
    const raw = JSON.stringify({ type: "show", game: DEFAULT_GAME, code: "ABCDE", listing: {} });

    expect(parseDirectoryRequest(raw)).toEqual({ type: "show", game: DEFAULT_GAME });
  });

  it("rejects a request for a game there is not", () => {
    expect(parseDirectoryRequest(JSON.stringify({ type: "show", game: "no-such-game" }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "show", game: 3 }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "show" }))).toBeNull();
  });

  it("rejects a message of another type", () => {
    expect(parseDirectoryRequest(JSON.stringify({ type: "rooms", game: DEFAULT_GAME }))).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ code: "ABCDE", listing: null }))).toBeNull();
  });

  it("rejects text that is not JSON, and text too long to be a request", () => {
    expect(parseDirectoryRequest("show")).toBeNull();
    expect(parseDirectoryRequest(JSON.stringify({ type: "show", game: DEFAULT_GAME, pad: "x".repeat(MAX_DIRECTORY_REQUEST_LENGTH) }))).toBeNull();
  });
});

describe("parseNumbersAnswer", () => {
  it("reads the days sent, and that the numbers were not given", () => {
    const day = { day: 20773, counts: { visits: 3, "hour:9": 3 } };

    expect(parseNumbersAnswer(JSON.stringify({ type: "numbers", days: [day] }))).toEqual({ type: "numbers", days: [day] });
    expect(parseNumbersAnswer(JSON.stringify({ type: "numbers", days: null }))).toEqual({ type: "numbers", days: null });
  });

  it("is nothing for another message, or for days that are not a list", () => {
    expect(parseNumbersAnswer(JSON.stringify({ type: "inbox", words: null }))).toBeNull();
    expect(parseNumbersAnswer(JSON.stringify({ type: "numbers" }))).toBeNull();
    expect(parseNumbersAnswer(JSON.stringify({ type: "numbers", days: "none" }))).toBeNull();
  });
});

describe("parseComingNote", () => {
  it("reads how many are coming to a meeting, and whether there are more than it says", () => {
    expect(parseComingNote(JSON.stringify({ type: "coming", meet: 1_800_000_000_000, count: 3, more: false, who: "x" }))).toEqual({ type: "coming", meet: 1_800_000_000_000, count: 3, more: false });
    expect(parseComingNote(JSON.stringify({ type: "coming", meet: 1_800_000_000_000, count: 20, more: true }))).toEqual({ type: "coming", meet: 1_800_000_000_000, count: 20, more: true });
    expect(parseComingNote(JSON.stringify({ type: "coming", meet: 1_800_000_000_000, count: 0 }))).toEqual({ type: "coming", meet: 1_800_000_000_000, count: 0, more: false });
  });

  it("is nothing for another message, with no meeting, or with a count that is not one", () => {
    expect(parseComingNote(JSON.stringify({ type: "watching", count: 2 }))).toBeNull();
    expect(parseComingNote(JSON.stringify({ type: "coming", count: 2 }))).toBeNull();
    expect(parseComingNote(JSON.stringify({ type: "coming", meet: 1_800_000_000_000 }))).toBeNull();
    expect(parseComingNote(JSON.stringify({ type: "coming", meet: 1_800_000_000_000, count: -1 }))).toBeNull();
    expect(parseComingNote(JSON.stringify({ type: "coming", meet: 1_800_000_000_000, count: 1.5 }))).toBeNull();
  });
});

describe("parseWantingNote", () => {
  it("reads how many hands are up for each game, and that none are", () => {
    expect(parseWantingNote(JSON.stringify({ type: "wanting", games: { "under-thirteen": 2, chess: 1 } }))).toEqual({ type: "wanting", games: { "under-thirteen": 2 } });
    expect(parseWantingNote(JSON.stringify({ type: "wanting", games: {} }))).toEqual({ type: "wanting", games: {} });
  });

  it("is nothing for another message, or with no count by game", () => {
    expect(parseWantingNote(JSON.stringify({ type: "watching", count: 2 }))).toBeNull();
    expect(parseWantingNote(JSON.stringify({ type: "wanting" }))).toBeNull();
    expect(parseWantingNote(JSON.stringify({ type: "wanting", games: [1] }))).toBeNull();
  });
});
