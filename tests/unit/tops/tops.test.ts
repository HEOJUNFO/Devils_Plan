import { describe, expect, it } from "vitest";
import { createLobby, joinLobby, viewLobby, withTops, type LobbyState } from "../../../src/shared/lobby";
import roomConfig from "../../../src/shared/room-config.json";
import { topsOf, type TopsConfig } from "../../../src/shared/tops";

const CONFIG: TopsConfig = { on: true, peopleAtLeast: 2 };
const token = (n: number): string => `player-token-${String(n).padStart(4, "0")}`;

/** A lobby of players 0..count-1. */
function lobbyOf(count: number): LobbyState {
  let state = createLobby();
  for (let n = 0; n < count; n++) {
    const result = joinLobby(state, { token: token(n), nick: `p${n}` }, roomConfig);
    if (!result.ok) throw new Error(`fixture join refused: ${result.reason}`);
    state = result.state;
  }
  return state;
}

/** The slots marked as the top, as everyone sees them. */
function topSlots(state: LobbyState): number[] {
  return viewLobby(state, new Set(), 0, roomConfig)
    .players.filter((p) => p.top)
    .map((p) => p.slot);
}

describe("topsOf", () => {
  it("names whoever ended at the best place", () => {
    const lines = [
      { token: token(0), place: 2 },
      { token: token(1), place: 1 },
      { token: token(2), place: 3 },
    ];

    expect([...(topsOf(lines, CONFIG) ?? [])]).toEqual([token(1)]);
  });

  it("names everyone who shares the best place", () => {
    const lines = [
      { token: token(0), place: 1 },
      { token: token(1), place: 1 },
      { token: token(2), place: 2 },
    ];

    expect([...(topsOf(lines, CONFIG) ?? [])]).toEqual([token(0), token(1)]);
  });

  it("names nobody where everyone ended level", () => {
    const lines = [
      { token: token(0), place: 1 },
      { token: token(1), place: 1 },
    ];

    expect(topsOf(lines, CONFIG)).toEqual(new Set());
  });

  it("says nothing for a game cut short, or one that tells no places", () => {
    expect(topsOf(null, CONFIG)).toBeNull();
    expect(topsOf(undefined, CONFIG)).toBeNull();
  });

  it("says nothing for a game a bot played in", () => {
    const lines = [
      { token: token(0), place: 1 },
      { token: null, place: 2 },
    ];

    expect(topsOf(lines, CONFIG)).toBeNull();
  });

  it("says nothing for a game of fewer people than the room counts", () => {
    expect(topsOf([{ token: token(0), place: 1 }], CONFIG)).toBeNull();
  });

  it("says nothing where rooms keep no mark", () => {
    const lines = [
      { token: token(0), place: 1 },
      { token: token(1), place: 2 },
    ];

    expect(topsOf(lines, { ...CONFIG, on: false })).toBeNull();
  });
});

describe("withTops", () => {
  it("marks the players named, as everyone sees them", () => {
    const state = withTops(lobbyOf(3), new Set([token(1)]));

    expect(topSlots(state)).toEqual([1]);
  });

  it("takes the mark from whoever had it when the next game names someone else", () => {
    const first = withTops(lobbyOf(3), new Set([token(1)]));

    const second = withTops(first, new Set([token(0), token(2)]));

    expect(topSlots(second)).toEqual([0, 2]);
  });

  it("takes every mark away after a game everyone ended level in", () => {
    const first = withTops(lobbyOf(3), new Set([token(1)]));

    expect(topSlots(withTops(first, new Set()))).toEqual([]);
  });

  it("leaves the marks as they were after a game that says nothing", () => {
    const first = withTops(lobbyOf(3), new Set([token(1)]));

    expect(withTops(first, null)).toBe(first);
  });

  it("returns the same state when nothing changes, and does not modify its input", () => {
    const before = lobbyOf(2);
    const marked = withTops(before, new Set([token(0)]));

    expect(withTops(marked, new Set([token(0)]))).toBe(marked);
    expect(topSlots(before)).toEqual([]);
  });

  it("marks nobody for a token that is no longer in the room", () => {
    expect(topSlots(withTops(lobbyOf(2), new Set([token(9)])))).toEqual([]);
  });

  it("keeps the mark of a player who comes back with the same token", () => {
    const marked = withTops(lobbyOf(2), new Set([token(1)]));

    const back = joinLobby(marked, { token: token(1), nick: "again" }, roomConfig);

    expect(back.ok && topSlots(back.state)).toEqual([1]);
  });
});
