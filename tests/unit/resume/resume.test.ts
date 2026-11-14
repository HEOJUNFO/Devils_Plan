import { describe, expect, it } from "vitest";
import { DEFAULT_GAME } from "../../../src/shared/games";
import { keepRoom, keptCode, keptRoom, leaveSeat, seatLeft } from "../../../src/shared/resume";
import shipped from "../../../src/shared/room-config.json";

/** The room the page was in. */
const CODE = "ABCDE";
/** Another room. */
const OTHER = "FGHJK";
/** An arbitrary moment the tests call the page being put away, in ms. */
const PUT_AWAY = 1_000_000_000;
/** How long a room holds an away player's place, as shipped: what is kept is shown no longer than that. */
const MAX_AGE = shipped.awaySlotSeconds;
const MAX_AGE_MS = MAX_AGE * 1000;

/** The room's word on the waiting room of `room`, as text. */
function lobbyText(room = CODE, change: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "lobby",
    room,
    you: 0,
    maxPlayers: 6,
    game: DEFAULT_GAME,
    listed: false,
    turnSeconds: 0,
    variant: null,
    voice: true,
    host: 0,
    players: [{ slot: 0, nick: "하나", connected: true }],
    ...change,
  });
}

/** The room's word on a game of `room` in `phase`, as text. */
function gameText(room = CODE, change: Record<string, unknown> = {}, phase = "play"): string {
  return JSON.stringify({ type: "game", room, game: DEFAULT_GAME, startedAt: PUT_AWAY - 60_000, view: { phase }, ...change });
}

describe("a room put away and looked for again", () => {
  it("comes back as it was sent, the waiting room alone when no game was on the screen", () => {
    const kept = keptRoom(keepRoom(CODE, lobbyText(), null, PUT_AWAY), CODE, PUT_AWAY + 1500, MAX_AGE);

    expect(kept).toEqual({ lobby: JSON.parse(lobbyText()), game: null, at: PUT_AWAY });
  });

  it("comes back with the game that was on the screen", () => {
    const kept = keptRoom(keepRoom(CODE, lobbyText(), gameText(), PUT_AWAY), CODE, PUT_AWAY + 1500, MAX_AGE);

    expect(kept?.game).toEqual(JSON.parse(gameText()));
  });

  it("comes back with a finished game's results, which were on the screen too", () => {
    const ended = gameText(CODE, {}, "ended");

    expect(keptRoom(keepRoom(CODE, lobbyText(), ended, PUT_AWAY), CODE, PUT_AWAY + 1500, MAX_AGE)?.game).toEqual(JSON.parse(ended));
  });

  it("is shown for as long as the room holds the player's place, and not a moment longer", () => {
    const stored = keepRoom(CODE, lobbyText(), null, PUT_AWAY);

    expect(keptRoom(stored, CODE, PUT_AWAY + MAX_AGE_MS, MAX_AGE)).not.toBeNull();
    expect(keptRoom(stored, CODE, PUT_AWAY + MAX_AGE_MS + 1, MAX_AGE)).toBeNull();
  });

  it("is not shown when its time is ahead of now: a clock was moved, and how old it is cannot be told", () => {
    expect(keptRoom(keepRoom(CODE, lobbyText(), null, PUT_AWAY), CODE, PUT_AWAY - 1, MAX_AGE)).toBeNull();
  });
});

describe("what is not this page's room", () => {
  it("is nothing when nothing was kept", () => {
    expect(keptRoom(null, CODE, PUT_AWAY, MAX_AGE)).toBeNull();
  });

  it("is not shown for another room's address", () => {
    expect(keptRoom(keepRoom(CODE, lobbyText(), null, PUT_AWAY), OTHER, PUT_AWAY, MAX_AGE)).toBeNull();
  });

  it("is not shown when the waiting room kept is another room's", () => {
    expect(keptRoom(keepRoom(CODE, lobbyText(OTHER), null, PUT_AWAY), CODE, PUT_AWAY, MAX_AGE)).toBeNull();
  });

  it.each([
    ["not JSON", "{"],
    ["not an object", "[]"],
    ["nothing", "null"],
    ["no time", JSON.stringify({ code: CODE, lobby: lobbyText(), game: null })],
    ["a time that is not a number", JSON.stringify({ code: CODE, at: "now", lobby: lobbyText(), game: null })],
    ["no waiting room", JSON.stringify({ code: CODE, at: PUT_AWAY, lobby: null, game: null })],
    ["a waiting room that is not text", JSON.stringify({ code: CODE, at: PUT_AWAY, lobby: JSON.parse(lobbyText()), game: null })],
    ["a game where the waiting room should be", keepRoom(CODE, gameText(), null, PUT_AWAY)],
    ["a waiting room with no players", keepRoom(CODE, lobbyText(CODE, { players: undefined }), null, PUT_AWAY)],
    ["a waiting room with no seat for the viewer", keepRoom(CODE, lobbyText(CODE, { you: undefined }), null, PUT_AWAY)],
    ["a waiting room for a game this page has not heard of", keepRoom(CODE, lobbyText(CODE, { game: "no-such-game" }), null, PUT_AWAY)],
  ])("is not shown when what was kept is %s", (_what, stored) => {
    expect(keptRoom(stored, CODE, PUT_AWAY, MAX_AGE)).toBeNull();
  });

  it.each([
    ["another room's", gameText(OTHER)],
    ["of a game this page has not heard of", gameText(CODE, { game: "no-such-game" })],
    ["without a start", gameText(CODE, { startedAt: undefined })],
    ["without a view", gameText(CODE, { view: null })],
    ["not a game at all", lobbyText()],
    ["not JSON", "{"],
  ])("shows the waiting room alone when the game kept is %s", (_what, game) => {
    const kept = keptRoom(keepRoom(CODE, lobbyText(), game, PUT_AWAY), CODE, PUT_AWAY, MAX_AGE);

    expect(kept).not.toBeNull();
    expect(kept?.game).toBeNull();
  });
});

