import { describe, expect, it } from "vitest";
import { againOf, hostCallDue, waitsOnHost, type AgainPlayer, type WaitingPlayer } from "../../../src/shared/again";
import roomConfig from "../../../src/shared/room-config.json";
import shipped from "../../../src/shared/sound-config.json";

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

describe("waitsOnHost", () => {
  /** The room with everyone connected; slot 3 sits out only where the room plays 탈락전. */
  const THERE: WaitingPlayer[] = ROOM.map((player) => ({ ...player, connected: true }));
  /** Everyone but the host ready, the one sitting out too little as it matters. */
  const ready = (slots: number[], players: WaitingPlayer[] = THERE): WaitingPlayer[] => players.map((player) => ({ ...player, ready: slots.includes(player.slot) }));
  /** A game one player can start, and one that takes two. */
  const ONE = 1;
  const TWO = 2;

  it("does once everyone else who is there has said so", () => {
    expect(waitsOnHost(ready([1, 2]), HOST, false, TWO)).toBe(false);
    expect(waitsOnHost(ready([1, 2, 3]), HOST, false, TWO)).toBe(true);
  });

  it("does not wait for someone sitting the games out of a room playing 탈락전", () => {
    expect(waitsOnHost(ready([1, 2]), HOST, true, TWO)).toBe(true);
    expect(waitsOnHost(ready([1]), HOST, true, TWO)).toBe(false);
  });

  it("does not wait for someone whose connection is gone", () => {
    const gone = ready([1, 2]).map((player) => (player.slot === 3 ? { ...player, connected: false } : player));

    expect(waitsOnHost(gone, HOST, false, TWO)).toBe(true);
  });

  it("does not while the host is alone, or the room has no host", () => {
    const alone = THERE.filter((player) => player.slot === HOST);
    const others = ready([1, 2, 3]).map((player) => (player.slot === HOST ? player : { ...player, connected: false, ready: false }));

    expect(waitsOnHost(alone, HOST, false, ONE)).toBe(false);
    expect(waitsOnHost(others, HOST, false, ONE)).toBe(false);
    expect(waitsOnHost(ready([1, 2, 3]), null, false, ONE)).toBe(false);
  });

  it("does not while fewer are there than the game takes: the host could not start it either", () => {
    const two = ready([1], THERE.filter((player) => player.slot <= 1));

    expect(waitsOnHost(two, HOST, false, TWO)).toBe(true);
    expect(waitsOnHost(two, HOST, false, TWO + 1)).toBe(false);
  });

  it("counts a host who sits the games out as not playing", () => {
    const hostOut = ready([1], THERE.filter((player) => player.slot <= 1)).map((player) => (player.slot === HOST ? { ...player, out: true } : player));

    expect(waitsOnHost(hostOut, HOST, true, TWO)).toBe(false);
    expect(waitsOnHost(hostOut, HOST, true, ONE)).toBe(true);
  });
});

describe("hostCallDue", () => {
  /** A moment, and the gap between two calls in seconds. */
  const NOW = 1_000_000;
  const GAP = 30;

  it("is for a host who has not been called in this room", () => {
    expect(hostCallDue(NOW, null, GAP)).toBe(true);
  });

  it("is not again until the gap has passed", () => {
    expect(hostCallDue(NOW + GAP * 1000 - 1, NOW, GAP)).toBe(false);
    expect(hostCallDue(NOW + GAP * 1000, NOW, GAP)).toBe(true);
  });

  it("ships with a gap that is some seconds and shorter than the room's own wait for its host", () => {
    expect(shipped.hostCallGapSeconds).toBeGreaterThan(0);
    expect(shipped.hostCallGapSeconds).toBeLessThan(roomConfig.hostIdleSeconds);
  });
});
