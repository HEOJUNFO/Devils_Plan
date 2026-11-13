import { describe, expect, it } from "vitest";
import { outsOf, placesByMost, type KnockoutConfig } from "../../../src/shared/knockout";
import { createLobby, dropLapsed, hostOf, joinLobby, kickPlayer, leaveLobby, markAway, nextHost, playersIn, setKnockout, viewLobby, waitingOnHost, withOuts, type LobbyState } from "../../../src/shared/lobby";
import roomConfig from "../../../src/shared/room-config.json";

const CONFIG: KnockoutConfig = { peopleAtLeast: 2 };
const token = (n: number): string => `player-token-${String(n).padStart(4, "0")}`;
/** Everyone a fixture game was played by, still in the room at its end. */
const EVERYONE: ReadonlySet<string> = new Set([0, 1, 2, 3, 4].map(token));

/** A lobby of players 0..count-1, playing 탈락전 or not. */
function lobbyOf(count: number, knockout = true): LobbyState {
  let state = createLobby();
  for (let n = 0; n < count; n++) {
    const result = joinLobby(state, { token: token(n), nick: `p${n}` }, roomConfig);
    if (!result.ok) throw new Error(`fixture join refused: ${result.reason}`);
    state = result.state;
  }
  return setKnockout(state, knockout);
}

/** The slots of those sitting out. */
const outs = (state: LobbyState): number[] => state.players.filter((p) => p.out === true).map((p) => p.slot);

describe("outsOf", () => {
  it("puts out whoever is last", () => {
    const places = [
      { token: token(0), place: 1 },
      { token: token(1), place: 3 },
      { token: token(2), place: 2 },
    ];

    expect(outsOf(places, CONFIG, EVERYONE)).toEqual([token(1)]);
  });

  it("puts out everyone level in last place", () => {
    const places = [
      { token: token(0), place: 1 },
      { token: token(1), place: 2 },
      { token: token(2), place: 2 },
    ];

    expect(outsOf(places, CONFIG, EVERYONE)).toEqual([token(1), token(2)]);
  });

  it("puts nobody out where everyone ended level", () => {
    const places = [
      { token: token(0), place: 1 },
      { token: token(1), place: 1 },
    ];

    expect(outsOf(places, CONFIG, EVERYONE)).toEqual([]);
  });

  it("puts nobody out for a game that tells no places, or was cut short", () => {
    expect(outsOf(undefined, CONFIG, EVERYONE)).toEqual([]);
    expect(outsOf(null, CONFIG, EVERYONE)).toEqual([]);
  });

  it("puts nobody out for a game a bot played in, or one of fewer people than a game needs to count", () => {
    const withBot = [
      { token: token(0), place: 1 },
      { token: null, place: 2 },
    ];

    expect(outsOf(withBot, CONFIG, EVERYONE)).toEqual([]);
    expect(outsOf([{ token: token(0), place: 1 }], CONFIG, EVERYONE)).toEqual([]);
  });
});

describe("outsOf, of a game some went from the room during", () => {
  const places = [
    { token: token(0), place: 1 },
    { token: token(1), place: 2 },
    { token: token(2), place: 3 },
  ];

  it("ranks those who stayed among themselves: the last of them is out, also when the first went", () => {
    expect(outsOf(places, CONFIG, new Set([token(1), token(2)]))).toEqual([token(2)]);
  });

  it("puts nobody out where those who stayed ended level, though whoever went was ahead of them", () => {
    const level = [places[0], { token: token(1), place: 2 }, { token: token(2), place: 2 }];

    expect(outsOf(level, CONFIG, new Set([token(1), token(2)]))).toEqual([]);
  });

  it("puts nobody out where fewer stayed than a game needs to count, or whoever is in now did not play", () => {
    expect(outsOf(places, CONFIG, new Set([token(2)]))).toEqual([]);
    expect(outsOf(places, CONFIG, new Set([token(2), token(9)]))).toEqual([]);
  });
});

