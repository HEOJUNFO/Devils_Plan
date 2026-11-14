/**
 * An appointment: an invitation to a room that also says when. Friends who
 * mean to play "Saturday at nine" send each other a link and a time in two
 * messages, and the time is the one that gets lost. Here the link carries
 * it: whoever opens the link is told when, can put it in their calendar, and
 * at that hour the same link opens the room (made again under its own code
 * where it has closed in between, `reopen.ts`).
 *
 * The time rides in the address after the room's code (`CODE-TAIL`), behind
 * the `#`, which is sent to no server: of a link's time the room and the
 * lobby know nothing, nothing is stored, and nobody is held to it. Two
 * links to one room may say two times; each says what its maker chose.
 *
 * A room has one time of its own besides, where its host has said one to
 * it (`mayAnnounce`, `setWhen` of `lobby.ts`): the room keeps that with
 * what else it keeps, and shows it to everyone in it, also to someone who
 * came in by the code and saw no link. The room's own link then carries it.
 *
 * Pure functions over plain data. Turning a day and a time of day into a
 * moment is the page's work, which knows the reader's clock.
 */

/** Tunable values of appointments. Loaded from `appointment-config.json`. */
export interface AppointmentConfig {
  /** How many days are offered to pick from, today first. */
  days: number;
  /** The time of day first offered, in minutes after midnight. */
  defaultMinutes: number;
  /** How far one press moves the time of day, in minutes. */
  stepMinutes: number;
  /** How long before the time the link takes someone straight into the room, as a link without a time does. Earlier than that it shows the time and waits for a press. */
  earlyMinutes: number;
  /** How long after the time the link still says it: people are gathering. After that it is a link to the room and nothing more. */
  graceMinutes: number;
  /** How long the entry in a calendar lasts, in minutes. */
  lengthMinutes: number;
  /** How long before the time a calendar reminds, in minutes. */
  remindMinutes: number;
}

const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;
/** What parts the code from the time in an address. A room's code has no such sign in it. */
const PART = "-";
const TAIL_PATTERN = /^[0-9a-z]{1,8}$/i;

/** The time `at` (ms since the epoch) as it rides in an address: whole minutes, in base 36, in capitals as a room's code is. */
export function tailOf(at: number): string {
  return Math.floor(at / MINUTE)
    .toString(36)
    .toUpperCase();
}

/** What follows the `#` of a link to the room `code`: the code, and after it the time where there is one. */
export function linkedOf(code: string, at: number | null): string {
  return at === null ? code : `${code}${PART}${tailOf(at)}`;
}

/**
 * What followed the `#` of an address, read: the room's code in capitals
 * (not checked here: the caller knows what a code is) and the time, or
 * `null` where there is none or what stands for it is not one. A link whose
 * time was mangled on the way is still a link to its room.
 */
export function parseLinked(raw: string): { code: string; at: number | null } {
  const cut = raw.indexOf(PART);
  if (cut < 0) return { code: raw.toUpperCase(), at: null };
  const code = raw.slice(0, cut).toUpperCase();
  const tail = raw.slice(cut + PART.length);
  if (!TAIL_PATTERN.test(tail)) return { code, at: null };
  const at = Number.parseInt(tail, 36) * MINUTE;
  return { code, at: Number.isSafeInteger(at) ? at : null };
}

/**
 * How an appointment for `at` stands at `now`: `ahead` while it is more than
 * `earlyMinutes` off (the link shows the time and waits), `due` from then
 * until `graceMinutes` after it (the link goes to the room, and still says
 * the time), and `null` once that has passed, or where the time is further
 * off than any the page offers (a made-up address): then the link is a link
 * to the room and says no time.
 */
export function standing(at: number, now: number, config: AppointmentConfig): "ahead" | "due" | null {
  if (now >= at + config.graceMinutes * MINUTE) return null;
  if (at - now > (config.days + 1) * DAY_MINUTES * MINUTE) return null;
  return at - now > config.earlyMinutes * MINUTE ? "ahead" : "due";
}

/** The time of day `minutes` (after midnight) moved by `by` presses, later for a positive number: round the clock, never out of the day. */
export function stepped(minutes: number, by: number, config: AppointmentConfig): number {
  return (((minutes + by * config.stepMinutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

/** Which of the days offered is picked at first, the time of day now being `nowMinutes`: today (0) while the time first offered is at least a step off, else tomorrow (1). */
export function firstDay(nowMinutes: number, config: AppointmentConfig): number {
  return config.defaultMinutes - nowMinutes >= config.stepMinutes ? 0 : 1;
}

/** Whether a link can be made for `at`: only for a time still to come. */
export function mayPlan(at: number, now: number): boolean {
  return at > now;
}

/**
 * Whether a room takes `at` from its host as the time its people meet: a
 * whole minute still to come, and no further off than a link may say
 * (`standing`).
 */
export function mayAnnounce(at: unknown, now: number, config: AppointmentConfig): at is number {
  return typeof at === "number" && Number.isSafeInteger(at) && at % MINUTE === 0 && mayPlan(at, now) && standing(at, now, config) !== null;
}
