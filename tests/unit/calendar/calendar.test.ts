import { describe, expect, it } from "vitest";
import { calendarOf, type CalendarEvent } from "../../../src/shared/calendar";

/** 2026-11-13 12:00 UTC, which is 21:00 where the meetings are held. */
const START = Date.UTC(2026, 10, 13, 12, 0, 0);
const event = (changes: Partial<CalendarEvent> = {}): CalendarEvent => ({
  uid: "meet-1@example.com",
  stamp: Date.UTC(2026, 10, 13, 4, 30, 5),
  start: START,
  end: START + 3_600_000,
  summary: "무거운 13 모임",
  url: "https://example.com/",
  remindMinutes: 10,
  ...changes,
});
const linesOf = (file: string): string[] => file.split("\r\n");
const octets = (line: string): number => new TextEncoder().encode(line).length;

describe("calendarOf", () => {
  it("writes one event with its times in UTC, its name, and where the site is", () => {
    const lines = linesOf(calendarOf(event()));

    expect(lines.slice(0, 2)).toEqual(["BEGIN:VCALENDAR", "VERSION:2.0"]);
    expect(lines).toContain("UID:meet-1@example.com");
    expect(lines).toContain("DTSTAMP:20261113T043005Z");
    expect(lines).toContain("DTSTART:20261113T120000Z");
    expect(lines).toContain("DTEND:20261113T130000Z");
    expect(lines).toContain("SUMMARY:무거운 13 모임");
    expect(lines).toContain("URL:https://example.com/");
    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.at(-2)).toBe("END:VCALENDAR");
  });

  it("ends every line with CR LF, the last as well, and has no bare line feed", () => {
    const file = calendarOf(event());

    expect(file.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(file.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("reminds so many minutes before the start, with the event's name", () => {
    const lines = linesOf(calendarOf(event({ remindMinutes: 15 })));
    const alarm = lines.slice(lines.indexOf("BEGIN:VALARM"), lines.indexOf("END:VALARM") + 1);

    expect(alarm).toEqual(["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:무거운 13 모임", "TRIGGER:-PT15M", "END:VALARM"]);
  });

  it("escapes what means something to a calendar's file in the name", () => {
    const lines = linesOf(calendarOf(event({ summary: "a, b; c\\d\ne" })));

    expect(lines).toContain("SUMMARY:a\\, b\; c\\\\d\\ne");
  });

  it("folds a long line so that none has more than 75 octets, and cuts no letter in two", () => {
    const summary = "미스터리 거래소 모임 ".repeat(8).trim();
    const file = calendarOf(event({ summary }));

    for (const line of linesOf(file)) expect(octets(line)).toBeLessThanOrEqual(75);
    // unfolded as a calendar reads it, the name is whole
    expect(file.replace(/\r\n /g, "")).toContain(`SUMMARY:${summary}\r\n`);
    expect(linesOf(file).filter((line) => line.startsWith(" ")).length).toBeGreaterThan(1);
  });
});
