import { describe, expect, it } from "vitest";
import { createLobby, joinLobby, viewLobby, withResult, type LobbyState } from "../../../src/shared/lobby";
import roomConfig from "../../../src/shared/room-config.json";
import { resultOf, streakOf, type GameResult, type TopsConfig } from "../../../src/shared/tops";

const CONFIG: TopsConfig = { on: true, peopleAtLeast: 2, streakFrom: 2 };
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

/** A game played by players `played`, of whom players `tops` did best. */
function game(played: number[], tops: number[]): GameResult {
  return { played: new Set(played.map(token)), tops: new Set(tops.map(token)) };
}

/** The slots marked as the top, as everyone sees them. */
function topSlots(state: LobbyState): number[] {
  return viewLobby(state, new Set(), 0, roomConfig)
    .players.filter((p) => p.top)
    .map((p) => p.slot);
}

/** Each player's games counted in the room and how many of them they were at the top of, by slot, as everyone sees them. */
function tallies(state: LobbyState): [number, number][] {
  return viewLobby(state, new Set(), 0, roomConfig).players.map((p) => [p.games, p.wins]);
}

/** Each player's streak in the room, by slot, as everyone sees it. */
function streaks(state: LobbyState): number[] {
  return viewLobby(state, new Set(), 0, roomConfig).players.map((p) => p.streak);
}

describe("resultOf", () => {
  it("names whoever ended at the best place, and everyone who played", () => {
    const lines = [
      { token: token(0), place: 2 },
      { token: token(1), place: 1 },
      { token: token(2), place: 3 },
    ];

    expect(resultOf(lines, CONFIG)).toEqual(game([0, 1, 2], [1]));
  });

  it("names everyone who shares the best place", () => {
    const lines = [
      { token: token(0), place: 1 },
      { token: token(1), place: 1 },
      { token: token(2), place: 2 },
    ];

    expect(resultOf(lines, CONFIG)).toEqual(game([0, 1, 2], [0, 1]));
  });

  it("names nobody at the top where everyone ended level", () => {
    const lines = [
      { token: token(0), place: 1 },
      { token: token(1), place: 1 },
    ];

    expect(resultOf(lines, CONFIG)).toEqual(game([0, 1], []));
  });

  it("says nothing for a game cut short, or one that tells no places", () => {
    expect(resultOf(null, CONFIG)).toBeNull();
    expect(resultOf(undefined, CONFIG)).toBeNull();
  });

  it("says nothing for a game a bot played in", () => {
    const lines = [
      { token: token(0), place: 1 },
      { token: null, place: 2 },
    ];

    expect(resultOf(lines, CONFIG)).toBeNull();
  });

  it("says nothing for a game of fewer people than the room counts", () => {
    expect(resultOf([{ token: token(0), place: 1 }], CONFIG)).toBeNull();
  });

  it("says nothing for a game fewer people than the room counts were still in the room at the end of", () => {
    // Arrange: two played, and one of them had given their place up before the other finished
    const lines = [
      { token: token(0), place: 1 },
      { token: token(1), place: 2 },
    ];

    // Act
    const alone = resultOf(lines, CONFIG, new Set([token(0)]));
    const both = resultOf(lines, CONFIG, new Set([token(0), token(1)]));

    // Assert: first place among nobody is not a place; with both still there it is
    expect(alone).toBeNull();
    expect(both).toEqual(game([0, 1], [0]));
  });

  it("ranks by everyone who played where enough of them stayed, whoever left among them", () => {
    // Arrange: three played, the one who ended last has left
    const lines = [
      { token: token(0), place: 1 },
      { token: token(1), place: 2 },
      { token: token(2), place: 3 },
    ];

    // Act
    const result = resultOf(lines, CONFIG, new Set([token(0), token(1)]));

    // Assert
    expect(result).toEqual(game([0, 1, 2], [0]));
  });

  it("says nothing where rooms keep no mark", () => {
    const lines = [
      { token: token(0), place: 1 },
      { token: token(1), place: 2 },
    ];

    expect(resultOf(lines, { ...CONFIG, on: false })).toBeNull();
  });
});

