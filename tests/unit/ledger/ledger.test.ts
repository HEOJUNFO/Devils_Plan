import { describe, expect, it } from "vitest";
import { gainsOf, type LedgerConfig } from "../../../src/shared/ledger";
import { createLobby, joinLobby, viewLobby, withPieces, type LobbyState } from "../../../src/shared/lobby";
import roomConfig from "../../../src/shared/room-config.json";

const CONFIG: LedgerConfig = { on: true, peopleAtLeast: 2 };
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

describe("gainsOf", () => {
  it("gives each player who won pieces what they won, by their token", () => {
    const lines = [
      { token: token(0), pieces: 3 },
      { token: token(1), pieces: 0 },
      { token: token(2), pieces: 1 },
    ];

    expect([...gainsOf(lines, CONFIG)]).toEqual([
      [token(0), 3],
      [token(2), 1],
    ]);
  });

  it("gives nothing for a game that pays none, or was cut short", () => {
    expect(gainsOf(undefined, CONFIG).size).toBe(0);
    expect(gainsOf(null, CONFIG).size).toBe(0);
  });

  it("gives nothing for a game a bot played in: a bot is a test aid, not someone to win pieces from", () => {
    const lines = [
      { token: token(0), pieces: 4 },
      { token: null, pieces: 0 },
    ];

    expect(gainsOf(lines, CONFIG).size).toBe(0);
  });

  it("gives nothing for a game of fewer people than a game needs to count", () => {
    expect(gainsOf([{ token: token(0), pieces: 3 }], CONFIG).size).toBe(0);
  });

  it("gives nothing while the ledger is off", () => {
    const lines = [
      { token: token(0), pieces: 3 },
      { token: token(1), pieces: 0 },
    ];

    expect(gainsOf(lines, { ...CONFIG, on: false }).size).toBe(0);
  });

  it("takes no pieces from anyone: a line below nought, or not a whole number, is nothing", () => {
    const lines = [
      { token: token(0), pieces: -2 },
      { token: token(1), pieces: 1.5 },
      { token: token(2), pieces: 2 },
    ];

    expect([...gainsOf(lines, CONFIG)]).toEqual([[token(2), 2]]);
  });
});

describe("withPieces", () => {
  it("adds what each player won to what they had in the room", () => {
    const first = withPieces(lobbyOf(3), new Map([[token(0), 3]]));

    const second = withPieces(first, new Map([[token(0), 1], [token(2), 4]]));

    expect(second.players.map((p) => p.pieces ?? 0)).toEqual([4, 0, 4]);
  });

  it("leaves the lobby as it was when nobody in it won any", () => {
    const state = lobbyOf(2);

    expect(withPieces(state, new Map())).toBe(state);
    expect(withPieces(state, new Map([[token(9), 3]]))).toBe(state);
  });

  it("does not change the lobby it was given", () => {
    const state = lobbyOf(2);

    withPieces(state, new Map([[token(0), 3]]));

    expect(state.players[0].pieces).toBeUndefined();
  });
});

describe("viewLobby", () => {
  it("shows everyone each player's pieces, and nought for a player with none", () => {
    const state = withPieces(lobbyOf(2), new Map([[token(1), 3]]));

    const view = viewLobby(state, new Set([0, 1]), 0, roomConfig);

    expect(view.players.map((p) => p.pieces)).toEqual([0, 3]);
  });
});
