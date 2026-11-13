import { describe, expect, it } from "vitest";
import { hearersOf, heardBy, namesOf, parseTo, teammatesOf, toggled, type AsidePlayer, type Hearer } from "../../../src/shared/aside";

/** The most a line can be said to in these tests: a room of sixteen but the speaker. */
const MOST = 15;

/** A room of five: slots 0 to 4, the player in slot 3 away, slots 0, 2 and 3 in team 1, slot 4 in team 2. */
const ROOM: AsidePlayer[] = [
  { slot: 0, nick: "가람", connected: true, team: 1 },
  { slot: 1, nick: "나래", connected: true, team: 0 },
  { slot: 2, nick: "다온", connected: true, team: 1 },
  { slot: 3, nick: "라온", connected: false, team: 1 },
  { slot: 4, nick: "마루", connected: true, team: 2 },
];

describe("parseTo", () => {
  it("takes one slot, as a page of an earlier build sends it, for a list of one", () => {
    expect(parseTo(3, MOST)).toEqual([3]);
    expect(parseTo(0, MOST)).toEqual([0]);
  });

  it("takes a list of slots, each once, lowest first", () => {
    expect(parseTo([4, 1], MOST)).toEqual([1, 4]);
    expect(parseTo([2, 2, 0, 2], MOST)).toEqual([0, 2]);
  });

  it("takes nothing that is not a slot, nor a list with one such thing in it", () => {
    for (const raw of [-1, 1.5, "2", null, {}, [1, -1], [1, 1.5], [1, "2"], [[1]]]) expect(parseTo(raw, MOST)).toBeNull();
  });

  it("takes no list of nobody: such a line is not said to everyone instead", () => {
    expect(parseTo([], MOST)).toBeNull();
  });

  it("takes no list longer than the most", () => {
    const upTo = (count: number): number[] => Array.from({ length: count }, (_none, slot) => slot);
    expect(parseTo(upTo(MOST), MOST)).toEqual(upTo(MOST));
    expect(parseTo(upTo(MOST + 1), MOST)).toBeNull();
  });
});

describe("heardBy", () => {
  const here = (slot: number): boolean => ROOM.find((p) => p.slot === slot)?.connected === true;

  it("gives those of the slots asked who are in the room and connected, with their names, lowest slot first", () => {
    expect(heardBy([4, 1], 0, ROOM, here)).toEqual([
      { slot: 1, nick: "나래" },
      { slot: 4, nick: "마루" },
    ]);
  });

  it("leaves out the speaker, a slot nobody is in, and a player whose connection is gone", () => {
    expect(heardBy([0, 2, 3, 9], 0, ROOM, here)).toEqual([{ slot: 2, nick: "다온" }]);
  });

  it("gives nobody where none of them can read it", () => {
    expect(heardBy([0], 0, ROOM, here)).toEqual([]);
    expect(heardBy([3, 9], 0, ROOM, here)).toEqual([]);
  });
});

/** The players of `ROOM` in the slots given, as a line names them. */
const people = (...slots: number[]): Hearer[] => slots.map((slot) => ({ slot, nick: ROOM[slot]?.nick ?? "?" }));

describe("teammatesOf", () => {
  it("gives the others of the player's team who are connected", () => {
    expect(teammatesOf(ROOM, 0)).toEqual(people(2));
    expect(teammatesOf(ROOM, 2)).toEqual(people(0));
  });

  it("gives nobody for a player alone, for a team of one, and for someone not in the room", () => {
    expect(teammatesOf(ROOM, 1)).toEqual([]);
    expect(teammatesOf(ROOM, 4)).toEqual([]);
    expect(teammatesOf(ROOM, 9)).toEqual([]);
  });

  it("puts no two players who play alone in a team with each other", () => {
    const alone: AsidePlayer[] = [
      { slot: 0, nick: "a", connected: true, team: 0 },
      { slot: 1, nick: "b", connected: true, team: 0 },
    ];
    expect(teammatesOf(alone, 0)).toEqual([]);
  });
});

describe("hearersOf", () => {
  it("names nobody for a line said to everyone", () => {
    expect(hearersOf({ kind: "all" }, ROOM, 0)).toBeNull();
  });

  it("gives the team as it now stands for a line said to the team", () => {
    expect(hearersOf({ kind: "team" }, ROOM, 0)).toEqual(people(2));
    expect(hearersOf({ kind: "team" }, ROOM, 1)).toEqual([]);
  });

  it("gives those of the players picked who are still in the room, lowest slot first, the reader never among them", () => {
    expect(hearersOf({ kind: "some", people: people(4, 1) }, ROOM, 0)).toEqual(people(1, 4));
    expect(hearersOf({ kind: "some", people: [...people(0, 1), { slot: 9, nick: "없음" }] }, ROOM, 0)).toEqual(people(1));
    expect(hearersOf({ kind: "some", people: [{ slot: 9, nick: "없음" }] }, ROOM, 0)).toEqual([]);
  });

  it("still names a player picked whose connection is gone: they hold their seat and may be back for the next line", () => {
    expect(hearersOf({ kind: "some", people: people(3) }, ROOM, 0)).toEqual(people(3));
  });

  it("does not name someone else who has taken the seat of a player picked", () => {
    expect(hearersOf({ kind: "some", people: [{ slot: 1, nick: "먼저 온 사람" }, ...people(4)] }, ROOM, 0)).toEqual(people(4));
    expect(hearersOf({ kind: "some", people: [{ slot: 1, nick: "먼저 온 사람" }] }, ROOM, 0)).toEqual([]);
  });
});

describe("toggled", () => {
  it("adds a player to those spoken to, lowest slot first", () => {
    expect(toggled([], people(2)[0]!)).toEqual({ kind: "some", people: people(2) });
    expect(toggled(people(4), people(1)[0]!)).toEqual({ kind: "some", people: people(1, 4) });
  });

  it("takes out a player who was among them", () => {
    expect(toggled(people(1, 4), people(1)[0]!)).toEqual({ kind: "some", people: people(4) });
  });

  it("is a line for everyone again once the last of them is taken out", () => {
    expect(toggled(people(4), people(4)[0]!)).toEqual({ kind: "all" });
  });
});

describe("namesOf", () => {
  it("says one name, or two", () => {
    expect(namesOf(["나래"])).toBe("나래");
    expect(namesOf(["나래", "마루"])).toBe("나래, 마루");
  });

  it("says the first and how many more past two, in no language", () => {
    expect(namesOf(["나래", "다온", "마루"])).toBe("나래 +2");
  });

  it("says nothing of nobody", () => {
    expect(namesOf([])).toBe("");
  });
});