describe("withResult: the mark of the last game's top", () => {
  it("marks the players named, as everyone sees them", () => {
    const state = withResult(lobbyOf(3), game([0, 1, 2], [1]));

    expect(topSlots(state)).toEqual([1]);
  });

  it("takes the mark from whoever had it when the next game names someone else", () => {
    const first = withResult(lobbyOf(3), game([0, 1, 2], [1]));

    const second = withResult(first, game([0, 1, 2], [0, 2]));

    expect(topSlots(second)).toEqual([0, 2]);
  });

  it("takes every mark away after a game everyone ended level in", () => {
    const first = withResult(lobbyOf(3), game([0, 1, 2], [1]));

    expect(topSlots(withResult(first, game([0, 1, 2], [])))).toEqual([]);
  });

  it("leaves everything as it was after a game that says nothing", () => {
    const first = withResult(lobbyOf(3), game([0, 1, 2], [1]));

    expect(withResult(first, null)).toBe(first);
  });

  it("marks nobody for a token that is no longer in the room", () => {
    expect(topSlots(withResult(lobbyOf(2), game([0, 9], [9])))).toEqual([]);
  });

  it("keeps the mark of a player who comes back with the same token", () => {
    const marked = withResult(lobbyOf(2), game([0, 1], [1]));

    const back = joinLobby(marked, { token: token(1), nick: "again" }, roomConfig);

    expect(back.ok && topSlots(back.state)).toEqual([1]);
  });
});

describe("withResult: the room's tally", () => {
  it("counts the game for everyone who played it, and a win for those at its top", () => {
    const state = withResult(lobbyOf(3), game([0, 1, 2], [1]));

    expect(tallies(state)).toEqual([
      [1, 0],
      [1, 1],
      [1, 0],
    ]);
  });

  it("adds each game played to its end to what was counted before", () => {
    const first = withResult(lobbyOf(3), game([0, 1, 2], [1]));

    const second = withResult(first, game([0, 1, 2], [1, 2]));

    expect(tallies(second)).toEqual([
      [2, 0],
      [2, 2],
      [2, 1],
    ]);
  });

  it("counts a game everyone ended level in, and a win for nobody", () => {
    const state = withResult(lobbyOf(2), game([0, 1], []));

    expect(tallies(state)).toEqual([
      [1, 0],
      [1, 0],
    ]);
  });

  it("counts nothing for someone in the room who did not play the game", () => {
    const state = withResult(lobbyOf(3), game([0, 1], [0]));

    expect(tallies(state)).toEqual([
      [1, 1],
      [1, 0],
      [0, 0],
    ]);
  });

  it("does not modify its input", () => {
    const before = lobbyOf(2);

    withResult(before, game([0, 1], [0]));

    expect(tallies(before)).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });
});

describe("withResult: the streak", () => {
  it("is one game longer for whoever is at the top again, and nobody has one before a game is played", () => {
    const none = lobbyOf(3);
    const first = withResult(none, game([0, 1, 2], [1]));
    const second = withResult(first, game([0, 1, 2], [1, 2]));

    expect(streaks(none)).toEqual([0, 0, 0]);
    expect(streaks(first)).toEqual([0, 1, 0]);
    expect(streaks(second)).toEqual([0, 2, 1]);
  });

  it("is over for someone who played and was not at the top, and after a game everyone ended level in", () => {
    const twice = withResult(withResult(lobbyOf(2), game([0, 1], [1])), game([0, 1], [1]));

    expect(streaks(withResult(twice, game([0, 1], [0])))).toEqual([1, 0]);
    expect(streaks(withResult(twice, game([0, 1], [])))).toEqual([0, 0]);
  });

  it("is left as it was for someone who did not play the game, and after a game that says nothing", () => {
    const twice = withResult(withResult(lobbyOf(3), game([0, 1, 2], [1])), game([0, 1, 2], [1]));

    expect(streaks(withResult(twice, game([0, 2], [0])))).toEqual([1, 2, 0]);
    expect(streaks(withResult(twice, null))).toEqual([0, 2, 0]);
  });

  it("goes on for a player who comes back with the same token", () => {
    const twice = withResult(withResult(lobbyOf(2), game([0, 1], [1])), game([0, 1], [1]));

    const back = joinLobby(twice, { token: token(1), nick: "again" }, roomConfig);

    expect(back.ok && streaks(back.state)).toEqual([0, 2]);
  });
});

describe("streakOf", () => {
  it("is the games in a row from the fewest that make a streak on, and none for fewer", () => {
    expect([0, 1, 2, 3].map((run) => streakOf(run, CONFIG))).toEqual([0, 0, 2, 3]);
    expect(streakOf(2, { streakFrom: 3 })).toBe(0);
  });
});
