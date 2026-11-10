import { describe, expect, it } from "vitest";
import { DEFAULT_GAME } from "../../../src/shared/games";
import {
  MAX_CLIENT_MESSAGE_LENGTH,
  parseClientMessage,
  parseDirectoryMessage,
  parseServerMessage,
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
    });
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
  });

  it("rejects a change of listing that does not say which way", () => {
    expect(parseClientMessage(JSON.stringify({ type: "listing" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "listing", listed: "true" }))).toBeNull();
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

  it("reads a move and keeps only what the move is made of", () => {
    const raw = JSON.stringify({ type: "action", seat: 3, action: { type: "rotate", steps: 2, credits: 99 } });

    expect(parseClientMessage(raw)).toEqual({ type: "action", action: { type: "rotate", steps: 2 } });
  });

  it("rejects an action that is not one of the game's moves", () => {
    const unknown = JSON.stringify({ type: "action", action: { type: "fire" } });
    const missing = JSON.stringify({ type: "action" });
    const fractional = JSON.stringify({ type: "action", action: { type: "tamper", amount: 1.5 } });

    expect(parseClientMessage(unknown)).toBeNull();
    expect(parseClientMessage(missing)).toBeNull();
    expect(parseClientMessage(fractional)).toBeNull();
  });
});

describe("parseServerMessage", () => {
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

  it("rejects a message of another type", () => {
    expect(parseDirectoryMessage(JSON.stringify({ type: "lobby", rooms: [] }))).toBeNull();
  });

  it("rejects a list that is not a list", () => {
    expect(parseDirectoryMessage(JSON.stringify({ type: "rooms", rooms: "none" }))).toBeNull();
  });

  it("rejects text that is not JSON", () => {
    expect(parseDirectoryMessage("rooms")).toBeNull();
  });
});