describe("the room a page was in, where its address does not say", () => {
  it("is the room that was put away", () => {
    expect(keptCode(keepRoom(CODE, lobbyText(), null, PUT_AWAY))).toBe(CODE);
    expect(keptCode(keepRoom(OTHER, lobbyText(OTHER), gameText(OTHER), PUT_AWAY))).toBe(OTHER);
  });

  it("is no room when nothing was kept, or what was kept is not this page's", () => {
    expect(keptCode(null)).toBe("");
    expect(keptCode("")).toBe("");
    expect(keptCode("not json")).toBe("");
    expect(keptCode("null")).toBe("");
    expect(keptCode(JSON.stringify({ at: PUT_AWAY }))).toBe("");
    expect(keptCode(JSON.stringify({ code: 12345 }))).toBe("");
  });

  it("names the room only: whether it is still shown is for keptRoom to say", () => {
    const old = keepRoom(CODE, lobbyText(), null, PUT_AWAY);
    expect(keptCode(old)).toBe(CODE);
    expect(keptRoom(old, keptCode(old), PUT_AWAY + MAX_AGE_MS + 1, MAX_AGE)).toBeNull();
  });
});

describe("the room a browser was last put away in", () => {
  /** A code is a room's when it is five capitals: enough for these tests. */
  const isCode = (code: string): boolean => /^[A-Z]{5}$/.test(code);

  it("is offered again with how long the room still holds the place", () => {
    const left = leaveSeat(CODE, PUT_AWAY);

    expect(seatLeft(left, PUT_AWAY, MAX_AGE, isCode)).toEqual({ code: CODE, until: PUT_AWAY + MAX_AGE_MS });
    expect(seatLeft(left, PUT_AWAY + MAX_AGE_MS - 1, MAX_AGE, isCode)).toEqual({ code: CODE, until: PUT_AWAY + MAX_AGE_MS });
  });

  it("is offered no longer once the room has let the place go, nor from a clock that is ahead of this one", () => {
    const left = leaveSeat(CODE, PUT_AWAY);

    expect(seatLeft(left, PUT_AWAY + MAX_AGE_MS, MAX_AGE, isCode)).toBeNull();
    expect(seatLeft(left, PUT_AWAY + 10 * MAX_AGE_MS, MAX_AGE, isCode)).toBeNull();
    expect(seatLeft(left, PUT_AWAY - 1, MAX_AGE, isCode)).toBeNull();
  });

  it("is nothing where nothing was left, or what was left is not a room and a moment", () => {
    expect(seatLeft(null, PUT_AWAY, MAX_AGE, isCode)).toBeNull();
    expect(seatLeft("", PUT_AWAY, MAX_AGE, isCode)).toBeNull();
    expect(seatLeft("{", PUT_AWAY, MAX_AGE, isCode)).toBeNull();
    expect(seatLeft("null", PUT_AWAY, MAX_AGE, isCode)).toBeNull();
    expect(seatLeft(JSON.stringify({ code: "abc", at: PUT_AWAY }), PUT_AWAY, MAX_AGE, isCode)).toBeNull();
    expect(seatLeft(JSON.stringify({ code: CODE, at: "now" }), PUT_AWAY, MAX_AGE, isCode)).toBeNull();
    expect(seatLeft(JSON.stringify({ code: CODE }), PUT_AWAY, MAX_AGE, isCode)).toBeNull();
  });

  it("leaves the room's code and the moment and nothing else", () => {
    expect(JSON.parse(leaveSeat(CODE, PUT_AWAY))).toEqual({ code: CODE, at: PUT_AWAY });
  });
});