describe("placesByMost", () => {
  it("gives the most the first place, and those level a place together, the next counting everyone ahead", () => {
    expect(placesByMost([5, 9, 5, 1], (n) => n)).toEqual([2, 1, 2, 4]);
  });
});

describe("setKnockout", () => {
  it("turns 탈락전 on for the room, and is shown to everyone in it", () => {
    const off = lobbyOf(2, false);

    const on = setKnockout(off, true);

    expect(viewLobby(off, new Set([0, 1]), 0, roomConfig).knockout).toBe(false);
    expect(viewLobby(on, new Set([0, 1]), 0, roomConfig).knockout).toBe(true);
    expect(setKnockout(on, true)).toBe(on);
    expect(setKnockout(off, false)).toBe(off);
  });

  it("turned off, has nobody sit out any more", () => {
    const state = withOuts(lobbyOf(3), [token(2)]).state;

    const off = setKnockout(state, false);

    expect(outs(state)).toEqual([2]);
    expect(outs(off)).toEqual([]);
    expect(off.knockout).toBeUndefined();
  });
});

describe("withOuts", () => {
  it("has the last place of a game sit the next ones out, and shows that to everyone", () => {
    const knocked = withOuts(lobbyOf(3), [token(1)]);

    expect(knocked.out).toEqual([1]);
    expect(knocked.champion).toBeNull();
    expect(playersIn(knocked.state).map((p) => p.slot)).toEqual([0, 2]);
    expect(viewLobby(knocked.state, new Set([0, 1, 2]), 0, roomConfig).players.map((p) => p.out)).toEqual([false, true, false]);
  });

  it("names the one player left in as the winner, and has everyone in again", () => {
    const first = withOuts(lobbyOf(3), [token(1)]).state;

    const last = withOuts(first, [token(0)]);

    expect(last.out).toEqual([0]);
    expect(last.champion).toBe(2);
    expect(outs(last.state)).toEqual([]);
    expect(last.state.knockout).toBe(true);
  });

  it("names the winner of a room of two after its one game", () => {
    const knocked = withOuts(lobbyOf(2), [token(0)]);

    expect(knocked).toMatchObject({ out: [0], champion: 1 });
    expect(outs(knocked.state)).toEqual([]);
  });

  it("does nothing in a room that is not playing 탈락전, or for tokens that are no player still in", () => {
    const off = lobbyOf(3, false);
    const on = withOuts(lobbyOf(3), [token(1)]).state;

    expect(withOuts(off, [token(1)])).toEqual({ state: off, out: [], champion: null });
    expect(withOuts(on, [token(1), token(9)])).toEqual({ state: on, out: [], champion: null });
  });

  it("does not change the lobby it was given", () => {
    const state = lobbyOf(3);

    withOuts(state, [token(1)]);

    expect(outs(state)).toEqual([]);
  });
});

describe("a room playing 탈락전 when players go", () => {
  it("has everyone in again once at most one player is left in, whoever went and however", () => {
    const state = withOuts(lobbyOf(3), [token(2)]).state;

    expect(outs(leaveLobby(state, token(0)))).toEqual([]);
    expect(outs(kickPlayer(state, 1, roomConfig) ?? state)).toEqual([]);
  });

  it("leaves those sitting out where they are while two or more are still in", () => {
    const state = withOuts(lobbyOf(4), [token(3)]).state;

    expect(outs(leaveLobby(state, token(0)))).toEqual([3]);
  });

  it("gives someone who comes in a place in the next game", () => {
    const state = withOuts(lobbyOf(3), [token(2)]).state;

    const joined = joinLobby(state, { token: token(7), nick: "late" }, roomConfig);

    expect(joined.ok && playersIn(joined.state).map((p) => p.nick)).toEqual(["p0", "p1", "late"]);
  });
});

