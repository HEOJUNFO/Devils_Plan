import { describe, expect, it } from "vitest";
import { againOf, type AgainPlayer } from "../../../src/shared/again";

/** A room of four: the host in slot 0, slot 2 ready, slot 3 sitting the games out. */
const ROOM: AgainPlayer[] = [
  { slot: 0, ready: false, out: false },
  { slot: 1, ready: false, out: false },
  { slot: 2, ready: true, out: false },
  { slot: 3, ready: false, out: true },
];
const HOST = 0;
/** The same room with nobody ready. */
const QUIET: AgainPlayer[] = ROOM.map((player) => ({ ...player, ready: false }));

describe("againOf", () => {
  it("lets a player who is not the host say they want another game, and counts who has", () => {
    expect(againOf(ROOM, 1, false, false)).toEqual({ count: 1, mine: false, press: true });
    expect(againOf(QUIET, 1, false, false)).toEqual({ count: 0, mine: false, press: true });
  });

  it("counts the reader once they have said so", () => {
    expect(againOf(ROOM, 2, false, false)).toEqual({ count: 1, mine: true, press: true });
  });

  it("goes by what the reader pressed until the room has answered", () => {
    expect(againOf(ROOM, 1, false, false, true)).toEqual({ count: 2, mine: true, press: true });
    expect(againOf(ROOM, 2, false, false, false)).toEqual({ count: 0, mine: false, press: true });
  });

  it("shows the host how many want one, with nothing to press", () => {
    expect(againOf(ROOM, HOST, true, false)).toEqual({ count: 1, mine: false, press: false });
  });

  it("shows the host nothing while nobody has said so", () => {
    expect(againOf(QUIET, HOST, true, false)).toBeNull();
  });

  it("never counts the host's own word, whatever was pressed", () => {
    expect(againOf(QUIET, HOST, true, false, true)).toBeNull();
  });

  it("gives someone sitting the games out of a 탈락전 nothing to press, and shows them the count", () => {
    expect(againOf(ROOM, 3, false, true)).toEqual({ count: 1, mine: false, press: false });
    expect(againOf(QUIET, 3, false, true)).toBeNull();
  });

  it("lets a player marked out say so in a room that is not playing 탈락전", () => {
    expect(againOf(QUIET, 3, false, false)).toEqual({ count: 0, mine: false, press: true });
  });

  it("shows someone who is not of the room only the count", () => {
    expect(againOf(ROOM, 9, false, false)).toEqual({ count: 1, mine: false, press: false });
    expect(againOf(QUIET, 9, false, false)).toBeNull();
  });
});
