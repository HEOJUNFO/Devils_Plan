/**
 * A meeting as a calendar's file (iCalendar, RFC 5545): what someone who
 * said they will come (`going.ts`) is given to put in their own calendar,
 * which then reminds them. The site sends no reminder of its own and keeps
 * nothing of whoever took the file.
 *
 * One event and one alarm. Its times are written in UTC, so the calendar
 * shows them in its owner's own time.
 */

/** What the file says: when (ms since the epoch), under which name, where the site is, and how many minutes before the start the calendar reminds its owner. */
export interface CalendarEvent {
  /** What the event is known by to the calendar: the same for the same meeting, so taking the file twice makes one event. */
  uid: string;
  /** When the file was made. */
  stamp: number;
  start: number;
  end: number;
  summary: string;
  url: string;
  remindMinutes: number;
}

/** The most octets a line of the file has before it is folded onto the next (RFC 5545, 3.1). */
const LINE_OCTETS = 75;
const encoder = new TextEncoder();

/** `at` as the file writes a time in UTC: `20261113T120000Z`. */
function utc(at: number): string {
  return new Date(at).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** `text` as the file writes text: the four characters that mean something to it are escaped. */
function escaped(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** `line` folded: no line of more than 75 octets, each further line begun with a space, and no letter cut in two. */
function folded(line: string): string {
  const lines: string[] = [];
  let [current, octets] = ["", 0];
  for (const letter of line) {
    const size = encoder.encode(letter).length;
    if (octets + size > LINE_OCTETS) {
      lines.push(current);
      // the space a further line begins with is one of its octets
      [current, octets] = [" ", 1];
    }
    current += letter;
    octets += size;
  }
  return [...lines, current].join("\r\n");
}

/** The file for `event`: its lines end in CR LF, the last as well. */
export function calendarOf(event: CalendarEvent): string {
  const summary = escaped(event.summary);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//brain-survival//meet//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${utc(event.stamp)}`,
    `DTSTART:${utc(event.start)}`,
    `DTEND:${utc(event.end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${escaped(event.url)}`,
    `URL:${event.url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${summary}`,
    `TRIGGER:-PT${Math.max(0, Math.floor(event.remindMinutes))}M`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(folded).join("\r\n") + "\r\n";
}