describe("a player who goes from the room while sitting out", () => {
  it("sits out still when they come back, by leaving or by being away too long", () => {
    const state = withOuts(lobbyOf(4), [token(3)]).state;
    const left = leaveLobby(state, token(3));
    const lapsed = dropLapsed(markAway(state, new Set([0, 1, 2]), 0), Number.MAX_SAFE_INTEGER, roomConfig, () => false);

    const back = joinLobby(left, { token: token(3), nick: "p3" }, roomConfig);
    const backLate = joinLobby(lapsed, { token: token(3), nick: "p3" }, roomConfig);

    expect(back.ok && outs(back.state)).toEqual([3]);
    expect(backLate.ok && outs(backLate.state)).toEqual([3]);
    expect(back.ok && back.state.outGone).toBeUndefined();
  });

  it("is in again like everyone once the others are down to one, and when 탈락전 is turned off", () => {
    const left = leaveLobby(withOuts(lobbyOf(4), [token(3)]).state, token(3));

    const settled = leaveLobby(leaveLobby(left, token(0)), token(1));
    const off = setKnockout(left, false);
    const afterSettled = joinLobby(settled, { token: token(3), nick: "p3" }, roomConfig);
    const afterOff = joinLobby(setKnockout(off, true), { token: token(3), nick: "p3" }, roomConfig);

    expect(afterSettled.ok && outs(afterSettled.state)).toEqual([]);
    expect(afterOff.ok && outs(afterOff.state)).toEqual([]);
  });

  it("does not keep out someone who went while still in", () => {
    const state = withOuts(lobbyOf(4), [token(3)]).state;

    const back = joinLobby(leaveLobby(state, token(1)), { token: token(1), nick: "p1" }, roomConfig);

    expect(back.ok && outs(back.state)).toEqual([3]);
  });
});

describe("the host of a room playing 탈락전", () => {
  const ALL: ReadonlySet<number> = new Set([0, 1, 2, 3]);

  it("is, once the host has gone, whoever came first of those still in: not someone sitting out", () => {
    const state = withOuts(lobbyOf(4), [token(1)]).state;
    const left = leaveLobby(state, token(0));
    const lapsed = dropLapsed(markAway(state, new Set([1, 2, 3]), 0), Number.MAX_SAFE_INTEGER, roomConfig, () => false);

    expect(hostOf(state, ALL)?.slot).toBe(0);
    expect(hostOf(left, ALL)?.slot).toBe(2);
    expect(hostOf(lapsed, ALL)?.slot).toBe(2);
  });

  it("stays the host who is put out, also when someone else goes", () => {
    const state = withOuts(lobbyOf(4), [token(0)]).state;

    expect(hostOf(state, ALL)?.slot).toBe(0);
    expect(hostOf(leaveLobby(state, token(3)), ALL)?.slot).toBe(0);
  });

  it("is whoever came first, as in any room, once nobody sits out", () => {
    const state = withOuts(lobbyOf(3), [token(1)]).state;

    const settled = leaveLobby(state, token(0));

    expect(outs(settled)).toEqual([]);
    expect(hostOf(settled, ALL)?.slot).toBe(1);
  });

  it("does not pass, when the host does not answer, to someone sitting out", () => {
    const state = withOuts(lobbyOf(4), [token(1)]).state;
    const ready = { ...state, players: state.players.map((p) => (p.slot === 0 ? p : { ...p, ready: true as const })) };

    expect(nextHost(ready, ALL)?.slot).toBe(2);
  });
});

describe("waitingOnHost in a room playing 탈락전", () => {
  it("does not wait for those sitting out to be ready, nor count them towards a game", () => {
    // (a game two can play: the room does not wait on its host for a game it has too few for)
    const state: LobbyState = { ...withOuts(lobbyOf(3), [token(2)]).state, game: "under-thirteen" };
    const ready = { ...state, players: state.players.map((p) => (p.slot === 1 ? { ...p, ready: true as const } : p)) };

    expect(waitingOnHost(ready, new Set([0, 1, 2]))).toBe(true);
    expect(waitingOnHost(state, new Set([0, 1, 2]))).toBe(false);
  });
});

describe("playersIn", () => {
  it("is everyone in a room that is not playing 탈락전", () => {
    expect(playersIn(lobbyOf(3, false))).toHaveLength(3);
  });
});
