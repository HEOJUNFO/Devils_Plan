import { describe, expect, it } from "vitest";
import { firstDay, linkedOf, mayPlan, parseLinked, standing, stepped, tailOf, type AppointmentConfig } from "../../../src/shared/appointment";

const CONFIG: AppointmentConfig = { days: 7, defaultMinutes: 21 * 60, stepMinutes: 30, earlyMinutes: 15, graceMinutes: 60, lengthMinutes: 90, remindMinutes: 10 };
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** A whole minute, some day. */
const AT = 1_800_000_000_000 - (1_800_000_000_000 % MINUTE);

describe("tailOf and linkedOf", () => {
  it("writes the time as whole minutes in base 36, in capitals", () => {
    expect(tailOf(AT)).toBe((AT / MINUTE).toString(36).toUpperCase());
    expect(tailOf(AT)).toMatch(/^[0-9A-Z]+$/);
  });

  it("drops the seconds of a time that is not on the minute", () => {
    expect(tailOf(AT + 59_999)).toBe(tailOf(AT));
  });

  it("puts the time after the room's code, and nothing where there is none", () => {
    expect(linkedOf("SMQWU", AT)).toBe(`SMQWU-${tailOf(AT)}`);
    expect(linkedOf("SMQWU", null)).toBe("SMQWU");
  });
});

describe("parseLinked", () => {
  it("reads back what linkedOf wrote", () => {
    expect(parseLinked(linkedOf("SMQWU", AT))).toEqual({ code: "SMQWU", at: AT });
    expect(parseLinked(linkedOf("SMQWU", null))).toEqual({ code: "SMQWU", at: null });
  });

  it("reads a link typed in small letters", () => {
    expect(parseLinked(linkedOf("SMQWU", AT).toLowerCase())).toEqual({ code: "SMQWU", at: AT });
  });

  it("reads the room of a link whose time is not one, and no time", () => {
    for (const tail of ["", "!!", "12 34", "ABCDEFGHI", "-", "1-2"]) expect(parseLinked(`SMQWU-${tail}`)).toEqual({ code: "SMQWU", at: null });
  });

  it("checks nothing of the code: an empty one, or one that is no code, comes back as it is", () => {
    expect(parseLinked("")).toEqual({ code: "", at: null });
    expect(parseLinked(`-${tailOf(AT)}`)).toEqual({ code: "", at: AT });
    expect(parseLinked("not a code")).toEqual({ code: "NOT A CODE", at: null });
  });
});

describe("standing", () => {
  it("is ahead while the time is more than the early minutes off", () => {
    expect(standing(AT, AT - DAY, CONFIG)).toBe("ahead");
    expect(standing(AT, AT - CONFIG.earlyMinutes * MINUTE - 1, CONFIG)).toBe("ahead");
  });

  it("is due from the early minutes before it until the grace after it", () => {
    expect(standing(AT, AT - CONFIG.earlyMinutes * MINUTE, CONFIG)).toBe("due");
    expect(standing(AT, AT, CONFIG)).toBe("due");
    expect(standing(AT, AT + CONFIG.graceMinutes * MINUTE - 1, CONFIG)).toBe("due");
  });

  it("no longer stands once the grace has passed", () => {
    expect(standing(AT, AT + CONFIG.graceMinutes * MINUTE, CONFIG)).toBeNull();
    expect(standing(AT, AT + DAY, CONFIG)).toBeNull();
  });

  it("does not stand for a time further off than any the page offers", () => {
    expect(standing(AT, AT - (CONFIG.days + 1) * DAY, CONFIG)).toBe("ahead");
    expect(standing(AT, AT - (CONFIG.days + 1) * DAY - 1, CONFIG)).toBeNull();
  });
});

describe("stepped", () => {
  it("moves the time of day by a step for each press, later or earlier", () => {
    expect(stepped(21 * 60, 1, CONFIG)).toBe(21 * 60 + 30);
    expect(stepped(21 * 60, -2, CONFIG)).toBe(20 * 60);
  });

  it("goes round the clock and stays in the day", () => {
    expect(stepped(23 * 60 + 30, 1, CONFIG)).toBe(0);
    expect(stepped(0, -1, CONFIG)).toBe(23 * 60 + 30);
  });
});

describe("firstDay", () => {
  it("picks today while the time first offered is at least a step off", () => {
    expect(firstDay(9 * 60, CONFIG)).toBe(0);
    expect(firstDay(CONFIG.defaultMinutes - CONFIG.stepMinutes, CONFIG)).toBe(0);
  });

  it("picks tomorrow once it is nearer than that, or past", () => {
    expect(firstDay(CONFIG.defaultMinutes - CONFIG.stepMinutes + 1, CONFIG)).toBe(1);
    expect(firstDay(23 * 60, CONFIG)).toBe(1);
  });
});

describe("mayPlan", () => {
  it("lets a link be made for a time to come, and for no other", () => {
    expect(mayPlan(AT + 1, AT)).toBe(true);
    expect(mayPlan(AT, AT)).toBe(false);
    expect(mayPlan(AT - MINUTE, AT)).toBe(false);
  });
});
