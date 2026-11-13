import { describe, expect, it } from "vitest";
import { makeRoom, type LabelBox, type LabelRoom } from "../../../src/client/game/labels";

/** The room the table's picture gives its names: the gap kept between two, the height of a name with its line under it, and where the picture ends. */
const ROOM: LabelRoom = { gap: 11, lines: 26, edge: 300 };
/** The far middle seat's name at a table of six: it starts beside the seat and runs right. */
const FAR_X = 168;
const FAR_Y = 26;
/** The top of the name over the next seat round, and the middle of that seat. */
const NEXT_Y = 32;
const NEXT_MIDDLE = 242;

const far = (width: number): LabelBox => ({ x: FAR_X, y: FAR_Y, width });
const next = (width: number): LabelBox => ({ x: NEXT_MIDDLE - Math.round(width / 2), y: NEXT_Y, width });

describe("makeRoom", () => {
  it("leaves two names that do not meet where they are", () => {
    expect(makeRoom(far(30), next(22), ROOM)).toEqual({ shift: 0, cut: 0 });
  });

  it("moves the next name over when the far one reaches it", () => {
    // 168 + 61 + 11 = 240, and the next name starts at 231
    expect(makeRoom(far(61), next(22), ROOM)).toEqual({ shift: 9, cut: 0 });
  });

  it("cuts the far name by what the next one cannot move", () => {
    // the next name is 209 to 275 and can move 25; 168 + 66 + 11 - 209 = 36 is wanted
    expect(makeRoom(far(66), next(66), ROOM)).toEqual({ shift: 25, cut: 11 });
  });

  it("cuts the far name by all of it when the next one is at the edge already", () => {
    const atEdge: LabelBox = { x: 230, y: NEXT_Y, width: 70 };
    expect(makeRoom(far(66), atEdge, ROOM)).toEqual({ shift: 0, cut: 15 });
  });

  it("leaves a name on other lines alone", () => {
    // a table of four: the next seat's name is 41 pixels lower
    expect(makeRoom(far(66), { ...next(66), y: FAR_Y + 41 }, ROOM)).toEqual({ shift: 0, cut: 0 });
    expect(makeRoom(far(66), { ...next(66), y: FAR_Y + ROOM.lines - 1 }, ROOM).shift).toBeGreaterThan(0);
  });

  it("leaves a name to the left alone", () => {
    expect(makeRoom(far(66), { x: 29, y: NEXT_Y, width: 66 }, ROOM)).toEqual({ shift: 0, cut: 0 });
  });
});
